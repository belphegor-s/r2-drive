'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, HardDrive, Clock, Star, Trash2, Globe, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { driveApi } from '@/app/lib/driveClient';
import { FolderIcon, FileTypeIcon } from './fileIcons';
import StorageMeter from './StorageMeter';
import { DRAG_MIME } from '@/app/lib/dnd';

function FileLeaf({ file, depth, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(file)}
      className="group flex w-full select-none items-center gap-2 truncate rounded-md py-1.5 text-left text-sm transition-colors hover:bg-hover"
      style={{ paddingLeft: 8 + depth * 12 + 22 }}
      title={file.name}
    >
      <FileTypeIcon name={file.name} mime={file.mime} size={14} />
      <span className="truncate text-ink-muted group-hover:text-ink">{file.name}</span>
    </button>
  );
}

function TreeNode({ scope, node, currentPrefix, onNavigate, onFileOpen, onDropItems, depth = 0, refreshKey }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dropActive, setDropActive] = useState(false);

  const isActive = currentPrefix === node.prefix;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await driveApi.list(scope, node.prefix);
      setData({ folders: res.folders || [], files: res.files || [] });
    } catch (err) {
      console.error(err);
      setData({ folders: [], files: [] });
    } finally {
      setLoading(false);
    }
  }, [scope, node.prefix]);

  useEffect(() => {
    if (open && data === null) load();
  }, [open, data, load]);

  // Auto-expand along the active path.
  useEffect(() => {
    if (currentPrefix && (currentPrefix === node.prefix || currentPrefix.startsWith(`${node.prefix}/`))) {
      setOpen(true);
    }
  }, [currentPrefix, node.prefix]);

  useEffect(() => {
    if (open && refreshKey) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const handleDragOver = (e) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropActive(true);
  };

  const handleDrop = (e) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.stopPropagation();
    setDropActive(false);
    try {
      const payload = JSON.parse(e.dataTransfer.getData(DRAG_MIME));
      onDropItems?.(node.prefix, payload);
    } catch {
      // malformed payload — nothing to move
    }
  };

  return (
    <div>
      <div
        className={`group flex cursor-pointer select-none items-center gap-1 rounded-md transition-colors ${
          isActive ? 'bg-accent/20 text-ink' : dropActive ? 'bg-accent/25 ring-1 ring-accent' : 'hover:bg-hover'
        }`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onDragOver={handleDragOver}
        onDragLeave={() => setDropActive(false)}
        onDrop={handleDrop}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          className="p-1 text-ink-faint transition-colors hover:text-ink"
          aria-label={open ? 'Collapse' : 'Expand'}
          aria-expanded={open}
        >
          <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }} className="inline-flex">
            <ChevronRight size={14} />
          </motion.span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate(node.prefix)}
          className="flex flex-1 items-center gap-2 truncate py-1.5 text-left text-sm"
          title={node.prefix}
        >
          <FolderIcon size={15} />
          <span className="truncate">{node.name}</span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="children"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            {loading && <div className="py-1 pl-8 text-xs text-ink-faint">Loading…</div>}
            {!loading && data && data.folders.length === 0 && data.files.length === 0 && (
              <div className="py-1 pl-8 text-xs italic text-ink-faint">empty</div>
            )}
            {data?.folders.map((c) => (
              <TreeNode
                key={c.prefix}
                scope={scope}
                node={c}
                currentPrefix={currentPrefix}
                onNavigate={onNavigate}
                onFileOpen={onFileOpen}
                onDropItems={onDropItems}
                depth={depth + 1}
                refreshKey={refreshKey}
              />
            ))}
            {data?.files.map((f) => (
              <FileLeaf key={f.key} file={f} depth={depth + 1} onClick={onFileOpen} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavItem({ icon, label, active, badge, onClick, onDropItems }) {
  const [dropActive, setDropActive] = useState(false);

  const dropProps = onDropItems
    ? {
        onDragOver: (e) => {
          if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDropActive(true);
        },
        onDragLeave: () => setDropActive(false),
        onDrop: (e) => {
          if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
          e.preventDefault();
          setDropActive(false);
          try {
            onDropItems(JSON.parse(e.dataTransfer.getData(DRAG_MIME)));
          } catch {
            // malformed payload — ignore
          }
        },
      }
    : {};

  return (
    <button
      type="button"
      onClick={onClick}
      {...dropProps}
      className={`flex w-full select-none items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
        active ? 'bg-accent/20 text-ink' : dropActive ? 'bg-accent/25 ring-1 ring-accent' : 'text-ink-muted hover:bg-hover hover:text-ink'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge > 0 && (
        <span className="rounded-full bg-raised px-1.5 py-0.5 text-[10px] tabular-nums text-ink-faint">{badge}</span>
      )}
    </button>
  );
}

export default function Sidebar({
  scope,
  currentPrefix,
  view = 'browse',
  onNavigate,
  onSetView,
  onFileOpen,
  onOpenTrash,
  onDropItems,
  refreshKey,
  onClose,
  starredCount = 0,
  usage,
  usageLoading,
  usageError,
  onRefreshUsage,
}) {
  const [roots, setRoots] = useState(null);
  const [rootFiles, setRootFiles] = useState([]);

  const loadRoots = useCallback(async () => {
    try {
      const res = await driveApi.list(scope, '');
      setRoots(res.folders || []);
      setRootFiles(res.files || []);
    } catch (err) {
      console.error(err);
      setRoots([]);
      setRootFiles([]);
    }
  }, [scope]);

  useEffect(() => {
    loadRoots();
  }, [loadRoots, refreshKey]);

  const atHome = view === 'browse' && !currentPrefix;

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line p-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {scope === 'private' ? (
            <Lock size={15} className="text-amber-300" />
          ) : (
            <Globe size={15} className="text-accent" />
          )}
          <span className="capitalize">{scope} drive</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="px-2 text-xl leading-none text-ink-faint hover:text-ink md:hidden">
            ×
          </button>
        )}
      </div>

      <nav className="space-y-0.5 border-b border-line p-2">
        <NavItem
          icon={<HardDrive size={14} className={atHome ? 'text-accent' : ''} />}
          label="My drive"
          active={atHome}
          onClick={() => {
            onSetView?.('browse');
            onNavigate('');
          }}
          onDropItems={onDropItems ? (payload) => onDropItems('', payload) : undefined}
        />
        <NavItem
          icon={<Clock size={14} className={view === 'recent' ? 'text-accent' : ''} />}
          label="Recent"
          active={view === 'recent'}
          onClick={() => onSetView?.('recent')}
        />
        <NavItem
          icon={<Star size={14} className={view === 'starred' ? 'text-accent' : ''} />}
          label="Starred"
          active={view === 'starred'}
          badge={starredCount}
          onClick={() => onSetView?.('starred')}
        />
        <NavItem icon={<Trash2 size={14} />} label="Trash" onClick={onOpenTrash} />
      </nav>

      <div className="custom-scrollbar flex-1 overflow-y-auto p-1">
        <div className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-ink-faint">
          Folders
        </div>
        {roots === null ? (
          <div className="space-y-1.5 px-2 py-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-5 rounded" />
            ))}
          </div>
        ) : roots.length === 0 ? (
          <p className="px-3 py-2 text-xs italic text-ink-faint">No folders yet</p>
        ) : (
          roots.map((r) => (
            <TreeNode
              key={r.prefix}
              scope={scope}
              node={r}
              currentPrefix={view === 'browse' ? currentPrefix : null}
              onNavigate={(p) => {
                onSetView?.('browse');
                onNavigate(p);
              }}
              onFileOpen={onFileOpen}
              onDropItems={onDropItems}
              refreshKey={refreshKey}
            />
          ))
        )}
        {rootFiles.map((f) => (
          <FileLeaf key={f.key} file={f} depth={0} onClick={onFileOpen} />
        ))}
      </div>

      <StorageMeter
        usage={usage}
        loading={usageLoading}
        error={usageError}
        onRefresh={onRefreshUsage}
        onOpenTrash={onOpenTrash}
      />
    </aside>
  );
}
