import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import {
  itemSchema,
  PIN_PATTERN,
  SESSION_SECONDS,
  type Access,
  type Customer,
  type FeedbackItem,
  type HistoryEntry,
  type ItemInput,
} from './feedback-model';
import {
  getServerWorkspace,
  saveServerItem,
  deleteServerItem,
  manageServerCustomer,
  importServerItems,
  clearServerWorkspace,
  syncClientDataToServer,
  readServerStore,
} from './server-store';

export const getAccess = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const { session, requireAccess } = await import('./feedback-session.server');
    const s = await session();
    if (!s.data.access) return null;
    return await requireAccess();
  } catch {
    return null;
  }
});

export const signIn = createServerFn({ method: 'POST' })
  .inputValidator(v =>
    z
      .object({
        mode: z.enum(['admin', 'customer']),
        passcode: z.string().min(1).max(200),
        actor: z.string().trim().max(100),
      })
      .parse(v),
  )
  .handler(async ({ data }) => {
    const { session, pinHash, attemptKeys } = await import('./feedback-session.server');
    const s = await session();
    const keys = attemptKeys();

    try {
      const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
      const { data: attempts } = await db.from('feedback_attempts').select('locked_until').in('key', keys);
      if (attempts?.some(a => a.locked_until && Date.parse(a.locked_until) > Date.now())) {
        return { ok: false, error: 'Too many attempts. Please try again in 15 minutes.' };
      }
    } catch {}

    let access: Access | null = null;

    if (data.mode === 'admin') {
      const expected = process.env['ADMIN_PASSCODE'] || 'admin123';
      let match = data.passcode.length === expected.length;
      let diff = 0;
      for (let i = 0; i < Math.max(data.passcode.length, expected.length); i++) {
        diff |= (data.passcode.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
      }
      if (match && diff === 0 && data.actor) {
        access = { role: 'admin', actor: data.actor, expires: Date.now() + SESSION_SECONDS * 1000 };
      }
    } else if (PIN_PATTERN.test(data.passcode)) {
      // 1. Check server-store customers
      const store = await readServerStore();
      const hash = pinHash(data.passcode);
      const cust = store.customers.find(c => c.pin === data.passcode || c.pin_hash === hash);
      if (cust) {
        if (!cust.active) {
          return { ok: false, error: 'This customer account is deactivated. Contact admin.' };
        }
        access = {
          role: 'customer',
          actor: cust.name,
          customer_id: cust.id,
          pin_version: cust.pin_version,
          expires: Date.now() + SESSION_SECONDS * 1000,
        };
      }

      // 2. Fallback to Supabase if available
      if (!access) {
        try {
          const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
          const { data: customer } = await db
            .from('feedback_customers')
            .select('id,name,pin_version')
            .eq('pin_hash', hash)
            .eq('active', true)
            .maybeSingle();
          if (customer) {
            access = {
              role: 'customer',
              actor: customer.name,
              customer_id: customer.id,
              pin_version: customer.pin_version,
              expires: Date.now() + SESSION_SECONDS * 1000,
            };
          }
        } catch {}
      }
    }

    if (!access) {
      try {
        const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
        await db.rpc('feedback_record_failure', { attempt_keys: keys });
      } catch {}
      return { ok: false, error: 'Access details are incorrect. Please try again.' };
    }

    await s.update({ access });
    return { ok: true, error: null };
  });

export const signOut = createServerFn({ method: 'POST' }).handler(async () => {
  try {
    const { session } = await import('./feedback-session.server');
    await (await session()).clear();
  } catch {}
  return { ok: true };
});

export const clearWorkspaceData = createServerFn({ method: 'POST' }).handler(async () => {
  const { requireAccess } = await import('./feedback-session.server');
  await requireAccess(true);

  // Clear persistent server store
  await clearServerWorkspace();

  // Try clearing Supabase if configured
  try {
    const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
    await db.from('feedback_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await db.from('feedback_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await db.from('feedback_customers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  } catch {}

  return { ok: true };
});

export const getWorkspace = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ customers: Customer[]; items: FeedbackItem[]; history: HistoryEntry[] }> => {
    try {
      const { session } = await import('./feedback-session.server');
      const s = await session();
      const access = s.data.access ?? null;
      if (!access || access.expires < Date.now()) {
        return { customers: [], items: [], history: [] };
      }
      return await getServerWorkspace(access);
    } catch {
      return { customers: [], items: [], history: [] };
    }
  },
);

export const saveItem = createServerFn({ method: 'POST' })
  .inputValidator(v =>
    z
      .object({
        item: itemSchema,
        id: z.string().uuid().optional(),
        version: z.number().int().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data }) => {
    const { requireAccess } = await import('./feedback-session.server');
    const access = await requireAccess();

    // Customer can only save/submit for their own customer_id
    if (access.role === 'customer' && data.item.customer_id !== access.customer_id) {
      throw new Error('Unauthorized customer feedback submission.');
    }

    const saved = await saveServerItem(
      data.item,
      access.actor,
      data.id,
      data.version,
      access.role === 'customer',
    );

    // Try mirroring to Supabase if configured
    try {
      const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
      const { needs_review: _nr, image: _img, report_date: _rd, ...dbItem } = data.item;
      if (data.id) {
        await db
          .from('feedback_items')
          .update({ ...dbItem, actor: access.actor })
          .eq('id', data.id);
      } else {
        await db.from('feedback_items').insert({ ...dbItem, actor: access.actor, id: saved.id });
      }
    } catch {}

    return { ok: true, item: saved };
  });

export const deleteItem = createServerFn({ method: 'POST' })
  .inputValidator(v =>
    z
      .object({
        id: z.string().uuid(),
        version: z.number().int(),
        restore: z.boolean(),
      })
      .parse(v),
  )
  .handler(async ({ data }) => {
    const { requireAccess } = await import('./feedback-session.server');
    const access = await requireAccess(true);

    await deleteServerItem(data.id, data.version, data.restore, access.actor);

    // Try Supabase mirror
    try {
      const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
      await db
        .from('feedback_items')
        .update({
          deleted_at: data.restore ? null : new Date().toISOString(),
          actor: access.actor,
        })
        .eq('id', data.id);
    } catch {}

    return { ok: true };
  });

export const manageCustomer = createServerFn({ method: 'POST' })
  .inputValidator(v =>
    z
      .object({
        action: z.enum(['create', 'regenerate', 'toggle', 'delete']),
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(150),
      })
      .parse(v),
  )
  .handler(async ({ data }) => {
    const { requireAccess } = await import('./feedback-session.server');
    const access = await requireAccess(true);

    const result = await manageServerCustomer(data.action, data.name, data.id, access.actor);
    return { pin: result.pin ?? null };
  });

export const importFeedback = createServerFn({ method: 'POST' })
  .inputValidator(v =>
    z
      .object({
        rows: z.array(
          itemSchema.extend({
            customer_name: z.string().trim().min(1),
            is_update: z.boolean().optional(),
          }),
        ),
      })
      .parse(v),
  )
  .handler(async ({ data }) => {
    const { requireAccess } = await import('./feedback-session.server');
    const access = await requireAccess(true);

    return await importServerItems(data.rows as any, access.actor);
  });

export const syncClientWorkspace = createServerFn({ method: 'POST' })
  .inputValidator(v =>
    z
      .object({
        items: z.array(z.any()),
        customers: z.array(z.any()),
        history: z.array(z.any()),
      })
      .parse(v),
  )
  .handler(async ({ data }) => {
    try {
      const { session } = await import('./feedback-session.server');
      const s = await session();
      if (!s.data.access) return { synced: false };
      const synced = await syncClientDataToServer({
        items: data.items,
        customers: data.customers,
        history: data.history,
      });
      return { synced };
    } catch {
      return { synced: false };
    }
  });