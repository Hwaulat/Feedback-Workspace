import { createFileRoute } from '@tanstack/react-router';
import { useWorkspace } from '@/components/feedback-provider';
import { TeamOnly, fmtDateTime } from '@/components/feedback-views';

export const Route = createFileRoute('/history')({
  head: () => ({ meta: [{ title: 'Loop — Change history' }, { name: 'description', content: 'Who changed what, and when.' }] }),
  component: HistoryPage,
});

function HistoryPage() {
  return <TeamOnly><HistoryInner /></TeamOnly>;
}

function HistoryInner() {
  const { history, customers } = useWorkspace();
  return (
    <>
      <div className="page-heading"><div><h1>Change history</h1><p>Who changed what, and when — recorded automatically.</p></div></div>
      {history.length === 0 ? <div className="empty-state">No changes recorded yet.</div> : (
        <div className="history-list">
          {history.map(h => {
            const customer = customers.find(c => c.id === h.customer_id);
            return (
              <div className="history-row" key={h.id}>
                <span className="avatar">{(h.actor || '?').slice(0, 2).toUpperCase()}</span>
                <div>
                  <h3>{h.action}</h3>
                  <p>{[customer?.name ?? 'Workspace', h.field, h.old_value && h.new_value ? `${h.old_value} → ${h.new_value}` : null].filter(Boolean).join(' · ')}</p>
                </div>
                <time>{fmtDateTime(h.created_at)}</time>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
