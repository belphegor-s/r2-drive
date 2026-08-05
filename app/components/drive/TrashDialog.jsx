'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { X, Trash2, RotateCcw, Loader2, AlertTriangle } from 'lucide-react';
import { driveApi } from '@/app/lib/driveClient';
import { formatCompactBytes } from '@/utils/formatFileSize';
import { FolderIcon, FileTypeIcon } from './fileIcons';

export default function TrashDialog({ open, scope, onClose, onChanged }) {
  const [state, setState] = useState({ loading: true, entries: [], bytes: 0, retentionDays: null });
  const [busyToken, setBusyToken] = useState(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await driveApi.trash.list(scope);
      setState({ loading: false, entries: res.entries || [], bytes: res.bytes || 0, retentionDays: res.retentionDays });
    } catch (err) {
      setState({ loading: false, entries: [], bytes: 0, retentionDays: null });
      toast.error(err.message || 'Failed to load trash');
    }
  }, [scope]);

  useEffect(() => {
    if (open) {
      setConfirmEmpty(false);
      load();
    }
  }, [open, load]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const restore = async (entry) => {
    setBusyToken(entry.token);
    try {
      await driveApi.trash.restore(scope, entry.token);
      toast.success(`Restored “${entry.name}”`);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.message || 'Restore failed');
    } finally {
      setBusyToken(null);
    }
  };

  const purge = async (entry) => {
    setBusyToken(entry.token);
    try {
      await driveApi.trash.purge(scope, entry.token);
      toast.success(`Deleted “${entry.name}” permanently`);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.message || 'Delete failed');
    } finally {
      setBusyToken(null);
    }
  };

  const emptyAll = async () => {
    setBusyToken('__all__');
    try {
      await driveApi.trash.empty(scope);
      toast.success('Trash emptied');
      setConfirmEmpty(false);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.message || 'Failed to empty trash');
    } finally {
      setBusyToken(null);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[65] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"
          onMouseDown={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="glass flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Trash"
          >
            <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
              <Trash2 size={16} className="text-ink-muted" />
              <h2 className="text-sm font-semibold">Trash</h2>
              {state.bytes > 0 && (
                <span className="rounded-full bg-raised px-2 py-0.5 text-[11px] text-ink-faint">
                  {formatCompactBytes(state.bytes)}
                </span>
              )}
              <div className="flex-1" />
              {state.entries.length > 0 && (
                confirmEmpty ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-ink-muted">Delete everything?</span>
                    <button onClick={emptyAll} disabled={busyToken} className="btn-danger-variant-small">
                      Yes, empty
                    </button>
                    <button onClick={() => setConfirmEmpty(false)} className="btn-neutral-small">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmEmpty(true)} className="btn-neutral-small">
                    Empty trash
                  </button>
                )
              )}
              <button
                onClick={onClose}
                className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-hover hover:text-ink"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="custom-scrollbar flex-1 overflow-y-auto">
              {state.loading ? (
                <div className="space-y-2 p-4">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="skeleton h-12 rounded-lg" />
                  ))}
                </div>
              ) : state.entries.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <p className="text-sm text-ink-muted">Trash is empty</p>
                  <p className="mt-1 text-[12px] text-ink-faint">
                    Deleted files land here instead of disappearing.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {state.entries.map((entry) => {
                    const busy = busyToken === entry.token;
                    return (
                      <li key={entry.token} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-hover/50">
                        <span className="shrink-0">
                          {entry.kind === 'folder' ? <FolderIcon size={18} /> : <FileTypeIcon name={entry.name} size={18} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-ink">{entry.name}</p>
                          <p className="truncate text-[11px] text-ink-faint">
                            {entry.originalFolder ? `from ${entry.originalFolder}` : 'from drive root'}
                            {' · '}
                            {entry.deletedAt ? `${formatDistanceToNow(new Date(entry.deletedAt))} ago` : 'unknown'}
                            {' · '}
                            {formatCompactBytes(entry.size)}
                            {entry.objects > 1 ? ` · ${entry.objects} files` : ''}
                          </p>
                        </div>
                        <button
                          onClick={() => restore(entry)}
                          disabled={busy}
                          className="btn-neutral-small flex shrink-0 items-center gap-1.5 disabled:opacity-50"
                          title="Restore to original location"
                        >
                          {busy ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                          Restore
                        </button>
                        <button
                          onClick={() => purge(entry)}
                          disabled={busy}
                          className="shrink-0 rounded-md p-1.5 text-ink-faint transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                          title="Delete permanently"
                          aria-label="Delete permanently"
                        >
                          <Trash2 size={14} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-line px-5 py-2.5 text-[11px] text-ink-faint">
              <AlertTriangle size={11} className="shrink-0 text-amber-400/80" />
              <span>
                Items in the trash still occupy R2 storage
                {state.retentionDays ? ` and are purged automatically after ${state.retentionDays} days.` : '. Empty it to reclaim quota.'}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
