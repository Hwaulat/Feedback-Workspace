import { useState } from 'react';
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
  return <TeamOnly><UploadInner /></TeamOnly>;
}

function UploadInner() {
  const tplFn = useServerFn(downloadTemplate), previewFn = useServerFn(previewImport), commitFn = useServerFn(commitImport);
  const [fileName, setFileName] = useState(''); const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState<'idle' | 'preview' | 'commit'>('idle'); const [pins, setPins] = useState<{ name: string; pin: string }[]>([]);
  function readBase64(file: File): Promise<string> { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1] ?? ''); r.onerror = () => reject(new Error('The file could not be read.')); r.readAsDataURL(file); }); }
  async function template() {
    try { const b64 = await tplFn(); const blob = await (await fetch(`data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${b64}`)).blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'feedback-template.xlsx'; a.click(); URL.revokeObjectURL(url); toast.success('Template downloaded'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'The template could not be downloaded.'); }
  }
  async function onFile(f: File | null) {
    setError(''); setPreview(null); setPins([]); if (!f) return;
    try { setBusy('preview'); const base64 = await readBase64(f); setPreview(await previewFn({ data: { name: f.name, base64 } })); }
    catch (e) { setError(e instanceof Error ? e.message : 'The file could not be read.'); }
    finally { setBusy('idle'); }
  }
  async function commit() {
    if (!preview) return;
    try { setBusy('commit'); const res = await commitFn({ data: { rows: preview.rows, file_name: preview.file_name, digest: preview.digest } }); setPins(res.pins); setPreview(null); setFileName(''); toast.success(`${res.count} feedback rows imported`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Import failed.'); }
    finally { setBusy('idle'); }
  }
  return (
    <>
      <div className="page-heading">
        <div><h1>Excel import</h1><p>Bring feedback in bulk from the shared workbook template.</p></div>
        <div className="heading-actions"><Button variant="outline" size="sm" onClick={template}><Download />Download template</Button></div>
      </div>
      <p className="filter-caption">Up to {MAX_IMPORT_ROWS.toLocaleString()} rows and 10 MB per workbook · matches existing feedback by customer and No. · use the template so columns line up.</p>
      <label className="upload-zone" style={{ cursor: 'pointer' }}>
        <span className="upload-icon"><FileUp /></span>
        {fileName ? <><h2>{fileName}</h2><p>Choose a different file to replace this preview.</p></> : <><h2>Drop your Excel workbook here</h2><p>Or click to browse — one worksheet named Feedback, from the template.</p></>}
        <input type="file" accept=".xlsx" style={{ display: 'none' }} onChange={e => onFile(e.target.files?.[0] ?? null)} />
      </label>
      <div className="upload-info"><span>{busy === 'preview' ? 'Checking the workbook…' : 'Excel files only (.xlsx)'}</span><span>Nothing is saved until you confirm the import.</span></div>
      {error && <p className="error-text" role="alert">{error}</p>}
      {preview && (
        <>
          <div className="filters-line" style={{ marginTop: 25 }}>
            <span className="filter-caption"><CheckCircle2 size={14} className="success" /> {preview.rows.length} rows ready · {preview.rows.filter(r => r.is_update).length} updates · {preview.newCustomers.length} new customers{preview.newCustomers.length > 0 ? ` (${preview.newCustomers.join(', ')})` : ''}</span>
            <Button size="sm" disabled={busy === 'commit' || preview.errors.length > 0} onClick={commit}>{busy === 'commit' ? 'Importing…' : 'Confirm import'}</Button>
          </div>
          {preview.errors.length > 0 && (
            <div className="table-wrap" style={{ marginBottom: 19 }}><div className="table-scroll" style={{ maxHeight: 220, overflow: 'auto' }}>
              <table className="feedback-table"><thead><tr><th>Row</th><th>Problem</th></tr></thead><tbody>
                {preview.errors.map(e => <tr key={e.row} style={{ cursor: 'default' }}><td>{e.row}</td><td style={{ whiteSpace: 'normal' }}>{e.reason}</td></tr>)}
              </tbody></table>
            </div></div>
          )}
          <div className="table-wrap"><div className="table-scroll">
            <table className="feedback-table">
              <thead><tr><th>Customer</th><th>No.</th><th>Feature</th><th>Feedback</th><th>Type</th><th>Category</th><th>Status</th><th>Activity</th><th>Estimated</th><th>Change</th></tr></thead>
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr key={i} style={{ cursor: 'default' }}>
                    <td>{r.customer_name}</td><td>{r.number}</td>
                    <td><div className="feedback-title">{r.feature || '—'}</div></td>
                    <td><div className="feedback-title">{r.feedback}</div></td>
                    <td>{r.type}</td>
                    <td><span className={`badge ${categoryBadge(r.category)}`}>{r.category}</span></td>
                    <td>{r.status}</td>
                    <td><span className={`badge ${activityBadge(r.activity)}`}>{r.activity}</span></td>
                    <td>{fmtDate(r.estimated_date)}</td>
                    <td>{r.is_update ? 'Update' : 'New'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
        </>
      )}
      {pins.length > 0 && (
        <div className="modal-overlay"><div className="modal" role="dialog" aria-modal="true">
          <div className="modal-header"><h2>New customer PINs</h2></div>
          <p className="login-copy">These PINs let each new customer view only their own feedback. They are shown once — copy them before closing.</p>
          {pins.map(p => <label className="form-field mb-3" key={p.name}><span className="pin-reveal">{p.name}</span><input className="pin-input" value={p.pin} readOnly onFocus={e => e.target.select()} /></label>)}
          <div className="form-actions"><Button onClick={() => setPins([])}>Done</Button></div>
        </div></div>
      )}
    </>
  );
}
