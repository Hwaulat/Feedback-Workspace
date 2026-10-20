import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Search, Inbox, CheckCircle2, LoaderCircle, Hourglass, GitPullRequest, ArrowRight, Download, X, ClipboardCheck, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/feedback-provider';
import { DetailModal, activityBadge, categoryBadge, statusBadge, typeBadge, fmtDate, fmtReportDate } from '@/components/feedback-views';
import { types, categories, statuses, activities, isOverdue, isNeedsUpdate, type FeedbackItem } from '@/lib/feedback-model';

export const Route = createFileRoute('/')({
  head: () => ({ meta: [{ title: 'Loop — Overview' }, { name: 'description', content: 'Live overview of customer feedback, progress and change requests.' }] }),
  component: Overview,
});

function Overview() {
  const { access, demo, customers, items, selectedCustomer, setSelectedCustomer, exportToExcel } = useWorkspace();
  const [detail, setDetail] = useState<FeedbackItem | null>(null);
  const [popupCategory, setPopupCategory] = useState<'all' | 'done' | 'inprogress' | 'notstarted' | 'changerequest' | 'overdue' | 'review_status' | 'needs_update' | 'updated' | 'status' | 'status_execution' | 'status_waiting' | 'status_notes' | null>(null);
  const [modalReviewFilter, setModalReviewFilter] = useState<'all' | 'needs_update' | 'updated'>('all');
  const [modalTypeFilter, setModalTypeFilter] = useState<string>('all');
  const [modalCategoryFilter, setModalCategoryFilter] = useState<string>('all');
  const [modalStatusFilter, setModalStatusFilter] = useState<string>('all');
  const [modalActivityFilter, setModalActivityFilter] = useState<string>('all');
  const [modalSearch, setModalSearch] = useState<string>('');

  const openPopup = (cat: 'all' | 'done' | 'inprogress' | 'notstarted' | 'changerequest' | 'overdue' | 'review_status' | 'needs_update' | 'updated' | 'status' | 'status_execution' | 'status_waiting' | 'status_notes') => {
    setPopupCategory(cat);
    setModalSearch('');
    setModalCategoryFilter('all');
    setModalStatusFilter('all');

    if (cat === 'needs_update') {
      setModalReviewFilter('needs_update');
      setModalTypeFilter('all');
      setModalActivityFilter('all');
    } else if (cat === 'updated') {
      setModalReviewFilter('updated');
      setModalTypeFilter('all');
      setModalActivityFilter('all');
    } else if (cat === 'changerequest') {
      setModalReviewFilter('all');
      setModalTypeFilter('Change Request');
      setModalActivityFilter('all');
    } else if (cat === 'done') {
      setModalReviewFilter('all');
      setModalTypeFilter('all');
      setModalActivityFilter('Done');
    } else if (cat === 'inprogress') {
      setModalReviewFilter('all');
      setModalTypeFilter('all');
      setModalActivityFilter('In progress');
    } else if (cat === 'notstarted') {
      setModalReviewFilter('all');
      setModalTypeFilter('all');
      setModalActivityFilter('Not started');
    } else if (cat === 'status_execution') {
      setModalReviewFilter('all');
      setModalTypeFilter('all');
      setModalStatusFilter('Execution');
      setModalActivityFilter('all');
    } else if (cat === 'status_waiting') {
      setModalReviewFilter('all');
      setModalTypeFilter('all');
      setModalStatusFilter('Waiting');
      setModalActivityFilter('all');
    } else if (cat === 'status_notes') {
      setModalReviewFilter('all');
      setModalTypeFilter('all');
      setModalStatusFilter('Execution by notes');
      setModalActivityFilter('all');
    } else {
      setModalReviewFilter('all');
      setModalTypeFilter('all');
      setModalActivityFilter('all');
    }
  };

  const defaultReviewFilter = popupCategory === 'needs_update' ? 'needs_update' : popupCategory === 'updated' ? 'updated' : 'all';
  const defaultTypeFilter = popupCategory === 'changerequest' ? 'Change Request' : 'all';
  const defaultStatusFilter =
    popupCategory === 'status_execution' ? 'Execution' :
    popupCategory === 'status_waiting' ? 'Waiting' :
    popupCategory === 'status_notes' ? 'Execution by notes' : 'all';
  const defaultActivityFilter =
    popupCategory === 'done' ? 'Done' : popupCategory === 'inprogress' ? 'In progress' : popupCategory === 'notstarted' ? 'Not started' : 'all';

  const hasActiveModalFilters =
    modalReviewFilter !== defaultReviewFilter ||
    (popupCategory !== 'changerequest' && modalTypeFilter !== defaultTypeFilter) ||
    modalCategoryFilter !== 'all' ||
    modalStatusFilter !== defaultStatusFilter ||
    modalActivityFilter !== defaultActivityFilter ||
    modalSearch.trim().length > 0;

  const resetModalFilters = () => {
    setModalReviewFilter(defaultReviewFilter);
    setModalTypeFilter(defaultTypeFilter);
    setModalCategoryFilter('all');
    setModalStatusFilter(defaultStatusFilter);
    setModalActivityFilter(defaultActivityFilter);
    setModalSearch('');
  };

  const getPicDisplay = (item: FeedbackItem) => {
    if (item.pic_name) return item.pic_name;
    const cust = customers.find(c => c.id === item.customer_id);
    if (item.actor && item.actor !== cust?.name && item.actor !== 'Internal team' && item.actor !== 'Loop Team' && item.actor !== 'Admin') {
      return item.actor;
    }
    return null;
  };

  const [recentTypeTab, setRecentTypeTab] = useState<'all' | 'Complaint' | 'Change Request' | 'Bug Report'>('all');
  const [recentCategory, setRecentCategory] = useState<string>('all');
  const [recentActivity, setRecentActivity] = useState<string>('all');
  const [recentPage, setRecentPage] = useState(1);
  const [recentPageSize, setRecentPageSize] = useState(10);

  const active = useMemo(() => items.filter(i => !i.deleted_at && (selectedCustomer === 'all' || i.customer_id === selectedCustomer)), [items, selectedCustomer]);
  const done = active.filter(i => i.activity === 'Done').length;
  const progress = active.filter(i => i.activity === 'In progress').length;
  const notStarted = active.filter(i => i.activity === 'Not started' || (i.activity as string) === 'Pending').length;
  const changeRequests = active.filter(i => i.type === 'Change Request').length;
  const overdue = active.filter(i => isOverdue(i)).length;
  const total = active.length;
  const needsUpdateCount = active.filter(i => isNeedsUpdate(i, customers)).length;
  const updatedCount = active.length - needsUpdateCount;

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
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }, [active, recentTypeTab, recentCategory, recentActivity]);

  const recentTotalPages = Math.max(1, Math.ceil(filteredRecent.length / recentPageSize));
  const recentPagedItems = useMemo(() => {
    const start = (recentPage - 1) * recentPageSize;
    return filteredRecent.slice(start, start + recentPageSize);
  }, [filteredRecent, recentPage, recentPageSize]);

  // Reset page when filters change
  const recentFilterKey = `${recentTypeTab}-${recentCategory}-${recentActivity}`;
  useEffect(() => { setRecentPage(1); }, [recentFilterKey, recentPageSize]);

  const typeCounts = (['Bug Report', 'Change Request', 'Complaint'] as const).map(t => ({
    label: t,
    short: t,
    value: active.filter(i => i.type === t).length,
  }));
  const maxType = Math.max(1, ...typeCounts.map(t => t.value));
  const catCounts = (['Major', 'Minor'] as const).map(c => ({
    label: c,
    cls: c === 'Major' ? 'major' : 'minor',
    value: active.filter(i => i.category === c).length,
  }));

  const statusExecution = active.filter(i => i.status === 'Execution').length;
  const statusWaiting = active.filter(i => i.status === 'Waiting').length;
  const statusExecutionNotes = active.filter(i => i.status === 'Execution by notes').length;

  const C = 2 * Math.PI * 48;
  const segs = [
    { label: 'Done', value: done, color: '#10B981', cls: 'chart-success' },
    { label: 'In progress', value: progress, color: '#02A9EA', cls: 'chart-info' },
    { label: 'Not started', value: notStarted, color: '#EF4444', cls: 'chart-danger' },
  ].filter(s => s.value > 0);

  const statusSegs = [
    { label: 'Execution', value: statusExecution, color: '#10B981', cls: 'status-execution' },
    { label: 'Waiting', value: statusWaiting, color: '#EA580C', cls: 'status-waiting' },
    { label: 'Execution by notes', value: statusExecutionNotes, color: '#0284C7', cls: 'status-execution-notes' },
  ].filter(s => s.value > 0);

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
    if (popupCategory === 'review_status') {
      return {
        title: 'Review Status Breakdown',
        subtitle: `Total ${total} feedback: ${updatedCount} Updated · ${needsUpdateCount} Needs Update`,
        items: [...active].sort((a, b) => {
          const aNeeds = isNeedsUpdate(a, customers) ? 0 : 1;
          const bNeeds = isNeedsUpdate(b, customers) ? 0 : 1;
          return aNeeds - bNeeds;
        }),
      };
    }
    if (popupCategory === 'needs_update') {
      return {
        title: 'Needs Update Feedback',
        subtitle: `${needsUpdateCount} feedback items pending review & triage`,
        items: active.filter(i => isNeedsUpdate(i, customers)),
      };
    }
    if (popupCategory === 'updated') {
      return {
        title: 'Updated Feedback',
        subtitle: `${updatedCount} feedback items reviewed and updated`,
        items: active.filter(i => !isNeedsUpdate(i, customers)),
      };
    }
    if (popupCategory === 'status') {
      return {
        title: 'Feedback by Status',
        subtitle: `Total ${total} feedback items: ${statusExecution} Execution · ${statusWaiting} Waiting · ${statusExecutionNotes} Execution by notes`,
        items: active,
      };
    }
    if (popupCategory === 'status_execution') {
      return {
        title: 'Execution Status Feedback',
        subtitle: `List of feedback items currently in Execution status (${statusExecution} items)`,
        items: active.filter(i => i.status === 'Execution'),
      };
    }
    if (popupCategory === 'status_waiting') {
      return {
        title: 'Waiting Status Feedback',
        subtitle: `List of feedback items currently in Waiting status (${statusWaiting} items)`,
        items: active.filter(i => i.status === 'Waiting'),
      };
    }
    if (popupCategory === 'status_notes') {
      return {
        title: 'Execution by Notes Feedback',
        subtitle: `List of feedback items with Execution by notes status (${statusExecutionNotes} items)`,
        items: active.filter(i => i.status === 'Execution by notes'),
      };
    }
    if (popupCategory === 'all') {
      return {
        title: 'All Feedback Items',
        subtitle: `Complete overview of recorded feedback (${total} items)`,
        items: active,
      };
    }
    return null;
  }, [popupCategory, active, updatedCount, needsUpdateCount, total, customers, statusExecution, statusWaiting, statusExecutionNotes]);

  const modalFilteredItems = useMemo(() => {
    if (!popupCategory || !popupData) return [];

    let list = [...active];

    if (popupCategory === 'overdue') {
      list = list.filter(i => isOverdue(i));
    }

    return list
      .filter(item => {
        if (modalReviewFilter === 'needs_update') {
          if (!isNeedsUpdate(item, customers)) return false;
        } else if (modalReviewFilter === 'updated') {
          if (isNeedsUpdate(item, customers)) return false;
        }

        if (popupCategory === 'changerequest') {
          if (item.type !== 'Change Request') return false;
        } else if (modalTypeFilter !== 'all' && item.type !== modalTypeFilter) {
          return false;
        }

        if (modalCategoryFilter !== 'all' && item.category !== modalCategoryFilter) {
          return false;
        }

        if (modalStatusFilter !== 'all' && item.status !== modalStatusFilter) {
          return false;
        }

        if (modalActivityFilter !== 'all') {
          const act = (item.activity as string) === 'Pending' ? 'Not started' : item.activity;
          if (act !== modalActivityFilter) return false;
        }

        if (modalSearch.trim()) {
          const q = modalSearch.toLowerCase().trim();
          const custName = customers.find(c => c.id === item.customer_id)?.name?.toLowerCase() || '';
          const pic = (getPicDisplay(item) || '').toLowerCase();
          const fb = item.feedback.toLowerCase();
          const feat = (item.feature || '').toLowerCase();
          const num = String(item.number);
          if (!fb.includes(q) && !feat.includes(q) && !custName.includes(q) && !pic.includes(q) && !num.includes(q)) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (popupCategory === 'review_status') {
          const aNeeds = isNeedsUpdate(a, customers) ? 0 : 1;
          const bNeeds = isNeedsUpdate(b, customers) ? 0 : 1;
          if (aNeeds !== bNeeds) return aNeeds - bNeeds;
        }
        return b.number - a.number;
      });
  }, [
    popupCategory,
    popupData,
    active,
    modalReviewFilter,
    modalTypeFilter,
    modalCategoryFilter,
    modalStatusFilter,
    modalActivityFilter,
    modalSearch,
    customers,
  ]);

  const modalDoneCount = useMemo(() => {
    return modalFilteredItems.filter(i => i.activity === 'Done').length;
  }, [modalFilteredItems]);

  const modalNotStartedCount = useMemo(() => {
    return modalFilteredItems.filter(i => {
      const act = (i.activity as string) === 'Pending' ? 'Not started' : i.activity;
      return act === 'Not started';
    }).length;
  }, [modalFilteredItems]);

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Overview</h1>
          <p>
            {demo
              ? 'A live demo of the ticketing workspace — sign in to work with your own data.'
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
            <button
              type="button"
              className="metric-tertiary-btn"
              onClick={() => openPopup('all')}
              aria-label="View all feedback details"
            >
              Details &rarr;
            </button>
          </div>
        </div>

        <div className="metric">
          <div className="metric-top">
            <span>Review Status</span>
            <span className="metric-icon warning"><ClipboardCheck /></span>
          </div>
          <div className="metric-review-breakdown">
            <div className="review-stat-row">
              <button
                type="button"
                className="review-stat-pill updated"
                onClick={() => openPopup('updated')}
                title={`${updatedCount} items Updated — click to view list`}
              >
                <span className="badge-dot" style={{ backgroundColor: '#10b981' }} />
                <span className="review-stat-label">Updated:</span>
                <strong className="review-stat-num">{updatedCount}</strong>
              </button>
              <button
                type="button"
                className="review-stat-pill needs-update"
                onClick={() => openPopup('needs_update')}
                title={`${needsUpdateCount} items Needs Update — click to view list`}
              >
                <span className="badge-dot" style={{ backgroundColor: '#ea580c' }} />
                <span className="review-stat-label">Needs Update:</span>
                <strong className="review-stat-num">{needsUpdateCount}</strong>
              </button>
            </div>
          </div>
          <div className="metric-foot">
            <span>{needsUpdateCount > 0 ? `${needsUpdateCount} pending review` : 'All items updated'}</span>
            <button
              type="button"
              className="metric-tertiary-btn"
              onClick={() => openPopup('review_status')}
              aria-label="View Review Status feedback details"
            >
              Details &rarr;
            </button>
          </div>
        </div>

        <div className="metric" style={{ cursor: 'pointer' }} onClick={() => openPopup('done')}>
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
              onClick={e => {
                e.stopPropagation();
                openPopup('done');
              }}
              aria-label="View Done feedback details"
            >
              Details &rarr;
            </button>
          </div>
        </div>

        <div className="metric" style={{ cursor: 'pointer' }} onClick={() => openPopup('inprogress')}>
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
              onClick={e => {
                e.stopPropagation();
                openPopup('inprogress');
              }}
              aria-label="View In progress feedback details"
            >
              Details &rarr;
            </button>
          </div>
        </div>

        <div className="metric" style={{ cursor: 'pointer' }} onClick={() => openPopup('notstarted')}>
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
              onClick={e => {
                e.stopPropagation();
                openPopup('notstarted');
              }}
              aria-label="View Not started feedback details"
            >
              Details &rarr;
            </button>
          </div>
        </div>

        <div className="metric" style={{ cursor: 'pointer' }} onClick={() => openPopup('changerequest')}>
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
              onClick={e => {
                e.stopPropagation();
                openPopup('changerequest');
              }}
              aria-label="View Change Request feedback details"
            >
              Details &rarr;
            </button>
          </div>
        </div>
      </div>

      <div className="charts-grid">
        {/* Activity status pie chart */}
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
                  (() => {
                    let actAcc = 0;
                    return segs.map(s => {
                      const len = (C * s.value) / total;
                      const strokeOffset = -actAcc;
                      actAcc += len;
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
                    });
                  })()}
              </svg>
              <div className="donut-center">
                {total}
                <small>total items</small>
              </div>
            </div>
            <div className="chart-legend">
              {[
                { l: 'Done', v: done, color: '#10B981', cat: 'done' },
                { l: 'In progress', v: progress, color: '#02A9EA', cat: 'inprogress' },
                { l: 'Not started', v: notStarted, color: '#EF4444', cat: 'notstarted' },
              ].map(s => (
                <div
                  className="legend-row"
                  key={s.l}
                  style={{ cursor: 'pointer' }}
                  onClick={() => openPopup(s.cat as any)}
                  title={`View ${s.l} feedback`}
                >
                  <span className="legend-dot" style={{ backgroundColor: s.color }} />
                  <span>{s.l}</span>
                  <strong>{s.v}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Status pie chart — positioned right next to Activity status */}
        <div className="chart-panel">
          <div className="panel-heading">
            <h2>Status</h2>
            <p className="panel-subtitle">{total} feedback items</p>
          </div>
          <div className="donut-layout">
            <div className="donut" role="img" aria-label="Status breakdown">
              <svg viewBox="0 0 120 120">
                <circle className="donut-track" cx="60" cy="60" r="48" fill="none" strokeWidth="16" />
                {total > 0 &&
                  (() => {
                    let statAcc = 0;
                    return statusSegs.map(s => {
                      const len = (C * s.value) / total;
                      const strokeOffset = -statAcc;
                      statAcc += len;
                      return (
                        <circle
                          key={s.label}
                          className="donut-segment"
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
                    });
                  })()}
              </svg>
              <div className="donut-center">
                {total}
                <small>total items</small>
              </div>
            </div>
            <div className="chart-legend">
              {[
                { l: 'Execution', v: statusExecution, color: '#10B981', cat: 'status_execution' },
                { l: 'Waiting', v: statusWaiting, color: '#EA580C', cat: 'status_waiting' },
                { l: 'Execution by notes', v: statusExecutionNotes, color: '#0284C7', cat: 'status_notes' },
              ].map(s => (
                <div
                  className="legend-row"
                  key={s.l}
                  style={{ cursor: 'pointer' }}
                  onClick={() => openPopup(s.cat as any)}
                  title={`View ${s.l} feedback`}
                >
                  <span className="legend-dot" style={{ backgroundColor: s.color }} />
                  <span>{s.l}</span>
                  <strong>{s.v}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Feedback by type bar chart */}
        <div className="chart-panel">
          <div className="panel-heading">
            <h2>Feedback by type</h2>
            <p className="panel-subtitle">All recorded items</p>
          </div>
          <div className="bar-chart">
            {typeCounts.map(t => (
              <div className="bar-col" key={t.label}>
                <span>{t.value}</span>
                <div
                  className="bar-rect"
                  style={{
                    height: `${Math.max(3, (t.value / maxType) * 100)}%`,
                    backgroundColor: t.label === 'Complaint' ? '#2563eb' : t.label === 'Change Request' ? '#dc2626' : '#ea580c',
                  }}
                />
              </div>
            ))}
          </div>
          <div className="bar-labels">
            {typeCounts.map(t => (
              <span key={t.label}>{t.short}</span>
            ))}
          </div>
        </div>

        {/* Category breakdown */}
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
                  <th>Report Date</th>
                  <th>Estimated</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {recentPagedItems.map(item => (
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
                        <span className={`badge ${activityBadge(item.activity)}`}>{item.activity}</span>
                      )}
                    </td>
                    <td>{fmtReportDate(item.report_date, item.updated_at)}</td>
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
          {filteredRecent.length > recentPageSize && (
            <div className="pagination-bar">
              <div className="pagination-info">
                Showing {(recentPage - 1) * recentPageSize + 1}–{Math.min(recentPage * recentPageSize, filteredRecent.length)} of {filteredRecent.length} items
              </div>
              <div className="pagination-controls">
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={recentPage <= 1}
                  onClick={() => setRecentPage(p => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  ‹ Prev
                </button>
                {Array.from({ length: recentTotalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === recentTotalPages || Math.abs(p - recentPage) <= 1)
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
                        className={`pagination-btn ${p === recentPage ? 'active' : ''}`}
                        onClick={() => setRecentPage(p)}
                      >
                        {p}
                      </button>
                    )
                  )}
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={recentPage >= recentTotalPages}
                  onClick={() => setRecentPage(p => Math.min(recentTotalPages, p + 1))}
                  aria-label="Next page"
                >
                  Next ›
                </button>
              </div>
              <div className="pagination-size">
                <label htmlFor="recent-page-size">Rows:</label>
                <select
                  id="recent-page-size"
                  value={recentPageSize}
                  onChange={e => { setRecentPageSize(Number(e.target.value)); setRecentPage(1); }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pop up modal for metric details */}
      {popupData && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setPopupCategory(null); }}>
          <div className="modal" style={{ width: 1200, maxWidth: '96vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h2>{popupData.title}</h2>
                <span className="badge" style={{ fontSize: 13, background: '#02A9EA', color: '#ffffff', fontWeight: 600 }}>
                  {modalFilteredItems.length} items
                </span>
                {modalFilteredItems.length !== (popupData.items?.length ?? active.length) && (
                  <span className="text-muted-foreground text-xs">
                    (filtered from {popupData.items?.length ?? active.length})
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {popupCategory === 'changerequest' && (
                  <>
                    <span
                      className="badge done"
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: '4px 9px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        borderRadius: 6,
                      }}
                      title="Total Done in this list"
                    >
                      <CheckCircle2 size={13} style={{ flexShrink: 0 }} />
                      Done: {modalDoneCount}
                    </span>
                    <span
                      className="badge pending"
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: '4px 9px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        borderRadius: 6,
                      }}
                      title="Total Not Started in this list"
                    >
                      <Hourglass size={13} style={{ flexShrink: 0 }} />
                      Not Started: {modalNotStartedCount}
                    </span>
                  </>
                )}
                <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setPopupCategory(null)}>
                  <X size={16} />
                </Button>
              </div>
            </div>
            <p className="text-muted-foreground text-sm" style={{ margin: '-14px 0 12px' }}>
              {popupData.subtitle}
            </p>

            {/* Filter bar: Search, Review Status, Type, Category, Status, Activity */}
            <div className="modal-filter-bar">
              <div className="modal-filter-group" style={{ minWidth: 200, flex: 1 }}>
                <label htmlFor="modal-search" className="modal-filter-label">Search</label>
                <div style={{ position: 'relative', width: '100%' }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)', pointerEvents: 'none' }} />
                  <input
                    id="modal-search"
                    type="search"
                    className="modal-filter-search"
                    style={{ paddingLeft: 28, width: '100%' }}
                    placeholder="Search feedback, feature, PIC..."
                    value={modalSearch}
                    onChange={e => setModalSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-filter-group">
                <label htmlFor="modal-review-filter" className="modal-filter-label">Review Status</label>
                <select
                  id="modal-review-filter"
                  className="modal-filter-select"
                  value={modalReviewFilter}
                  onChange={e => setModalReviewFilter(e.target.value as any)}
                >
                  <option value="all">All Review Status</option>
                  <option value="needs_update">Needs Update ({needsUpdateCount})</option>
                  <option value="updated">Updated ({updatedCount})</option>
                </select>
              </div>

              {popupCategory !== 'changerequest' && (
                <div className="modal-filter-group">
                  <label htmlFor="modal-type-filter" className="modal-filter-label">Type</label>
                  <select
                    id="modal-type-filter"
                    className="modal-filter-select"
                    value={modalTypeFilter}
                    onChange={e => setModalTypeFilter(e.target.value)}
                  >
                    <option value="all">All Types</option>
                    {types.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="modal-filter-group">
                <label htmlFor="modal-category-filter" className="modal-filter-label">Category</label>
                <select
                  id="modal-category-filter"
                  className="modal-filter-select"
                  value={modalCategoryFilter}
                  onChange={e => setModalCategoryFilter(e.target.value)}
                >
                  <option value="all">All Categories</option>
                  {categories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="modal-filter-group">
                <label htmlFor="modal-status-filter" className="modal-filter-label">Status</label>
                <select
                  id="modal-status-filter"
                  className="modal-filter-select"
                  value={modalStatusFilter}
                  onChange={e => setModalStatusFilter(e.target.value)}
                >
                  <option value="all">All Statuses</option>
                  {statuses.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="modal-filter-group">
                <label htmlFor="modal-activity-filter" className="modal-filter-label">Activity</label>
                <select
                  id="modal-activity-filter"
                  className="modal-filter-select"
                  value={modalActivityFilter}
                  onChange={e => setModalActivityFilter(e.target.value)}
                >
                  <option value="all">All Activities</option>
                  {activities.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>

              {hasActiveModalFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="modal-filter-reset"
                  onClick={resetModalFilters}
                  title="Reset all modal filters"
                  style={{ height: 32, fontSize: 12, marginTop: 16, gap: 4 }}
                >
                  <RotateCcw size={12} />
                  Reset
                </Button>
              )}
            </div>

            <div style={{ overflow: 'auto', flex: 1, marginBottom: 16 }}>
              {modalFilteredItems.length === 0 ? (
                <div className="empty-state" style={{ padding: '36px 15px', textAlign: 'center' }}>
                  <p className="font-medium text-sm">No feedback matching the selected filters.</p>
                  {hasActiveModalFilters && (
                    <Button variant="outline" size="sm" onClick={resetModalFilters} style={{ marginTop: 10 }}>
                      Reset filters
                    </Button>
                  )}
                </div>
              ) : (
                <div className="table-wrap">
                  <div className="table-scroll">
                    <table className="feedback-table modal-feedback-table">
                      <thead>
                        <tr>
                          <th>No.</th>
                          <th>PIC Name</th>
                          <th>Feedback</th>
                          {access?.role !== 'customer' && <th>Customer</th>}
                          <th>Review Status</th>
                          <th>Type</th>
                          <th>Category</th>
                          <th>Status</th>
                          <th>Activity</th>
                          <th>Report Date</th>
                          <th>Notes from Ragdalion</th>
                          <th>Estimated</th>
                          <th>Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {modalFilteredItems.map(item => (
                          <tr
                            key={item.id}
                            onClick={() => {
                              setPopupCategory(null);
                              setDetail(item);
                            }}
                          >
                            <td>{item.number}</td>
                            <td>{getPicDisplay(item) ? <span className="font-medium">{getPicDisplay(item)}</span> : <span className="text-muted-foreground">—</span>}</td>
                            <td>
                              <div className="feedback-title">{item.feedback}</div>
                              <div className="feedback-feature">{item.feature || '—'}</div>
                            </td>
                            {access?.role !== 'customer' && (
                              <td>{customers.find(c => c.id === item.customer_id)?.name ?? '—'}</td>
                            )}
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
