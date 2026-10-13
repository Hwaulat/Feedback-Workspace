import { useMemo, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Inbox, CheckCircle2, LoaderCircle, Hourglass, AlarmClock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/feedback-provider';
import { DetailModal, activityBadge, categoryBadge, fmtDate } from '@/components/feedback-views';
import { isOverdue, type FeedbackItem } from '@/lib/feedback-model';

export const Route = createFileRoute('/')({
  head: () => ({ meta: [{ title: 'Loop — Overview' }, { name: 'description', content: 'Live overview of customer feedback, progress and overdue work.' }] }),
  component: Overview,
});

function Overview() {
  const { access, demo, customers, items, selectedCustomer } = useWorkspace();
  const [detail, setDetail] = useState<FeedbackItem | null>(null);
  const active = useMemo(() => items.filter(i => !i.deleted_at && (selectedCustomer === 'all' || i.customer_id === selectedCustomer)), [items, selectedCustomer]);
  const done = active.filter(i => i.activity === 'Done').length;
  const progress = active.filter(i => i.activity === 'In progress').length;
  const pending = active.filter(i => i.activity === 'Pending').length;
  const overdue = active.filter(i => isOverdue(i)).length;
  const total = active.length;
  const recent = useMemo(() => [...active].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 8), [active]);
  const typeCounts = (['Bug Report', 'Change Request', 'Complaint'] as const).map(t => ({ label: t, short: t === 'Bug Report' ? 'Bug' : t === 'Change Request' ? 'Change' : 'Complaint', value: active.filter(i => i.type === t).length }));
  const maxType = Math.max(1, ...typeCounts.map(t => t.value));
  const catCounts = (['Major', 'Medium', 'Minor'] as const).map(c => ({ label: c, cls: c === 'Major' ? 'major' : c === 'Medium' ? 'medium' : 'minor', value: active.filter(i => i.category === c).length }));
  const C = 2 * Math.PI * 48;
  const segs = [{ label: 'Done', value: done, cls: 'chart-success' }, { label: 'In progress', value: progress, cls: 'chart-info' }, { label: 'Pending', value: pending, cls: 'chart-warning' }].filter(s => s.value > 0);
  let acc = 0;
  return (
    <>
      <div className="page-heading">
        <div><h1>Overview</h1><p>{demo ? 'A live demo of the feedback workspace — sign in to work with your own data.' : access?.role === 'customer' ? 'Feedback recorded for your account.' : 'Every piece of customer feedback, at a glance.'}</p></div>
        <div className="heading-actions"><Button asChild variant="outline" size="sm"><Link to="/feedback">Open feedback list<ArrowRight /></Link></Button></div>
      </div>
      <div className="metrics">
        <div className="metric"><div className="metric-top"><span>Total feedback</span><span className="metric-icon info"><Inbox /></span></div><div className="metric-value">{total}</div><div className="metric-foot">Across {customers.length} customers</div></div>
        <div className="metric"><div className="metric-top"><span>Done</span><span className="metric-icon success"><CheckCircle2 /></span></div><div className="metric-value">{done}</div><div className="metric-foot">Completed to date</div></div>
        <div className="metric"><div className="metric-top"><span>In progress</span><span className="metric-icon"><LoaderCircle /></span></div><div className="metric-value">{progress}</div><div className="metric-foot">Being worked on</div></div>
        <div className="metric"><div className="metric-top"><span>Pending</span><span className="metric-icon warning"><Hourglass /></span></div><div className="metric-value">{pending}</div><div className="metric-foot">Waiting to start</div></div>
        <div className="metric"><div className="metric-top"><span>Overdue</span><span className="metric-icon danger"><AlarmClock /></span></div><div className="metric-value">{overdue}</div><div className="metric-foot">Past estimated date</div></div>
      </div>
      <div className="charts-grid">
        <div className="chart-panel">
          <div className="panel-heading"><h2>Activity status</h2><p className="panel-subtitle">{total} feedback items</p></div>
          <div className="donut-layout">
            <div className="donut" role="img" aria-label="Activity status breakdown">
              <svg viewBox="0 0 120 120">{segs.map(s => { const len = C * s.value / total; const el = <circle key={s.label} className={`donut-segment ${s.cls}`} cx="60" cy="60" r="48" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} />; acc += len; return el; })}<circle className="donut-track" cx="60" cy="60" r="48" fill="none" /></svg>
              <div className="donut-center">{total}<small>total items</small></div>
            </div>
            <div className="chart-legend">
              {[{ l: 'Done', v: done, c: 'done' }, { l: 'In progress', v: progress, c: 'progress' }, { l: 'Pending', v: pending, c: 'pending' }].map(s => <div className="legend-row" key={s.l}><span className={`legend-dot ${s.c}`} />{s.l}<strong>{s.v}</strong></div>)}
            </div>
          </div>
        </div>
        <div className="chart-panel">
          <div className="panel-heading"><h2>Feedback by type</h2><p className="panel-subtitle">All recorded items</p></div>
          <div className="bar-chart">{typeCounts.map(t => <div className="bar-col" key={t.label}><span>{t.value}</span><div className="bar-rect" style={{ height: `${Math.max(3, t.value / maxType * 100)}%` }} /></div>)}</div>
          <div className="bar-labels">{typeCounts.map(t => <span key={t.label}>{t.short}</span>)}</div>
        </div>
        <div className="chart-panel">
          <div className="panel-heading"><h2>Category breakdown</h2><p className="panel-subtitle">{overdue} overdue right now</p></div>
          <div className="category-chart">{catCounts.map(c => <div className="category-row" key={c.label}><span>{c.label}</span><div className="category-track"><div className={`category-fill ${c.cls}`} style={{ width: `${total ? c.value / total * 100 : 0}%` }} /></div><strong>{c.value}</strong></div>)}</div>
        </div>
      </div>
      <div className="section-heading"><div><h2>Recent feedback</h2><p>The latest updates across your workspace</p></div><Link to="/feedback" className="text-sm">View all</Link></div>
      {total === 0 ? <div className="empty-state">No feedback recorded yet. Import an Excel workbook or add the first item from the feedback list.</div> : (
        <div className="table-wrap"><div className="table-scroll">
          <table className="feedback-table">
            <thead><tr><th>Feedback</th>{access?.role !== 'customer' && <th>Customer</th>}<th>Type</th><th>Category</th><th>Activity</th><th>Estimated</th><th>Updated</th></tr></thead>
            <tbody>
              {recent.map(item => (
                <tr key={item.id} onClick={() => setDetail(item)}>
                  <td><div className="feedback-title">{item.feedback}</div><div className="feedback-feature">{item.feature || '—'}</div></td>
                  {access?.role !== 'customer' && <td>{customers.find(c => c.id === item.customer_id)?.name ?? '—'}</td>}
                  <td>{item.type}</td>
                  <td><span className={`badge ${categoryBadge(item.category)}`}>{item.category}</span></td>
                  <td><span className={`badge ${activityBadge(item.activity)}`}>{item.activity}</span></td>
                  <td>{fmtDate(item.estimated_date)}{isOverdue(item) && <span className="badge major" style={{ marginLeft: 6 }}>Overdue</span>}</td>
                  <td>{fmtDate(item.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}
      {detail && <DetailModal item={detail} customers={customers} onClose={() => setDetail(null)} />}
    </>
  );
}
