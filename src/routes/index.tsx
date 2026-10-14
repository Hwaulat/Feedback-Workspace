import { useMemo, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Inbox, CheckCircle2, LoaderCircle, Hourglass, GitPullRequest, ArrowRight, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/feedback-provider';
import { DetailModal, activityBadge, categoryBadge, statusBadge, fmtDate } from '@/components/feedback-views';
import { categories, activities, isOverdue, type FeedbackItem } from '@/lib/feedback-model';

export const Route = createFileRoute('/')({
  head: () => ({ meta: [{ title: 'Loop — Overview' }, { name: 'description', content: 'Live overview of customer feedback, progress and change requests.' }] }),
  component: Overview,
});

function Overview() {
  const { access, demo, customers, items, selectedCustomer, setSelectedCustomer, exportToExcel } = useWorkspace();
  const [detail, setDetail] = useState<FeedbackItem | null>(null);
  const [popupCategory, setPopupCategory] = useState<'done' | 'inprogress' | 'notstarted' | 'changerequest' | 'overdue' | null>(null);
  const [recentTypeTab, setRecentTypeTab] = useState<'all' | 'Complaint' | 'Change Request' | 'Bug Report'>('all');
  const [recentCategory, setRecentCategory] = useState<string>('all');
  const [recentActivity, setRecentActivity] = useState<string>('all');

  const active = useMemo(() => items.filter(i => !i.deleted_at && (selectedCustomer === 'all' || i.customer_id === selectedCustomer)), [items, selectedCustomer]);
  const done = active.filter(i => i.activity === 'Done').length;
  const progress = active.filter(i => i.activity === 'In progress').length;
  const notStarted = active.filter(i => i.activity === 'Not started' || (i.activity as string) === 'Pending').length;
  const changeRequests = active.filter(i => i.type === 'Change Request').length;
  const overdue = active.filter(i => isOverdue(i)).length;
  const total = active.length;

  const filteredRecent = useMemo(() => {
    return [...active]
      .filter(i => {
        if (recentTypeTab !== 'all' && i.type !== recentTypeTab) return false;
        if (recentCategory !== 'all' && i.category !== recentCategory) return false;
        if (recentActivity !== 'all') {
          const act = (i.activity as string) === 'Pending' ? 'Not started' : i.activity;
          if (act !== recentActivity) return false;
        }
        return true;
      })
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 10);
  }, [active, recentTypeTab, recentCategory, recentActivity]);

  const typeCounts = (['Bug Report', 'Change Request', 'Complaint'] as const).map(t => ({
    label: t,
    short: t,
    value: active.filter(i => i.type === t).length,
  }));
  const maxType = Math.max(1, ...typeCounts.map(t => t.value));
  const catCounts = (['Major', 'Medium', 'Minor'] as const).map(c => ({
    label: c,
    cls: c === 'Major' ? 'major' : c === 'Medium' ? 'medium' : 'minor',
    value: active.filter(i => i.category === c).length,
  }));

  const C = 2 * Math.PI * 48;
  const segs = [
    { label: 'Done', value: done, color: '#10B981', cls: 'chart-success' },
    { label: 'In progress', value: progress, color: '#02A9EA', cls: 'chart-info' },
    { label: 'Not started', value: notStarted, color: '#EF4444', cls: 'chart-danger' },
  ].filter(s => s.value > 0);

  let acc = 0;

  const popupData = useMemo(() => {
    if (!popupCategory) return null;
    if (popupCategory === 'done') {
      return {
        title: 'Done Feedback',
        subtitle: 'List of all completed feedback items',
        items: active.filter(i => i.activity === 'Done'),
      };
    }
    if (popupCategory === 'inprogress') {
      return {
        title: 'In Progress Feedback',
        subtitle: 'List of feedback currently in progress',
        items: active.filter(i => i.activity === 'In progress'),
      };
    }
    if (popupCategory === 'notstarted') {
      return {
        title: 'Not Started Feedback',
        subtitle: 'List of feedback waiting to start',
        items: active.filter(i => i.activity === 'Not started' || (i.activity as string) === 'Pending'),
      };
    }
    if (popupCategory === 'changerequest') {
      return {
        title: 'Change Request Feedback',
        subtitle: 'List of all feedback with Change Request type',
        items: active.filter(i => i.type === 'Change Request'),
      };
    }
    if (popupCategory === 'overdue') {
      return {
        title: 'Overdue Feedback',
        subtitle: 'List of feedback past estimated completion date',
        items: active.filter(i => isOverdue(i)),
      };
    }
    return null;
  }, [popupCategory, active]);

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Overview</h1>
          <p>
            {demo
              ? 'A live demo of the feedback workspace — sign in to work with your own data.'
              : access?.role === 'customer'
              ? 'Feedback recorded for your account.'
              : 'Every piece of customer feedback, at a glance.'}
          </p>
        </div>
        <div className="heading-actions">
          {access?.role !== 'customer' && customers.length > 0 && (
            <select
              className="filter-select"
              value={selectedCustomer}
              onChange={e => setSelectedCustomer(e.target.value)}
              aria-label="Filter by customer"
              style={{ height: 34, fontSize: 15 }}
            >
              <option value="all">All customers ({customers.length})</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportToExcel(active)}
            disabled={total === 0}
            title="Export feedback to Excel file (.xlsx)"
          >
            <Download />Export by Excel ({total})
          </Button>
          <Button asChild size="sm">
            <Link to="/feedback">
              Open feedback list<ArrowRight />
            </Link>
          </Button>
        </div>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="metric-top">
            <span>Total feedback</span>
            <span className="metric-icon info"><Inbox /></span>
          </div>
          <div className="metric-value">{total}</div>
          <div className="metric-foot">
            <span>{access?.role === 'customer' ? 'Your active feedback' : `Across ${customers.length} customers`}</span>
          </div>
        </div>

        <div className="metric">
          <div className="metric-top">
            <span>Done</span>
            <span className="metric-icon success"><CheckCircle2 /></span>
          </div>
          <div className="metric-value">{done}</div>
          <div className="metric-foot">
            <span>Completed to date</span>
            <button
              type="button"
              className="metric-tertiary-btn"
              onClick={() => setPopupCategory('done')}
              aria-label="View Done feedback details"
            >
              Details &rarr;
            </button>
          </div>
        </div>

        <div className="metric">
          <div className="metric-top">
            <span>In progress</span>
            <span className="metric-icon"><LoaderCircle /></span>
          </div>
          <div className="metric-value">{progress}</div>
          <div className="metric-foot">
            <span>Being worked on</span>
            <button
              type="button"
              className="metric-tertiary-btn"
              onClick={() => setPopupCategory('inprogress')}
              aria-label="View In progress feedback details"
            >
              Details &rarr;
            </button>
          </div>
        </div>

        <div className="metric">
          <div className="metric-top">
            <span>Not started</span>
            <span className="metric-icon danger"><Hourglass /></span>
          </div>
          <div className="metric-value">{notStarted}</div>
          <div className="metric-foot">
            <span>Waiting to start</span>
            <button
              type="button"
              className="metric-tertiary-btn"
              onClick={() => setPopupCategory('notstarted')}
              aria-label="View Not started feedback details"
            >
              Details &rarr;
            </button>
          </div>
        </div>

        <div className="metric">
          <div className="metric-top">
            <span>Change Request</span>
            <span className="metric-icon info"><GitPullRequest /></span>
          </div>
          <div className="metric-value">{changeRequests}</div>
          <div className="metric-foot">
            <span>Enhancement requests</span>
            <button
              type="button"
              className="metric-tertiary-btn"
              onClick={() => setPopupCategory('changerequest')}
              aria-label="View Change Request feedback details"
            >
              Details &rarr;
            </button>
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-panel">
          <div className="panel-heading">
            <h2>Activity status</h2>
            <p className="panel-subtitle">{total} feedback items</p>
          </div>
          <div className="donut-layout">
            <div className="donut" role="img" aria-label="Activity status breakdown">
              <svg viewBox="0 0 120 120">
                <circle className="donut-track" cx="60" cy="60" r="48" fill="none" strokeWidth="16" />
                {total > 0 &&
                  segs.map(s => {
                    const len = (C * s.value) / total;
                    const strokeOffset = -acc;
                    acc += len;
                    return (
                      <circle
                        key={s.label}
                        className={`donut-segment ${s.cls}`}
                        cx="60"
                        cy="60"
                        r="48"
                        fill="none"
                        stroke={s.color}
                        strokeWidth="16"
                        strokeDasharray={`${len} ${C - len}`}
                        strokeDashoffset={strokeOffset}
                      />
                    );
                  })}
              </svg>
              <div className="donut-center">
                {total}
                <small>total items</small>
              </div>
            </div>
            <div className="chart-legend">
              {[
                { l: 'Done', v: done, color: '#10B981' },
                { l: 'In progress', v: progress, color: '#02A9EA' },
                { l: 'Not started', v: notStarted, color: '#EF4444' },
              ].map(s => (
                <div className="legend-row" key={s.l}>
                  <span className="legend-dot" style={{ backgroundColor: s.color }} />
                  {s.l}
                  <strong>{s.v}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="chart-panel">
          <div className="panel-heading">
            <h2>Feedback by type</h2>
            <p className="panel-subtitle">All recorded items</p>
          </div>
          <div className="bar-chart">
            {typeCounts.map(t => (
              <div className="bar-col" key={t.label}>
                <span>{t.value}</span>
                <div className="bar-rect" style={{ height: `${Math.max(3, (t.value / maxType) * 100)}%` }} />
              </div>
            ))}
          </div>
          <div className="bar-labels">
            {typeCounts.map(t => (
              <span key={t.label}>{t.short}</span>
            ))}
          </div>
        </div>

        <div className="chart-panel">
          <div className="panel-heading">
            <h2>Category breakdown</h2>
            <p className="panel-subtitle">{changeRequests} change requests</p>
          </div>
          <div className="category-chart">
            {catCounts.map(c => (
              <div className="category-row" key={c.label}>
                <span>{c.label}</span>
                <div className="category-track">
                  <div className={`category-fill ${c.cls}`} style={{ width: `${total ? (c.value / total) * 100 : 0}%` }} />
                </div>
                <strong>{c.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="section-heading" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div>
            <h2>Recent feedback</h2>
            <p>Latest feedback updates by type and filters</p>
          </div>
          {access?.role !== 'customer' && active.filter(i => i.needs_review).length > 0 && (
            <span className="badge needs-update" style={{ fontSize: 13, padding: '3px 9px' }}>
              {active.filter(i => i.needs_review).length} need update
            </span>
          )}
        </div>
        <Link to="/feedback" className="text-sm">View all ({total})</Link>
      </div>

      <div className="recent-feedback-toolbar">
        <div className="tab-buttons" role="tablist" aria-label="Filter feedback by type tab">
          {[
            { id: 'all', label: 'All', count: active.length },
            { id: 'Complaint', label: 'Complaint', count: active.filter(i => i.type === 'Complaint').length },
            { id: 'Change Request', label: 'Change Request', count: active.filter(i => i.type === 'Change Request').length },
            { id: 'Bug Report', label: 'Bug Report', count: active.filter(i => i.type === 'Bug Report').length },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={recentTypeTab === tab.id}
              className={`tab-btn ${recentTypeTab === tab.id ? 'active' : ''}`}
              onClick={() => setRecentTypeTab(tab.id as any)}
            >
              {tab.label}
              <span className="tab-count">{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="recent-filters">
          <select
            className="filter-select"
            value={recentCategory}
            onChange={e => setRecentCategory(e.target.value)}
            aria-label="Filter recent by category"
            style={{ height: 34, fontSize: 14 }}
          >
            <option value="all">All categories</option>
            {categories.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={recentActivity}
            onChange={e => setRecentActivity(e.target.value)}
            aria-label="Filter by activity"
            style={{ height: 34, fontSize: 14 }}
          >
            <option value="all">All activity</option>
            {activities.map(a => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {total === 0 ? (
        <div className="empty-state">
          <p className="font-medium text-base mb-1">No feedback recorded yet.</p>
          <p className="text-muted-foreground text-sm mb-4">
            {access?.role === 'customer'
              ? 'No feedback recorded for your account yet.'
              : 'Add manual feedback or register a customer to begin tracking feedback.'}
          </p>
          <div className="flex gap-2 justify-center">
            {access?.role === 'customer' ? (
              <Button asChild size="sm">
                <Link to="/feedback">Open feedback list</Link>
              </Button>
            ) : (
              <>
                <Button asChild size="sm">
                  <Link to="/feedback">+ Add feedback</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to="/customers">+ Add customer</Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/upload">Import Excel</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      ) : filteredRecent.length === 0 ? (
        <div className="empty-state" style={{ padding: '36px 20px' }}>
          <p className="font-medium text-sm mb-1">No feedback matches these tab filters.</p>
          <p className="text-muted-foreground text-xs mb-3">
            Change feedback type tab, or adjust category and activity filter selections.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRecentTypeTab('all');
              setRecentCategory('all');
              setRecentActivity('all');
            }}
          >
            Reset filters
          </Button>
        </div>
      ) : (
        <div className="table-wrap">
          <div className="table-scroll">
            <table className="feedback-table">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Feedback</th>
                  {access?.role !== 'customer' && <th>Customer</th>}
                  {access?.role !== 'customer' && <th>Review Status</th>}
                  <th>Type</th>
                  <th>Category</th>
                  <th>Activity</th>
                  <th>Estimated</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecent.map(item => (
                  <tr key={item.id} onClick={() => setDetail(item)}>
                    <td>{item.number}</td>
                    <td>
                      <div className="feedback-title">{item.feedback}</div>
                      <div className="feedback-feature">{item.feature || '—'}</div>
                    </td>
                    {access?.role !== 'customer' && (
                      <td>{customers.find(c => c.id === item.customer_id)?.name ?? '—'}</td>
                    )}
                    {access?.role !== 'customer' && (
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
                    <td>{access?.role === 'customer' && item.needs_review ? <span className="text-muted-foreground">—</span> : item.type}</td>
                    <td>
                      {access?.role === 'customer' && item.needs_review ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={`badge ${categoryBadge(item.category)}`}>{item.category}</span>
                      )}
                    </td>
                    <td>
                      {access?.role === 'customer' && item.needs_review ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={`badge ${activityBadge(item.activity)}`}>{item.activity}</span>
                      )}
                    </td>
                    <td>
                      {fmtDate(item.estimated_date)}
                      {isOverdue(item) && <span className="badge major" style={{ marginLeft: 6 }}>Overdue</span>}
                    </td>
                    <td>{fmtDate(item.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pop up modal for metric details */}
      {popupData && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setPopupCategory(null); }}>
          <div className="modal" style={{ width: 1000, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2>{popupData.title}</h2>
                <span className="badge" style={{ fontSize: 13, background: '#02A9EA', color: '#ffffff', fontWeight: 600 }}>
                  {popupData.items.length} items
                </span>
              </div>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setPopupCategory(null)}>
                <X size={16} />
              </Button>
            </div>
            <p className="text-muted-foreground text-sm" style={{ margin: '-14px 0 14px' }}>
              {popupData.subtitle}
            </p>
            <div style={{ overflow: 'auto', flex: 1, marginBottom: 16 }}>
              {popupData.items.length === 0 ? (
                <div className="empty-state" style={{ padding: '30px 15px' }}>
                  <p className="font-medium text-sm">No feedback in this category.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <div className="table-scroll">
                    <table className="feedback-table modal-feedback-table">
                      <thead>
                        <tr>
                          <th>No.</th>
                          <th>Feedback</th>
                          {access?.role !== 'customer' && <th>Customer</th>}
                          {access?.role !== 'customer' && <th>Review Status</th>}
                          <th>Type</th>
                          <th>Category</th>
                          <th>Status</th>
                          <th>Activity</th>
                          <th>Notes from Ragdalion</th>
                          <th>Estimated</th>
                          <th>Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {popupData.items.map(item => (
                          <tr
                            key={item.id}
                            onClick={() => {
                              setPopupCategory(null);
                              setDetail(item);
                            }}
                          >
                            <td>{item.number}</td>
                            <td>
                              <div className="feedback-title">{item.feedback}</div>
                              <div className="feedback-feature">{item.feature || '—'}</div>
                            </td>
                            {access?.role !== 'customer' && (
                              <td>{customers.find(c => c.id === item.customer_id)?.name ?? '—'}</td>
                            )}
                            {access?.role !== 'customer' && (
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
                            <td>{access?.role === 'customer' && item.needs_review ? <span className="text-muted-foreground">—</span> : item.type}</td>
                            <td>
                              {access?.role === 'customer' && item.needs_review ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <span className={`badge ${categoryBadge(item.category)}`}>{item.category}</span>
                              )}
                            </td>
                            <td><span className={`badge ${statusBadge(item.status)}`}>{item.status}</span></td>
                            <td>
                              {access?.role === 'customer' && item.needs_review ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <span className={`badge ${activityBadge(item.activity)}`}>{item.activity}</span>
                              )}
                            </td>
                            <td style={{ maxWidth: 240, whiteSpace: 'normal' }} title={item.notes || undefined}>
                              {item.notes ? (
                                <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                  {item.notes}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--muted-foreground)' }}>—</span>
                              )}
                            </td>
                            <td>
                              {fmtDate(item.estimated_date)}
                              {isOverdue(item) && <span className="badge major" style={{ marginLeft: 6 }}>Overdue</span>}
                            </td>
                            <td>{fmtDate(item.updated_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="outline" size="sm" onClick={() => setPopupCategory(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {detail && <DetailModal item={detail} customers={customers} onClose={() => setDetail(null)} />}
    </>
  );
}
