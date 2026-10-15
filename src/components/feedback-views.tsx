import { useMemo, useState, useEffect, useRef, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useWorkspace } from './feedback-provider';
import { Button } from '@/components/ui/button';
import { X, Trash2, RotateCcw, ShieldCheck, Image as ImageIcon, Pencil, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { types, categories, statuses, activities, todayWIB, createActionReportDate, parseImages, serializeImages, type Customer, type FeedbackItem, type ItemInput } from '@/lib/feedback-model';

export const activityBadge = (a: string) => (a === 'Done' ? 'done' : a === 'In progress' ? 'progress' : 'pending');
export const categoryBadge = (c: string) => (c === 'Major' ? 'major' : c === 'Medium' ? 'medium' : '');
export const statusBadge = (s: string) => (s === 'Waiting' ? 'status-waiting' : s === 'Execution' ? 'status-execution' : s === 'Execution by notes' ? 'status-execution-notes' : '');
export const reviewBadge = (needsReview?: boolean) => (needsReview ? 'needs-update' : 'updated');
export function fmtDate(d?: string | null) { if (!d) return '—'; return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d)); }
export function fmtDateTime(iso?: string | null) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    return iso;
  }
}
export function fmtReportDate(reportDate?: string | null, fallbackTimestamp?: string | null) {
  if (!reportDate && !fallbackTimestamp) return '—';
  if (reportDate && (reportDate.includes('T') || reportDate.includes(':'))) {
    return fmtDateTime(reportDate);
  }
  if (fallbackTimestamp && (fallbackTimestamp.includes('T') || fallbackTimestamp.includes(':'))) {
    return fmtDateTime(fallbackTimestamp);
  }
  return reportDate ? fmtDate(reportDate) : '—';
}

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
        <p className="font-medium text-base mb-1">Restricted Access for {access.pic_name || 'Customer Portal'}</p>
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

export function ImageLightboxModal({
  images,
  initialIndex = 0,
  onClose,
}: {
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && images.length > 1) {
        setCurrentIndex(prev => (prev > 0 ? prev - 1 : images.length - 1));
      }
      if (e.key === 'ArrowRight' && images.length > 1) {
        setCurrentIndex(prev => (prev < images.length - 1 ? prev + 1 : 0));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images.length, onClose]);

  if (!images || images.length === 0) return null;
  const currentImg = images[currentIndex] || images[0];

  return (
    <div className="image-lightbox-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="image-lightbox-content"
        onClick={e => e.stopPropagation()}
        style={{
          width: 600,
          height: 600,
          maxWidth: 'min(600px, 94vw)',
          maxHeight: 'min(600px, 92vh)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          background: '#090d16',
          borderRadius: 12,
          padding: 12,
          boxShadow: '0 25px 60px rgba(0,0,0,0.85)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          overflow: 'hidden',
        }}
      >
        {/* Top Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
            color: '#fff',
            zIndex: 10,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
              Image preview (600 × 600)
            </span>
            {images.length > 1 && (
              <span
                style={{
                  fontSize: 12,
                  padding: '2px 8px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.15)',
                  color: '#93c5fd',
                }}
              >
                {currentIndex + 1} / {images.length}
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close image preview"
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
            }}
          >
            <X size={16} />
          </Button>
        </div>

        {/* Image viewport with 600x600 container proportions */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)',
            borderRadius: 8,
            overflow: 'hidden',
            minHeight: 0,
          }}
        >
          <img
            src={currentImg}
            alt={`Image ${currentIndex + 1}`}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
              display: 'block',
              borderRadius: 4,
            }}
          />

          {/* Left Arrow Button */}
          {images.length > 1 && (
            <button
              type="button"
              onClick={() => setCurrentIndex(prev => (prev > 0 ? prev - 1 : images.length - 1))}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.65)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.15s ease',
                zIndex: 10,
              }}
              title="Previous image (Left arrow)"
              aria-label="Previous image"
            >
              <ChevronLeft size={20} />
            </button>
          )}

          {/* Right Arrow Button */}
          {images.length > 1 && (
            <button
              type="button"
              onClick={() => setCurrentIndex(prev => (prev < images.length - 1 ? prev + 1 : 0))}
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.65)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.15s ease',
                zIndex: 10,
              }}
              title="Next image (Right arrow)"
              aria-label="Next image"
            >
              <ChevronRight size={20} />
            </button>
          )}
        </div>

        {/* Bottom thumbnail strip if multiple images */}
        {images.length > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginTop: 10,
              paddingTop: 2,
              overflowX: 'auto',
              flexShrink: 0,
            }}
          >
            {images.map((img, idx) => (
              <button
                type="button"
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 6,
                  padding: 2,
                  border: idx === currentIndex ? '2px solid #02a9ea' : '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(0,0,0,0.5)',
                  cursor: 'pointer',
                  opacity: idx === currentIndex ? 1 : 0.6,
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                  overflow: 'hidden',
                }}
                title={`Switch to image #${idx + 1}`}
              >
                <img
                  src={img}
                  alt={`Thumb ${idx + 1}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
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
  const images = useMemo(() => parseImages(value), [value]);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | File[]) => {
    setError(null);
    const fileArr = Array.from(files);
    const validFiles = fileArr.filter(
      f => f.type.startsWith('image/') || /\.(png|jpe?g)$/i.test(f.name)
    );
    if (validFiles.length === 0) {
      setError('Only PNG and JPG/JPEG images are supported.');
      return;
    }
    if (images.length + validFiles.length > 10) {
      setError('You can upload a maximum of 10 images per feedback item.');
      return;
    }
    try {
      const processed = await Promise.all(validFiles.map(processImageFile));
      const nextImages = [...images, ...processed];
      onChange(serializeImages(nextImages));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process images.');
    }
  };

  const removeImage = (idxToRemove: number) => {
    const nextImages = images.filter((_, idx) => idx !== idxToRemove);
    onChange(serializeImages(nextImages));
  };

  const clearAll = () => {
    onChange(null);
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (disabled) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const pastedFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) pastedFiles.push(file);
        }
      }
      if (pastedFiles.length > 0) {
        e.preventDefault();
        addFiles(pastedFiles);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [disabled, images]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      addFiles(files);
    }
  };

  return (
    <div className="image-uploader-wrap">
      <input
        type="file"
        ref={fileInputRef}
        accept="image/png,image/jpeg,image/jpg"
        multiple
        style={{ display: 'none' }}
        onChange={e => {
          if (e.target.files && e.target.files.length > 0) {
            addFiles(e.target.files);
          }
          e.target.value = '';
        }}
      />

      {images.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Grid of uploaded images */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
            {images.map((imgUrl, idx) => (
              <div
                key={idx}
                className="image-card-item"
                style={{
                  position: 'relative',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 6,
                  background: 'var(--surface-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: 84,
                    borderRadius: 6,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    background: '#090d16',
                  }}
                  onClick={() => setZoomIndex(idx)}
                  title="Click to view in 600×600 popup"
                >
                  <img
                    src={imgUrl}
                    alt={`Preview #${idx + 1}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                      transition: 'opacity 0.15s ease',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(0,0,0,0.4)',
                      opacity: 0,
                      transition: 'opacity 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                    className="thumb-hover-overlay"
                  >
                    🔍 600×600
                  </div>
                  <span
                    style={{
                      position: 'absolute',
                      top: 4,
                      left: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: 'rgba(0,0,0,0.7)',
                      color: '#fff',
                    }}
                  >
                    #{idx + 1}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <button
                    type="button"
                    onClick={() => setZoomIndex(idx)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#02a9ea',
                      fontSize: 12,
                      padding: 0,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    Zoom 600px
                  </button>
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    disabled={disabled}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--danger)',
                      padding: 2,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title={`Delete image #${idx + 1}`}
                    aria-label={`Delete image #${idx + 1}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}

            {/* + Add more image button card if < 10 images */}
            {images.length < 10 && (
              <div
                onClick={() => !disabled && fileInputRef.current?.click()}
                style={{
                  border: '1.5px dashed var(--border)',
                  borderRadius: 8,
                  padding: 10,
                  minHeight: 114,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  background: 'var(--secondary)',
                  gap: 4,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#02a9ea'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                title="Add more images"
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'rgba(2, 169, 234, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#02a9ea',
                  }}
                >
                  <Plus size={18} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Add image</span>
                <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>PNG, JPG</span>
              </div>
            )}
          </div>

          {/* Action bar below thumbnails */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted-foreground)' }}>
            <span>{images.length} image{images.length > 1 ? 's' : ''} attached • Click thumbnail to view in 600×600 popup</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || images.length >= 10}
                style={{ height: 26, fontSize: 12, padding: '0 8px' }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus size={12} className="mr-1" /> Add more
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                style={{ height: 26, fontSize: 12, padding: '0 8px', color: 'var(--danger)' }}
                onClick={clearAll}
              >
                Clear all
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`image-dropzone ${isDragging ? 'dragging' : ''}`}
          onClick={() => !disabled && fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
          onDragEnter={e => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
          onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          aria-label="Upload screenshots or images"
        >
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
              Upload multiple PNG or JPG • Paste anytime with <kbd style={{ padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 12 }}>Ctrl+V</kbd>
            </p>
          </div>
        </div>
      )}

      {error && <p className="error-text" style={{ margin: '6px 0 0', fontSize: 13 }}>{error}</p>}

      {zoomIndex !== null && images.length > 0 && (
        <ImageLightboxModal
          images={images}
          initialIndex={zoomIndex}
          onClose={() => setZoomIndex(null)}
        />
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
  const [detailZoomIndex, setDetailZoomIndex] = useState(0);
  const detailImages = useMemo(() => parseImages(item.image), [item.image]);
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
          <div><dt>PIC Name</dt><dd>{item.pic_name || (item.actor && item.actor !== customer?.name && item.actor !== 'Internal team' && item.actor !== 'Loop Team' && item.actor !== 'Admin' ? item.actor : '—')}</dd></div>
          <div><dt>Feature</dt><dd>{item.feature || '—'}</dd></div>
          <div><dt>Report date</dt><dd>{fmtReportDate(item.report_date, item.updated_at)}</dd></div>
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
          {detailImages.length > 0 && (
            <div className="full">
              <dt>Attached screenshot{detailImages.length > 1 ? `s (${detailImages.length})` : ''}</dt>
              <dd>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
                  {detailImages.map((img, idx) => (
                    <div
                      key={idx}
                      style={{
                        position: 'relative',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        padding: 4,
                        background: 'var(--surface-subtle)',
                        cursor: 'pointer',
                        transition: 'transform 0.15s ease',
                      }}
                      onClick={() => {
                        setDetailZoomIndex(idx);
                        setZoomImage(true);
                      }}
                      title={`Click to view image #${idx + 1} in 600×600 popup`}
                    >
                      <img
                        src={img}
                        alt={`Attachment ${idx + 1}`}
                        style={{
                          width: 110,
                          height: 85,
                          objectFit: 'cover',
                          borderRadius: 6,
                          display: 'block',
                        }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          bottom: 6,
                          right: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '1px 5px',
                          borderRadius: 4,
                          background: 'rgba(0,0,0,0.7)',
                          color: '#fff',
                        }}
                      >
                        #{idx + 1}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDetailZoomIndex(0);
                    setZoomImage(true);
                  }}
                  style={{
                    marginTop: 8,
                    background: 'none',
                    border: 'none',
                    color: '#02a9ea',
                    fontSize: 13,
                    cursor: 'pointer',
                    padding: 0,
                    textDecoration: 'underline',
                  }}
                >
                  View full image (600×600 pop-up)
                </button>
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
      {zoomImage && detailImages.length > 0 && (
        <ImageLightboxModal
          images={detailImages}
          initialIndex={detailZoomIndex}
          onClose={() => setZoomImage(false)}
        />
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
  // Target customer ID for determining the next number
  const initialCustId = isCustomer ? defaultCustId : (item ? item.customer_id : defaultCustId);
  const [selectedCustId, setSelectedCustId] = useState(initialCustId);

  // Auto next number calculated from the last feedback number for that customer
  const autoNextNumber = useMemo(() => {
    const activeId = isCustomer ? defaultCustId : (selectedCustId || defaultCustId);
    const custItems = items.filter(i => i.customer_id === activeId && !i.deleted_at);
    const nums = custItems.map(i => i.number).filter(n => typeof n === 'number' && !isNaN(n));
    return nums.length > 0 ? Math.max(...nums) + 1 : 1;
  }, [items, isCustomer, defaultCustId, selectedCustId]);

  // Collect all unique feature titles from workspace items and localStorage
  const savedFeatures = useMemo(() => {
    const featureCount = new Map<string, number>();
    const featureLastSeen = new Map<string, number>();
    const activeCustId = isCustomer ? defaultCustId : (selectedCustId || defaultCustId);

    // 1. Gather all feature titles from existing workspace items
    items.forEach((i, idx) => {
      const f = (i.feature || '').trim();
      if (f) {
        const isMatchCustomer = i.customer_id === activeCustId;
        const weight = isMatchCustomer ? 0 : 500;
        featureCount.set(f, (featureCount.get(f) ?? 0) + 1);
        if (!featureLastSeen.has(f) || isMatchCustomer) {
          featureLastSeen.set(f, idx + weight);
        }
      }
    });

    // 2. Also load persistent features from localStorage
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('loop_saved_features');
        if (stored) {
          const list: string[] = JSON.parse(stored);
          if (Array.isArray(list)) {
            list.forEach(f => {
              const trimmed = typeof f === 'string' ? f.trim() : '';
              if (trimmed && !featureCount.has(trimmed)) {
                featureCount.set(trimmed, 1);
                featureLastSeen.set(trimmed, 1000);
              }
            });
          }
        }
      }
    } catch {}

    return Array.from(featureCount.keys()).sort((a, b) => {
      const recA = featureLastSeen.get(a) ?? 9999;
      const recB = featureLastSeen.get(b) ?? 9999;
      if (recA !== recB) return recA - recB;
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
  }, [items, isCustomer, defaultCustId, selectedCustId]);

  const activePic = access?.pic_name || (typeof window !== 'undefined' ? localStorage.getItem('loop_active_pic_name') : null) || (access?.role === 'admin' ? access?.actor : null) || null;

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
        pic_name: item.pic_name ?? activePic,
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
        pic_name: activePic,
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

      const trimmedFeature = form.feature.trim();
      // Persist the feature title to localStorage so it is remembered for future submissions
      if (trimmedFeature) {
        try {
          if (typeof window !== 'undefined') {
            const raw = localStorage.getItem('loop_saved_features');
            const list: string[] = raw ? JSON.parse(raw) : [];
            const filtered = list.filter(f => f.toLowerCase() !== trimmedFeature.toLowerCase());
            filtered.unshift(trimmedFeature);
            localStorage.setItem('loop_saved_features', JSON.stringify(filtered.slice(0, 100)));
          }
        } catch {}
      }

      await save({
        ...form,
        customer_id: finalCustId,
        number: assignedNumber,
        report_date: createActionReportDate(isCustomer ? null : form.report_date),
        feature: trimmedFeature,
        feedback: form.feedback.trim(),
        detail: form.detail.trim(),
        image: form.image || null,
        pic_name: form.pic_name?.trim() || activePic || null,
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

  const renderFeatureField = () => (
    <div className="form-field full">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <label style={{ fontSize: 14, fontWeight: 500 }}>Feature</label>
        {savedFeatures.length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 400 }}>
            {savedFeatures.length} saved feature{savedFeatures.length > 1 ? 's' : ''} available
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <input
          list="feature-suggestions-list"
          maxLength={200}
          value={form.feature}
          onChange={set('feature')}
          placeholder={savedFeatures.length > 0 ? "Select from saved features or type a new one..." : "e.g. Dashboard navigation, Export to PDF"}
          style={{ flex: '1 1 220px', minWidth: 0 }}
          autoComplete="off"
        />
        {savedFeatures.length > 0 && (
          <select
            value=""
            onChange={e => {
              if (e.target.value) {
                setForm(f => ({ ...f, feature: e.target.value }));
              }
            }}
            style={{
              flex: '0 0 auto',
              maxWidth: '100%',
              cursor: 'pointer',
              fontSize: '13px',
              padding: '8px 10px',
              background: 'var(--secondary)',
              borderColor: 'var(--border)',
              color: 'var(--foreground)',
              borderRadius: '5px',
            }}
            title="Pick a previously entered feature"
            aria-label="Pick a previously entered feature"
          >
            <option value="">▼ Saved features ({savedFeatures.length})</option>
            {savedFeatures.map(feat => (
              <option key={feat} value={feat}>{feat}</option>
            ))}
          </select>
        )}
      </div>
      <datalist id="feature-suggestions-list">
        {savedFeatures.map(feat => (
          <option key={feat} value={feat} />
        ))}
      </datalist>
      {savedFeatures.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)', alignSelf: 'center' }}>Recent:</span>
          {savedFeatures.slice(0, 4).map(feat => (
            <button
              type="button"
              key={feat}
              onClick={() => setForm(f => ({ ...f, feature: feat }))}
              style={{
                fontSize: 12,
                padding: '2px 8px',
                borderRadius: 12,
                border: form.feature === feat ? '1px solid var(--primary)' : '1px solid var(--border)',
                background: form.feature === feat ? 'var(--primary)' : 'var(--secondary)',
                color: form.feature === feat ? 'var(--primary-foreground)' : 'var(--foreground)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title={`Click to use "${feat}"`}
            >
              {feat}
            </button>
          ))}
        </div>
      )}
    </div>
  );

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
          <h2>{isCustomer ? (item ? 'Edit Ticket' : 'Submit Ticket') : item ? 'Edit feedback' : 'New Ticket'}</h2>
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
                  PIC Name
                  <input
                    type="text"
                    maxLength={100}
                    value={form.pic_name || activePic || ''}
                    onChange={set('pic_name')}
                    placeholder={activePic || 'PIC name'}
                    title="Person in charge submitting this feedback"
                  />
                  <span className="text-[13px] text-muted-foreground mt-0.5">
                    Person in charge submitting this feedback
                  </span>
                </label>
                <label className="form-field">
                  Report Date
                  <input
                    type="text"
                    value={item ? fmtReportDate(item.report_date, item.updated_at) : 'Automatically recorded on submit'}
                    readOnly
                    disabled
                    style={{ opacity: 0.85, cursor: 'not-allowed', backgroundColor: 'var(--secondary)' }}
                    title="Report date & time automatically recorded on submission"
                  />
                  <span className="text-[13px] text-muted-foreground mt-0.5">
                    {item ? 'Recorded on submission' : 'Tanggal & jam otomatis tersimpan saat submit'}
                  </span>
                </label>
                {renderFeatureField()}
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
                <label className="form-field">PIC Name
                  <input
                    type="text"
                    maxLength={100}
                    value={form.pic_name ?? ''}
                    onChange={set('pic_name')}
                    placeholder="e.g. Budi Santoso"
                    title="Person in charge name"
                  />
                </label>
                <label className="form-field">Report date
                  <input
                    type="date"
                    value={form.report_date ? (form.report_date.includes('T') ? form.report_date.slice(0, 10) : form.report_date) : (item ? (item.report_date?.slice(0, 10) ?? item.updated_at.slice(0, 10)) : todayWIB())}
                    onChange={e => setForm(f => ({ ...f, report_date: e.target.value || null }))}
                    title="Date feedback was submitted"
                  />
                  <span className="text-[13px] text-muted-foreground mt-0.5">
                    Jam menyesuaikan otomatis saat klik save/submit
                  </span>
                </label>
                {renderFeatureField()}
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
              {busy ? 'Saving…' : isCustomer ? (item ? 'Save Ticket' : 'Submit Ticket') : item?.needs_review ? 'Update feedback (Mark as Updated)' : item ? 'Save feedback' : 'Submit Ticket'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
