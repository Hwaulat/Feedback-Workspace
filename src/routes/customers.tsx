import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/feedback-provider';
import { TeamOnly, fmtDate } from '@/components/feedback-views';

export const Route = createFileRoute('/customers')({
  head: () => ({ meta: [{ title: 'Loop — Customers & PINs' }, { name: 'description', content: 'Manage customers and their six-digit access PINs.' }] }),
  component: CustomersPage,
});

function CustomersPage() {
  return <TeamOnly><CustomersInner /></TeamOnly>;
}

function CustomersInner() {
  const { customers, items, customerAction } = useWorkspace();
  const [creating, setCreating] = useState(false); const [name, setName] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [newPin, setNewPin] = useState<string | null>(null);
  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { const pin = await customerAction('create', name.trim()); setCreating(false); setName(''); if (pin) setNewPin(pin); }
    catch (err) { setError(err instanceof Error ? err.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  async function regenerate(id: string, customerName: string) {
    setBusy(true); setError('');
    try { const pin = await customerAction('regenerate', customerName, id); if (pin) setNewPin(pin); }
    catch (err) { setError(err instanceof Error ? err.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  return (
    <>
      <div className="page-heading">
        <div><h1>Customers & PINs</h1><p>Every customer signs in with their own six-digit PIN and sees only their feedback.</p></div>
        <div className="heading-actions">
          <Button size="sm" onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 font-medium">
            <Plus className="w-4 h-4 shrink-0" />
            <span>New customer</span>
          </Button>
        </div>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      {customers.length === 0 ? (
        <div className="empty-state">
          <p className="font-medium text-base mb-1">No registered customers yet.</p>
          <p className="text-muted-foreground text-sm mb-4">Add customers manually. The system will automatically generate a 6-digit access PIN for each customer.</p>
          <Button onClick={() => setCreating(true)} className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg shadow-sm">
            <Plus className="w-4 h-4 shrink-0" />
            <span>Add new customer</span>
          </Button>
        </div>
      ) : (
        <div className="customer-grid">
          {customers.map(c => {
            const count = items.filter(i => i.customer_id === c.id && !i.deleted_at).length;
            return (
              <div className="customer-card" key={c.id}>
                <div className="customer-top">
                  <span className="avatar">{c.name.split(' ').map(s => s[0]).slice(0, 2).join('')}</span>
                  <div className="flex-1"><h2>{c.name}</h2><p>Added {fmtDate(c.created_at)}</p></div>
                  <span className={`badge ${c.active ? 'done' : 'pending'}`}>{c.active ? 'Active' : 'Inactive'}</span>
                </div>
                <div className="customer-stats">
                  <div><strong>{count}</strong><span>Feedback items</span></div>
                  <div><strong>v{c.pin_version}</strong><span>PIN version</span></div>
                  <div><strong className="font-mono tracking-wider">{c.pin || '—'}</strong><span>Active PIN</span></div>
                </div>
                <div className="form-actions" style={{ marginTop: 18 }}>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => regenerate(c.id, c.name)}>Regenerate PIN</Button>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => customerAction('toggle', c.name, c.id)}>{c.active ? 'Deactivate' : 'Activate'}</Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" disabled={busy} onClick={() => customerAction('delete', c.name, c.id)}>Delete</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {creating && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setCreating(false); }}>
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header"><h2>New customer</h2><Button variant="ghost" size="icon" aria-label="Close" onClick={() => setCreating(false)}><X /></Button></div>
            <form onSubmit={create}>
              <label className="form-field">Customer name<input required maxLength={150} value={name} onChange={e => setName(e.target.value)} placeholder="Company name" autoFocus /></label>
              <p className="login-copy" style={{ marginTop: 12 }}>A unique six-digit PIN is generated automatically and shown once after creation.</p>
              <div className="form-actions"><Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create customer'}</Button></div>
            </form>
          </div>
        </div>
      )}
      {newPin && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setNewPin(null); }}>
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header"><h2>Customer PIN</h2><Button variant="ghost" size="icon" aria-label="Close" onClick={() => setNewPin(null)}><X /></Button></div>
            <p className="login-copy">Share this PIN with the customer. It is shown only once — store it somewhere safe before closing.</p>
            <input className="pin-input" style={{ width: '100%' }} value={newPin} readOnly onFocus={e => e.target.select()} />
            <div className="form-actions"><Button onClick={() => setNewPin(null)}>Done</Button></div>
          </div>
        </div>
      )}
    </>
  );
}
