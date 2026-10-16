import { useEffect, useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Search, Calendar, RotateCcw, History as HistoryIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/feedback-provider';
import { TeamOnly, fmtDateTime } from '@/components/feedback-views';

export const Route = createFileRoute('/history')({
  head: () => ({
    meta: [
      { title: 'Loop — Change history' },
      { name: 'description', content: 'Who changed what, and when.' },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  return (
    <TeamOnly>
      <HistoryInner />
    </TeamOnly>
  );
}

function HistoryInner() {
  const { history, customers } = useWorkspace();

  // Filters & Pagination State
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Filtered and sorted history
  const filteredHistory = useMemo(() => {
    const q = search.trim().toLowerCase();
    return history
      .filter(h => {
        // Date range filtering
        if (startDate) {
          const start = new Date(`${startDate}T00:00:00`);
          const itemDate = new Date(h.created_at);
          if (itemDate < start) return false;
        }
        if (endDate) {
          const end = new Date(`${endDate}T23:59:59.999`);
          const itemDate = new Date(h.created_at);
          if (itemDate > end) return false;
        }

        // Search filtering
        if (q) {
          const customer = customers.find(c => c.id === h.customer_id);
          const searchable = [
            h.action,
            h.actor,
            customer?.name ?? 'Workspace',
            h.field,
            h.old_value,
            h.new_value,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          if (!searchable.includes(q)) return false;
        }

        return true;
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [history, customers, search, startDate, endDate]);

  // Total pages
  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / pageSize));

  // Paginated items
  const paginatedHistory = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredHistory.slice(start, start + pageSize);
  }, [filteredHistory, page, pageSize]);

  // Reset to first page when search, date range, or page size change
  const filterKey = `${search}-${startDate}-${endDate}`;
  useEffect(() => {
    setPage(1);
  }, [filterKey, pageSize]);

  const hasActiveFilters = Boolean(search || startDate || endDate);

  const resetFilters = () => {
    setSearch('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Change history</h1>
          <p>Who changed what, and when — recorded automatically.</p>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="empty-state">
          <p className="font-medium text-base mb-1">No activity history yet.</p>
          <p className="text-muted-foreground text-sm">
            Every feedback creation, status update, customer PIN change, and data reset will be logged here automatically.
          </p>
        </div>
      ) : (
        <>
          {/* Filter Bar */}
          <div
            className="filters-line"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              alignItems: 'center',
              marginBottom: '20px',
              justifyContent: 'space-between',
            }}
          >
            <div
              className="table-tools"
              style={{
                margin: 0,
                flex: 1,
                display: 'flex',
                flexWrap: 'wrap',
                gap: '10px',
                alignItems: 'center',
              }}
            >
              <label className="search-box" style={{ minWidth: '240px', flex: 1 }}>
                <Search />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search action, actor, customer, or change details…"
                  aria-label="Search change history"
                />
              </label>

              <div className="date-filter-group">
                <div className="date-filter-item">
                  <Calendar size={14} />
                  <span>From:</span>
                  <input
                    type="date"
                    className="date-input"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    aria-label="Filter start date"
                  />
                </div>
                <div className="date-filter-item">
                  <span>To:</span>
                  <input
                    type="date"
                    className="date-input"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    aria-label="Filter end date"
                  />
                </div>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetFilters}
                    style={{ height: 36, padding: '0 10px', gap: 5 }}
                    title="Reset all filters"
                  >
                    <RotateCcw size={13} />
                    <span>Reset</span>
                  </Button>
                )}
              </div>
            </div>
            <span className="filter-caption" style={{ whiteSpace: 'nowrap' }}>
              {filteredHistory.length} of {history.length} entries
            </span>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="empty-state" style={{ padding: '48px 20px', textAlign: 'center' }}>
              <HistoryIcon size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
              <p className="font-medium text-base mb-1">No history entries match your search or date filters.</p>
              <p className="text-muted-foreground text-sm mb-4">
                Try modifying your search keywords or clearing the date range.
              </p>
              <Button variant="outline" size="sm" onClick={resetFilters}>
                <RotateCcw size={14} style={{ marginRight: 6 }} />
                Reset filters
              </Button>
            </div>
          ) : (
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: '8px',
                overflow: 'hidden',
                background: 'var(--background)',
              }}
            >
              <div className="history-list" style={{ borderTop: 'none' }}>
                {paginatedHistory.map(h => {
                  const customer = customers.find(c => c.id === h.customer_id);
                  return (
                    <div className="history-row" key={h.id} style={{ padding: '16px 20px' }}>
                      <span className="avatar">{(h.actor || '?').slice(0, 2).toUpperCase()}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3>{h.action}</h3>
                        <p>
                          {[
                            customer?.name ?? 'Workspace',
                            h.field,
                            h.old_value && h.new_value ? `${h.old_value} → ${h.new_value}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <time>{fmtDateTime(h.created_at)}</time>
                    </div>
                  );
                })}
              </div>

              {/* Pagination controls */}
              <div className="pagination-bar">
                <div className="pagination-info">
                  Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredHistory.length)} of {filteredHistory.length} entries
                </div>
                <div className="pagination-controls">
                  <button
                    type="button"
                    className="pagination-btn"
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    aria-label="Previous page"
                  >
                    ‹ Prev
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
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
                          className={`pagination-btn ${p === page ? 'active' : ''}`}
                          onClick={() => setPage(p)}
                        >
                          {p}
                        </button>
                      )
                    )}
                  <button
                    type="button"
                    className="pagination-btn"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    aria-label="Next page"
                  >
                    Next ›
                  </button>
                </div>
                <div className="pagination-size">
                  <label htmlFor="history-page-size">Rows per page:</label>
                  <select
                    id="history-page-size"
                    value={pageSize}
                    onChange={e => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
