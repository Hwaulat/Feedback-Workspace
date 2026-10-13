import { useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/feedback-provider';
import { DetailModal, FormModal, activityBadge, categoryBadge, fmtDate, fmtDateTime } from '@/components/feedback-views';
import { types, activities, statuses, isOverdue, type FeedbackItem } from '@/lib/feedback-model';

export const Route = createFileRoute('/feedback')({
  head: () => ({ meta: [{ title: 'Loop — Feedback list' }, { name: 'description', content: 'Browse, filter and update customer feedback.' }] }),
  component: FeedbackPage,
});

function FeedbackPage() {
  const { access, demo, customers, items, selectedCustomer, setSelectedCustomer } = useWorkspace();
  const [search, setSearch] = useState(''); const [type, setType] = useState('all'); const [status, setStatus] = useState('all'); const [activity, setActivity] = useState('all');
  const [detail, setDetail] = useState<FeedbackItem | null>(null); const [editing, setEditing] = useState<FeedbackItem | null>(null); const [creating, setCreating] = useState(false);
  const isAdmin = access?.role === 'admin';
  const rows = useMemo(() => items
    .filter(i => !i.deleted_at
      && (selectedCustomer === 'all' || i.customer_id === selectedCustomer)
      && (type === 'all' || i.type === type)
      && (status === 'all' || i.status === status)
      && (activity === 'all' || i.activity === activity)
      && (search === '' || `${i.feature} ${i.feedback} ${i.notes} ${i.detail}`.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [items, selectedCustomer, type, status, activity, search]);
  const open = (item: FeedbackItem) => (isAdmin ? setEditing(item) : setDetail(item));
  return (
    <>
      <div className="page-heading">
        <div><h1>Feedback list</h1><p>{isAdmin ? 'Track, update and close out customer feedback.' : 'Progress and updates for your feedback.'}</p></div>
        {isAdmin && <div className="heading-actions"><Button size="sm" onClick={() => setCreating(true)}><Plus />New feedback</Button></div>}
      </div>
      <div className="filters-line">
        <div className="table-tools" style={{ margin: 0, flex: 1 }}>
          <label className="search-box"><Search /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search feedback, feature or notes…" aria-label="Search feedback" /></label>
          {isAdmin && <select className="filter-select" value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)} aria-label="Filter by customer"><option value="all">All customers</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
          <select className="filter-select" value={type} onChange={e => setType(e.target.value)} aria-label="Filter by type"><option value="all">All types</option>{types.map(t => <option key={t}>{t}</option>)}</select>
          <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status"><option value="all">All statuses</option>{statuses.map(s => <option key={s}>{s}</option>)}</select>
          <select className="filter-select" value={activity} onChange={e => setActivity(e.target.value)} aria-label="Filter by activity"><option value="all">All activity</option>{activities.map(a => <option key={a}>{a}</option>)}</select>
        </div>
        <span className="filter-caption">{rows.length} of {items.filter(i => !i.deleted_at).length} items</span>
      </div>
      {rows.length === 0 ? <div className="empty-state">No feedback matches these filters.</div> : (
        <>
          <div className="table-wrap desktop-table"><div className="table-scroll">
            <table className="feedback-table">
              <thead><tr><th>No.</th><th>Feedback</th>{isAdmin && <th>Customer</th>}<th>Type</th><th>Category</th><th>Status</th><th>Activity</th><th>Estimated</th><th>Updated</th></tr></thead>
              <tbody>
                {rows.map(item => (
                  <tr key={item.id} onClick={() => open(item)}>
                    <td>{item.number}</td>
                    <td><div className="feedback-title">{item.feedback}</div><div className="feedback-feature">{item.feature || '—'}</div></td>
                    {isAdmin && <td>{customers.find(c => c.id === item.customer_id)?.name ?? '—'}</td>}
                    <td>{item.type}</td>
                    <td><span className={`badge ${categoryBadge(item.category)}`}>{item.category}</span></td>
                    <td>{item.status}</td>
                    <td><span className={`badge ${activityBadge(item.activity)}`}>{item.activity}</span></td>
                    <td>{fmtDate(item.estimated_date)}{isOverdue(item) && <span className="badge major" style={{ marginLeft: 6 }}>Overdue</span>}</td>
                    <td title={fmtDateTime(item.updated_at)}>{fmtDate(item.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div><div className="table-footer"><span>Click a row to {isAdmin ? 'edit' : 'view'} the full details.</span><span>Last updated times shown in Jakarta time (WIB).</span></div></div>
          <div className="mobile-feedback-list">{rows.map(item => (
            <div className="feedback-mobile-item" key={item.id} onClick={() => open(item)}>
              <h3>{item.feedback}</h3><p>{item.feature || '—'} · #{item.number}</p>
              <div className="mobile-meta"><span className={`badge ${activityBadge(item.activity)}`}>{item.activity}</span><span className={`badge ${categoryBadge(item.category)}`}>{item.category}</span><time>{fmtDate(item.updated_at)}</time></div>
            </div>
          ))}</div>
        </>
      )}
      {detail && <DetailModal item={detail} customers={customers} onClose={() => setDetail(null)} />}
      {editing && <FormModal item={editing} customers={customers} onClose={() => setEditing(null)} />}
      {creating && <FormModal customers={customers} onClose={() => setCreating(false)} />}
    </>
  );
}
