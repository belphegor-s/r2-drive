'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Pencil, Star, Link as LinkIcon, Eye, Info } from 'lucide-react';
import { driveApi } from '@/app/lib/driveClient';
import { categoryOf } from '@/app/lib/fileTypes';
import { formatFileSize } from '@/utils/formatFileSize';
import { FolderIcon, FileTypeIcon } from './fileIcons';

function Field({ label, value, mono = false }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex gap-3 py-1.5 text-[12px]">
      <span className="w-24 shrink-0 text-ink-faint">{label}</span>
      <span className={`min-w-0 flex-1 break-words text-ink-muted ${mono ? 'font-mono text-[11px]' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function Header({ onClose }) {
  return (
    <div className="flex items-center gap-2 border-b border-line px-4 py-3">
      <Info size={14} className="text-accent" />
      <h2 className="flex-1 text-sm font-semibold">Details</h2>
      <button
        onClick={onClose}
        className="rounded-md p-1 text-ink-faint transition-colors hover:bg-hover hover:text-ink"
        aria-label="Close details"
      >
        <X size={15} />
      </button>
    </div>
  );
}

function Body({
  target, isFile, file, category, thumb, meta, selectionCount, selectionBytes,
  onPreview, onDownload, onRename, onCopyLink, onToggleStar, isStarred,
}) {
  if (!target) {
    return selectionCount > 1 ? (
      <div className="space-y-1 text-sm">
        <p className="font-medium text-ink">{selectionCount} items selected</p>
        <p className="text-[12px] text-ink-faint">{formatFileSize(selectionBytes)} total</p>
      </div>
    ) : (
      <p className="pt-8 text-center text-[12px] text-ink-faint">Select an item to see its details.</p>
    );
  }

  return (
    <>
      <div className="mb-4 flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-line bg-sunken">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={target.item.name} className="h-full w-full object-contain" />
        ) : target.kind === 'folder' ? (
          <FolderIcon size={44} />
        ) : (
          <FileTypeIcon name={target.item.name} mime={target.item.mime} size={40} />
        )}
      </div>

      <h3 className="break-words text-sm font-semibold text-ink">{target.item.name}</h3>
      <p className="mt-0.5 text-[11px] capitalize text-ink-faint">
        {target.kind === 'folder' ? 'Folder' : category}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {isFile && (
          <>
            <button onClick={() => onPreview?.(target.item)} className="btn-neutral-small flex items-center gap-1.5">
              <Eye size={12} /> Preview
            </button>
            <button onClick={() => onDownload?.(target.item)} className="btn-neutral-small flex items-center gap-1.5">
              <Download size={12} /> Download
            </button>
          </>
        )}
        <button onClick={() => onRename?.(target)} className="btn-neutral-small flex items-center gap-1.5">
          <Pencil size={12} /> Rename
        </button>
        <button onClick={() => onToggleStar?.(target)} className="btn-neutral-small flex items-center gap-1.5">
          <Star size={12} className={isStarred ? 'fill-amber-300 text-amber-300' : ''} />
          {isStarred ? 'Starred' : 'Star'}
        </button>
        {isFile && (meta?.url || target.item.url) && (
          <button onClick={() => onCopyLink?.(meta?.url || target.item.url)} className="btn-neutral-small flex items-center gap-1.5">
            <LinkIcon size={12} /> Copy link
          </button>
        )}
      </div>

      <div className="mt-4 divide-y divide-line border-t border-line pt-1">
        <Field
          label="Location"
          value={
            target.kind === 'folder'
              // A folder's own prefix includes its name — show where it sits.
              ? target.item.prefix.split('/').slice(0, -1).join('/') || 'Drive root'
              : meta?.folder || file?.folder || 'Drive root'
          }
        />
        {isFile && <Field label="Size" value={formatFileSize(meta?.size ?? file.size)} />}
        {isFile && (
          <Field
            label="Modified"
            value={
              (meta?.lastModified || file.lastModified)
                ? format(new Date(meta?.lastModified || file.lastModified), 'PPpp')
                : null
            }
          />
        )}
        {isFile && <Field label="Type" value={meta?.mime || file.mime} mono />}
        {isFile && <Field label="ETag" value={meta?.etag} mono />}
        {isFile && <Field label="Storage" value={meta?.storageClass} />}
        {isFile && <Field label="Key" value={meta?.key || file.key} mono />}
      </div>
    </>
  );
}

export default function DetailsPanel({
  open,
  scope,
  target,          // { kind, item, id } | null
  selectionCount,
  selectionBytes,
  onClose,
  onPreview,
  onDownload,
  onRename,
  onCopyLink,
  onToggleStar,
  isStarred,
}) {
  const [meta, setMeta] = useState(null);
  const [thumb, setThumb] = useState(null);

  const isFile = target?.kind === 'file';
  const file = isFile ? target.item : null;
  const category = file ? categoryOf(file.mime || '', file.name) : null;

  // Object metadata is one HEAD request, so only fetch it for a single file.
  useEffect(() => {
    setMeta(null);
    if (!open || !isFile || !file?.key) return undefined;

    let cancelled = false;
    driveApi
      .meta(scope, file.key)
      .then((res) => !cancelled && setMeta(res))
      .catch(() => !cancelled && setMeta(null));
    return () => {
      cancelled = true;
    };
  }, [open, isFile, file?.key, scope]);

  // Private buckets have no public URL, so an image thumbnail needs a signed one.
  useEffect(() => {
    setThumb(null);
    if (!open || category !== 'image' || !file?.key) return undefined;
    if (file.url) {
      setThumb(file.url);
      return undefined;
    }

    let cancelled = false;
    driveApi
      .previewUrl(scope, file.key)
      .then((res) => !cancelled && setThumb(res.url))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, category, file?.key, file?.url, scope]);

  // Escape closes the sheet on touch devices, where there is no toolbar toggle.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const body = (
    <Body
      target={target}
      isFile={isFile}
      file={file}
      category={category}
      thumb={thumb}
      meta={meta}
      selectionCount={selectionCount}
      selectionBytes={selectionBytes}
      onPreview={onPreview}
      onDownload={onDownload}
      onRename={onRename}
      onCopyLink={onCopyLink}
      onToggleStar={onToggleStar}
      isStarred={isStarred}
    />
  );

  return (
    <>
      {/* Desktop: a column beside the grid. */}
      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="hidden shrink-0 overflow-hidden border-l border-line bg-surface lg:block"
          >
            <div className="flex h-full w-[300px] flex-col">
              <Header onClose={onClose} />
              <div className="custom-scrollbar flex-1 overflow-y-auto p-4">{body}</div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Touch / narrow: a bottom sheet. There is no room for a side column, and
          the toolbar toggle is desktop-only — this is opened from the context menu. */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] flex items-end bg-black/60 lg:hidden"
            onMouseDown={onClose}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              className="glass flex max-h-[82vh] w-full flex-col rounded-t-2xl"
              onMouseDown={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Details"
            >
              <div className="flex justify-center pt-2">
                <span className="h-1 w-10 rounded-full bg-line-strong" aria-hidden />
              </div>
              <Header onClose={onClose} />
              <div
                className="custom-scrollbar flex-1 overflow-y-auto p-4"
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
              >
                {body}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
