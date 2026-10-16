import { useEffect, useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Plus, Search, Download, Trash2, RotateCcw, ChevronLeft, ChevronRight, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useWorkspace } from '@/components/feedback-provider';
import { DetailModal, FormModal, activityBadge, categoryBadge, statusBadge, typeBadge, fmtDate, fmtDateTime, fmtReportDate } from '@/components/feedback-views';
import { types, activities, statuses, isOverdue, parseImages, type FeedbackItem } from '@/lib/feedback-model';

export const Route = createFileRoute('/feedback')({
  head: () => ({ meta: [{ title: 'Loop — Ticketing List' }, { name: 'description', content: 'Browse, filter and update customer feedback.' }] }),
  component: FeedbackPage,
});

function FeedbackPage() {
  const { access, demo, customers, items, selectedCustomer, setSelectedCustomer, exportToExcel, exportChangeRequests, remove, openLogin } = useWorkspace();
  const [search, setSearch] = useState(''); const [type, setType] = useState('all'); const [status, setStatus] = useState('all'); const [activity, setActivity] = useState('all');
  const [reviewFilter, setReviewFilter] = useState('all');
  const [viewTrash, setViewTrash] = useState(false);
  const [detail, setDetail] = useState<FeedbackItem | null>(null); const [editing, setEditing] = useState<FeedbackItem | null>(null); const [creating, setCreating] = useState(false);
  const [fbPage, setFbPage] = useState(1);
  const [fbPageSize, setFbPageSize] = useState(10);
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

  const crRows = useMemo(() => rows.filter(i => {
    const t = (i.type || '').toLowerCase();
    return t.includes('change') || t.includes('request') || t.includes('cr');
  }), [rows]);

  const [crCustomerPromptOpen, setCrCustomerPromptOpen] = useState(false);
  const [promptSelectedCustomer, setPromptSelectedCustomer] = useState('');

  const customerCrCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of customers) {
      const cnt = items.filter(
        i =>
          !i.deleted_at &&
          i.customer_id === c.id &&
          ((i.type || '').toLowerCase().includes('change') || (i.type || '').toLowerCase().includes('cr'))
      ).length;
      map.set(c.id, cnt);
    }
    return map;
  }, [customers, items]);

  const handleDownloadCR = () => {
    if (selectedCustomer === 'all') {
      setPromptSelectedCustomer('');
      setCrCustomerPromptOpen(true);
      return;
    }
    exportChangeRequests(crRows);
  };

  const fbTotalPages = Math.max(1, Math.ceil(rows.length / fbPageSize));
  const paginatedRows = useMemo(() => {
    const start = (fbPage - 1) * fbPageSize;
    return rows.slice(start, start + fbPageSize);
  }, [rows, fbPage, fbPageSize]);

  // Reset page when filters change
  const fbFilterKey = `${viewTrash}-${selectedCustomer}-${type}-${status}-${activity}-${reviewFilter}-${search}`;
  useEffect(() => { setFbPage(1); }, [fbFilterKey, fbPageSize]);

  const open = (item: FeedbackItem) => (canManage ? setEditing(item) : setDetail(item));
  const needsUpdateCount = items.filter(i => !i.deleted_at && i.needs_review).length;

  const getPicDisplay = (item: FeedbackItem) => {
    if (item.pic_name) return item.pic_name;
    const cust = customers.find(c => c.id === item.customer_id);
    if (item.actor && item.actor !== cust?.name && item.actor !== 'Internal team' && item.actor !== 'Loop Team' && item.actor !== 'Admin') {
      return item.actor;
    }
    return null;
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{viewTrash ? 'Trash / Deleted feedback' : 'Ticketing List'}</h1>
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
          {!viewTrash && (
            <Button
              size="sm"
              onClick={handleDownloadCR}
              disabled={crRows.length === 0}
              title={
                selectedCustomer === 'all'
                  ? 'Pilih customer terlebih dahulu untuk download dokumen CR'
                  : 'Download Change Request (CR) report to formatted Excel file (.xlsx)'
              }
              className="bg-[#02A9EA] hover:bg-[#0292CA] text-white border-0 shadow-sm font-medium"
            >
              <FileSpreadsheet />Download CR ({crRows.length})
            </Button>
          )}
          {!viewTrash && (
            <Button size="sm" onClick={() => setCreating(true)}><Plus />Submit Ticket</Button>
          )}
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
                <Plus /> Submit Ticket
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
                {paginatedRows.map(item => (
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
                      {getPicDisplay(item) ? (
                        <span className="font-medium text-foreground">{getPicDisplay(item)}</span>
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
                    <td>
                      {item.needs_review ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={`badge ${typeBadge(item.type)}`}>{item.type}</span>
                      )}
                    </td>
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
                    <td>{fmtReportDate(item.report_date, item.updated_at)}</td>
                    <td>{fmtDate(item.estimated_date)}{isOverdue(item) && <span className="badge major" style={{ marginLeft: 6 }}>Overdue</span>}</td>
                    <td title={fmtDateTime(item.updated_at)}>{fmtDate(item.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            <div className="table-footer">
              <span>Click a row to {canManage ? 'edit' : 'view or edit'} the full details.</span>
              <span>Showing {rows.length > 0 ? (fbPage - 1) * fbPageSize + 1 : 0}–{Math.min(fbPage * fbPageSize, rows.length)} of {rows.length} items</span>
            </div>
            {rows.length > fbPageSize && (
              <div className="pagination-bar">
                <div className="pagination-info">
                  Page {fbPage} of {fbTotalPages}
                </div>
                <div className="pagination-controls">
                  <button
                    type="button"
                    className="pagination-btn"
                    disabled={fbPage <= 1}
                    onClick={() => setFbPage(p => Math.max(1, p - 1))}
                    aria-label="Previous page"
                  >
                    ‹ Prev
                  </button>
                  {Array.from({ length: fbTotalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === fbTotalPages || Math.abs(p - fbPage) <= 1)
                    .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] ?? 0) > 1) acc.push('ellipsis');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, idx) =>
                      p === 'ellipsis' ? (
                        <span key={`e${idx}`} className="pagination-ellipsis">…</span>
                      ) : (
                        <button
                          key={p}
                          type="button"
                          className={`pagination-btn ${p === fbPage ? 'active' : ''}`}
                          onClick={() => setFbPage(p)}
                        >
                          {p}
                        </button>
                      )
                    )}
                  <button
                    type="button"
                    className="pagination-btn"
                    disabled={fbPage >= fbTotalPages}
                    onClick={() => setFbPage(p => Math.min(fbTotalPages, p + 1))}
                    aria-label="Next page"
                  >
                    Next ›
                  </button>
                </div>
                <div className="pagination-size">
                  <label htmlFor="fb-page-size">Rows per page:</label>
                  <select
                    id="fb-page-size"
                    value={fbPageSize}
                    onChange={e => { setFbPageSize(Number(e.target.value)); setFbPage(1); }}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>
            )}
          </div>
          <div className="mobile-feedback-list">{paginatedRows.map(item => (
            <div className="feedback-mobile-item" key={item.id} onClick={() => open(item)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3>{item.feedback}</h3>
                  <p>
                    {item.feature || '—'} · #{item.number}
                    {getPicDisplay(item) && <span className="inline-block ml-1 font-medium text-primary">· PIC: {getPicDisplay(item)}</span>}
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
                    <span className={`badge ${typeBadge(item.type)}`}>{item.type}</span>
                    <span className={`badge ${statusBadge(item.status)}`}>{item.status}</span>
                    <span className={`badge ${activityBadge(item.activity)}`}>{item.activity}</span>
                    <span className={`badge ${categoryBadge(item.category)}`}>{item.category}</span>
                  </>
                )}
                <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }} title="Report date">
                  Report: {fmtReportDate(item.report_date, item.updated_at)}
                </span>
                <time>{fmtDate(item.updated_at)}</time>
              </div>
            </div>
          ))}
          {rows.length > fbPageSize && (
            <div className="pagination-bar" style={{ padding: '14px 16px' }}>
              <div className="pagination-info">
                {(fbPage - 1) * fbPageSize + 1}–{Math.min(fbPage * fbPageSize, rows.length)} of {rows.length}
              </div>
              <div className="pagination-controls">
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={fbPage <= 1}
                  onClick={() => setFbPage(p => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  ‹ Prev
                </button>
                {Array.from({ length: fbTotalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === fbTotalPages || Math.abs(p - fbPage) <= 1)
                  .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] ?? 0) > 1) acc.push('ellipsis');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, idx) =>
                    p === 'ellipsis' ? (
                      <span key={`e${idx}`} className="pagination-ellipsis">…</span>
                    ) : (
                      <button
                        key={p}
                        type="button"
                        className={`pagination-btn ${p === fbPage ? 'active' : ''}`}
                        onClick={() => setFbPage(p)}
                      >
                        {p}
                      </button>
                    )
                  )}
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={fbPage >= fbTotalPages}
                  onClick={() => setFbPage(p => Math.min(fbTotalPages, p + 1))}
                  aria-label="Next page"
                >
                  Next ›
                </button>
              </div>
              <div className="pagination-size">
                <label htmlFor="fb-page-size-mobile">Rows:</label>
                <select
                  id="fb-page-size-mobile"
                  value={fbPageSize}
                  onChange={e => { setFbPageSize(Number(e.target.value)); setFbPage(1); }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
          )}
          </div>
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

      {/* Customer Selection Required Modal for CR Download */}
      <Dialog open={crCustomerPromptOpen} onOpenChange={setCrCustomerPromptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">Pilih Customer Terlebih Dahulu</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Dokumen Change Request (CR) wajib per customer
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-sm text-foreground/80 leading-relaxed">
              Untuk men-download dokumen <strong>Change Request (CR)</strong>, Anda wajib memilih customer terlebih dahulu agar data CR dari customer lain tidak masuk ke dalam dokumen.
            </p>

            <div className="space-y-1.5">
              <label htmlFor="prompt-customer-select" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pilih Customer
              </label>
              <select
                id="prompt-customer-select"
                className="w-full h-10 px-3 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-[#02A9EA] focus:border-[#02A9EA]"
                value={promptSelectedCustomer}
                onChange={e => setPromptSelectedCustomer(e.target.value)}
              >
                <option value="">-- Silakan Pilih Customer --</option>
                {customers.map(c => {
                  const count = customerCrCounts.get(c.id) ?? 0;
                  return (
                    <option key={c.id} value={c.id}>
                      {c.name} ({count} CR)
                    </option>
                  );
                })}
              </select>
            </div>

            {promptSelectedCustomer && (customerCrCounts.get(promptSelectedCustomer) ?? 0) === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                ⚠️ Customer ini belum memiliki tiket Change Request untuk diekspor.
              </p>
            )}
          </div>

          <DialogFooter className="flex flex-row justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCrCustomerPromptOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!promptSelectedCustomer || (customerCrCounts.get(promptSelectedCustomer) ?? 0) === 0}
              className="bg-[#02A9EA] hover:bg-[#0292CA] text-white border-0 shadow-sm font-medium"
              onClick={() => {
                if (!promptSelectedCustomer) return;
                const chosenId = promptSelectedCustomer;
                setSelectedCustomer(chosenId);
                const targetCr = items.filter(
                  i =>
                    !i.deleted_at &&
                    i.customer_id === chosenId &&
                    ((i.type || '').toLowerCase().includes('change') || (i.type || '').toLowerCase().includes('cr'))
                );
                setCrCustomerPromptOpen(false);
                exportChangeRequests(targetCr);
              }}
            >
              <FileSpreadsheet className="w-4 h-4 mr-1.5" />
              Download Dokumen CR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
