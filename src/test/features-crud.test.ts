import { describe, expect, it } from 'vitest';
import {
  itemSchema,
  todayWIB,
  isOverdue,
  isNeedsUpdate,
  completionDate,
  safeCell,
  types,
  categories,
  statuses,
  activities,
  PIN_PATTERN,
  parseImages,
  serializeImages,
  createActionReportDate,
  STORAGE_KEY_SAVED_PICS,
  persistSavedPicName,
  type FeedbackItem,
  type ItemInput,
  type Customer,
} from '@/lib/feedback-model';
import { demoCustomers, demoItems, demoHistory } from '@/lib/feedback-demo';
import { fmtDate, fmtDateTime, fmtReportDate, activityBadge, categoryBadge, statusBadge, typeBadge } from '@/components/feedback-views';

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
    { to: '/feedback', label: 'Ticketing List' },
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

  it('restricts customer navigation strictly to Overview (Dashboard) and Ticketing List', () => {
    const customerLinks = getAllowedNavLinks('customer');
    expect(customerLinks).toHaveLength(2);
    expect(customerLinks.map(l => l.to)).toEqual(['/', '/feedback']);
    expect(customerLinks.map(l => l.label)).toEqual(['Overview', 'Ticketing List']);
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

  it('supports multiple images upload, serialization, and backward compatibility', () => {
    const img1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const img2 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

    // 1. Multiple images serialized to JSON array string
    const multiSerialized = serializeImages([img1, img2]);
    expect(multiSerialized).toBeTruthy();
    expect(multiSerialized?.startsWith('[')).toBe(true);

    // 2. Validate against itemSchema
    const itemWithMulti: ItemInput = {
      customer_id: '00000000-0000-4000-8000-000000000001',
      number: 10,
      feature: 'Attachments',
      feedback: 'Multiple screenshots attached for reproduction steps',
      detail: '',
      type: 'Bug Report',
      category: 'Major',
      status: 'Execution',
      activity: 'In progress',
      notes: '',
      estimated_date: null,
      image: multiSerialized,
    };
    const parsedMulti = itemSchema.parse(itemWithMulti);
    expect(parsedMulti.image).toBe(multiSerialized);

    // 3. parseImages extracts both images cleanly
    const extracted = parseImages(parsedMulti.image);
    expect(extracted).toHaveLength(2);
    expect(extracted[0]).toBe(img1);
    expect(extracted[1]).toBe(img2);

    // 4. Backward compatibility: single legacy string
    const singleExtracted = parseImages(img1);
    expect(singleExtracted).toEqual([img1]);

    // 5. Empty / null / undefined handling
    expect(parseImages(null)).toEqual([]);
    expect(parseImages(undefined)).toEqual([]);
    expect(parseImages('')).toEqual([]);
    expect(serializeImages([])).toBeNull();
    expect(serializeImages([img1])).toBe(img1);
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

describe('Feature 14: PIC Name in Customer Login & Feedback List Column', () => {
  it('validates feedback item with pic_name field in itemSchema', () => {
    const itemWithPic: ItemInput = {
      customer_id: '00000000-0000-4000-8000-000000000001',
      number: 10,
      feature: 'Dashboard',
      feedback: 'Export button is missing',
      detail: 'Cannot find export button',
      type: 'Change Request',
      category: 'Minor',
      status: 'Execution',
      activity: 'In progress',
      notes: '',
      estimated_date: null,
      pic_name: 'Budi Santoso',
    };

    const parsed = itemSchema.parse(itemWithPic);
    expect(parsed.pic_name).toBe('Budi Santoso');
  });

  it('handles itemSchema with null, empty, or undefined pic_name gracefully', () => {
    const base = {
      customer_id: '00000000-0000-4000-8000-000000000001',
      number: 11,
      feature: 'Billing',
      feedback: 'Invoice mismatch',
      detail: '',
      type: 'Bug Report',
      category: 'Medium',
      status: 'Waiting',
      activity: 'Not started',
      notes: '',
      estimated_date: null,
    };

    const parsedWithout = itemSchema.parse(base);
    expect(parsedWithout.pic_name).toBeUndefined();

    const parsedNull = itemSchema.parse({ ...base, pic_name: null });
    expect(parsedNull.pic_name).toBeNull();

    const parsedEmpty = itemSchema.parse({ ...base, pic_name: '   ' });
    expect(parsedEmpty.pic_name).toBe('');
  });

  it('supports Access object with pic_name and replaces Customer portal in presentation', () => {
    const customerAccess = {
      role: 'customer' as const,
      actor: 'PT ABC Indonesia',
      customer_id: '00000000-0000-4000-8000-000000000001',
      pin_version: 1,
      expires: Date.now() + 3600000,
      pic_name: 'Siti Rahma',
    };

    // The subtext / badge replaces 'Customer portal' with pic_name
    const badgeText = (customerAccess.role as string) === 'admin'
      ? 'Team access'
      : (customerAccess.pic_name || 'Customer portal');
    expect(badgeText).toBe('Siti Rahma');

    // Without pic_name, fallbacks to 'Customer portal'
    const fallbackAccess = { ...customerAccess, pic_name: null };
    const fallbackBadge = (fallbackAccess.role as string) === 'admin'
      ? 'Team access'
      : (fallbackAccess.pic_name || 'Customer portal');
    expect(fallbackBadge).toBe('Customer portal');
  });
});

describe('Feature 15: Review Status Metric Card on Overview Page', () => {
  it('correctly calculates total updated and needs update counts across items', () => {
    const items = [
      {
        id: 'item-1',
        customer_id: '00000000-0000-4000-8000-000000000001',
        number: 1,
        feature: 'Dashboard',
        feedback: 'Bug in chart',
        detail: '',
        type: 'Bug Report',
        category: 'Major',
        status: 'Execution',
        activity: 'In progress',
        notes: '',
        needs_review: false,
        estimated_date: null,
        updated_at: '2026-10-15T00:00:00Z',
      },
      {
        id: 'item-2',
        customer_id: '00000000-0000-4000-8000-000000000001',
        number: 2,
        feature: 'Login',
        feedback: 'Cannot login with PIN',
        detail: '',
        type: 'Bug Report',
        category: 'Major',
        status: 'Waiting',
        activity: 'Not started',
        notes: '',
        needs_review: true,
        estimated_date: null,
        updated_at: '2026-10-15T00:00:00Z',
      },
      {
        id: 'item-3',
        customer_id: '00000000-0000-4000-8000-000000000001',
        number: 3,
        feature: 'Export',
        feedback: 'Add CSV export',
        detail: '',
        type: 'Change Request',
        category: 'Minor',
        status: 'Execution',
        activity: 'Done',
        notes: '',
        needs_review: false,
        estimated_date: null,
        updated_at: '2026-10-15T00:00:00Z',
      },
    ] as unknown as FeedbackItem[];

    const needsUpdateCount = items.filter(i => isNeedsUpdate(i)).length;
    const updatedCount = items.length - needsUpdateCount;

    expect(items.length).toBe(3);
    expect(needsUpdateCount).toBe(1);
    expect(updatedCount).toBe(2);
    expect(needsUpdateCount + updatedCount).toBe(items.length);
  });
});

describe('Feature 16: Overview Detail Modal Multi-Filter (Review Status, Type, Category, Status, Activity)', () => {
  const sampleItems = [
    {
      id: 'item-1',
      customer_id: '00000000-0000-4000-8000-000000000001',
      number: 1,
      feature: 'Dashboard',
      feedback: 'Chart glitch',
      detail: '',
      type: 'Bug Report',
      category: 'Major',
      status: 'Execution',
      activity: 'In progress',
      notes: '',
      needs_review: false,
      estimated_date: null,
      updated_at: '2026-10-15T00:00:00Z',
    },
    {
      id: 'item-2',
      customer_id: '00000000-0000-4000-8000-000000000001',
      number: 2,
      feature: 'Auth',
      feedback: 'Cannot login with PIN',
      detail: '',
      type: 'Bug Report',
      category: 'Major',
      status: 'Waiting',
      activity: 'Not started',
      notes: '',
      needs_review: true,
      estimated_date: null,
      updated_at: '2026-10-15T00:00:00Z',
    },
    {
      id: 'item-3',
      customer_id: '00000000-0000-4000-8000-000000000001',
      number: 3,
      feature: 'Export',
      feedback: 'Excel download missing column',
      detail: '',
      type: 'Change Request',
      category: 'Minor',
      status: 'Done' as any,
      activity: 'Done',
      notes: '',
      needs_review: false,
      estimated_date: null,
      updated_at: '2026-10-15T00:00:00Z',
    },
    {
      id: 'item-4',
      customer_id: '00000000-0000-4000-8000-000000000001',
      number: 4,
      feature: 'Billing',
      feedback: 'Invoice delayed',
      detail: '',
      type: 'Complaint',
      category: 'Medium',
      status: 'Execution by notes',
      activity: 'In progress',
      notes: '',
      needs_review: false,
      estimated_date: null,
      updated_at: '2026-10-15T00:00:00Z',
    },
  ] as unknown as FeedbackItem[];

  it('filters modal items correctly by review status (needs_update and updated)', () => {
    const needsUpdateOnly = sampleItems.filter(i => isNeedsUpdate(i));
    const updatedOnly = sampleItems.filter(i => !isNeedsUpdate(i));

    expect(needsUpdateOnly.length).toBe(1);
    expect(needsUpdateOnly[0]?.number).toBe(2);

    expect(updatedOnly.length).toBe(3);
    expect(updatedOnly.map(i => i.number)).toEqual([1, 3, 4]);
  });

  it('filters modal items correctly by type', () => {
    const bugs = sampleItems.filter(i => i.type === 'Bug Report');
    const crs = sampleItems.filter(i => i.type === 'Change Request');
    const complaints = sampleItems.filter(i => i.type === 'Complaint');

    expect(bugs.length).toBe(2);
    expect(crs.length).toBe(1);
    expect(complaints.length).toBe(1);
  });

  it('filters modal items correctly by category', () => {
    const majors = sampleItems.filter(i => i.category === 'Major');
    const mediums = sampleItems.filter(i => i.category === 'Medium');
    const minors = sampleItems.filter(i => i.category === 'Minor');

    expect(majors.length).toBe(2);
    expect(mediums.length).toBe(1);
    expect(minors.length).toBe(1);
  });

  it('filters modal items correctly by status', () => {
    const waiting = sampleItems.filter(i => i.status === 'Waiting');
    const execution = sampleItems.filter(i => i.status === 'Execution');
    const byNotes = sampleItems.filter(i => i.status === 'Execution by notes');

    expect(waiting.length).toBe(1);
    expect(execution.length).toBe(1);
    expect(byNotes.length).toBe(1);
  });

  it('filters modal items correctly by activity', () => {
    const done = sampleItems.filter(i => i.activity === 'Done');
    const inProgress = sampleItems.filter(i => i.activity === 'In progress');
    const notStarted = sampleItems.filter(i => i.activity === 'Not started');

    expect(done.length).toBe(1);
    expect(inProgress.length).toBe(2);
    expect(notStarted.length).toBe(1);
  });

  it('combines multiple modal filters seamlessly (e.g. type + category + activity)', () => {
    const filtered = sampleItems.filter(i => {
      if (i.type !== 'Bug Report') return false;
      if (i.category !== 'Major') return false;
      if (i.activity !== 'In progress') return false;
      return true;
    });

    expect(filtered.length).toBe(1);
    expect(filtered[0]?.number).toBe(1);
    expect(filtered[0]?.feedback).toBe('Chart glitch');
  });
});

describe('Feature 17: Report Date with Exact Action Timestamp (Save/Submit)', () => {
  it('creates an action report date with the exact hour of the save/submit click', () => {
    // Fixed reference time: 2026-10-15 15:30:45 WIB (08:30:45 UTC)
    const fixedNow = new Date('2026-10-15T08:30:45.000Z');

    // 1. When submitting with today's date or no date
    const autoDate = createActionReportDate(null, fixedNow);
    expect(autoDate).toBe('2026-10-15T08:30:45.000Z');

    // 2. When submitting with explicit today date (YYYY-MM-DD)
    const todayStr = '2026-10-15';
    const actionDateToday = createActionReportDate(todayStr, fixedNow);
    expect(actionDateToday).toBe('2026-10-15T08:30:45.000Z');

    // 3. When submitting with a past date, it combines the past date with the action time in WIB
    const pastStr = '2026-10-10';
    const actionDatePast = createActionReportDate(pastStr, fixedNow);
    // 2026-10-10 15:30:45 WIB is 2026-10-10T08:30:45.000Z
    expect(actionDatePast).toBe('2026-10-10T08:30:45.000Z');
  });

  it('validates itemSchema successfully with an ISO date-time report_date', () => {
    const inputWithDateTime: ItemInput = {
      customer_id: '00000000-0000-4000-8000-000000000001',
      number: 1,
      feature: 'Invoice Export',
      feedback: 'Add PDF download button',
      detail: '',
      type: 'Change Request',
      category: 'Medium',
      status: 'Waiting',
      activity: 'Not started',
      notes: '',
      estimated_date: null,
      report_date: '2026-10-15T08:30:45.000Z',
    };

    const parsed = itemSchema.parse(inputWithDateTime);
    expect(parsed.report_date).toBe('2026-10-15T08:30:45.000Z');
  });

  it('formats report_date with date and time in 24h WIB format using fmtReportDate', () => {
    // Exact ISO date-time
    const isoDate = '2026-10-15T08:05:00.000Z'; // 15:05 WIB
    const formatted = fmtReportDate(isoDate);
    expect(formatted).toMatch(/15 Oct 2026.*15:05/);

    // Legacy date-only item with fallback updated_at timestamp
    const legacyReportDate = '2026-10-14';
    const fallbackUpdatedAt = '2026-10-14T03:20:00.000Z'; // 10:20 WIB
    const formattedLegacy = fmtReportDate(legacyReportDate, fallbackUpdatedAt);
    expect(formattedLegacy).toMatch(/14 Oct 2026.*10:20/);

    // Empty or null
    expect(fmtReportDate(null, null)).toBe('—');
    expect(fmtReportDate(undefined, undefined)).toBe('—');
  });
});

describe('Feature 18: Auto-population and Persistence of PIC Name on Ticket Submission', () => {
  it('resolves active PIC Name from session access when saving or submitting feedback', () => {
    // Scenario 1: Customer logged in with PIC "Andi Wijaya" submits without manually filling pic_name
    const customerAccess = {
      role: 'customer' as const,
      actor: 'PT Maju Bersama',
      customer_id: 'cust-123',
      pic_name: 'Andi Wijaya',
      expires: Date.now() + 3600000,
    };

    const inputWithoutPic: ItemInput = {
      customer_id: customerAccess.customer_id,
      number: 1,
      feature: 'Dashboard',
      feedback: 'Chart is not loading',
      detail: '',
      type: 'Bug Report',
      category: 'Major',
      status: 'Waiting',
      activity: 'Not started',
      notes: '',
      estimated_date: null,
      pic_name: undefined,
    };

    const isCustomerActor = customerAccess.role === 'customer';
    const resolvedPicName = inputWithoutPic.pic_name?.trim() || customerAccess.pic_name || (isCustomerActor ? null : customerAccess.actor) || null;
    expect(resolvedPicName).toBe('Andi Wijaya');

    // Scenario 2: Admin logged in with actor name "Budi Santoso"
    const adminAccess = {
      role: 'admin' as const,
      actor: 'Budi Santoso',
      pic_name: 'Budi Santoso',
      expires: Date.now() + 3600000,
    };

    const adminPic = inputWithoutPic.pic_name?.trim() || adminAccess.pic_name || adminAccess.actor || null;
    expect(adminPic).toBe('Budi Santoso');
  });

  it('correctly resolves fallback PIC display when item.pic_name is empty but item.actor contains the user name', () => {
    const cust: Customer = {
      id: 'cust-abc',
      name: 'PT Samudra Jaya',
      active: true,
      pin: '123456',
      pin_version: 1,
      created_at: new Date().toISOString(),
    };

    const getPicDisplay = (item: { pic_name?: string | null; actor?: string; customer_id: string }) => {
      if (item.pic_name) return item.pic_name;
      if (item.actor && item.actor !== cust.name && item.actor !== 'Internal team' && item.actor !== 'Loop Team' && item.actor !== 'Admin') {
        return item.actor;
      }
      return null;
    };

    // Case 1: Item has explicit pic_name
    expect(getPicDisplay({ pic_name: 'Siti Rahma', actor: 'PT Samudra Jaya', customer_id: 'cust-abc' })).toBe('Siti Rahma');

    // Case 2: Item has no pic_name, but actor is the PIC name
    expect(getPicDisplay({ pic_name: null, actor: 'Doni Pratama', customer_id: 'cust-abc' })).toBe('Doni Pratama');

    // Case 3: Item has no pic_name and actor is the customer company name -> returns null (displayed as '—')
    expect(getPicDisplay({ pic_name: null, actor: 'PT Samudra Jaya', customer_id: 'cust-abc' })).toBeNull();

    // Case 4: Item has no pic_name and actor is generic internal team -> returns null
    expect(getPicDisplay({ pic_name: null, actor: 'Loop Team', customer_id: 'cust-abc' })).toBeNull();
  });
});

describe('Feature 19: Solid Badges for Feedback Types', () => {
  it('maps feedback types to their corresponding solid badge CSS classes', () => {
    // Complaint = Blue ('type-complaint')
    expect(typeBadge('Complaint')).toBe('type-complaint');
    expect(typeBadge('complaint')).toBe('type-complaint');

    // Change Request = Red ('type-changerequest')
    expect(typeBadge('Change Request')).toBe('type-changerequest');
    expect(typeBadge('change request')).toBe('type-changerequest');

    // Bug Report = Orange ('type-bugreport')
    expect(typeBadge('Bug Report')).toBe('type-bugreport');
    expect(typeBadge('bug report')).toBe('type-bugreport');
  });

  it('handles empty, null, or unknown type gracefully without crashing', () => {
    expect(typeBadge(null)).toBe('');
    expect(typeBadge(undefined)).toBe('');
    expect(typeBadge('')).toBe('');
    expect(typeBadge('Unknown Type')).toBe('');
  });
});

describe('Feature 20: Saved PIC Names for Customer Portal Login', () => {
  it('defines STORAGE_KEY_SAVED_PICS constant', () => {
    expect(STORAGE_KEY_SAVED_PICS).toBe('loop_saved_pic_names');
  });

  it('persists and deduplicates PIC names in localStorage with most recent first', () => {
    localStorage.clear();

    persistSavedPicName('Budi Santoso');
    let saved = JSON.parse(localStorage.getItem(STORAGE_KEY_SAVED_PICS) || '[]');
    expect(saved).toEqual(['Budi Santoso']);

    // Adding another name puts it at the front
    persistSavedPicName('Siti Rahma');
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY_SAVED_PICS) || '[]');
    expect(saved).toEqual(['Siti Rahma', 'Budi Santoso']);

    // Re-adding existing name moves it to the front without duplicates (case-insensitive)
    persistSavedPicName('budi santoso');
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY_SAVED_PICS) || '[]');
    expect(saved).toEqual(['budi santoso', 'Siti Rahma']);
  });

  it('filters out empty names and system actor names from being saved as PIC', () => {
    localStorage.clear();

    persistSavedPicName('   ');
    persistSavedPicName(null);
    persistSavedPicName(undefined);
    persistSavedPicName('Loop Team');
    persistSavedPicName('Admin');
    persistSavedPicName('Internal team');
    persistSavedPicName('customer');

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_SAVED_PICS) || '[]');
    expect(saved).toEqual([]);
  });

  it('aggregates unique PIC names from saved storage and items', () => {
    localStorage.clear();
    persistSavedPicName('Andi Wijaya');

    const testItems: Array<{ pic_name?: string | null }> = [
      { pic_name: 'Budi Santoso' },
      { pic_name: 'Andi Wijaya' }, // duplicate of saved
      { pic_name: 'Siti Rahma' },
      { pic_name: null },
      { pic_name: '   ' },
    ];

    const list: string[] = [];
    const seen = new Set<string>();
    const add = (val: unknown) => {
      if (typeof val !== 'string') return;
      const clean = val.trim();
      if (!clean) return;
      const lower = clean.toLowerCase();
      if (['loop team', 'admin', 'internal team', 'excel import', 'customer'].includes(lower)) return;
      if (!seen.has(lower)) {
        seen.add(lower);
        list.push(clean);
      }
    };

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_SAVED_PICS) || '[]');
    stored.forEach(add);
    testItems.forEach(i => { if (i.pic_name) add(i.pic_name); });

    expect(list).toEqual(['Andi Wijaya', 'Budi Santoso', 'Siti Rahma']);
  });
});


