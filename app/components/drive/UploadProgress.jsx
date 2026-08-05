'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, X, Ban } from 'lucide-react';

export default function UploadProgress({ batches, onDismiss, onCancel, lift = false }) {
  return (
    <div
      className="fixed right-4 z-50 w-[min(360px,calc(100%-2rem))] space-y-2 transition-all"
      style={{ bottom: lift ? 96 : 16 }}
      aria-live="polite"
    >
      <AnimatePresence>
        {batches.map((b) => {
          const inflight = b.status === 'uploading';
          const terminal = b.status === 'done' || b.status === 'error' || b.status === 'cancelled';
          return (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="glass overflow-hidden rounded-xl"
            >
              <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                {b.status === 'done' && <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />}
                {b.status === 'error' && <AlertCircle size={16} className="shrink-0 text-red-400" />}
                {b.status === 'cancelled' && <Ban size={16} className="shrink-0 text-ink-faint" />}
                {inflight && (
                  <div className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                )}
                <span className="flex-1 truncate text-sm font-medium">{b.label}</span>

                {inflight && !b.indeterminate && (
                  <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">
                    {Math.round(b.percent || 0)}%
                  </span>
                )}

                {inflight && onCancel && (
                  <button
                    onClick={() => onCancel(b.id)}
                    className="btn-danger-variant-small shrink-0"
                    title="Cancel"
                  >
                    Cancel
                  </button>
                )}
                {terminal && (
                  <button
                    onClick={() => onDismiss(b.id)}
                    className="shrink-0 text-ink-faint transition-colors hover:text-ink"
                    title="Dismiss"
                    aria-label="Dismiss"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {inflight && (
                <div className="h-1 overflow-hidden bg-raised">
                  {b.indeterminate ? (
                    <div className="progress-indeterminate h-full w-1/3 bg-accent" />
                  ) : (
                    <div className="h-full bg-accent transition-all" style={{ width: `${b.percent || 0}%` }} />
                  )}
                </div>
              )}

              {b.message && (
                <div className={`px-3 py-1.5 text-[11px] ${b.status === 'error' ? 'text-red-400' : 'text-ink-faint'}`}>
                  {b.message}
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
