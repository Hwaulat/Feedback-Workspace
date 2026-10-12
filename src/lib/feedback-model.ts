import { z } from 'zod';

export const types = ['Bug Report', 'Change Request', 'Complaint'] as const;
export const categories = ['Minor', 'Medium', 'Major'] as const;
export const statuses = ['Execution', 'Waiting', 'Execution by notes'] as const;
export const activities = ['Done', 'In progress', 'Pending'] as const;
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v).nullable();
export const itemSchema = z.object({
  customer_id: z.string().uuid(), number: z.number().int().positive(),
  feature: z.string().trim().max(200), feedback: z.string().trim().min(1).max(1000),
  detail: z.string().max(5000), type: z.enum(types), category: z.enum(categories),
  status: z.enum(statuses), activity: z.enum(activities), notes: z.string().max(5000), estimated_date: dateSchema,
});
export type ItemInput = z.infer<typeof itemSchema>;
export type FeedbackItem = ItemInput & { id: string; completion_date: string | null; deleted_at: string | null; version: number; updated_at: string; actor: string };
export type Customer = { id: string; name: string; active: boolean; pin_version: number; created_at: string };
export type HistoryEntry = { id: string; customer_id: string | null; item_id: string | null; action: string; field: string; old_value: string | null; new_value: string | null; actor: string; created_at: string };
export type Access = { role: 'admin' | 'customer'; actor: string; customer_id?: string; pin_version?: number; expires: number };
export function todayWIB(now = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year:'numeric', month:'2-digit', day:'2-digit' }).format(now); }
export function isOverdue(item: Pick<FeedbackItem,'activity'|'estimated_date'>, today = todayWIB()) { return item.activity !== 'Done' && !!item.estimated_date && item.estimated_date < today; }
export function completionDate(activity: string, oldActivity: string, oldDate: string | null, today: string) { return activity !== 'Done' ? null : oldActivity === 'Done' ? oldDate : today; }
export function safeCell(value: string) { return /^[=+\-@]/.test(value) ? `'${value}` : value; }
export const PIN_PATTERN = /^\d{6}$/;
export const SESSION_SECONDS = 8 * 60 * 60;
export const LOCKOUT_ATTEMPTS = 5;
export const LOCKOUT_SECONDS = 15 * 60;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;