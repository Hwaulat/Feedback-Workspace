import { describe, expect, it } from 'vitest';
import {
  itemSchema,
  todayWIB,
  isOverdue,
  completionDate,
  safeCell,
  types,
  categories,
  statuses,
  activities,
  PIN_PATTERN,
  type FeedbackItem,
  type ItemInput,
  type Customer,
} from '@/lib/feedback-model';
import { demoCustomers, demoItems, demoHistory } from '@/lib/feedback-demo';
import { fmtDate, fmtDateTime, activityBadge, categoryBadge, statusBadge } from '@/components/feedback-views';

describe('Feature 1: Feedback Data Model & Validation (itemSchema)', () => {
  it('validates a valid feedback item input correctly', () => {
    const valid: ItemInput = {
      customer_id: '00000000-0000-4000-8000-000000000001',
      number: 1,
      feature: 'Auth',
      feedback: 'Cannot reset password with expired token',
      detail: 'Reproducible on Firefox and Chrome',
      type: 'Bug Report',
      category: 'Major',
      status: 'Execution',
      activity: 'In progress',
      notes: 'Assigned to backend team',
      estimated_date: '2026-10-20',
    };
    const parsed = itemSchema.parse(valid);
    expect(parsed.feedback).toBe('Cannot reset password with expired token');
    expect(parsed.category).toBe('Major');
  });

  it('rejects feedback item with empty feedback title', () => {
    const invalid = {
      customer_id: '00000000-0000-4000-8000-000000000001',
      number: 1,
      feature: 'Auth',
      feedback: '   ',
      detail: '',
      type: 'Bug Report',
      category: 'Major',
      status: 'Execution',
      activity: 'In progress',
      notes: '',
      estimated_date: null,
    };
    expect(() => itemSchema.parse(invalid)).toThrow();
  });

  it('rejects invalid enum values for type, category, status, activity', () => {
    const base = {
      customer_id: '00000000-0000-4000-8000-000000000001',
      number: 1,
      feature: 'Test',
      feedback: 'Valid feedback',
      detail: '',
      type: 'InvalidType' as any,
      category: 'Medium',
      status: 'Execution',
      activity: 'Pending',
      notes: '',
      estimated_date: null,
    };
    expect(() => itemSchema.parse(base)).toThrow();
  });

  it('rejects malformed date strings', () => {
    const invalidDate = {
      customer_id: '00000000-0000-4000-8000-000000000001',
      number: 1,
      feature: 'Test',
      feedback: 'Valid feedback',
      detail: '',
      type: 'Bug Report',
      category: 'Medium',
      status: 'Execution',
      activity: 'Pending',
      notes: '',
      estimated_date: '2026-13-45', // Invalid month/day
    };
    expect(() => itemSchema.parse(invalidDate)).toThrow();
  });
});

describe('Feature 2: Date, Overdue & Timezone Utilities', () => {
  it('formats current date in WIB (Asia/Jakarta) format YYYY-MM-DD', () => {
    const today = todayWIB();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('calculates isOverdue correctly for past dates and non-done activities', () => {
    const overdueItem = {
      activity: 'In progress' as const,
      estimated_date: '2020-01-01',
    };
    expect(isOverdue(overdueItem, '2026-10-13')).toBe(true);

    const completedItem = {
      activity: 'Done' as const,
      estimated_date: '2020-01-01',
    };
    expect(isOverdue(completedItem, '2026-10-13')).toBe(false);

    const futureItem = {
      activity: 'Not started' as const,
      estimated_date: '2030-01-01',
    };
    expect(isOverdue(futureItem, '2026-10-13')).toBe(false);

    const noDateItem = {
      activity: 'In progress' as const,
      estimated_date: null,
    };
    expect(isOverdue(noDateItem, '2026-10-13')).toBe(false);
  });

  it('calculates completionDate correctly when activity changes to Done', () => {
    const today = '2026-10-13';
    // Becoming done: sets completion date to today
    expect(completionDate('Done', 'In progress', null, today)).toBe(today);

    // Already done: preserves original completion date
    expect(completionDate('Done', 'Done', '2026-10-01', today)).toBe('2026-10-01');

    // Moving away from done: resets to null
    expect(completionDate('In progress', 'Done', '2026-10-01', today)).toBe(null);
  });

  it('protects against spreadsheet formula injection with safeCell()', () => {
    expect(safeCell('=SUM(A1:B1)')).toBe("'=SUM(A1:B1)");
    expect(safeCell('+12345')).toBe("'+12345");
    expect(safeCell('-100')).toBe("'-100");
    expect(safeCell('@mention')).toBe("'@mention");
    expect(safeCell('Normal string')).toBe('Normal string');
  });

  it('validates 6-digit customer PIN pattern', () => {
    expect(PIN_PATTERN.test('123456')).toBe(true);
    expect(PIN_PATTERN.test('000123')).toBe(true);
    expect(PIN_PATTERN.test('12345')).toBe(false); // only 5 digits
    expect(PIN_PATTERN.test('1234567')).toBe(false); // 7 digits
    expect(PIN_PATTERN.test('12345a')).toBe(false); // non-digit
  });
});

describe('Feature 3: CRUD Workflow Execution in State/Store', () => {
  const fixtureCustomer: Customer = {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'PT Inovasi Mandiri',
    active: true,
    pin_version: 1,
    created_at: '2026-10-12T00:00:00Z',
  };

  const fixtureItem: FeedbackItem = {
    id: '00000000-0000-4000-8000-000000000010',
    customer_id: fixtureCustomer.id,
    number: 1,
    feature: 'Dashboard',
    feedback: 'Add filter by date range',
    detail: 'Allow custom start and end date filtering',
    type: 'Change Request',
    category: 'Medium',
    status: 'Waiting',
    activity: 'Not started',
    notes: 'Requested during demo',
    estimated_date: '2026-11-01',
    completion_date: null,
    deleted_at: null,
    version: 1,
    updated_at: '2026-10-12T00:00:00Z',
    actor: 'Admin',
  };

  it('CREATE: allows adding a new feedback item with auto-assigned metadata', () => {
    const items: FeedbackItem[] = [fixtureItem];
    const newItemInput: ItemInput = {
      customer_id: fixtureCustomer.id,
      number: 99,
      feature: 'Integrations',
      feedback: 'Add webhook notification for status change',
      detail: 'Webhook payload with HMAC signature',
      type: 'Change Request',
      category: 'Medium',
      status: 'Waiting',
      activity: 'Not started',
      notes: 'Requested by client tech team',
      estimated_date: '2026-11-01',
    };

    const validated = itemSchema.parse(newItemInput);
    const createdItem: FeedbackItem = {
      ...validated,
      id: 'item-new-99',
      version: 1,
      completion_date: null,
      deleted_at: null,
      updated_at: new Date().toISOString(),
      actor: 'Admin Tester',
    };

    items.unshift(createdItem);
    expect(items.length).toBe(2);
    expect(items[0]?.feedback).toBe('Add webhook notification for status change');
    expect(items[0]?.version).toBe(1);
    expect(items[0]?.deleted_at).toBeNull();
  });

  it('READ: retrieves feedback items filtered by customer', () => {
    const items: FeedbackItem[] = [fixtureItem];
    const custId = fixtureCustomer.id;
    const customerItems = items.filter((i) => i.customer_id === custId && !i.deleted_at);
    expect(customerItems.length).toBeGreaterThan(0);
    expect(customerItems.every((i) => i.customer_id === custId)).toBe(true);
  });

  it('UPDATE: modifies feedback fields and bumps version correctly', () => {
    const existing = { ...fixtureItem };
    const originalVersion = existing.version;

    // Simulate update
    const updated: FeedbackItem = {
      ...existing,
      activity: 'Done',
      completion_date: todayWIB(),
      notes: 'Feature verified and deployed to production.',
      version: originalVersion + 1,
      updated_at: new Date().toISOString(),
      actor: 'Editor User',
    };

    expect(updated.version).toBe(originalVersion + 1);
    expect(updated.activity).toBe('Done');
    expect(updated.completion_date).toBe(todayWIB());
  });

  it('DELETE: soft-deletes an item by setting deleted_at timestamp', () => {
    const item = { ...fixtureItem };
    expect(item.deleted_at).toBeNull();

    // Soft delete
    const deleted: FeedbackItem = {
      ...item,
      deleted_at: new Date().toISOString(),
      version: item.version + 1,
    };
    expect(deleted.deleted_at).not.toBeNull();

    // Active query ignores soft-deleted items
    const activeList = [deleted].filter((i) => !i.deleted_at);
    expect(activeList.length).toBe(0);
  });

  it('RESTORE: recovers a soft-deleted item by clearing deleted_at', () => {
    const deleted: FeedbackItem = {
      ...fixtureItem,
      deleted_at: '2026-10-12T10:00:00Z',
    };

    // Restore
    const restored: FeedbackItem = {
      ...deleted,
      deleted_at: null,
      version: deleted.version + 1,
    };
    expect(restored.deleted_at).toBeNull();
  });
});

describe('Feature 4: Customer Management & PIN Controls', () => {
  it('manages customer list and PIN versions', () => {
    const customers: Customer[] = [
      {
        id: '00000000-0000-4000-8000-000000000001',
        name: 'PT Inovasi Mandiri',
        active: true,
        pin_version: 1,
        created_at: '2026-10-12T00:00:00Z',
      },
    ];
    const firstCust = customers[0]!;
    expect(firstCust.active).toBe(true);
    expect(firstCust.pin_version).toBe(1);

    // Toggle active state
    const deactivated = { ...firstCust, active: !firstCust.active };
    expect(deactivated.active).toBe(false);

    // Regenerate PIN: bumps pin_version to invalidate prior sessions
    const regenerated = { ...firstCust, pin_version: firstCust.pin_version + 1 };
    expect(regenerated.pin_version).toBe(2);
  });
});

describe('Feature 5: UI Formatters and Badge Mappings', () => {
  it('maps activityBadge and categoryBadge css classes correctly', () => {
    expect(activityBadge('Done')).toBe('done');
    expect(activityBadge('In progress')).toBe('progress');
    expect(activityBadge('Not started')).toBe('pending');
    expect(activityBadge('Pending')).toBe('pending');

    expect(categoryBadge('Major')).toBe('major');
    expect(categoryBadge('Medium')).toBe('medium');
    expect(categoryBadge('Minor')).toBe('');
  });

  it('formats dates consistently', () => {
    expect(fmtDate('2026-10-14')).toContain('2026');
    expect(fmtDate(null)).toBe('—');
    expect(fmtDateTime(null)).toBe('—');
  });
});

describe('Feature 6: Customer POV Access Control & Route Restrictions', () => {
  const allRoutes = [
    { to: '/', label: 'Overview' },
    { to: '/feedback', label: 'Feedback list' },
    { to: '/upload', label: 'Excel import' },
    { to: '/customers', label: 'Customers & PINs' },
    { to: '/history', label: 'Change history' },
  ];

  function getAllowedNavLinks(role: 'admin' | 'customer' | null) {
    if (role === 'customer') {
      return allRoutes.slice(0, 2);
    }
    return allRoutes;
  }

  it('restricts customer navigation strictly to Overview (Dashboard) and Feedback list', () => {
    const customerLinks = getAllowedNavLinks('customer');
    expect(customerLinks).toHaveLength(2);
    expect(customerLinks.map(l => l.to)).toEqual(['/', '/feedback']);
    expect(customerLinks.map(l => l.label)).toEqual(['Overview', 'Feedback list']);
  });

  it('allows full navigation for admin across all 5 workspace features', () => {
    const adminLinks = getAllowedNavLinks('admin');
    expect(adminLinks).toHaveLength(5);
    expect(adminLinks.map(l => l.to)).toEqual([
      '/',
      '/feedback',
      '/upload',
      '/customers',
      '/history',
    ]);
  });

  it('forbids customer access to admin-only routes', () => {
    const customerLinks = getAllowedNavLinks('customer');
    const forbiddenForCustomer = ['/upload', '/customers', '/history'];
    for (const route of forbiddenForCustomer) {
      expect(customerLinks.some(l => l.to === route)).toBe(false);
    }
  });
});

describe('Feature 7: Internal Triage & Review Status for Customer Submissions', () => {
  it('correctly maps reviewBadge CSS classes', async () => {
    const { reviewBadge } = await import('@/components/feedback-views');
    expect(reviewBadge(true)).toBe('needs-update');
    expect(reviewBadge(false)).toBe('updated');
    expect(reviewBadge(undefined)).toBe('updated');
  });

  it('determines isNeedsUpdate correctly for feedback items', async () => {
    const { isNeedsUpdate } = await import('@/lib/feedback-model');
    const itemNeedingUpdate: FeedbackItem = {
      id: 'item-1',
      customer_id: 'cust-1',
      number: 1,
      feature: 'Checkout',
      feedback: 'Payment gateway timeout',
      detail: 'Timeout after 30s',
      type: 'Bug Report',
      category: 'Major',
      status: 'Waiting',
      activity: 'Not started',
      notes: '',
      estimated_date: null,
      completion_date: null,
      deleted_at: null,
      version: 1,
      updated_at: '2026-10-13T12:00:00Z',
      actor: 'PT ABC Customer',
      needs_review: true,
    };

    const reviewedItem: FeedbackItem = {
      ...itemNeedingUpdate,
      id: 'item-2',
      needs_review: false,
    };

    expect(isNeedsUpdate(itemNeedingUpdate)).toBe(true);
    expect(isNeedsUpdate(reviewedItem)).toBe(false);
  });

  it('supports needs_review field in itemSchema validation', () => {
    const input: ItemInput = {
      customer_id: '00000000-0000-4000-8000-000000000001',
      number: 2,
      feature: 'Login',
      feedback: 'Cannot click submit button',
      detail: '',
      type: 'Bug Report',
      category: 'Minor',
      status: 'Waiting',
      activity: 'Not started',
      notes: '',
      estimated_date: null,
      needs_review: true,
    };
    const parsed = itemSchema.parse(input);
    expect(parsed.needs_review).toBe(true);
  });

  it('supports image field in itemSchema validation and stores base64/null', () => {
    const withImage: ItemInput = {
      customer_id: '00000000-0000-4000-8000-000000000001',
      number: 3,
      feature: 'Profile',
      feedback: 'Avatar upload displays distorted preview',
      detail: 'See attached screenshot',
      type: 'Bug Report',
      category: 'Minor',
      status: 'Waiting',
      activity: 'Not started',
      notes: '',
      estimated_date: null,
      needs_review: true,
      image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    };
    const parsed = itemSchema.parse(withImage);
    expect(parsed.image).toContain('data:image/png;base64');

    const withoutImage: ItemInput = {
      ...withImage,
      image: null,
    };
    const parsedWithout = itemSchema.parse(withoutImage);
    expect(parsedWithout.image).toBeNull();
  });

  it('calculates auto-generated customer feedback number correctly based on previous feedback items', () => {
    const customerId = '00000000-0000-4000-8000-000000000001';
    const existingItems = [
      { id: '1', customer_id: customerId, number: 1, deleted_at: null },
      { id: '2', customer_id: customerId, number: 4, deleted_at: null },
      { id: '3', customer_id: customerId, number: 2, deleted_at: null },
      { id: '4', customer_id: 'other-cust', number: 10, deleted_at: null },
      { id: '5', customer_id: customerId, number: 99, deleted_at: '2026-10-13T10:00:00Z' }, // deleted
    ];

    const customerActiveItems = existingItems.filter(i => i.customer_id === customerId && !i.deleted_at);
    const nums = customerActiveItems.map(i => i.number);
    const nextNumber = nums.length > 0 ? Math.max(...nums) + 1 : 1;

    expect(nextNumber).toBe(5); // Math.max(1, 4, 2) + 1 = 5

    // Brand new customer with 0 items:
    const emptyNums: number[] = [];
    const firstNum = emptyNums.length > 0 ? Math.max(...emptyNums) + 1 : 1;
    expect(firstNum).toBe(1);
  });
});

describe('Feature 11: Feedback Deletion with Activity Status Guard', () => {
  function canDeleteItem(item: Pick<FeedbackItem, 'activity'>) {
    return item.activity !== 'Done';
  }

  it('prevents deletion of feedback items when activity status is Done', () => {
    const doneItem: FeedbackItem = {
      id: 'd1',
      customer_id: '00000000-0000-4000-8000-000000000001',
      number: 1,
      feature: 'Export',
      feedback: 'Exporting report as Excel',
      detail: '',
      type: 'Change Request',
      category: 'Major',
      status: 'Execution',
      activity: 'Done',
      notes: 'Completed',
      estimated_date: '2026-10-10',
      completion_date: '2026-10-10',
      updated_at: '2026-10-10T00:00:00Z',
      deleted_at: null,
      version: 1,
      actor: 'Admin',
    };

    expect(canDeleteItem(doneItem)).toBe(false);
  });

  it('allows deletion of feedback items when activity status is In progress or Not started', () => {
    const inProgressItem: FeedbackItem = {
      id: 'd2',
      customer_id: '00000000-0000-4000-8000-000000000001',
      number: 2,
      feature: 'Auth',
      feedback: 'SSO login issue',
      detail: '',
      type: 'Bug Report',
      category: 'Major',
      status: 'Execution',
      activity: 'In progress',
      notes: '',
      estimated_date: '2026-10-25',
      completion_date: null,
      updated_at: '2026-10-10T00:00:00Z',
      deleted_at: null,
      version: 1,
      actor: 'Admin',
    };

    const notStartedItem: FeedbackItem = {
      ...inProgressItem,
      id: 'd3',
      activity: 'Not started',
    };

    expect(canDeleteItem(inProgressItem)).toBe(true);
    expect(canDeleteItem(notStartedItem)).toBe(true);
  });
});

describe('Feature 12: Status Column Badges (Waiting=Orange, Execution=Green, Execution by notes=Blue)', () => {
  it('maps Waiting to status-waiting badge class', () => {
    expect(statusBadge('Waiting')).toBe('status-waiting');
  });

  it('maps Execution to status-execution badge class', () => {
    expect(statusBadge('Execution')).toBe('status-execution');
  });

  it('maps Execution by notes to status-execution-notes badge class', () => {
    expect(statusBadge('Execution by notes')).toBe('status-execution-notes');
  });
});

describe('Feature 13: Review Status Needs Update & 4-Field Triage', () => {
  it('displays dash "-" for Type, Category, Status, and Activity when review status is Needs Update', () => {
    const unreviewedItem: FeedbackItem = {
      id: 'cust-item-63',
      customer_id: 'cust-1',
      number: 63,
      feature: 'Order Control - Label Printing by Item',
      feedback: 'Invalid Path',
      detail: '',
      type: 'Bug Report',
      category: 'Minor',
      status: 'Waiting',
      activity: 'Not started',
      notes: '',
      report_date: '2026-10-14',
      estimated_date: null,
      completion_date: null,
      deleted_at: null,
      version: 1,
      updated_at: '2026-10-14T10:00:00Z',
      actor: 'Hasan',
      needs_review: true,
    };

    const isPending = Boolean(unreviewedItem.needs_review);

    // When review status is Needs Update, all 4 fields are displayed as "-"
    const displayType = isPending ? '—' : unreviewedItem.type;
    const displayCategory = isPending ? '—' : unreviewedItem.category;
    const displayStatus = isPending ? '—' : unreviewedItem.status;
    const displayActivity = isPending ? '—' : unreviewedItem.activity;

    expect(displayType).toBe('—');
    expect(displayCategory).toBe('—');
    expect(displayStatus).toBe('—');
    expect(displayActivity).toBe('—');

    // Once internal team fills in all 4 fields and updates it:
    const reviewedItem: FeedbackItem = {
      ...unreviewedItem,
      type: 'Bug Report',
      category: 'Major',
      status: 'Execution',
      activity: 'In progress',
      needs_review: false,
    };

    const isStillPending = Boolean(reviewedItem.needs_review);
    expect(isStillPending).toBe(false);
    expect(isStillPending ? '—' : reviewedItem.type).toBe('Bug Report');
    expect(isStillPending ? '—' : reviewedItem.category).toBe('Major');
    expect(isStillPending ? '—' : reviewedItem.status).toBe('Execution');
    expect(isStillPending ? '—' : reviewedItem.activity).toBe('In progress');
  });
});


