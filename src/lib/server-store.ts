import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID, randomInt } from 'node:crypto';
import {
  type Customer,
  type FeedbackItem,
  type HistoryEntry,
  type ItemInput,
  type Access,
  todayWIB,
} from './feedback-model';
import { pinHash } from './feedback-session.server';

export interface ServerWorkspaceData {
  customers: (Customer & { pin_hash?: string | null | undefined })[];
  items: FeedbackItem[];
  history: HistoryEntry[];
}

const isTestEnv = process.env['NODE_ENV'] === 'test' || process.env['VITEST'] === 'true';
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.resolve(DATA_DIR, isTestEnv ? 'workspace.test.json' : 'workspace.json');

let writeLock = Promise.resolve();

async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {}
}

export async function readServerStore(): Promise<ServerWorkspaceData> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      customers: Array.isArray(parsed?.customers) ? parsed.customers : [],
      items: Array.isArray(parsed?.items) ? parsed.items : [],
      history: Array.isArray(parsed?.history) ? parsed.history : [],
    };
  } catch {
    return { customers: [], items: [], history: [] };
  }
}

export async function writeServerStore(data: ServerWorkspaceData): Promise<void> {
  await ensureDataDir();
  // Queue writes sequentially to avoid race conditions
  writeLock = writeLock
    .then(async () => {
      try {
        const tmp = `${DB_FILE}.${randomUUID()}.tmp`;
        const json = JSON.stringify(data, null, 2);
        await fs.writeFile(tmp, json, 'utf8');
        await fs.rename(tmp, DB_FILE);
      } catch (err) {
        // Read-only serverless filesystems (e.g. Vercel) - storage is handled by Supabase
      }
    })
    .catch(() => {});
  return writeLock;
}

export async function getServerWorkspace(access: Access | null): Promise<{
  customers: Customer[];
  items: FeedbackItem[];
  history: HistoryEntry[];
}> {
  if (!access) {
    return { customers: [], items: [], history: [] };
  }

  const store = await readServerStore();

  if (access.role === 'customer') {
    const custId = access.customer_id;
    const items = store.items.filter(i => i.customer_id === custId && !i.deleted_at);
    const customers = store.customers
      .filter(c => c.id === custId)
      .map(({ pin_hash, ...rest }) => rest);
    return { customers, items, history: [] };
  }

  // Admin access: return all items, customers, and history
  const customers = store.customers.map(({ pin_hash, ...rest }) => rest);
  return {
    customers,
    items: store.items,
    history: store.history,
  };
}

export async function saveServerItem(
  item: ItemInput,
  actor: string,
  existingId?: string,
  existingVersion?: number,
  isCustomer = false,
): Promise<FeedbackItem> {
  const store = await readServerStore();
  const nowIso = new Date().toISOString();

  if (existingId) {
    const idx = store.items.findIndex(i => i.id === existingId);
    if (idx === -1) {
      throw new Error('Feedback item not found.');
    }
    const current = store.items[idx]!;
    const updated: FeedbackItem = {
      ...item,
      id: existingId,
      version: (existingVersion ?? current.version ?? 0) + 1,
      report_date: item.report_date ?? current.report_date ?? current.updated_at.slice(0, 10),
      completion_date: item.activity === 'Done' ? (current.completion_date ?? todayWIB()) : null,
      deleted_at: current.deleted_at,
      updated_at: nowIso,
      actor,
      needs_review: isCustomer ? true : (item.needs_review ?? false),
      image: item.image !== undefined ? item.image : (current.image ?? null),
    };
    store.items[idx] = updated;

    const histEntry: HistoryEntry = {
      id: randomUUID(),
      customer_id: item.customer_id,
      item_id: existingId,
      action: isCustomer ? 'Updated feedback (Customer)' : 'Updated feedback',
      field: 'activity',
      old_value: current.activity,
      new_value: item.activity,
      actor,
      created_at: nowIso,
    };
    store.history.unshift(histEntry);
    await writeServerStore(store);
    return updated;
  }

  // New feedback
  const newItem: FeedbackItem = {
    ...item,
    id: randomUUID(),
    version: 1,
    report_date: item.report_date || todayWIB(),
    completion_date: item.activity === 'Done' ? todayWIB() : null,
    deleted_at: null,
    updated_at: nowIso,
    actor,
    needs_review: isCustomer ? true : (item.needs_review ?? false),
    image: item.image ?? null,
  };

  store.items.unshift(newItem);
  const histEntry: HistoryEntry = {
    id: randomUUID(),
    customer_id: item.customer_id,
    item_id: newItem.id,
    action: isCustomer ? 'Submitted feedback (Customer)' : 'Created feedback',
    field: 'feedback',
    old_value: null,
    new_value: item.feedback,
    actor,
    created_at: nowIso,
  };
  store.history.unshift(histEntry);
  await writeServerStore(store);
  return newItem;
}

export async function deleteServerItem(
  id: string,
  version: number,
  restore: boolean,
  actor: string,
): Promise<void> {
  const store = await readServerStore();
  const idx = store.items.findIndex(i => i.id === id);
  if (idx === -1) throw new Error('Item not found.');

  const item = store.items[idx]!;
  if (!restore && item.activity === 'Done') {
    throw new Error("Feedback with activity status 'Done' cannot be deleted.");
  }

  const nowIso = new Date().toISOString();
  store.items[idx] = {
    ...item,
    deleted_at: restore ? null : nowIso,
    version: (version ?? item.version) + 1,
    updated_at: nowIso,
    actor,
  };

  const histEntry: HistoryEntry = {
    id: randomUUID(),
    customer_id: item.customer_id,
    item_id: item.id,
    action: restore ? 'Restored feedback' : 'Deleted feedback',
    field: 'status',
    old_value: null,
    new_value: restore ? 'Active' : 'Deleted',
    actor,
    created_at: nowIso,
  };
  store.history.unshift(histEntry);
  await writeServerStore(store);
}

export async function manageServerCustomer(
  action: 'create' | 'regenerate' | 'toggle' | 'delete',
  name: string,
  id?: string,
  actor = 'Loop Team',
): Promise<{ pin?: string | null }> {
  const store = await readServerStore();
  const cleanName = name.trim();
  const nowIso = new Date().toISOString();

  if (action === 'create') {
    const pin = String(randomInt(100000, 999999));
    const newCust: Customer & { pin_hash: string } = {
      id: randomUUID(),
      name: cleanName,
      active: true,
      pin,
      pin_hash: pinHash(pin),
      pin_version: 1,
      created_at: nowIso,
    };
    store.customers.push(newCust);
    store.history.unshift({
      id: randomUUID(),
      customer_id: newCust.id,
      item_id: null,
      action: 'Created customer',
      field: 'name',
      old_value: null,
      new_value: cleanName,
      actor,
      created_at: nowIso,
    });
    await writeServerStore(store);
    return { pin };
  }

  if (!id) throw new Error('Customer ID is required.');
  const idx = store.customers.findIndex(c => c.id === id);
  if (idx === -1) throw new Error('Customer not found.');

  const cust = store.customers[idx]!;

  if (action === 'regenerate') {
    const pin = String(randomInt(100000, 999999));
    store.customers[idx] = {
      ...cust,
      pin,
      pin_hash: pinHash(pin),
      pin_version: cust.pin_version + 1,
    };
    store.history.unshift({
      id: randomUUID(),
      customer_id: id,
      item_id: null,
      action: 'Regenerated PIN',
      field: 'pin',
      old_value: null,
      new_value: 'New PIN generated',
      actor,
      created_at: nowIso,
    });
    await writeServerStore(store);
    return { pin };
  }

  if (action === 'toggle') {
    const nextActive = !cust.active;
    store.customers[idx] = {
      ...cust,
      active: nextActive,
    };
    store.history.unshift({
      id: randomUUID(),
      customer_id: id,
      item_id: null,
      action: nextActive ? 'Activated customer' : 'Deactivated customer',
      field: 'active',
      old_value: String(cust.active),
      new_value: String(nextActive),
      actor,
      created_at: nowIso,
    });
    await writeServerStore(store);
    return { pin: null };
  }

  if (action === 'delete') {
    store.customers.splice(idx, 1);
    store.history.unshift({
      id: randomUUID(),
      customer_id: id,
      item_id: null,
      action: 'Deleted customer',
      field: 'name',
      old_value: cust.name,
      new_value: null,
      actor,
      created_at: nowIso,
    });
    await writeServerStore(store);
    return { pin: null };
  }

  return { pin: null };
}

export async function importServerItems(
  rows: Array<ItemInput & { customer_name: string; is_update?: boolean }>,
  actor: string,
): Promise<{ count: number; pins: { name: string; pin: string }[] }> {
  const store = await readServerStore();
  const custMap = new Map<string, Customer & { pin_hash?: string | null | undefined }>();
  store.customers.forEach(c => custMap.set(c.name.toLowerCase(), c));

  const newPins: { name: string; pin: string }[] = [];
  const nowIso = new Date().toISOString();

  // Create missing customers
  for (const r of rows) {
    const key = r.customer_name.toLowerCase();
    if (!custMap.has(key)) {
      const pin = String(randomInt(100000, 999999));
      const newCust: Customer & { pin_hash: string } = {
        id: randomUUID(),
        name: r.customer_name,
        active: true,
        pin,
        pin_hash: pinHash(pin),
        pin_version: 1,
        created_at: nowIso,
      };
      custMap.set(key, newCust);
      store.customers.push(newCust);
      newPins.push({ name: r.customer_name, pin });
    }
  }

  let count = 0;
  for (const r of rows) {
    const cust = custMap.get(r.customer_name.toLowerCase());
    const custId = cust?.id ?? r.customer_id;
    const existingIdx = store.items.findIndex(
      i => i.customer_id === custId && i.number === r.number && !i.deleted_at,
    );

    const newItem: FeedbackItem = {
      customer_id: custId,
      number: r.number,
      feature: r.feature,
      feedback: r.feedback,
      detail: r.detail,
      type: r.type,
      category: r.category,
      status: r.status,
      activity: ((r.activity as string) === 'Pending' ? 'Not started' : r.activity) as any,
      notes: r.notes,
      report_date: r.report_date ?? todayWIB(),
      estimated_date: r.estimated_date,
      completion_date: r.activity === 'Done' ? todayWIB() : null,
      deleted_at: null,
      id: existingIdx >= 0 ? store.items[existingIdx]!.id : randomUUID(),
      version: existingIdx >= 0 ? (store.items[existingIdx]!.version ?? 1) + 1 : 1,
      updated_at: nowIso,
      actor,
    };

    if (existingIdx >= 0) {
      store.items[existingIdx] = newItem;
    } else {
      store.items.unshift(newItem);
    }
    count++;
  }

  store.history.unshift({
    id: randomUUID(),
    customer_id: null,
    item_id: null,
    action: 'Imported Excel data',
    field: 'items',
    old_value: null,
    new_value: `${count} items imported`,
    actor,
    created_at: nowIso,
  });

  await writeServerStore(store);
  return { count, pins: newPins };
}

export async function clearServerWorkspace(): Promise<void> {
  const store: ServerWorkspaceData = {
    customers: [],
    items: [],
    history: [],
  };
  await writeServerStore(store);
}

export async function syncClientDataToServer(clientData: {
  items: FeedbackItem[];
  customers: Customer[];
  history: HistoryEntry[];
}): Promise<boolean> {
  const store = await readServerStore();
  let changed = false;

  // Merge customers: add customer or fill missing pin/pin_hash
  for (const c of clientData.customers) {
    const existingIdx = store.customers.findIndex(
      sc => sc.id === c.id || sc.name.toLowerCase() === c.name.toLowerCase(),
    );
    if (existingIdx >= 0) {
      if (c.pin && !store.customers[existingIdx]!.pin) {
        store.customers[existingIdx]!.pin = c.pin;
        store.customers[existingIdx]!.pin_hash = pinHash(c.pin);
        changed = true;
      }
    } else {
      store.customers.push({
        ...c,
        pin_hash: c.pin ? pinHash(c.pin) : undefined,
      });
      changed = true;
    }
  }

  // Merge items
  for (const item of clientData.items) {
    const existingIdx = store.items.findIndex(
      si => si.id === item.id || (si.customer_id === item.customer_id && si.number === item.number && !si.deleted_at),
    );
    if (existingIdx === -1) {
      store.items.unshift(item);
      changed = true;
    }
  }

  if (store.history.length === 0 && clientData.history.length > 0) {
    store.history = clientData.history;
    changed = true;
  }

  if (changed || (store.items.length === 0 && clientData.items.length > 0)) {
    await writeServerStore(store);
    return true;
  }

  return false;
}
