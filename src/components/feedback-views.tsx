import { useMemo, useState, useEffect, useRef, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useWorkspace } from './feedback-provider';
import { Button } from '@/components/ui/button';
import { X, Trash2, RotateCcw, ShieldCheck, Image as ImageIcon, Pencil } from 'lucide-react';
import { types, categories, statuses, activities, todayWIB, type Customer, type FeedbackItem, type ItemInput } from '@/lib/feedback-model';

export const activityBadge = (a: string) => (a === 'Done' ? 'done' : a === 'In progress' ? 'progress' : 'pending');
export const categoryBadge = (c: string) => (c === 'Major' ? 'major' : c === 'Medium' ? 'medium' : '');
export const statusBadge = (s: string) => (s === 'Waiting' ? 'status-waiting' : s === 'Execution' ? 'status-execution' : s === 'Execution by notes' ? 'status-execution-notes' : '');
export const reviewBadge = (needsReview?: boolean) => (needsReview ? 'needs-update' : 'updated');
export function fmtDate(d?: string | null) { if (!d) return '—'; return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d)); }
export function fmtDateTime(iso?: string | null) { if (!iso) return '—'; return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); }

export function TeamOnly({ children }: { children: ReactNode }) {
  const { access, openLogin } = useWorkspace();
  if (!access) {
    return (
      <div className="empty-state">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <ShieldCheck size={36} className="text-muted-foreground" />
        </div>
        <p className="font-medium text-base mb-1">Authentication Required</p>
        <p className="text-muted-foreground text-sm mb-4">
          Please sign in to access this page.
        </p>
        <div className="flex gap-2 justify-center">
          <Button size="sm" onClick={openLogin}>
            Sign in
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/">Go to Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }
  if (access.role === 'customer') {
    return (
      <div className="empty-state">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <ShieldCheck size={36} className="text-muted-foreground" />
        </div>
        <p className="font-medium text-base mb-1">Restricted Access for Customer Portal</p>
        <p className="text-muted-foreground text-sm mb-4">
          As a customer account, you can only access the <strong>Dashboard (Overview)</strong> and <strong>Feedback list</strong>.
        </p>
        <div className="flex gap-2 justify-center">
          <Button asChild size="sm">
            <Link to="/">Go to Dashboard</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/feedback">Go to Feedback list</Link>
          </Button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function processImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const isImage = file.type.startsWith('image/') || /\.(png|jpe?g)$/i.test(file.name);
    if (!isImage) {
      reject(new Error('Only PNG and JPG/JPEG images are supported.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file format.'));
      img.onload = () => {
        const maxDim = 1200;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(mime, 0.85);
        resolve(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function ImageUploader({
  value,
  onChange,
  disabled,
}: {
  value?: string | null | undefined;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    try {
      const dataUrl = await processImageFile(file);
      onChange(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process image.');
    }
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (disabled) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [disabled]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="image-uploader-wrap">
      {value ? (
        <div className="image-preview-card">
          <img
            src={value}
            alt="Preview thumbnail"
            className="image-thumb"
            onClick={() => setZoom(true)}
            title="Click to view full preview"
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 500, fontSize: 14 }}>Image attached</span>
              <span className="badge" style={{ fontSize: 12, padding: '1px 6px' }}>Ready</span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
              Click thumbnail to zoom • Drag or paste to replace
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              style={{ height: 30, fontSize: 13, padding: '0 10px' }}
              onClick={() => fileInputRef.current?.click()}
            >
              Replace
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              style={{ height: 28, width: 28, color: 'var(--danger)' }}
              onClick={() => onChange(null)}
              title="Remove image"
            >
              <Trash2 size={14} />
            </Button>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            accept="image/png,image/jpeg,image/jpg"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />
        </div>
      ) : (
        <div
          className={`image-dropzone ${isDragging ? 'dragging' : ''}`}
          onClick={() => !disabled && fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
          onDragEnter={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          aria-label="Upload screenshot or image"
        >
          <input
            type="file"
            ref={fileInputRef}
            accept="image/png,image/jpeg,image/jpg"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                backgroundColor: isDragging ? 'rgba(2, 169, 234, 0.15)' : 'var(--background)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#02a9ea',
              }}
            >
              <ImageIcon size={20} />
            </div>
            <div>
              <span style={{ fontWeight: 500, fontSize: 15 }}>Click to upload</span>
              <span style={{ color: 'var(--muted-foreground)', fontSize: 14 }}> or drag & drop</span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted-foreground)' }}>
              PNG or JPG • Paste anytime with <kbd style={{ padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 12 }}>Ctrl+V</kbd>
            </p>
          </div>
        </div>
      )}
      {error && <p className="error-text" style={{ margin: '6px 0 0', fontSize: 13 }}>{error}</p>}

      {zoom && value && (
        <div className="image-lightbox-overlay" onClick={() => setZoom(false)}>
          <div className="image-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={value} alt="Attachment full preview" className="image-lightbox-img" />
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="image-lightbox-close"
              onClick={() => setZoom(false)}
              aria-label="Close zoom"
            >
              <X size={16} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DetailModal({
  item,
  customers,
  onClose,
  onEdit,
  onDelete,
  drawer = false,
}: {
  item: FeedbackItem;
  customers: Customer[];
  onClose: () => void;
  onEdit?: (item: FeedbackItem) => void;
  onDelete?: (item: FeedbackItem) => void;
  drawer?: boolean;
}) {
  const { access } = useWorkspace();
  const [zoomImage, setZoomImage] = useState(false);
  const customer = customers.find(c => c.id === item.customer_id);
  const showReview = access?.role !== 'customer';
  const isPendingInternalReview = Boolean(item.needs_review);
  return (
    <div
      className={drawer ? 'modal-overlay-drawer' : 'modal-overlay'}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={drawer ? 'modal modal-drawer-right' : 'modal'}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <h2>Feedback #{item.number}</h2>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}><X /></Button>
        </div>
        <dl className="detail-grid">
          <div><dt>Customer</dt><dd>{customer?.name ?? '—'}</dd></div>
          <div><dt>Feature</dt><dd>{item.feature || '—'}</dd></div>
          <div><dt>Report date</dt><dd>{fmtDate(item.report_date ?? item.updated_at.slice(0, 10))}</dd></div>
          {showReview && (
            <div>
              <dt>Review Status</dt>
              <dd>
                <span className={`badge ${reviewBadge(item.needs_review)}`}>
                  {item.needs_review ? 'Needs Update' : 'Updated'}
                </span>
              </dd>
            </div>
          )}
          <div><dt>Type</dt><dd>{isPendingInternalReview ? <span className="text-muted-foreground">—</span> : item.type}</dd></div>
          <div>
            <dt>Category</dt>
            <dd>
              {isPendingInternalReview ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <span className={`badge ${categoryBadge(item.category)}`}>{item.category}</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              {isPendingInternalReview ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <span className={`badge ${statusBadge(item.status)}`}>{item.status}</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Activity</dt>
            <dd>
              {isPendingInternalReview ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <span className={`badge ${activityBadge(item.activity)}`}>{item.activity}</span>
              )}
            </dd>
          </div>
          <div><dt>Estimated completion</dt><dd>{isPendingInternalReview ? <span className="text-muted-foreground">—</span> : fmtDate(item.estimated_date)}</dd></div>
          <div><dt>Completion date (automatic)</dt><dd>{fmtDate(item.completion_date)}</dd></div>
          {isPendingInternalReview && (
            <div className="full" style={{ padding: '6px 12px', background: 'var(--secondary)', borderRadius: 6, fontSize: 13, color: 'var(--muted-foreground)' }}>
              ℹ️ <em>Type, Category, Status, and Activity are currently pending review and must be updated by the internal team.</em>
            </div>
          )}
          <div className="full"><dt>Feedback</dt><dd>{item.feedback}</dd></div>
          {item.detail && <div className="full"><dt>Detail information</dt><dd>{item.detail}</dd></div>}
          {item.image && (
            <div className="full">
              <dt>Attached screenshot</dt>
              <dd>
                <div style={{ marginTop: 4, display: 'inline-block' }}>
                  <img
                    src={item.image}
                    alt="Feedback screenshot attachment"
                    style={{
                      maxHeight: 180,
                      maxWidth: '100%',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      display: 'block',
                    }}
                    onClick={() => setZoomImage(true)}
                    title="Click to view full image"
                  />
                  <button
                    type="button"
                    onClick={() => setZoomImage(true)}
                    style={{
                      marginTop: 6,
                      background: 'none',
                      border: 'none',
                      color: '#02a9ea',
                      fontSize: 14,
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline',
                    }}
                  >
                    View full image
                  </button>
                </div>
              </dd>
            </div>
          )}
          {item.notes && <div className="full"><dt>Notes from Ragdalion</dt><dd>{item.notes}</dd></div>}
          <div><dt>Last updated</dt><dd>{fmtDateTime(item.updated_at)}</dd></div>
          <div><dt>Updated by</dt><dd>{item.actor || '—'}</dd></div>
        </dl>
        <div className="form-actions" style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          {onDelete && (
            <Button
              type="button"
              variant="outline"
              disabled={item.activity === 'Done'}
              title={item.activity === 'Done' ? "Feedback with activity status 'Done' cannot be deleted" : `Delete feedback #${item.number}`}
              onClick={() => onDelete(item)}
              style={{
                color: item.activity === 'Done' ? 'var(--muted-foreground)' : '#ef4444',
                opacity: item.activity === 'Done' ? 0.45 : 1,
                cursor: item.activity === 'Done' ? 'not-allowed' : 'pointer',
              }}
            >
              <Trash2 size={14} className="mr-1.5" />Delete
            </Button>
          )}
          {onEdit && (
            <Button variant="default" onClick={() => onEdit(item)}>
              <Pencil size={14} className="mr-1.5" />Edit feedback
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
      {zoomImage && item.image && (
        <div className="image-lightbox-overlay" onClick={() => setZoomImage(false)}>
          <div className="image-lightbox-content" onClick={e => e.stopPropagation()}>
            <img src={item.image} alt="Attachment full preview" className="image-lightbox-img" />
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="image-lightbox-close"
              onClick={() => setZoomImage(false)}
              aria-label="Close zoom"
            >
              <X size={16} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function FormModal({
  item,
  customers,
  onClose,
  drawer = false,
}: {
  item?: FeedbackItem;
  customers: Customer[];
  onClose: () => void;
  drawer?: boolean;
}) {
  const { items, save, remove, customerAction, access } = useWorkspace();
  const isCustomer = access?.role === 'customer';
  const defaultCustId = isCustomer ? (access?.customer_id ?? customers[0]?.id ?? '') : (customers[0]?.id ?? '');
  const [newCustName, setNewCustName] = useState('');

  // Target customer ID for determining the next number
  const initialCustId = isCustomer ? defaultCustId : (item ? item.customer_id : defaultCustId);
  const [selectedCustId, setSelectedCustId] = useState(initialCustId);

  // Auto next number calculated from the last feedback number for that customer
  const autoNextNumber = useMemo(() => {
    const activeId = isCustomer ? defaultCustId : (selectedCustId || defaultCustId);
    const custItems = items.filter(i => i.customer_id === activeId);
    const nums = custItems.map(i => i.number).filter(n => typeof n === 'number' && !isNaN(n));
    return nums.length > 0 ? Math.max(...nums) + 1 : 1;
  }, [items, isCustomer, defaultCustId, selectedCustId]);

  const [form, setForm] = useState<ItemInput>(() => item
    ? {
        customer_id: item.customer_id,
        number: item.number,
        feature: item.feature,
        feedback: item.feedback,
        detail: item.detail,
        type: !isCustomer && item.needs_review ? ('' as any) : item.type,
        category: !isCustomer && item.needs_review ? ('' as any) : item.category,
        status: !isCustomer && item.needs_review ? ('' as any) : item.status,
        activity: !isCustomer && item.needs_review ? ('' as any) : item.activity,
        notes: item.notes,
        report_date: item.report_date ?? item.updated_at.slice(0, 10),
        estimated_date: item.estimated_date,
        needs_review: !isCustomer && item.needs_review ? false : (item.needs_review ?? false),
        image: item.image ?? null,
      }
    : {
        customer_id: defaultCustId,
        number: autoNextNumber,
        feature: '',
        feedback: '',
        detail: '',
        type: isCustomer ? 'Bug Report' : ('' as any),
        category: isCustomer ? 'Minor' : ('' as any),
        status: isCustomer ? 'Waiting' : ('' as any),
        activity: isCustomer ? 'Not started' : ('' as any),
        notes: '',
        report_date: todayWIB(),
        estimated_date: null,
        needs_review: isCustomer,
        image: null,
      });

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof ItemInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value as never }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!isCustomer) {
        if (!form.type || !form.category || !form.status || !form.activity) {
          throw new Error('Please select all 4 required fields: Type, Category, Status, and Activity status.');
        }
      }

      let finalCustId = isCustomer ? (access?.customer_id || defaultCustId) : (form.customer_id || defaultCustId);
      if (!finalCustId && customers.length === 0) {
        if (!newCustName.trim()) throw new Error('Please enter a customer name first.');
        await customerAction('create', newCustName.trim());
        const raw = typeof window !== 'undefined' ? localStorage.getItem('loop_feedback_customers') : null;
        const list: Customer[] = raw ? JSON.parse(raw) : [];
        const created = list.find(c => c.name.toLowerCase() === newCustName.trim().toLowerCase()) ?? list[list.length - 1];
        if (!created) throw new Error('Failed to create customer.');
        finalCustId = created.id;
      }
      if (!finalCustId) throw new Error('Please select or create a customer first.');

      // For customer, number is preserved if editing or auto-generated if creating
      const assignedNumber = item ? item.number : isCustomer ? autoNextNumber : Number(form.number);

      await save({
        ...form,
        customer_id: finalCustId,
        number: assignedNumber,
        report_date: isCustomer ? (item ? (item.report_date ?? item.updated_at.slice(0, 10)) : todayWIB()) : (form.report_date || todayWIB()),
        feature: form.feature.trim(),
        feedback: form.feedback.trim(),
        detail: form.detail.trim(),
        image: form.image || null,
        type: isCustomer ? (item ? form.type : 'Bug Report') : form.type,
        category: isCustomer ? (item ? form.category : 'Minor') : form.category,
        status: isCustomer ? (item ? form.status : 'Waiting') : form.status,
        activity: isCustomer ? (item ? form.activity : 'Not started') : form.activity,
        estimated_date: isCustomer ? (item ? item.estimated_date : null) : (form.estimated_date || null),
        needs_review: isCustomer ? true : (form.needs_review ?? false),
      }, item);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const customerItemNumber = item ? item.number : autoNextNumber;

  return (
    <div
      className={drawer ? 'modal-overlay-drawer' : 'modal-overlay'}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={drawer ? 'modal modal-drawer-right' : 'modal'}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <h2>{isCustomer ? (item ? 'Edit feedback' : 'Submit feedback') : item ? 'Edit feedback' : 'New feedback'}</h2>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}><X /></Button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            {item?.needs_review && !isCustomer && (
              <div
                style={{
                  gridColumn: '1 / -1',
                  padding: '10px 14px',
                  borderRadius: 6,
                  background: 'rgba(234, 88, 12, 0.12)',
                  border: '1px solid rgba(234, 88, 12, 0.3)',
                  color: '#ea580c',
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span><strong>Action required (Needs Update):</strong> Please select all 4 required fields: <strong>Type</strong>, <strong>Category</strong>, <strong>Status</strong>, and <strong>Activity</strong>. Once selected and saved, review status will automatically change to <strong>Updated</strong>.</span>
              </div>
            )}

            {isCustomer ? (
              <>
                <label className="form-field">
                  No. (Auto-generated)
                  <input
                    type="number"
                    value={customerItemNumber}
                    readOnly
                    disabled
                    style={{ opacity: 0.85, cursor: 'not-allowed', backgroundColor: 'var(--secondary)' }}
                    title="Automatically generated based on the latest feedback number"
                  />
                  <span className="text-[13px] text-muted-foreground mt-0.5">
                    {item ? `Feedback #${item.number}` : `Auto-generated from last feedback (#${customerItemNumber})`}
                  </span>
                </label>
                <label className="form-field">
                  Report Date
                  <input
                    type="date"
                    value={item ? (item.report_date ?? item.updated_at.slice(0, 10)) : todayWIB()}
                    readOnly
                    disabled
                    style={{ opacity: 0.85, cursor: 'not-allowed', backgroundColor: 'var(--secondary)' }}
                    title="Report date automatically recorded on submission"
                  />
                  <span className="text-[13px] text-muted-foreground mt-0.5">
                    {item ? 'Recorded on submission' : 'Set to today upon submission'}
                  </span>
                </label>
                <label className="form-field full">
                  Feature
                  <input
                    maxLength={200}
                    value={form.feature}
                    onChange={set('feature')}
                    placeholder="e.g. Dashboard navigation, Export to PDF"
                  />
                </label>
                <label className="form-field full">
                  Feedback
                  <textarea
                    required
                    maxLength={1000}
                    value={form.feedback}
                    onChange={set('feedback')}
                    placeholder="Describe your feedback, request, or issue"
                  />
                </label>
                <label className="form-field full">
                  Detail information
                  <textarea
                    maxLength={5000}
                    value={form.detail}
                    onChange={set('detail')}
                    placeholder="Optional background details, reproduction steps, or context"
                  />
                </label>
                <div className="form-field full">
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
                    Upload image (PNG or JPG)
                  </label>
                  <ImageUploader
                    value={form.image}
                    onChange={img => setForm(f => ({ ...f, image: img }))}
                    disabled={busy}
                  />
                </div>
              </>
            ) : (
              <>
                {customers.length === 0 && !item ? (
                  <label className="form-field full">Customer Name (New)
                    <input required maxLength={150} value={newCustName} onChange={e => setNewCustName(e.target.value)} placeholder="e.g. Acme Corporation" autoFocus />
                    <span className="text-[13px] text-muted-foreground mt-1">No customers registered yet. A new customer account and 6-digit PIN will be generated automatically.</span>
                  </label>
                ) : (
                  <label className="form-field">Customer
                    <select
                      value={form.customer_id}
                      onChange={e => {
                        const id = e.target.value;
                        setSelectedCustId(id);
                        const nums = items.filter(i => i.customer_id === id && !i.deleted_at).map(i => i.number);
                        setForm(f => ({ ...f, customer_id: id, number: item ? item.number : (nums.length ? Math.max(...nums) + 1 : 1) }));
                      }}
                      disabled={customers.length < 2 && !!item}
                    >
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                )}
                <label className="form-field">No.<input type="number" min={1} required value={form.number} onChange={e => setForm(f => ({ ...f, number: Number(e.target.value) }))} /></label>
                <label className="form-field">Report date
                  <input
                    type="date"
                    value={form.report_date ?? (item ? (item.report_date ?? item.updated_at.slice(0, 10)) : todayWIB())}
                    onChange={e => setForm(f => ({ ...f, report_date: e.target.value || null }))}
                    title="Date feedback was submitted"
                  />
                </label>
                <label className="form-field full">Feature<input maxLength={200} value={form.feature} onChange={set('feature')} placeholder="e.g. Reporting" /></label>
                <label className="form-field full">Feedback<textarea required maxLength={1000} value={form.feedback} onChange={set('feedback')} placeholder="Describe the feedback" /></label>
                <label className="form-field full">Detail information<textarea maxLength={5000} value={form.detail} onChange={set('detail')} placeholder="Optional background or steps" /></label>
                <div className="form-field full">
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
                    Upload image (PNG or JPG)
                  </label>
                  <ImageUploader
                    value={form.image}
                    onChange={img => setForm(f => ({ ...f, image: img }))}
                    disabled={busy}
                  />
                </div>
                <label className="form-field">
                  Type *
                  <select required value={form.type} onChange={set('type')}>
                    <option value="" disabled>-- Select Type --</option>
                    {types.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="form-field">
                  Category *
                  <select required value={form.category} onChange={set('category')}>
                    <option value="" disabled>-- Select Category --</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="form-field">
                  Status *
                  <select required value={form.status} onChange={set('status')}>
                    <option value="" disabled>-- Select Status --</option>
                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="form-field">
                  Activity status *
                  <select required value={form.activity} onChange={set('activity')}>
                    <option value="" disabled>-- Select Activity --</option>
                    {activities.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
                <label className="form-field">Estimated completion date<input type="date" value={form.estimated_date ?? ''} onChange={e => setForm(f => ({ ...f, estimated_date: e.target.value || null }))} /></label>
                <label className="form-field">Completion date<input value={form.activity === 'Done' ? (item?.completion_date ?? todayWIB()) : '—'} readOnly title="Set automatically when activity becomes Done" /></label>
                <label className="form-field full">Notes from Ragdalion<textarea maxLength={5000} value={form.notes} onChange={set('notes')} placeholder="Notes from Ragdalion" /></label>
                <label className="form-field full" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <input
                    type="checkbox"
                    checked={form.needs_review ?? false}
                    onChange={e => setForm(f => ({ ...f, needs_review: e.target.checked }))}
                    style={{ width: 'auto', margin: 0 }}
                  />
                  <span style={{ fontSize: 14 }}>
                    <strong>Keep as "Needs Update"</strong> (Check only if this item still requires further triage; leave unchecked so status changes to Updated)
                  </span>
                </label>
              </>
            )}
          </div>
          {error && <p className="error-text" role="alert">{error}</p>}
          <div className="form-actions">
            {item && (
              <Button
                type="button"
                variant="outline"
                disabled={busy || ((item.activity === 'Done' || form.activity === 'Done') && !item.deleted_at)}
                title={(item.activity === 'Done' || form.activity === 'Done') && !item.deleted_at ? "Feedback with activity status 'Done' cannot be deleted" : undefined}
                style={(item.activity === 'Done' || form.activity === 'Done') && !item.deleted_at ? { opacity: 0.4, cursor: 'not-allowed', color: 'var(--muted-foreground)' } : { color: '#ef4444' }}
                onClick={async () => {
                  if ((item.activity === 'Done' || form.activity === 'Done') && !item.deleted_at) return;
                  if (!item.deleted_at && !window.confirm(`Are you sure you want to delete feedback #${item.number}?`)) {
                    return;
                  }
                  setBusy(true);
                  try {
                    await remove(item, !!item.deleted_at);
                    onClose();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {item.deleted_at ? <><RotateCcw />Restore</> : <><Trash2 />Delete</>}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : isCustomer ? (item ? 'Save feedback' : 'Submit feedback') : item?.needs_review ? 'Update feedback (Mark as Updated)' : 'Save feedback'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
