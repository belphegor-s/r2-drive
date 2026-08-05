'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trash2, Move, Copy, Download, X, CheckSquare, Square, Scissors, Star, MoreHorizontal,
} from 'lucide-react';
import { formatCompactBytes } from '@/utils/formatFileSize';

function Action({ icon, label, onClick, disabled, danger }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors disabled:opacity-50 ${
        danger ? 'bg-red-900/60 hover:bg-red-800' : 'bg-raised hover:bg-hover'
      }`}
    >
      {icon}
      {/* Labels only once there is room for all of them; below that the bar is
          icon-only. It must never scroll — see the overflow menu. */}
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

function MenuItem({ icon, label, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink-muted transition-colors hover:bg-hover hover:text-ink disabled:opacity-50"
    >
      <span className="text-ink-faint">{icon}</span>
      {label}
    </button>
  );
}

export default function SelectionBar({
  count,
  totalCount = 0,
  bytes = 0,
  onClear,
  onSelectAll,
  onDelete,
  onMove,
  onCopy,
  onCut,
  onClipboardCopy,
  onStar,
  onDownloadZip,
  busy,
}) {
  const allSelected = totalCount > 0 && count >= totalCount;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (count === 0) setMenuOpen(false);
  }, [count]);

  const run = (fn) => () => {
    setMenuOpen(false);
    fn?.();
  };

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="fixed bottom-4 left-1/2 z-40 w-[min(calc(100%-1rem),900px)] -translate-x-1/2"
        >
          <div className="glass flex items-center gap-1.5 rounded-2xl px-2 py-2 sm:gap-2 sm:px-3">
            <button
              onClick={onClear}
              className="shrink-0 rounded-lg p-2 transition-colors hover:bg-hover"
              aria-label="Clear selection"
              title="Clear selection (Esc)"
            >
              <X size={16} />
            </button>

            <div className="min-w-0 shrink">
              <div className="truncate text-[13px] font-medium leading-tight sm:text-sm">
                {count} <span className="hidden xs:inline">selected</span>
              </div>
              {bytes > 0 && (
                <div className="truncate text-[11px] leading-tight text-ink-faint">{formatCompactBytes(bytes)}</div>
              )}
            </div>

            {totalCount > 1 && (
              <button
                onClick={() => (allSelected ? onClear() : onSelectAll())}
                className="hidden shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-hover hover:text-ink sm:flex"
                title={allSelected ? 'Deselect all' : 'Select all'}
              >
                {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                <span className="hidden lg:inline">{allSelected ? 'Deselect all' : 'Select all'}</span>
              </button>
            )}

            <div className="min-w-1 flex-1" />

            {/* Primary actions — always reachable in one tap. */}
            <Action icon={<Star size={14} />} label="Star" onClick={onStar} disabled={busy} />
            <Action icon={<Download size={14} />} label="ZIP" onClick={onDownloadZip} disabled={busy} />
            <Action icon={<Move size={14} />} label="Move to…" onClick={onMove} disabled={busy} />

            {/* Secondary actions: inline once wide, folded into a menu before
                the row would ever need to scroll. */}
            <div className="hidden xl:contents">
              <Action icon={<Scissors size={14} />} label="Cut" onClick={onCut} disabled={busy} />
              <Action icon={<Copy size={14} />} label="Copy" onClick={onClipboardCopy} disabled={busy} />
              <Action icon={<Copy size={14} />} label="Copy to…" onClick={onCopy} disabled={busy} />
            </div>

            <div ref={menuRef} className="relative shrink-0 xl:hidden">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                disabled={busy}
                className="flex items-center rounded-lg bg-raised px-2.5 py-1.5 transition-colors hover:bg-hover disabled:opacity-50"
                aria-label="More actions"
                aria-expanded={menuOpen}
                title="More actions"
              >
                <MoreHorizontal size={14} />
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.98 }}
                    transition={{ duration: 0.14 }}
                    className="glass absolute bottom-full right-0 mb-2 min-w-[180px] overflow-hidden rounded-xl py-1"
                  >
                    {totalCount > 1 && (
                      <MenuItem
                        icon={allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                        label={allSelected ? 'Deselect all' : 'Select all'}
                        onClick={run(allSelected ? onClear : onSelectAll)}
                      />
                    )}
                    <MenuItem icon={<Scissors size={14} />} label="Cut" onClick={run(onCut)} disabled={busy} />
                    <MenuItem icon={<Copy size={14} />} label="Copy" onClick={run(onClipboardCopy)} disabled={busy} />
                    <MenuItem icon={<Copy size={14} />} label="Copy to…" onClick={run(onCopy)} disabled={busy} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Action icon={<Trash2 size={14} />} label="Trash" onClick={onDelete} disabled={busy} danger />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
