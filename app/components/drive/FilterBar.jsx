'use client';

import { motion } from 'framer-motion';
import { X } from 'lucide-react';

const LABELS = {
  folder: 'Folders',
  image: 'Images',
  video: 'Video',
  audio: 'Audio',
  pdf: 'PDF',
  doc: 'Docs',
  text: 'Text & code',
  archive: 'Archives',
  other: 'Other',
};

/**
 * Type filter chips. Only categories actually present in the current listing
 * are offered, so the row stays short and never dead-ends on an empty result.
 */
export default function FilterBar({ counts = {}, active, onChange }) {
  const entries = Object.entries(counts).filter(([, n]) => n > 0);
  if (entries.length < 2) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {entries.map(([cat, n]) => {
        const isActive = active === cat;
        return (
          <button
            key={cat}
            onClick={() => onChange(isActive ? null : cat)}
            className={`relative flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
              isActive ? 'text-white' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="filterChip"
                className="absolute inset-0 rounded-full bg-accent"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative z-10">{LABELS[cat] || cat}</span>
            <span className={`relative z-10 tabular-nums ${isActive ? 'text-white/70' : 'text-ink-faint'}`}>{n}</span>
          </button>
        );
      })}
      {active && (
        <button
          onClick={() => onChange(null)}
          className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-ink-faint transition-colors hover:text-ink"
        >
          <X size={11} /> Clear
        </button>
      )}
    </div>
  );
}
