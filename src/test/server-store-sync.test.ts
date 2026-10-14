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
    await manageServerCustomer('create', 'Customer A');
    await manageServerCustomer('create', 'Customer B');
    const store = await readServerStore();
    const custA = store.customers.find(c => c.name === 'Customer A')!;
    const custB = store.customers.find(c => c.name === 'Customer B')!;

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
});
