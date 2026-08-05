'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, CornerDownLeft, Loader2 } from 'lucide-react';
import { driveApi } from '@/app/lib/driveClient';
import { FolderIcon, FileTypeIcon } from './fileIcons';
import { formatCompactBytes } from '@/utils/formatFileSize';
import { MOD_LABEL } from '@/app/lib/shortcuts';

/**
 * Subsequence match with a contiguity bonus — enough to make "dwn" find
 * "Download" without pulling in a fuzzy-search dependency.
 * Returns null when the query does not match at all.
 */
function score(text, query) {
  if (!query) return 0;
  const hay = text.toLowerCase();
  const needle = query.toLowerCase();

  const direct = hay.indexOf(needle);
  if (direct === 0) return 1000;
  if (direct > 0) return 800 - direct;

  let ti = 0;
  let total = 0;
  let streak = 0;
  for (const ch of needle) {
    const found = hay.indexOf(ch, ti);
    if (found === -1) return null;
    streak = found === ti ? streak + 1 : 0;
    total += 10 + streak * 5 - Math.min(found - ti, 10);
    ti = found + 1;
  }
  return total;
}

function useDebounced(value, ms) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export default function CommandPalette({ open, onClose, scope, commands = [], folders = [], onNavigate, onOpenFile }) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [remote, setRemote] = useState({ loading: false, files: [] });
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const debouncedQuery = useDebounced(query.trim(), 220);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      setRemote({ loading: false, files: [] });
      // Focus after the entry animation starts so the caret does not jump.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Remote file search. Anything shorter than two characters would match most
  // of the bucket, which costs a full LIST for no useful result.
  useEffect(() => {
    if (!open || debouncedQuery.length < 2) {
      setRemote({ loading: false, files: [] });
      return undefined;
    }
    let cancelled = false;
    setRemote((r) => ({ ...r, loading: true }));
    driveApi
      .search(scope, debouncedQuery)
      .then((res) => {
        if (cancelled) return;
        setRemote({ loading: false, files: (res?.results || []).slice(0, 8) });
      })
      .catch(() => {
        if (!cancelled) setRemote({ loading: false, files: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [open, debouncedQuery, scope]);

  const groups = useMemo(() => {
    const q = query.trim();

    const rank = (items, textOf) =>
      items
        .map((item) => ({ item, s: q ? score(textOf(item), q) : 0 }))
        .filter((r) => r.s !== null)
        .sort((a, b) => b.s - a.s)
        .map((r) => r.item);

    const matchedCommands = rank(
      commands.filter((c) => !c.hidden),
      (c) => `${c.label} ${c.keywords || ''}`,
    ).slice(0, q ? 8 : 20);

    const matchedFolders = q
      ? rank(folders, (f) => f.prefix || f.name)
          .slice(0, 6)
          .map((f) => ({
            id: `folder:${f.prefix}`,
            label: f.name,
            sub: f.prefix || 'Drive root',
            icon: <FolderIcon size={15} />,
            run: () => onNavigate(f.prefix),
          }))
      : [];

    const matchedFiles = remote.files.map((f) => ({
      id: `file:${f.key}`,
      label: f.name,
      sub: `${f.folder || 'Drive root'} · ${formatCompactBytes(f.size)}`,
      icon: <FileTypeIcon name={f.name} mime={f.mime} size={15} />,
      run: () => onOpenFile(f),
    }));

    return [
      { title: 'Actions', items: matchedCommands },
      { title: 'Folders', items: matchedFolders },
      { title: 'Files', items: matchedFiles },
    ].filter((g) => g.items.length > 0);
  }, [query, commands, folders, remote.files, onNavigate, onOpenFile]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, flat.length - 1)));
  }, [flat.length]);

  // Keep the highlighted row inside the scroll viewport.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${cursor}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const run = useCallback(
    (item) => {
      if (!item) return;
      onClose();
      // Let the palette unmount before the action moves focus or opens a modal.
      setTimeout(() => item.run(), 0);
    },
    [onClose],
  );

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (flat.length ? (c + 1) % flat.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (flat.length ? (c - 1 + flat.length) % flat.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(flat[cursor]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let flatIndex = -1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          // Less top offset on phones so the list survives the on-screen keyboard.
          className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 px-3 pt-[5vh] backdrop-blur-[2px] sm:px-4 sm:pt-[12vh]"
          onMouseDown={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.985 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="glass w-full max-w-xl overflow-hidden rounded-2xl"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
          >
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <Search size={16} className="shrink-0 text-ink-faint" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCursor(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Search files, folders and actions…"
                className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
                autoComplete="off"
                spellCheck={false}
              />
              {remote.loading && <Loader2 size={14} className="shrink-0 animate-spin text-ink-faint" />}
              <kbd className="kbd shrink-0">Esc</kbd>
            </div>

            <div ref={listRef} className="custom-scrollbar max-h-[52vh] overflow-y-auto py-2">
              {flat.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-ink-faint">
                  {query ? `No matches for “${query}”` : 'Start typing to search'}
                </div>
              ) : (
                groups.map((group) => (
                  <div key={group.title} className="mb-1">
                    <div className="px-4 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-ink-faint">
                      {group.title}
                    </div>
                    {group.items.map((item) => {
                      flatIndex += 1;
                      const idx = flatIndex;
                      const active = idx === cursor;
                      return (
                        <button
                          key={item.id}
                          data-index={idx}
                          onMouseMove={() => setCursor(idx)}
                          onClick={() => run(item)}
                          className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                            active ? 'bg-accent/15' : 'hover:bg-hover'
                          }`}
                        >
                          <span className="shrink-0 text-ink-muted">{item.icon}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-ink">{item.label}</span>
                            {item.sub && (
                              <span className="block truncate text-[11px] text-ink-faint">{item.sub}</span>
                            )}
                          </span>
                          {item.shortcut && <kbd className="kbd shrink-0">{item.shortcut}</kbd>}
                          {active && <CornerDownLeft size={13} className="shrink-0 text-ink-faint" />}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Key hints mean nothing on touch. */}
            <div className="hidden items-center gap-3 border-t border-line px-4 py-2 text-[11px] text-ink-faint sm:flex">
              <span className="flex items-center gap-1"><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> navigate</span>
              <span className="flex items-center gap-1"><kbd className="kbd">↵</kbd> run</span>
              <span className="ml-auto flex items-center gap-1"><kbd className="kbd">{MOD_LABEL} K</kbd> toggle</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
