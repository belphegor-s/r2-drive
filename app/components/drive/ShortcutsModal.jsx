'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Keyboard } from 'lucide-react';
import { SHORTCUT_GROUPS, visibleShortcuts, formatCombo } from '@/app/lib/shortcuts';

export default function ShortcutsModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const byGroup = SHORTCUT_GROUPS.map((group) => ({
    group,
    items: visibleShortcuts().filter((s) => s.group === group),
  })).filter((g) => g.items.length > 0);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"
          onMouseDown={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="glass flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
          >
            <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
              <Keyboard size={16} className="text-accent" />
              <h2 className="flex-1 text-sm font-semibold">Keyboard shortcuts</h2>
              <button
                onClick={onClose}
                className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-hover hover:text-ink"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="custom-scrollbar grid flex-1 gap-x-8 gap-y-6 overflow-y-auto p-5 sm:grid-cols-2">
              {byGroup.map(({ group, items }) => (
                <section key={group}>
                  <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-ink-faint">
                    {group}
                  </h3>
                  <ul className="space-y-1">
                    {items.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 rounded-md px-1 py-1.5">
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-muted">{s.label}</span>
                        <kbd className="kbd shrink-0">{formatCombo(s.combo, s.keyLabel)}</kbd>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            <div className="border-t border-line px-5 py-3 text-[11px] text-ink-faint">
              Single-key shortcuts are ignored while you are typing in a field.
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
