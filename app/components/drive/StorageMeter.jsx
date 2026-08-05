'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  RefreshCw,
  HardDrive,
  Trash2,
  AlertTriangle,
  Info,
  Cloud,
} from 'lucide-react';
import { formatCompactBytes, formatCount } from '@/utils/formatFileSize';

// Category colours are shared with the breakdown bar and the legend.
const CATEGORY_STYLE = {
  image: { label: 'Images', color: '#34d399' },
  video: { label: 'Video', color: '#f472b6' },
  audio: { label: 'Audio', color: '#c084fc' },
  pdf: { label: 'PDF', color: '#f87171' },
  doc: { label: 'Documents', color: '#60a5fa' },
  text: { label: 'Text & code', color: '#38bdf8' },
  archive: { label: 'Archives', color: '#fbbf24' },
  other: { label: 'Other', color: '#94a3b8' },
};

function toneFor(percent) {
  if (percent >= 90) return { ring: '#ef4444', text: 'text-red-400' };
  if (percent >= 75) return { ring: '#fbbf24', text: 'text-amber-300' };
  return { ring: '#3b82f6', text: 'text-ink' };
}

/**
 * One bar carries both facts: how full the plan is (fill vs track) and what is
 * filling it (segments, by file type). A second composition bar underneath was
 * redundant — the same numbers drawn twice.
 *
 * Past 75% the segments collapse into a single warning-toned fill: at that point
 * the message is "you are running out", and a rainbow reads as decoration. The
 * per-type split is still one click away in the breakdown.
 */
function UsageBar({ percent, categories }) {
  const clamped = Math.max(0, Math.min(100, percent || 0));
  const tone = toneFor(clamped);
  const alarmed = clamped >= 75;

  // A nearly-empty drive would otherwise render a sliver too thin to see.
  const width = clamped === 0 ? 0 : Math.max(clamped, 1.5);

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
      <motion.div
        className="flex h-full overflow-hidden rounded-full"
        style={alarmed ? { backgroundColor: tone.ring } : undefined}
        initial={{ width: 0 }}
        animate={{ width: `${width}%` }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        {!alarmed &&
          categories.map((c) => (
            <div
              key={c.cat}
              className="h-full"
              style={{ width: `${c.share}%`, backgroundColor: c.color }}
              title={`${c.label}: ${formatCompactBytes(c.bytes)}`}
            />
          ))}
      </motion.div>
    </div>
  );
}

function QuotaBar({ label, used, limit, percent, unit = 'ops' }) {
  const tone = toneFor(percent);
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-ink-muted">{label}</span>
        <span className={tone.text}>
          {unit === 'bytes' ? formatCompactBytes(used) : formatCount(used)}
          <span className="text-ink-faint"> / {unit === 'bytes' ? formatCompactBytes(limit) : formatCount(limit)}</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-raised">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: tone.ring }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, Math.min(100, percent || 0))}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

export default function StorageMeter({ usage, loading, error, onRefresh, onOpenTrash }) {
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const categories = useMemo(() => {
    if (!usage?.scopes) return [];
    const merged = {};
    for (const scope of Object.values(usage.scopes)) {
      for (const [cat, stat] of Object.entries(scope.byCategory || {})) {
        merged[cat] ||= { bytes: 0, count: 0 };
        merged[cat].bytes += stat.bytes;
        merged[cat].count += stat.count;
      }
    }
    const total = Object.values(merged).reduce((a, c) => a + c.bytes, 0) || 1;
    return Object.entries(merged)
      .map(([cat, stat]) => ({
        cat,
        ...stat,
        share: (stat.bytes / total) * 100,
        ...(CATEGORY_STYLE[cat] || CATEGORY_STYLE.other),
      }))
      .sort((a, b) => b.bytes - a.bytes);
  }, [usage]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh?.(true);
    } finally {
      setRefreshing(false);
    }
  };

  if (error) {
    return (
      <div className="border-t border-line p-3 text-xs text-ink-faint">
        <div className="flex items-center gap-2">
          <AlertTriangle size={13} className="text-amber-400" />
          <span>Storage usage unavailable</span>
        </div>
        <button onClick={handleRefresh} className="mt-2 text-[11px] text-accent hover:underline">
          Try again
        </button>
      </div>
    );
  }

  if (loading && !usage) {
    return (
      <div className="space-y-2 border-t border-line p-3">
        <div className="skeleton h-2.5 w-20 rounded" />
        <div className="skeleton h-3.5 w-28 rounded" />
        <div className="skeleton h-1.5 w-full rounded-full" />
      </div>
    );
  }

  const storage = usage?.quota?.storage;
  const percent = storage?.percent ?? 0;
  const tone = toneFor(percent);
  const trashBytes = usage?.totals?.trashBytes ?? 0;
  const isEstimate = usage?.source !== 'cloudflare';

  return (
    <div className="border-t border-line">
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-ink-faint">
            <HardDrive size={10} />
            R2 free plan
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="-mr-1 shrink-0 rounded-md p-1 text-ink-faint transition-colors hover:bg-hover hover:text-ink disabled:opacity-50"
            title="Recalculate usage"
            aria-label="Recalculate usage"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="mb-2 mt-1.5 flex items-baseline gap-1">
          <span className={`text-[15px] font-semibold leading-none tabular-nums ${tone.text}`}>
            {formatCompactBytes(storage?.used ?? 0)}
          </span>
          <span className="text-[11px] leading-none text-ink-faint">
            of {formatCompactBytes(storage?.limit ?? 0)}
          </span>
        </div>

        <UsageBar percent={percent} categories={categories} />

        <div className="mt-1.5 flex items-baseline justify-between text-[10px] text-ink-faint">
          <span className="tabular-nums">{formatCount(usage?.totals?.objects ?? 0)} objects</span>
          <span className="tabular-nums">
            {formatCompactBytes(Math.max(0, (storage?.limit ?? 0) - (storage?.used ?? 0)))} free
          </span>
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 flex w-full items-center justify-between rounded-md py-1 text-[11px] text-ink-faint transition-colors hover:text-ink-muted"
          aria-expanded={expanded}
        >
          <span>{expanded ? 'Hide breakdown' : 'Show breakdown'}</span>
          <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.18 }} className="inline-flex">
            <ChevronDown size={13} />
          </motion.span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-3 pb-3">
              {/* By file type */}
              <div className="space-y-1.5">
                {categories.map((c) => (
                  <div key={c.cat} className="flex items-center gap-2 text-[11px]">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="flex-1 truncate text-ink-muted">{c.label}</span>
                    <span className="text-ink-faint">{formatCount(c.count)}</span>
                    <span className="w-16 text-right tabular-nums text-ink">{formatCompactBytes(c.bytes)}</span>
                  </div>
                ))}
              </div>

              {/* Per-scope */}
              <div className="space-y-1.5 border-t border-line pt-3">
                {Object.entries(usage?.scopes || {}).map(([name, s]) => (
                  <div key={name} className="flex items-center gap-2 text-[11px]">
                    <span className="flex-1 capitalize text-ink-muted">{name}</span>
                    <span className="text-ink-faint">{formatCount(s.objects)} obj</span>
                    <span className="w-16 text-right tabular-nums text-ink">{formatCompactBytes(s.bytes)}</span>
                  </div>
                ))}
              </div>

              {/* Monthly operation quotas — only when Cloudflare analytics is reachable */}
              {(usage?.quota?.classA || usage?.quota?.classB) && (
                <div className="space-y-2 border-t border-line pt-3">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-ink-faint">
                    <Cloud size={10} /> This month
                  </div>
                  {usage.quota.classA && (
                    <QuotaBar label="Class A ops (writes, lists)" {...usage.quota.classA} />
                  )}
                  {usage.quota.classB && (
                    <QuotaBar label="Class B ops (reads)" {...usage.quota.classB} />
                  )}
                </div>
              )}

              {/* Trash */}
              {trashBytes > 0 && (
                <button
                  onClick={onOpenTrash}
                  className="flex w-full items-center gap-2 rounded-lg border border-line bg-raised px-2.5 py-2 text-left text-[11px] transition-colors hover:bg-hover"
                >
                  <Trash2 size={12} className="text-ink-faint" />
                  <span className="flex-1 text-ink-muted">
                    Trash still counts toward your quota
                  </span>
                  <span className="tabular-nums text-ink">{formatCompactBytes(trashBytes)}</span>
                </button>
              )}

              {isEstimate && (
                <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-ink-faint">
                  <Info size={11} className="mt-px shrink-0" />
                  <span>
                    Counted from object listings. Add an API token with R2 + Analytics read to show
                    Cloudflare&apos;s billed figures and operation counts.
                  </span>
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
