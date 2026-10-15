import { useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Plus, Search, Download, Trash2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/feedback-provider';
import { DetailModal, FormModal, activityBadge, categoryBadge, statusBadge, fmtDate, fmtDateTime } from '@/components/feedback-views';
import { types, activities, statuses, isOverdue, parseImages, type FeedbackItem } from '@/lib/feedback-model';

export const Route = createFileRoute('/feedback')({
  head: () => ({ meta: [{ title: 'Loop — Feedback list' }, { name: 'description', content: 'Browse, filter and update customer feedback.' }] }),
  component: FeedbackPage,
});

function FeedbackPage() {
  const { access, demo, customers, items, selectedCustomer, setSelectedCustomer, exportToExcel, remove, openLogin } = useWorkspace();
  const [search, setSearch] = useState(''); const [type, setType] = useState('all'); const [status, setStatus] = useState('all'); const [activity, setActivity] = useState('all');
  const [reviewFilter, setReviewFilter] = useState('all');
  const [viewTrash, setViewTrash] = useState(false);
  const [detail, setDetail] = useState<FeedbackItem | null>(null); const [editing, setEditing] = useState<FeedbackItem | null>(null); const [creating, setCreating] = useState(false);
  const canManage = access?.role === 'admin';
  const isCustomer = access?.role === 'customer';

  const trashCount = useMemo(
    () => items.filter(i => Boolean(i.deleted_at) && (selectedCustomer === 'all' || i.customer_id === selectedCustomer)).length,
    [items, selectedCustomer],
  );

  const rows = useMemo(() => items
    .filter(i => (viewTrash ? Boolean(i.deleted_at) : !i.deleted_at)
      && (selectedCustomer === 'all' || i.customer_id === selectedCustomer)
      && (type === 'all' || i.type === type)
      && (status === 'all' || i.status === status)
      && (activity === 'all' || i.activity === activity || (activity === 'Not started' && (i.activity as string) === 'Pending'))
      && (reviewFilter === 'all' || (reviewFilter === 'needs_update' ? Boolean(i.needs_review) : !i.needs_review))
      && (search === '' || `${i.feature} ${i.feedback} ${i.notes} ${i.detail}`.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => b.number - a.number), [items, viewTrash, selectedCustomer, type, status, activity, reviewFilter, search]);

  const open = (item: FeedbackItem) => (canManage ? setEditing(item) : setDetail(item));
  const needsUpdateCount = items.filter(i => !i.deleted_at && i.needs_review).length;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{viewTrash ? 'Trash / Deleted feedback' : 'Feedback list'}</h1>
          <p>{viewTrash ? 'Review deleted feedback items and restore them anytime.' : (canManage ? 'Track, update and close out customer feedback.' : 'Progress and updates for your feedback.')}</p>
        </div>
        <div className="heading-actions">
          {canManage && trashCount > 0 && (
            <Button
              variant={viewTrash ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setViewTrash(prev => !prev)}
              className={viewTrash ? 'border-destructive/40 text-destructive' : ''}
              title={viewTrash ? 'Back to active feedback list' : 'View deleted feedback items'}
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              <span>{viewTrash ? 'Active list' : `Trash (${trashCount})`}</span>
            </Button>
          )}
          {!viewTrash && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToExcel(rows)}
              disabled={rows.length === 0}
              title="Export feedback to Excel file (.xlsx)"
            >
              <Download />Export by Excel ({rows.length})
            </Button>
          )}
          {!viewTrash && (canManage ? (
            <Button size="sm" onClick={() => setCreating(true)}><Plus />New feedback</Button>
          ) : access?.role === 'customer' ? (
            <Button size="sm" onClick={() => setCreating(true)}><Plus />Submit feedback</Button>
          ) : null)}
        </div>
      </div>
      <div className="filters-line">
        <div className="table-tools" style={{ margin: 0, flex: 1 }}>
          <label className="search-box"><Search /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search feedback, feature or notes…" aria-label="Search feedback" /></label>
          {canManage && <select className="filter-select" value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)} aria-label="Filter by customer"><option value="all">All customers</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
          {canManage && (
            <select className="filter-select" value={reviewFilter} onChange={e => setReviewFilter(e.target.value)} aria-label="Filter by review status">
              <option value="all">All review status</option>
              <option value="needs_update">Needs Update ({needsUpdateCount})</option>
              <option value="updated">Updated</option>
            </select>
          )}
          <select className="filter-select" value={type} onChange={e => setType(e.target.value)} aria-label="Filter by type"><option value="all">All types</option>{types.map(t => <option key={t}>{t}</option>)}</select>
          <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status"><option value="all">All statuses</option>{statuses.map(s => <option key={s}>{s}</option>)}</select>
          <select className="filter-select" value={activity} onChange={e => setActivity(e.target.value)} aria-label="Filter by activity"><option value="all">All activity</option>{activities.map(a => <option key={a}>{a}</option>)}</select>
        </div>
        <span className="filter-caption">
          {rows.length} of {items.filter(i => !i.deleted_at).length} items
          {canManage && needsUpdateCount > 0 && (
            <span className="badge needs-update" style={{ marginLeft: 8 }}>
              {needsUpdateCount} need update
            </span>
          )}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="empty-state">
          <p className="font-medium text-base mb-1">
            {items.length === 0 ? 'No feedback recorded yet.' : 'No feedback matches these filters.'}
          </p>
          <p className="text-muted-foreground text-sm mb-4">
            {!access
              ? 'Please sign in to view and manage feedback recorded in the workspace.'
              : access?.role === 'customer'
              ? (items.length === 0 ? 'No feedback has been recorded for your account yet.' : 'No feedback matches your current search or filters.')
              : (items.length === 0
                ? 'The workspace is clean. Click "+ New feedback" to add a new feedback item manually.'
                : 'Try adjusting your search filters or select a different customer.')}
          </p>
          {items.length === 0 && (
            access ? (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus /> {access?.role === 'customer' ? 'Submit feedback' : 'Add new feedback'}
              </Button>
            ) : (
              <Button size="sm" onClick={openLogin}>
                Sign in to manage feedback
              </Button>
            )
          )}
        </div>
      ) : (
        <>
          <div className="table-wrap desktop-table"><div className="table-scroll">
            <table className="feedback-table">
              <thead>
                <tr>
                  <th style={{ width: 60, textAlign: 'center', padding: '0 8px' }}>Action</th>
                  <th style={{ width: 50, padding: '0 8px' }}>No.</th>
                  <th style={{ minWidth: 120 }}>PIC Name</th>
                  <th>Feedback</th>
                  {canManage && <th>Customer</th>}
                  {canManage && <th>Review Status</th>}
                  <th>Type</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Activity</th>
                  <th>Report Date</th>
                  <th>Estimated</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(item => (
                  <tr key={item.id} onClick={() => open(item)}>
                    <td style={{ textAlign: 'center', padding: '10px 8px', width: item.deleted_at ? 95 : 60 }} onClick={e => e.stopPropagation()}>
                      {item.deleted_at ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs inline-flex items-center gap-1 text-primary hover:bg-primary/10 border-primary/30"
                          title={`Restore feedback #${item.number}`}
                          aria-label={`Restore feedback #${item.number}`}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (window.confirm(`Restore feedback #${item.number}?`)) {
                              await remove(item, true);
                            }
                          }}
                        >
                          <RotateCcw size={12} />
                          <span>Restore</span>
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="delete-table-btn"
                          disabled={item.activity === 'Done'}
                          title={
                            item.activity === 'Done'
                              ? "Feedback with activity status 'Done' cannot be deleted"
                              : `Delete feedback #${item.number}`
                          }
                          aria-label={
                            item.activity === 'Done'
                              ? "Cannot delete feedback with Done activity"
                              : `Delete feedback #${item.number}`
                          }
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (item.activity === 'Done') return;
                            if (window.confirm(`Are you sure you want to delete feedback #${item.number}?`)) {
                              await remove(item);
                            }
                          }}
                        >
                          <Trash2 size={16} />
                        </Button>
                      )}
                    </td>
                    <td style={{ width: 50, padding: '10px 8px' }}>{item.number}</td>
                    <td style={{ minWidth: 120 }}>
                      {item.pic_name ? (
                        <span className="font-medium text-foreground">{item.pic_name}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td>
                      <div className="feedback-title">{item.feedback}</div>
                      <div className="feedback-feature">
                        {item.feature || '—'}
                        {item.image && (
                          <span className="inline-image-badge" title="Has attached screenshot / image">
                            📷 {parseImages(item.image).length > 1 ? `${parseImages(item.image).length} Images` : 'Attachment'}
                          </span>
                        )}
                      </div>
                    </td>
                    {canManage && <td>{customers.find(c => c.id === item.customer_id)?.name ?? '—'}</td>}
                    {canManage && (
                      <td>
                        {item.needs_review ? (
                          <span
                            className="badge needs-update"
                            title="Newly added by customer — update Type, Category, Status & Activity"
                          >
                            <span className="badge-dot" style={{ backgroundColor: '#ea580c' }} />
                            Needs Update
                          </span>
                        ) : (
                          <span
                            className="badge updated"
                            title="Reviewed and updated by internal team"
                          >
                            <span className="badge-dot" style={{ backgroundColor: '#10b981' }} />
                            Updated
                          </span>
                        )}
                      </td>
                    )}
                    <td>{item.needs_review ? <span className="text-muted-foreground">—</span> : item.type}</td>
                    <td>
                      {item.needs_review ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={`badge ${categoryBadge(item.category)}`}>{item.category}</span>
                      )}
                    </td>
                    <td>
                      {item.needs_review ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={`badge ${statusBadge(item.status)}`}>{item.status}</span>
                      )}
                    </td>
                    <td>
                      {item.needs_review ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={`badge ${activityBadge(item.activity)}`}>{item.activity}</span>
                      )}
                    </td>
                    <td>{fmtDate(item.report_date ?? item.updated_at.slice(0, 10))}</td>
                    <td>{fmtDate(item.estimated_date)}{isOverdue(item) && <span className="badge major" style={{ marginLeft: 6 }}>Overdue</span>}</td>
                    <td title={fmtDateTime(item.updated_at)}>{fmtDate(item.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div><div className="table-footer"><span>Click a row to {canManage ? 'edit' : 'view or edit'} the full details.</span><span>Last updated times shown in Jakarta time (WIB).</span></div></div>
          <div className="mobile-feedback-list">{rows.map(item => (
            <div className="feedback-mobile-item" key={item.id} onClick={() => open(item)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3>{item.feedback}</h3>
                  <p>
                    {item.feature || '—'} · #{item.number}
                    {item.pic_name && <span className="inline-block ml-1 font-medium text-primary">· PIC: {item.pic_name}</span>}
                    {item.image && (
                      <span className="inline-image-badge" style={{ marginLeft: 6 }}>
                        📷 {parseImages(item.image).length > 1 ? `${parseImages(item.image).length} Images` : 'Attachment'}
                      </span>
                    )}
                  </p>
                </div>
                {item.deleted_at ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs inline-flex items-center gap-1 text-primary border-primary/30"
                    title={`Restore feedback #${item.number}`}
                    aria-label={`Restore feedback #${item.number}`}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (window.confirm(`Restore feedback #${item.number}?`)) {
                        await remove(item, true);
                      }
                    }}
                    style={{ flexShrink: 0 }}
                  >
                    <RotateCcw size={12} />
                    <span>Restore</span>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="delete-table-btn"
                    disabled={item.activity === 'Done'}
                    title={
                      item.activity === 'Done'
                        ? "Feedback with activity status 'Done' cannot be deleted"
                        : `Delete feedback #${item.number}`
                    }
                    aria-label={
                      item.activity === 'Done'
                        ? "Cannot delete feedback with Done activity"
                        : `Delete feedback #${item.number}`
                    }
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (item.activity === 'Done') return;
                      if (window.confirm(`Are you sure you want to delete feedback #${item.number}?`)) {
                        await remove(item);
                      }
                    }}
                    style={{ flexShrink: 0, height: 28, width: 28 }}
                  >
                    <Trash2 size={15} />
                  </Button>
                )}
              </div>
              <div className="mobile-meta">
                {canManage && (
                  <span className={`badge ${item.needs_review ? 'needs-update' : 'updated'}`}>
                    {item.needs_review ? 'Needs Update' : 'Updated'}
                  </span>
                )}
                {item.needs_review ? (
                  <span className="text-xs text-muted-foreground italic">Type, Category, Status & Activity: — (Needs Update)</span>
                ) : (
                  <>
                    <span className={`badge ${statusBadge(item.status)}`}>{item.status}</span>
                    <span className={`badge ${activityBadge(item.activity)}`}>{item.activity}</span>
                    <span className={`badge ${categoryBadge(item.category)}`}>{item.category}</span>
                  </>
                )}
                <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }} title="Report date">
                  Report: {fmtDate(item.report_date ?? item.updated_at.slice(0, 10))}
                </span>
                <time>{fmtDate(item.updated_at)}</time>
              </div>
            </div>
          ))}</div>
        </>
      )}
      {detail && (
        <DetailModal
          item={detail}
          customers={customers}
          onClose={() => setDetail(null)}
          onEdit={(item) => {
            setDetail(null);
            setEditing(item);
          }}
          onDelete={async (targetItem) => {
            if (targetItem.activity === 'Done') return;
            if (window.confirm(`Are you sure you want to delete feedback #${targetItem.number}?`)) {
              await remove(targetItem);
              setDetail(null);
            }
          }}
          drawer={true}
        />
      )}
      {editing && <FormModal item={editing} customers={customers} onClose={() => setEditing(null)} drawer={true} />}
      {creating && <FormModal customers={customers} onClose={() => setCreating(false)} drawer={true} />}
    </>
  );
}
