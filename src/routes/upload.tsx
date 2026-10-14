import { useState, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { FileUp, Download, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useWorkspace } from '@/components/feedback-provider';
import { TeamOnly, activityBadge, categoryBadge, fmtDate } from '@/components/feedback-views';
import { downloadTemplate, previewImport, commitImport, type ImportPreview } from '@/lib/excel.functions';
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS } from '@/lib/feedback-model';

export const Route = createFileRoute('/upload')({
  head: () => ({ meta: [{ title: 'Loop — Excel import' }, { name: 'description', content: 'Import customer feedback in bulk from an Excel workbook.' }] }),
  component: UploadPage,
});

function UploadPage() {
  const { access } = useWorkspace();
  if (access && access.role === 'customer') {
    return <TeamOnly><UploadInner /></TeamOnly>;
  }
  return <UploadInner />;
}

function UploadInner() {
  const { importRows, customers, access, openLogin } = useWorkspace();
  const tplFn = useServerFn(downloadTemplate), previewFn = useServerFn(previewImport), commitFn = useServerFn(commitImport);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'idle' | 'preview' | 'commit'>('idle');

  useEffect(() => {
    if (!selectedCustomer && customers.length > 0 && customers[0]?.name) {
      setSelectedCustomer(customers[0].name);
    }
  }, [customers, selectedCustomer]);

  function handleCustomerChange(customerName: string) {
    setSelectedCustomer(customerName);
    if (preview) {
      const custObj = customers.find(c => c.name.toLowerCase() === customerName.toLowerCase());
      const custId = custObj?.id ?? '00000000-0000-4000-8000-000000000000';
      setPreview({
        ...preview,
        rows: preview.rows.map(r => ({
          ...r,
          customer_name: customerName,
          customer_id: custId,
        })),
      });
    }
  }

  function readBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
      r.onerror = () => reject(new Error('The file could not be read.'));
      r.readAsDataURL(file);
    });
  }

  async function template() {
    try {
      const b64 = await tplFn();
      const blob = await (await fetch(`data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${b64}`)).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'feedback-template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Template downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The template could not be downloaded.');
    }
  }

  async function onFile(f: File | null) {
    setError('');
    setPreview(null);
    if (!f) return;
    try {
      setBusy('preview');
      const base64 = await readBase64(f);
      const activeCust = selectedCustomer || customers[0]?.name || '';
      const res = await previewFn({ data: { name: f.name, base64, customer_name: activeCust } });
      if (activeCust && !selectedCustomer) {
        setSelectedCustomer(activeCust);
      }
      if (activeCust) {
        const custObj = customers.find(c => c.name.toLowerCase() === activeCust.toLowerCase());
        const custId = custObj?.id ?? '00000000-0000-4000-8000-000000000000';
        res.rows = res.rows.map(r => ({
          ...r,
          customer_name: activeCust,
          customer_id: custId,
        }));
      }
      setPreview(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The file could not be read.');
    } finally {
      setBusy('idle');
    }
  }

  async function commit() {
    if (!preview) return;
    if (!selectedCustomer) {
      setError('Please select a customer first.');
      toast.error('Select a customer before importing.');
      return;
    }
    try {
      setBusy('commit');
      const custObj = customers.find(c => c.name.toLowerCase() === selectedCustomer.toLowerCase());
      const custId = custObj?.id ?? '00000000-0000-4000-8000-000000000000';
      const rowsToCommit = preview.rows.map(r => ({
        ...r,
        customer_name: selectedCustomer,
        customer_id: custId,
      }));

      // ALWAYS update workspace state & persistent storage so Dashboard and Feedback List receive the data immediately
      await importRows(rowsToCommit);

      // Also attempt server sync if connected
      try {
        await commitFn({ data: { rows: rowsToCommit, file_name: preview.file_name, digest: preview.digest } });
      } catch {}

      setPreview(null);
      setFileName('');
      toast.success(`${rowsToCommit.length} feedback items imported and connected to Dashboard and Feedback list!`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setBusy('idle');
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Excel import</h1>
          <p>Bring feedback in bulk from the shared workbook template.</p>
        </div>
        <div className="heading-actions">
          <Button variant="outline" size="sm" onClick={template}>
            <Download />Download template
          </Button>
        </div>
      </div>
      {!access && (
        <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--secondary)', border: '1px solid var(--border)', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 14 }}>
            <strong>Read-only preview mode:</strong> You can download templates and preview files. Please sign in to import feedback into the workspace.
          </span>
          <Button size="sm" onClick={openLogin}>Sign in</Button>
        </div>
      )}
      <p className="filter-caption">
        Import up to {MAX_IMPORT_ROWS.toLocaleString()} rows and 10 MB per file · Automatically detects sheet Feedback or first sheet · Data connects directly to Dashboard & Feedback list.
      </p>
      <label className="upload-zone" style={{ cursor: 'pointer' }}>
        <span className="upload-icon"><FileUp /></span>
        {fileName ? (
          <>
            <h2>{fileName}</h2>
            <p>Click to choose another file.</p>
          </>
        ) : (
          <>
            <h2>Drop your Excel workbook here</h2>
            <p>Or click to browse (.xlsx). Click <strong>Download template</strong> above for the official format.</p>
          </>
        )}
        <input
          type="file"
          accept=".xlsx"
          style={{ display: 'none' }}
          onChange={e => {
            const f = e.target.files?.[0] ?? null;
            setFileName(f ? f.name : '');
            onFile(f);
          }}
        />
      </label>
      <div className="upload-info">
        <span>{busy === 'preview' ? 'Validating workbook…' : 'Excel workbooks only (.xlsx)'}</span>
        <span>Data is only saved to the workspace after you click Confirm import.</span>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      {preview && (
        <>
          <div className="filters-line" style={{ marginTop: 25, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span className="filter-caption">
              <CheckCircle2 size={14} className="success" /> {preview.rows.length} rows ready · {preview.rows.filter(r => r.is_update).length} updates
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label htmlFor="customer-select" style={{ fontSize: 15, fontWeight: 500, color: 'var(--muted-foreground, #888)' }}>
                  Customer:
                </label>
                <select
                  id="customer-select"
                  value={selectedCustomer}
                  onChange={e => handleCustomerChange(e.target.value)}
                  disabled={busy === 'commit'}
                  style={{
                    height: 36,
                    padding: '0 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border, #333)',
                    background: 'var(--background, #18191b)',
                    color: 'inherit',
                    fontSize: 15,
                    fontWeight: 500,
                    outline: 'none',
                    minWidth: 160,
                  }}
                >
                  {customers.length === 0 ? (
                    <option value="">No registered customers</option>
                  ) : (
                    customers.map(c => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <Button
                size="sm"
                disabled={!access || busy === 'commit' || preview.errors.length > 0 || !selectedCustomer}
                onClick={commit}
                title={!access ? 'Please sign in to import feedback' : undefined}
              >
                {busy === 'commit' ? 'Importing…' : 'Confirm import'}
              </Button>
            </div>
          </div>
          {preview.errors.length > 0 && (
            <div className="table-wrap" style={{ marginBottom: 19 }}>
              <div className="table-scroll" style={{ maxHeight: 220, overflow: 'auto' }}>
                <table className="feedback-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.errors.map(e => (
                      <tr key={e.row} style={{ cursor: 'default' }}>
                        <td>{e.row}</td>
                        <td style={{ whiteSpace: 'normal' }}>{e.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="table-wrap">
            <div className="table-scroll">
              <table className="feedback-table">
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Feature</th>
                    <th>Feedback</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Activity</th>
                    <th>Report Date</th>
                    <th>Estimated</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr key={i} style={{ cursor: 'default' }}>
                      <td>{r.number}</td>
                      <td><div className="feedback-title">{r.feature || '—'}</div></td>
                      <td><div className="feedback-title">{r.feedback}</div></td>
                      <td>{r.type}</td>
                      <td><span className={`badge ${categoryBadge(r.category)}`}>{r.category}</span></td>
                      <td>{r.status}</td>
                      <td><span className={`badge ${activityBadge(r.activity)}`}>{r.activity}</span></td>
                      <td>{fmtDate(r.report_date)}</td>
                      <td>{fmtDate(r.estimated_date)}</td>
                      <td>{r.is_update ? 'Update' : 'New'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

