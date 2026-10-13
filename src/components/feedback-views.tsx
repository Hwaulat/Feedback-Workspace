import { useMemo, useState, type ReactNode } from 'react';
import { useWorkspace } from './feedback-provider';
import { Button } from '@/components/ui/button';
import { X, Trash2, RotateCcw, ShieldCheck } from 'lucide-react';
import { types, categories, statuses, activities, todayWIB, type Customer, type FeedbackItem, type ItemInput } from '@/lib/feedback-model';

export const activityBadge = (a: string) => (a === 'Done' ? 'done' : a === 'In progress' ? 'progress' : 'pending');
export const categoryBadge = (c: string) => (c === 'Major' ? 'major' : c === 'Medium' ? 'medium' : '');
export function fmtDate(d?: string | null) { if (!d) return '—'; return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d)); }
export function fmtDateTime(iso?: string | null) { if (!iso) return '—'; return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); }

export function TeamOnly({ children }: { children: ReactNode }) {
  const { access, demo, openLogin } = useWorkspace();
  if (access?.role !== 'admin') return (
    <div className="empty-state"><ShieldCheck />This page is for the internal team only. Sign in with the team passcode to continue.{demo && <div style={{ marginTop: 18 }}><Button variant="outline" size="sm" onClick={openLogin}>Sign in</Button></div>}</div>
  );
  return <>{children}</>;
}

export function DetailModal({ item, customers, onClose }: { item: FeedbackItem; customers: Customer[]; onClose: () => void }) {
  const customer = customers.find(c => c.id === item.customer_id);
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-header"><h2>Feedback #{item.number}</h2><Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}><X /></Button></div>
        <dl className="detail-grid">
          <div><dt>Customer</dt><dd>{customer?.name ?? '—'}</dd></div>
          <div><dt>Feature</dt><dd>{item.feature || '—'}</dd></div>
          <div><dt>Type</dt><dd>{item.type}</dd></div>
          <div><dt>Category</dt><dd><span className={`badge ${categoryBadge(item.category)}`}>{item.category}</span></dd></div>
          <div><dt>Status</dt><dd>{item.status}</dd></div>
          <div><dt>Activity</dt><dd><span className={`badge ${activityBadge(item.activity)}`}>{item.activity}</span></dd></div>
          <div><dt>Estimated completion</dt><dd>{fmtDate(item.estimated_date)}</dd></div>
          <div><dt>Completion date (automatic)</dt><dd>{fmtDate(item.completion_date)}</dd></div>
          <div className="full"><dt>Feedback</dt><dd>{item.feedback}</dd></div>
          {item.detail && <div className="full"><dt>Detail information</dt><dd>{item.detail}</dd></div>}
          {item.notes && <div className="full"><dt>Notes / remarks</dt><dd>{item.notes}</dd></div>}
          <div><dt>Last updated</dt><dd>{fmtDateTime(item.updated_at)}</dd></div>
          <div><dt>Updated by</dt><dd>{item.actor || '—'}</dd></div>
        </dl>
      </div>
    </div>
  );
}

export function FormModal({ item, customers, onClose }: { item?: FeedbackItem; customers: Customer[]; onClose: () => void }) {
  const { items, save, remove } = useWorkspace();
  const [form, setForm] = useState<ItemInput>(() => item
    ? { customer_id: item.customer_id, number: item.number, feature: item.feature, feedback: item.feedback, detail: item.detail, type: item.type, category: item.category, status: item.status, activity: item.activity, notes: item.notes, estimated_date: item.estimated_date }
    : { customer_id: customers[0]?.id ?? '', number: 1, feature: '', feedback: '', detail: '', type: 'Bug Report', category: 'Minor', status: 'Waiting', activity: 'Pending', notes: '', estimated_date: null });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k: keyof ItemInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value as never }));
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await save({ ...form, number: Number(form.number), estimated_date: form.estimated_date || null }, item); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-header"><h2>{item ? 'Edit feedback' : 'New feedback'}</h2><Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}><X /></Button></div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="form-field">Customer
              <select value={form.customer_id} onChange={e => { const id = e.target.value; const nums = items.filter(i => i.customer_id === id && !i.deleted_at).map(i => i.number); setForm(f => ({ ...f, customer_id: id, number: item ? item.number : (nums.length ? Math.max(...nums) + 1 : 1) })); }} disabled={customers.length < 2 && !!item}>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="form-field">No.<input type="number" min={1} required value={form.number} onChange={e => setForm(f => ({ ...f, number: Number(e.target.value) }))} /></label>
            <label className="form-field full">Feature<input maxLength={200} value={form.feature} onChange={set('feature')} placeholder="e.g. Reporting" /></label>
            <label className="form-field full">Feedback<textarea required maxLength={1000} value={form.feedback} onChange={set('feedback')} placeholder="Describe the feedback" /></label>
            <label className="form-field full">Detail information<textarea maxLength={5000} value={form.detail} onChange={set('detail')} placeholder="Optional background or steps" /></label>
            <label className="form-field">Type<select value={form.type} onChange={set('type')}>{types.map(t => <option key={t}>{t}</option>)}</select></label>
            <label className="form-field">Category<select value={form.category} onChange={set('category')}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
            <label className="form-field">Status<select value={form.status} onChange={set('status')}>{statuses.map(s => <option key={s}>{s}</option>)}</select></label>
            <label className="form-field">Activity status<select value={form.activity} onChange={set('activity')}>{activities.map(a => <option key={a}>{a}</option>)}</select></label>
            <label className="form-field">Estimated completion date<input type="date" value={form.estimated_date ?? ''} onChange={e => setForm(f => ({ ...f, estimated_date: e.target.value || null }))} /></label>
            <label className="form-field">Completion date<input value={form.activity === 'Done' ? (item?.completion_date ?? todayWIB()) : '—'} readOnly title="Set automatically when activity becomes Done" /></label>
            <label className="form-field full">Notes / remarks<textarea maxLength={5000} value={form.notes} onChange={set('notes')} placeholder="Internal notes" /></label>
          </div>
          {error && <p className="error-text" role="alert">{error}</p>}
          <div className="form-actions">
            {item && <Button type="button" variant="outline" onClick={async () => { setBusy(true); try { await remove(item, !!item.deleted_at); onClose(); } finally { setBusy(false); } }}>{item.deleted_at ? <><RotateCcw />Restore</> : <><Trash2 />Delete</>}</Button>}
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save feedback'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
