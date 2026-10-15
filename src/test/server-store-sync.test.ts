import { describe, expect, it, beforeEach } from 'vitest';
import {
  readServerStore,
  writeServerStore,
  getServerWorkspace,
  saveServerItem,
  deleteServerItem,
  manageServerCustomer,
  importServerItems,
  clearServerWorkspace,
  syncClientDataToServer,
} from '@/lib/server-store';
import { type ItemInput } from '@/lib/feedback-model';

describe('Server Store Multi-Browser Synchronization', () => {
  beforeEach(async () => {
    await clearServerWorkspace();
  });

  it('starts with empty workspace', async () => {
    const store = await readServerStore();
    expect(store.items).toEqual([]);
    expect(store.customers).toEqual([]);
    expect(store.history).toEqual([]);
  });

  it('returns empty data when access is null (unauthenticated)', async () => {
    // Add an item first
    const cust = await manageServerCustomer('create', 'PT Alpha');
    const store = await readServerStore();
    const custId = store.customers[0]!.id;

    await saveServerItem(
      {
        customer_id: custId,
        number: 1,
        feature: 'Login',
        feedback: 'Bug in login',
        detail: '',
        type: 'Bug Report',
        category: 'Major',
        status: 'Execution',
        activity: 'In progress',
        notes: '',
        estimated_date: null,
      },
      'Admin',
    );

    const unauthData = await getServerWorkspace(null);
    expect(unauthData.items).toEqual([]);
    expect(unauthData.customers).toEqual([]);
    expect(unauthData.history).toEqual([]);
  });

  it('returns all items for admin access', async () => {
    await manageServerCustomer('create', 'PT Alpha');
    const store = await readServerStore();
    const custId = store.customers[0]!.id;

    const saved = await saveServerItem(
      {
        customer_id: custId,
        number: 101,
        feature: 'Dashboard',
        feedback: 'Need dark mode',
        detail: '',
        type: 'Change Request',
        category: 'Medium',
        status: 'Waiting',
        activity: 'Not started',
        notes: 'Ragdalion notes',
        estimated_date: '2026-11-01',
      },
      'Admin User',
    );

    const adminData = await getServerWorkspace({
      role: 'admin',
      actor: 'Admin User',
      expires: Date.now() + 10000,
    });

    expect(adminData.items.length).toBe(1);
    expect(adminData.items[0]!.feedback).toBe('Need dark mode');
    expect(adminData.items[0]!.report_date).toBeDefined();
    expect(adminData.customers.length).toBe(1);
    expect(adminData.history.length).toBeGreaterThan(0);
  });

  it('filters items for customer access', async () => {
    const resA = await manageServerCustomer('create', 'Customer A');
    const resB = await manageServerCustomer('create', 'Customer B');
    const store = await readServerStore();
    const custA = resA.customer || store.customers.find(c => c.name === 'Customer A')!;
    const custB = resB.customer || store.customers.find(c => c.name === 'Customer B')!;

    await saveServerItem(
      {
        customer_id: custA.id,
        number: 1,
        feature: 'Feature A',
        feedback: 'Feedback for A',
        detail: '',
        type: 'Bug Report',
        category: 'Minor',
        status: 'Execution',
        activity: 'In progress',
        notes: '',
        estimated_date: null,
      },
      'Customer A',
    );

    await saveServerItem(
      {
        customer_id: custB.id,
        number: 2,
        feature: 'Feature B',
        feedback: 'Feedback for B',
        detail: '',
        type: 'Bug Report',
        category: 'Minor',
        status: 'Execution',
        activity: 'In progress',
        notes: '',
        estimated_date: null,
      },
      'Customer B',
    );

    const dataA = await getServerWorkspace({
      role: 'customer',
      actor: 'Customer A',
      customer_id: custA.id,
      expires: Date.now() + 10000,
    });

    expect(dataA.items.length).toBe(1);
    expect(dataA.items[0]!.feedback).toBe('Feedback for A');
    expect(dataA.customers.length).toBe(1);
    expect(dataA.customers[0]!.name).toBe('Customer A');
  });

  it('imports batch items and creates missing customers with PINs', async () => {
    const rows = [
      {
        customer_name: 'Client X',
        customer_id: '00000000-0000-0000-0000-000000000001',
        number: 1,
        feature: 'Billing',
        feedback: 'Invoice PDF error',
        detail: '',
        type: 'Bug Report' as const,
        category: 'Major' as const,
        status: 'Execution' as const,
        activity: 'Not started' as const,
        notes: '',
        estimated_date: null,
        report_date: '2026-10-14',
      },
      {
        customer_name: 'Client Y',
        customer_id: '00000000-0000-0000-0000-000000000002',
        number: 2,
        feature: 'Reports',
        feedback: 'Add export to CSV',
        detail: '',
        type: 'Change Request' as const,
        category: 'Medium' as const,
        status: 'Waiting' as const,
        activity: 'Not started' as const,
        notes: '',
        estimated_date: null,
        report_date: '2026-10-14',
      },
    ];

    const result = await importServerItems(rows, 'Excel Importer');
    expect(result.count).toBe(2);
    expect(result.pins.length).toBe(2);

    const store = await readServerStore();
    expect(store.items.length).toBe(2);
    expect(store.customers.length).toBe(2);
  });

  it('syncs client data to server when server store is empty (Chrome -> Server migration)', async () => {
    const clientItems = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        customer_id: '22222222-2222-2222-2222-222222222222',
        number: 1,
        feature: 'UI',
        feedback: 'Uploaded in Chrome',
        detail: '',
        type: 'Complaint' as const,
        category: 'Minor' as const,
        status: 'Execution' as const,
        activity: 'Done' as const,
        notes: '',
        estimated_date: null,
        completion_date: '2026-10-14',
        deleted_at: null,
        version: 1,
        updated_at: '2026-10-14T08:00:00.000Z',
        actor: 'Chrome User',
      },
    ];
    const clientCustomers = [
      {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'Client Alpha',
        active: true,
        pin_version: 1,
        created_at: '2026-10-14T08:00:00.000Z',
        pin: '123456',
      },
    ];

    const synced = await syncClientDataToServer({
      items: clientItems,
      customers: clientCustomers,
      history: [],
    });

    expect(synced).toBe(true);

    const store = await readServerStore();
    expect(store.items.length).toBe(1);
    expect(store.items[0]!.feedback).toBe('Uploaded in Chrome');
    expect(store.customers.length).toBe(1);
    expect(store.customers[0]!.pin_hash).toBeDefined();
  });

  it('guarantees sequential numbering on multiple consecutive customer submissions without skipping', async () => {
    const { customer } = await manageServerCustomer('create', 'PT Customer Test');
    expect(customer).toBeDefined();
    const custId = customer!.id;

    // Customer submit 1
    const item1 = await saveServerItem(
      {
        customer_id: custId,
        number: 1,
        feature: 'Feature 1',
        feedback: 'First customer feedback',
        detail: '',
        type: 'Bug Report',
        category: 'Minor',
        status: 'Waiting',
        activity: 'Not started',
        notes: '',
        estimated_date: null,
      },
      'Customer Test',
      undefined,
      undefined,
      true,
    );

    expect(item1.number).toBe(1);

    // Customer submit 2
    const item2 = await saveServerItem(
      {
        customer_id: custId,
        number: 1, // client might send duplicate or stale number
        feature: 'Feature 2',
        feedback: 'Second customer feedback',
        detail: '',
        type: 'Bug Report',
        category: 'Minor',
        status: 'Waiting',
        activity: 'Not started',
        notes: '',
        estimated_date: null,
      },
      'Customer Test',
      undefined,
      undefined,
      true,
    );

    // Number must be 2, strictly sequential!
    expect(item2.number).toBe(2);

    // Customer submit 3
    const item3 = await saveServerItem(
      {
        customer_id: custId,
        number: 2,
        feature: 'Feature 3',
        feedback: 'Third customer feedback',
        detail: '',
        type: 'Bug Report',
        category: 'Minor',
        status: 'Waiting',
        activity: 'Not started',
        notes: '',
        estimated_date: null,
      },
      'Customer Test',
      undefined,
      undefined,
      true,
    );

    expect(item3.number).toBe(3);

    // Verify all 3 items exist in customer workspace and none disappeared!
    const ws = await getServerWorkspace({
      role: 'customer',
      actor: 'Customer Test',
      customer_id: custId,
      expires: Date.now() + 10000,
    });

    expect(ws.items.length).toBe(3);
    const numbers = ws.items.map(i => i.number).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3]);
  });

  it('guarantees numbering increases sequentially even after an item is soft-deleted', async () => {
    const { customer } = await manageServerCustomer('create', 'PT Delete Test');
    const custId = customer!.id;

    // Submit #1
    const i1 = await saveServerItem(
      {
        customer_id: custId,
        number: 1,
        feature: 'A',
        feedback: 'Item 1',
        detail: '',
        type: 'Bug Report',
        category: 'Minor',
        status: 'Waiting',
        activity: 'Not started',
        notes: '',
        estimated_date: null,
      },
      'Customer',
      undefined,
      undefined,
      true,
    );
    expect(i1.number).toBe(1);

    // Submit #2
    const i2 = await saveServerItem(
      {
        customer_id: custId,
        number: 2,
        feature: 'B',
        feedback: 'Item 2',
        detail: '',
        type: 'Bug Report',
        category: 'Minor',
        status: 'Waiting',
        activity: 'Not started',
        notes: '',
        estimated_date: null,
      },
      'Customer',
      undefined,
      undefined,
      true,
    );
    expect(i2.number).toBe(2);

    // Soft delete #2
    await deleteServerItem(i2.id, i2.version, false, 'Admin');

    // Customer workspace only sees #1 (not the deleted #2)
    const wsBefore = await getServerWorkspace({
      role: 'customer',
      actor: 'Customer',
      customer_id: custId,
      expires: Date.now() + 10000,
    });
    expect(wsBefore.items.length).toBe(1);
    expect(wsBefore.items[0]!.number).toBe(1);

    // Customer now submits a new item. It MUST assign #2 (the next number after active item #1)!
    const i3 = await saveServerItem(
      {
        customer_id: custId,
        number: 1, // Client might send 1
        feature: 'C',
        feedback: 'Item 3 (replaces deleted 2)',
        detail: '',
        type: 'Bug Report',
        category: 'Minor',
        status: 'Waiting',
        activity: 'Not started',
        notes: '',
        estimated_date: null,
      },
      'Customer',
      undefined,
      undefined,
      true,
    );

    // Number must be 2, strictly following the active data (1 -> 2)!
    expect(i3.number).toBe(2);

    // Customer workspace now has both active items #1 and #2
    const wsAfter = await getServerWorkspace({
      role: 'customer',
      actor: 'Customer',
      customer_id: custId,
      expires: Date.now() + 10000,
    });
    expect(wsAfter.items.length).toBe(2);
    expect(wsAfter.items.map(i => i.number).sort((a, b) => a - b)).toEqual([1, 2]);
  });
});
