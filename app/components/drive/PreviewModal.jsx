'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ChevronLeft, ChevronRight, Download, ExternalLink, ZoomIn, ZoomOut,
  RotateCw, Maximize2, Link as LinkIcon, Star, Loader2,
} from 'lucide-react';
import { driveApi } from '@/app/lib/driveClient';
import { categoryOf } from '@/app/lib/fileTypes';
import { formatFileSize } from '@/utils/formatFileSize';
import { FileTypeIcon } from './fileIcons';
import TextPreview from './preview/TextPreview';

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 8;

function IconButton({ title, onClick, disabled, active, children, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`rounded-lg p-2 transition-colors disabled:opacity-30 ${
        active ? 'bg-accent text-white' : 'bg-raised text-ink hover:bg-hover'
      } ${className}`}
    >
      {children}
    </button>
  );
}

export default function PreviewModal({
  scope,
  files,
  startIndex,
  onClose,
  onDownload,
  onCopyLink,
  onToggleStar,
  isStarred,
}) {
  const [index, setIndex] = useState(startIndex);
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Image viewport transform
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragState = useRef(null);

  // Presigned URLs are short-lived but stable within a session; caching avoids
  // re-signing every time the user flips back and forth.
  const urlCache = useRef(new Map());

  useEffect(() => setIndex(startIndex), [startIndex]);

  const file = files[index];
  const cat = file ? categoryOf(file.mime || '', file.name) : null;
  const isImage = cat === 'image';

  const resetView = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    resetView();
  }, [index, resetView]);

  const resolveUrl = useCallback(
    async (target) => {
      if (!target) return null;
      const cached = urlCache.current.get(target.key);
      if (cached) return cached;
      const res = await driveApi.previewUrl(scope, target.key);
      urlCache.current.set(target.key, res.url);
      return res.url;
    },
    [scope],
  );

  useEffect(() => {
    if (!file) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);

    resolveUrl(file)
      .then((resolved) => {
        if (cancelled) return;
        setUrl(resolved);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [file, resolveUrl]);

  // Warm the neighbours so arrow-key browsing feels instant.
  useEffect(() => {
    for (const neighbour of [files[index + 1], files[index - 1]]) {
      if (neighbour) resolveUrl(neighbour).catch(() => {});
    }
  }, [index, files, resolveUrl]);

  const next = useCallback(() => setIndex((i) => Math.min(i + 1, files.length - 1)), [files.length]);
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  const zoomBy = useCallback((factor) => {
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * factor)));
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
      switch (e.key) {
        case 'Escape': onClose(); break;
        case 'ArrowRight': next(); break;
        case 'ArrowLeft': prev(); break;
        case '+': case '=': if (isImage) { e.preventDefault(); zoomBy(1.25); } break;
        case '-': case '_': if (isImage) { e.preventDefault(); zoomBy(0.8); } break;
        case '0': if (isImage) { e.preventDefault(); resetView(); } break;
        case 'r': case 'R': if (isImage) { e.preventDefault(); setRotation((d) => (d + 90) % 360); } break;
        case 'd': case 'D': if (file) { e.preventDefault(); onDownload?.(file); } break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, next, prev, isImage, zoomBy, resetView, file, onDownload]);

  const onWheel = (e) => {
    if (!isImage) return;
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
  };

  const onPointerDown = (e) => {
    if (!isImage || zoom <= 1) return;
    dragState.current = { startX: e.clientX, startY: e.clientY, originX: pan.x, originY: pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const state = dragState.current;
    if (!state) return;
    setPan({ x: state.originX + (e.clientX - state.startX), y: state.originY + (e.clientY - state.startY) });
  };

  const endDrag = (e) => {
    if (!dragState.current) return;
    dragState.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const filmstrip = useMemo(() => (files.length > 1 ? files : []), [files]);

  if (!file) return null;

  const publicUrl = file.url || null;
  // `isStarred` is a predicate, not a boolean, so the icon tracks the file the
  // viewer is currently on rather than the one it opened with.
  const starActive = typeof isStarred === 'function' ? isStarred(file) : Boolean(isStarred);

  return (
    <AnimatePresence>
      <motion.div
        key="preview"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
        className="fixed inset-0 z-[60] flex flex-col bg-black/90 backdrop-blur-sm"
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5 sm:gap-3 sm:px-5">
          <FileTypeIcon name={file.name} mime={file.mime} size={18} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{file.name}</div>
            <div className="truncate text-[11px] text-ink-faint">
              {formatFileSize(file.size)} · {cat}
              {files.length > 1 && ` · ${index + 1} of ${files.length}`}
            </div>
          </div>

          {isImage && (
            <div className="hidden items-center gap-1 sm:flex">
              <IconButton title="Zoom out (−)" onClick={() => zoomBy(0.8)} disabled={zoom <= ZOOM_MIN}>
                <ZoomOut size={15} />
              </IconButton>
              <span className="w-12 text-center text-[11px] tabular-nums text-ink-faint">
                {Math.round(zoom * 100)}%
              </span>
              <IconButton title="Zoom in (+)" onClick={() => zoomBy(1.25)} disabled={zoom >= ZOOM_MAX}>
                <ZoomIn size={15} />
              </IconButton>
              <IconButton title="Rotate (R)" onClick={() => setRotation((d) => (d + 90) % 360)}>
                <RotateCw size={15} />
              </IconButton>
              <IconButton title="Reset view (0)" onClick={resetView}>
                <Maximize2 size={15} />
              </IconButton>
            </div>
          )}

          <div className="flex items-center gap-1">
            <IconButton title="Previous (←)" onClick={prev} disabled={index === 0}>
              <ChevronLeft size={16} />
            </IconButton>
            <IconButton title="Next (→)" onClick={next} disabled={index === files.length - 1}>
              <ChevronRight size={16} />
            </IconButton>

            {onToggleStar && (
              <IconButton title={starActive ? 'Remove star' : 'Star'} onClick={() => onToggleStar(file)}>
                <Star size={15} className={starActive ? 'fill-amber-300 text-amber-300' : ''} />
              </IconButton>
            )}
            {publicUrl && onCopyLink && (
              <IconButton title="Copy public link" onClick={() => onCopyLink(publicUrl)}>
                <LinkIcon size={15} />
              </IconButton>
            )}
            <IconButton title="Download (D)" onClick={() => onDownload?.(file)}>
              <Download size={15} />
            </IconButton>
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title="Open in new tab"
                aria-label="Open in new tab"
                className="hidden rounded-lg bg-raised p-2 text-ink transition-colors hover:bg-hover sm:inline-flex"
              >
                <ExternalLink size={15} />
              </a>
            )}
            <IconButton title="Close (Esc)" onClick={onClose}>
              <X size={16} />
            </IconButton>
          </div>
        </div>

        {/* Stage */}
        <div
          className="relative flex-1 overflow-hidden"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{ cursor: isImage && zoom > 1 ? (dragState.current ? 'grabbing' : 'grab') : 'default' }}
        >
          {loading && (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-ink-faint">
              <Loader2 size={16} className="animate-spin" /> Loading preview…
            </div>
          )}
          {error && (
            <div className="flex h-full items-center justify-center text-sm text-red-400">
              Failed to load preview.
            </div>
          )}
          {!loading && !error && url && (
            <PreviewContent
              cat={cat}
              file={file}
              url={url}
              zoom={zoom}
              rotation={rotation}
              pan={pan}
              onResetView={resetView}
              onZoomToggle={() => (zoom === 1 ? setZoom(2) : resetView())}
              onDownload={onDownload}
            />
          )}
        </div>

        {/* Filmstrip */}
        {filmstrip.length > 1 && (
          <div className="custom-scrollbar flex shrink-0 gap-2 overflow-x-auto border-t border-line px-3 py-2">
            {filmstrip.map((f, i) => (
              <button
                key={f.key}
                onClick={() => setIndex(i)}
                title={f.name}
                className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border transition-all ${
                  i === index ? 'border-accent ring-2 ring-accent/40' : 'border-line opacity-60 hover:opacity-100'
                }`}
              >
                {f.url && categoryOf(f.mime || '', f.name) === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.url} alt={f.name} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <FileTypeIcon name={f.name} mime={f.mime} size={18} />
                )}
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function PreviewContent({ cat, file, url, zoom, rotation, pan, onZoomToggle, onDownload }) {
  if (cat === 'image') {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-hidden p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={file.name}
          draggable={false}
          onDoubleClick={onZoomToggle}
          className="max-h-full max-w-full select-none object-contain"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
            transition: 'transform 120ms ease-out',
          }}
        />
      </div>
    );
  }

  if (cat === 'video') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black p-4">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video src={url} controls autoPlay className="max-h-full max-w-full" />
      </div>
    );
  }

  if (cat === 'audio') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6">
        <div className="flex h-28 w-28 items-center justify-center rounded-2xl border border-line bg-surface">
          <FileTypeIcon name={file.name} mime={file.mime} size={48} />
        </div>
        <p className="max-w-md truncate text-sm text-ink-muted">{file.name}</p>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio src={url} controls autoPlay className="w-full max-w-md" />
      </div>
    );
  }

  if (cat === 'pdf') {
    return <iframe src={url} title={file.name} className="h-full w-full bg-white" />;
  }

  if (cat === 'doc') {
    return <DocPreview url={url} name={file.name} onDownload={() => onDownload?.(file)} />;
  }

  if (cat === 'text') {
    return <TextPreview url={url} name={file.name} />;
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-sm text-ink-muted">
      <FileTypeIcon name={file.name} mime={file.mime} size={44} />
      <p>No inline preview for this file type.</p>
      <button
        onClick={() => onDownload?.(file)}
        className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-white transition-colors hover:bg-accent-strong"
      >
        <Download size={16} />
        Download
      </button>
    </div>
  );
}

// Office documents render through Google's viewer, which needs a publicly
// fetchable URL — private-bucket presigned URLs work because they carry auth in
// the query string.
function DocPreview({ url, name, onDownload }) {
  const [failed, setFailed] = useState(false);
  if (!url) return null;

  if (failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-sm text-ink-muted">
        <p>This document could not be rendered inline.</p>
        <button onClick={onDownload} className="btn-neutral flex items-center gap-2">
          <Download size={15} /> Download instead
        </button>
      </div>
    );
  }

  return (
    <iframe
      src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`}
      title={name}
      className="h-full w-full bg-white"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
