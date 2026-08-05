'use client';

import { useState } from 'react';
import { ChevronRight, HardDrive, MoreHorizontal } from 'lucide-react';
import { DRAG_MIME } from '@/app/lib/dnd';

const MAX_VISIBLE = 4;

function Crumb({ crumb, isLast, onNavigate, onDropItems }) {
  const [dropActive, setDropActive] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onNavigate(crumb.prefix)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        e.preventDefault();
        setDropActive(false);
        try {
          onDropItems?.(crumb.prefix, JSON.parse(e.dataTransfer.getData(DRAG_MIME)));
        } catch {
          // malformed payload — ignore
        }
      }}
      className={`flex items-center gap-1 rounded-md px-2 py-1 transition-colors ${
        dropActive
          ? 'bg-accent/25 ring-1 ring-accent'
          : isLast
            ? 'bg-raised font-semibold text-ink'
            : 'text-ink-muted hover:bg-hover hover:text-ink'
      }`}
      title={crumb.prefix || 'Drive root'}
    >
      {crumb.icon}
      <span className="max-w-[160px] truncate">{crumb.label}</span>
    </button>
  );
}

export default function Breadcrumbs({ scope, prefix, onNavigate, onDropItems }) {
  const [expanded, setExpanded] = useState(false);
  const segments = (prefix || '').split('/').filter(Boolean);
  const rootLabel = scope === 'private' ? 'Private' : 'Public';

  const crumbs = [
    { label: rootLabel, prefix: '', icon: <HardDrive size={14} /> },
    ...segments.map((seg, i) => ({
      label: seg,
      prefix: segments.slice(0, i + 1).join('/'),
    })),
  ];

  // Deep paths collapse in the middle so the trail never pushes the toolbar
  // out of view; clicking the ellipsis reveals the full chain.
  const collapsed = !expanded && crumbs.length > MAX_VISIBLE + 1;
  const shown = collapsed ? [crumbs[0], ...crumbs.slice(-MAX_VISIBLE)] : crumbs;

  return (
    <nav
      className="custom-scrollbar flex items-center gap-1 overflow-x-auto whitespace-nowrap py-1 text-sm"
      aria-label="Breadcrumb"
    >
      {shown.map((c, i) => {
        const isLast = i === shown.length - 1;
        const showEllipsis = collapsed && i === 0;
        return (
          <div key={c.prefix || 'root'} className="flex items-center gap-1">
            <Crumb crumb={c} isLast={isLast} onNavigate={onNavigate} onDropItems={onDropItems} />
            {!isLast && <ChevronRight size={14} className="shrink-0 text-ink-faint" />}
            {showEllipsis && (
              <>
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="rounded-md px-1.5 py-1 text-ink-faint transition-colors hover:bg-hover hover:text-ink"
                  title="Show full path"
                  aria-label="Show full path"
                >
                  <MoreHorizontal size={14} />
                </button>
                <ChevronRight size={14} className="shrink-0 text-ink-faint" />
              </>
            )}
          </div>
        );
      })}
    </nav>
  );
}
