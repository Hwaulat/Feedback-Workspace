import { z } from 'zod';

export const types = ['Bug Report', 'Change Request', 'Complaint'] as const;
export const categories = ['Minor', 'Major'] as const;
export const categorySchema = z
  .enum(['Minor', 'Major', 'Medium'])
  .transform(v => (v === 'Medium' ? 'Minor' : v) as 'Minor' | 'Major');
export const statuses = ['Execution', 'Waiting', 'Execution by notes'] as const;
export const activities = ['Done', 'In progress', 'Not started'] as const;
export const activitySchema = z
  .enum(['Done', 'In progress', 'Not started', 'Pending'])
  .transform(v => (v === 'Pending' ? 'Not started' : v) as 'Done' | 'In progress' | 'Not started');
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v).nullable();
export const dateTimeSchema = z.string().refine(v => !Number.isNaN(Date.parse(v)), { message: 'Invalid date/time string' }).nullable();
export const itemSchema = z.object({
  customer_id: z.string().uuid(), number: z.number().int().positive(),
  feature: z.string().trim().max(200), feedback: z.string().trim().min(1).max(1000),
  detail: z.string().max(5000), type: z.enum(types), category: categorySchema,
  status: z.enum(statuses), activity: activitySchema, notes: z.string().max(5000), estimated_date: dateSchema,
  report_date: dateTimeSchema.optional(),
  needs_review: z.boolean().optional(),
  image: z.string().nullable().optional(),
  pic_name: z.string().trim().max(100).nullable().optional(),
});
export type ItemInput = z.infer<typeof itemSchema>;
export type FeedbackItem = ItemInput & {
  id: string;
  report_date?: string | null | undefined;
  completion_date: string | null;
  deleted_at: string | null;
  version: number;
  updated_at: string;
  actor: string;
  needs_review?: boolean | undefined;
  image?: string | null | undefined;
  pic_name?: string | null | undefined;
};
export type Customer = { id: string; name: string; active: boolean; pin_version: number; created_at: string; pin?: string };
export type HistoryEntry = { id: string; customer_id: string | null; item_id: string | null; action: string; field: string; old_value: string | null; new_value: string | null; actor: string; created_at: string };
export type Access = { role: 'admin' | 'customer'; actor: string; customer_id?: string; pin_version?: number; expires: number; pic_name?: string | null };
export function todayWIB(now = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year:'numeric', month:'2-digit', day:'2-digit' }).format(now); }
export function createActionReportDate(inputDate?: string | null, now = new Date()): string {
  const nowIso = now.toISOString();
  if (!inputDate) return nowIso;
  const datePart = inputDate.slice(0, 10);
  const today = todayWIB(now);
  if (datePart === today) {
    return nowIso;
  }
  const timeStr = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour12: false });
  const combined = new Date(`${datePart}T${timeStr}+07:00`);
  return isNaN(combined.getTime()) ? nowIso : combined.toISOString();
}
export function isOverdue(item: Pick<FeedbackItem,'activity'|'estimated_date'>, today = todayWIB()) { return item.activity !== 'Done' && !!item.estimated_date && item.estimated_date < today; }
export function completionDate(activity: string, oldActivity: string, oldDate: string | null, today: string) { return activity !== 'Done' ? null : oldActivity === 'Done' ? oldDate : today; }
export function isNeedsUpdate(item: FeedbackItem, customers: Customer[] = []): boolean {
  if (typeof item.needs_review === 'boolean') return item.needs_review;
  const isCust = customers.some(c => c.name.toLowerCase() === (item.actor || '').toLowerCase());
  return isCust;
}
export function safeCell(value: string) { return /^[=+\-@]/.test(value) ? `'${value}` : value; }
export const PIN_PATTERN = /^\d{6}$/;
export const SESSION_SECONDS = 8 * 60 * 60;
export const LOCKOUT_ATTEMPTS = 5;
export const LOCKOUT_SECONDS = 15 * 60;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

export function parseImages(image?: string | null): string[] {
  if (!image) return [];
  const trimmed = typeof image === 'string' ? image.trim() : '';
  if (!trimmed) return [];
  try {
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === 'string' && Boolean(x.trim()));
      }
    }
  } catch {}
  return [trimmed];
}

export function serializeImages(images: string[]): string | null {
  if (!images || images.length === 0) return null;
  const filtered = images.map(i => (typeof i === 'string' ? i.trim() : '')).filter(Boolean);
  if (filtered.length === 0) return null;
  if (filtered.length === 1) return filtered[0]!;
  return JSON.stringify(filtered);
}

export const STORAGE_KEY_SAVED_PICS = 'loop_saved_pic_names';

export function persistSavedPicName(name?: string | null) {
  if (!name) return;
  const clean = name.trim();
  if (!clean) return;
  const lower = clean.toLowerCase();
  if (['loop team', 'admin', 'internal team', 'excel import', 'customer'].includes(lower)) return;
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY_SAVED_PICS);
      const list: string[] = raw ? JSON.parse(raw) : [];
      const filtered = list.filter(n => typeof n === 'string' && n.trim().toLowerCase() !== lower);
      filtered.unshift(clean);
      localStorage.setItem(STORAGE_KEY_SAVED_PICS, JSON.stringify(filtered.slice(0, 50)));
    }
  } catch {}
}