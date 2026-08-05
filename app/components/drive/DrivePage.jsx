'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Eye, Download, Pencil, Move, Copy, Trash2, Share2, Link as LinkIcon, FolderOpen, Archive,
  Star, Scissors, ClipboardPaste, Info, FolderPlus, Upload, FolderUp, LayoutGrid, List,
  RefreshCw, Keyboard, Clock, PanelRight, Files, ShieldAlert,
} from 'lucide-react';
import Navbar from '@/app/components/Navbar';
import Sidebar from './Sidebar';
import Breadcrumbs from './Breadcrumbs';
import Toolbar from './Toolbar';
import SearchBar from './SearchBar';
import FileGrid from './FileGrid';
import FileList from './FileList';
import FilterBar from './FilterBar';
import ContextMenu from './ContextMenu';
import SelectionBar from './SelectionBar';
import PreviewModal from './PreviewModal';
import NewFolderModal from './NewFolderModal';
import RenameDialog from './RenameDialog';
import ConfirmDialog from './ConfirmDialog';
import MoveCopyDialog from './MoveCopyDialog';
import ShareDialog from './ShareDialog';
import UploadProgress from './UploadProgress';
import CommandPalette from './CommandPalette';
import ShortcutsModal from './ShortcutsModal';
import TrashDialog from './TrashDialog';
import DetailsPanel from './DetailsPanel';
import { GridSkeleton, ListSkeleton } from './Skeletons';
import useDriveData from '@/app/hooks/useDriveData';
import useSelection from '@/app/hooks/useSelection';
import useContextMenu from '@/app/hooks/useContextMenu';
import useKeyboardShortcuts from '@/app/hooks/useKeyboardShortcuts';
import useClipboard from '@/app/hooks/useClipboard';
import useStarred from '@/app/hooks/useStarred';
import useUsage from '@/app/hooks/useUsage';
import usePersistentState from '@/app/hooks/usePersistentState';
import useMediaQuery from '@/app/hooks/useMediaQuery';
import { driveApi, downloadFileWithProgress, downloadZipWithProgress } from '@/app/lib/driveClient';
import { uploadEntries, fileListToEntries, snapshotDataTransferEntries, walkSnapshot } from '@/app/lib/uploadClient';
import { categoryOf } from '@/app/lib/fileTypes';
import { DRAG_MIME } from '@/app/lib/dnd';
import { MOD_LABEL, formatCombo, getShortcut } from '@/app/lib/shortcuts';
import { formatCompactBytes } from '@/utils/formatFileSize';
import copyToClipboard from '@/utils/copyToClipboard';

const PREVIEWABLE = ['image', 'video', 'audio', 'pdf', 'text', 'doc'];

function shortcutLabel(id) {
  const s = getShortcut(id);
  return s ? formatCombo(s.combo, s.keyLabel) : undefined;
}

function sortItems(data = {}, sort) {
  const folders = [...(Array.isArray(data.folders) ? data.folders : [])];
  const files = [...(Array.isArray(data.files) ? data.files : [])];
  const dir = sort.dir === 'asc' ? 1 : -1;

  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

  const cmp = (a, b) => {
    if (sort.by === 'name') return byName(a, b) * dir;
    if (sort.by === 'size') return ((a.size ?? 0) - (b.size ?? 0)) * dir;
    if (sort.by === 'type') {
      const ca = categoryOf(a.mime || '', a.name);
      const cb = categoryOf(b.mime || '', b.name);
      return (ca.localeCompare(cb) || byName(a, b)) * dir;
    }
    return (new Date(a.lastModified || 0) - new Date(b.lastModified || 0)) * dir;
  };

  // Folders have no size or mtime of their own, so those sorts fall back to
  // name for them; name/type sorts still honour the chosen direction.
  const folderDir = sort.by === 'name' || sort.by === 'type' ? dir : 1;
  folders.sort((a, b) => byName(a, b) * folderDir);
  files.sort(cmp);

  return { folders, files };
}

export default function DrivePage({ scope }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefix = searchParams.get('path') || '';

  const { data, loading, refresh } = useDriveData(scope, prefix);

  const [view, setView] = usePersistentState('drive.view', 'grid');
  const [sort, setSort] = usePersistentState('drive.sort', { by: 'modified', dir: 'desc' });
  const [detailsOpen, setDetailsOpen] = usePersistentState('drive.details', false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // 'browse' shows the current folder; 'recent' and 'starred' are virtual views.
  // Mobile browsers do not implement `webkitdirectory`, so folder upload is
  // offered only where it can actually work.
  const canUploadFolder = useMediaQuery('(min-width: 640px)');

  const [viewMode, setViewMode] = useState('browse');
  const [recent, setRecent] = useState({ loading: false, files: [] });
  const [filterCat, setFilterCat] = useState(null);

  const selection = useSelection();
  const ctxMenu = useContextMenu();
  const clipboard = useClipboard();
  const starred = useStarred(scope);
  const { usage, loading: usageLoading, error: usageError, refresh: refreshUsage } = useUsage();

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [moveDialog, setMoveDialog] = useState(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [shareKey, setShareKey] = useState(null);
  const [previewState, setPreviewState] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);

  const [batches, setBatches] = useState([]);
  const [searchOverlay, setSearchOverlay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dropOver, setDropOver] = useState(false);
  const [activeSearch, setActiveSearch] = useState(null);
  const [cursorIndex, setCursorIndex] = useState(-1);

  const dragCounter = useRef(0);
  const batchControllers = useRef(new Map());
  const searchBarRef = useRef(null);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const contentRef = useRef(null);

  const anyModalOpen =
    Boolean(previewState) || Boolean(confirm) || Boolean(renameTarget) || Boolean(moveDialog) ||
    Boolean(shareKey) || newFolderOpen || paletteOpen || shortcutsOpen || trashOpen;

  // ─── Data shaping ────────────────────────────────────────────────────────
  const baseData = useMemo(() => {
    if (viewMode === 'recent') return { folders: [], files: recent.files };
    if (viewMode === 'starred') {
      return {
        folders: starred.items.filter((i) => i.kind === 'folder').map((i) => i.item),
        files: starred.items.filter((i) => i.kind === 'file').map((i) => i.item),
      };
    }
    if (activeSearch) return { folders: [], files: activeSearch.results || [] };
    return data;
  }, [viewMode, recent.files, starred.items, activeSearch, data]);

  const sorted = useMemo(() => sortItems(baseData, sort), [baseData, sort]);

  const categoryCounts = useMemo(() => {
    const counts = {};
    if (sorted.folders.length) counts.folder = sorted.folders.length;
    for (const f of sorted.files) {
      const cat = categoryOf(f.mime || '', f.name);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [sorted]);

  const visible = useMemo(() => {
    if (!filterCat) return sorted;
    if (filterCat === 'folder') return { folders: sorted.folders, files: [] };
    return {
      folders: [],
      files: sorted.files.filter((f) => categoryOf(f.mime || '', f.name) === filterCat),
    };
  }, [sorted, filterCat]);

  const allCurrentIds = useMemo(
    () => [...visible.folders.map((f) => `folder:${f.prefix}`), ...visible.files.map((f) => f.key)],
    [visible],
  );

  const idToEntry = useCallback(
    (id) => {
      if (id.startsWith('folder:')) {
        const p = id.slice(7);
        const f = visible.folders.find((x) => x.prefix === p);
        return f ? { kind: 'folder', item: f, id } : null;
      }
      const file = visible.files.find((x) => x.key === id);
      return file ? { kind: 'file', item: file, id } : null;
    },
    [visible],
  );

  const selectionItems = useCallback(
    () => selection.ids.map(idToEntry).filter(Boolean),
    [selection.ids, idToEntry],
  );

  const selectionBytes = useMemo(
    () => selectionItems().reduce((acc, e) => acc + (e.item.size || 0), 0),
    [selectionItems],
  );

  const cursorEntry = useMemo(
    () => (cursorIndex >= 0 ? idToEntry(allCurrentIds[cursorIndex]) : null),
    [cursorIndex, allCurrentIds, idToEntry],
  );

  const detailsTarget = useMemo(() => {
    if (selection.size === 1) return idToEntry(selection.ids[0]);
    if (selection.size === 0 && cursorEntry) return cursorEntry;
    return null;
  }, [selection.size, selection.ids, idToEntry, cursorEntry]);

  const previewableFiles = useMemo(
    () => visible.files.filter((f) => PREVIEWABLE.includes(categoryOf(f.mime || '', f.name))),
    [visible.files],
  );

  // ─── Navigation ──────────────────────────────────────────────────────────
  const navigate = useCallback(
    (newPrefix) => {
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      if (newPrefix) params.set('path', newPrefix);
      else params.delete('path');
      params.delete('q');
      const qs = params.toString();
      router.push(qs ? `?${qs}` : '?');
      setViewMode('browse');
    },
    [router, searchParams],
  );

  const goUp = useCallback(() => {
    if (viewMode !== 'browse') {
      setViewMode('browse');
      return;
    }
    if (!prefix) return;
    navigate(prefix.split('/').slice(0, -1).join('/'));
  }, [prefix, navigate, viewMode]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
      setTreeRefreshKey((k) => k + 1);
      refreshUsage();
      if (viewMode === 'recent') {
        const res = await driveApi.recent(scope, { refresh: true });
        setRecent({ loading: false, files: res.files || [] });
      }
    } finally {
      setRefreshing(false);
    }
  }, [refresh, refreshUsage, viewMode, scope]);

  // Reset transient state whenever the working set changes.
  useEffect(() => {
    selection.clear();
    setCursorIndex(-1);
    setFilterCat(null);
    setActiveSearch(null);
  }, [prefix, scope, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (viewMode !== 'recent') return;
    let cancelled = false;
    setRecent({ loading: true, files: [] });
    driveApi
      .recent(scope)
      .then((res) => !cancelled && setRecent({ loading: false, files: res.files || [] }))
      .catch(() => !cancelled && setRecent({ loading: false, files: [] }));
    // eslint-disable-next-line consistent-return
    return () => {
      cancelled = true;
    };
  }, [viewMode, scope]);

  // ─── Search ──────────────────────────────────────────────────────────────
  const runSearch = useCallback(
    async (q) => {
      try {
        setViewMode('browse');
        const res = await driveApi.search(scope, q);
        setActiveSearch({ q, results: res?.results || [], truncated: res?.truncated });
        selection.clear();
        const params = new URLSearchParams(window.location.search);
        params.set('q', q);
        router.push(`?${params.toString()}`);
      } catch (err) {
        console.error(err);
        toast.error('Search failed');
      }
    },
    [scope, router, selection],
  );

  const clearSearch = useCallback(() => {
    setActiveSearch(null);
    const params = new URLSearchParams(window.location.search);
    params.delete('q');
    router.push(params.toString() ? `?${params.toString()}` : '?');
  }, [router]);

  const focusSearch = useCallback(() => {
    if (window.innerWidth < 768) setSearchOverlay(true);
    else searchBarRef.current?.focus();
  }, []);

  // ─── Transfers ───────────────────────────────────────────────────────────
  const trackBatch = useCallback((id, label) => {
    setBatches((b) => [...b, { id, label, status: 'uploading', percent: 0, indeterminate: true, message: 'Preparing…' }]);
  }, []);

  const patchBatch = useCallback((id, patch) => {
    setBatches((b) => b.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, []);

  const runTransfer = useCallback(
    ({ label, filename, run }) => {
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const controller = new AbortController();
      batchControllers.current.set(id, controller);
      trackBatch(id, label);

      run({
        signal: controller.signal,
        onProgress: ({ loaded, total, percent }) => {
          patchBatch(id, {
            percent: percent ?? 0,
            indeterminate: percent === null,
            message: total
              ? `${formatCompactBytes(loaded)} / ${formatCompactBytes(total)}`
              : `${formatCompactBytes(loaded)} transferred`,
          });
        },
      })
        .then(({ bytes }) => {
          patchBatch(id, { status: 'done', percent: 100, indeterminate: false, message: `Saved ${filename} (${formatCompactBytes(bytes)})` });
        })
        .catch((err) => {
          const cancelled = err?.name === 'AbortError';
          patchBatch(id, {
            status: cancelled ? 'cancelled' : 'error',
            indeterminate: false,
            message: cancelled ? 'Cancelled' : err?.message || 'Transfer failed',
          });
          if (!cancelled) toast.error(err?.message || 'Transfer failed');
        })
        .finally(() => batchControllers.current.delete(id));
    },
    [trackBatch, patchBatch],
  );

  const downloadOne = useCallback(
    (file) => {
      runTransfer({
        label: `Downloading “${file.name}”`,
        filename: file.name,
        run: (opts) => downloadFileWithProgress(scope, file.key, file.name, opts),
      });
    },
    [scope, runTransfer],
  );

  const startZipDownload = useCallback(
    ({ payload, filename, label }) => {
      runTransfer({
        label,
        filename,
        run: (opts) => downloadZipWithProgress(scope, payload, filename, opts),
      });
    },
    [scope, runTransfer],
  );

  const zipFolder = useCallback(
    (folder) => startZipDownload({
      payload: { folderPrefix: folder.prefix },
      filename: `${folder.name}.zip`,
      label: `Zipping “${folder.name}”`,
    }),
    [startZipDownload],
  );

  const zipMultiple = useCallback(
    (items) => {
      const files = items.filter((x) => x.kind === 'file').map((x) => x.item);
      const folders = items.filter((x) => x.kind === 'folder').map((x) => x.item);
      if (!files.length && !folders.length) return;

      // Each folder becomes its own archive so the download keeps its structure;
      // loose files are bundled together.
      for (const folder of folders) zipFolder(folder);
      if (files.length) {
        startZipDownload({
          payload: { keys: files.map((f) => f.key) },
          filename: `files-${Date.now()}.zip`,
          label: `Zipping ${files.length} file${files.length > 1 ? 's' : ''}`,
        });
      }
    },
    [startZipDownload, zipFolder],
  );

  const copyLink = useCallback(async (url) => {
    if (!url) return;
    const ok = await copyToClipboard(url);
    if (ok) toast.success('Link copied');
    else toast.error('Failed to copy');
  }, []);

  // ─── Preview ─────────────────────────────────────────────────────────────
  const openPreview = useCallback(
    (file) => {
      const idx = previewableFiles.findIndex((f) => f.key === file.key);
      if (idx !== -1) {
        setPreviewState({ startIndex: idx });
        return;
      }
      // The file is not part of the current listing (sidebar leaf, palette hit).
      if (PREVIEWABLE.includes(categoryOf(file.mime || '', file.name))) {
        setPreviewState({ startIndex: 0, files: [file] });
        return;
      }
      driveApi.previewUrl(scope, file.key).then(({ url }) => window.open(url, '_blank', 'noopener'));
    },
    [previewableFiles, scope],
  );

  // ─── Trash / delete ──────────────────────────────────────────────────────
  const undoTrash = useCallback(
    async (tokens) => {
      try {
        for (const token of tokens) {
          await driveApi.trash.restore(scope, token);
        }
        toast.success('Restored');
        await refreshAll();
      } catch (err) {
        toast.error(err.message || 'Restore failed');
      }
    },
    [scope, refreshAll],
  );

  const performDelete = useCallback(
    async (items, permanent) => {
      const fileKeys = items.filter((x) => x.kind === 'file').map((x) => x.item.key);
      const folders = items.filter((x) => x.kind === 'folder');
      const tokens = [];

      if (fileKeys.length) {
        const res = await driveApi.deleteKeys(scope, fileKeys, { permanent });
        if (res.trashToken) tokens.push(res.trashToken);
      }
      for (const f of folders) {
        const res = await driveApi.deleteFolder(scope, f.item.prefix, { permanent });
        if (res.trashToken) tokens.push(res.trashToken);
      }

      for (const item of items) starred.remove(item.id);
      selection.clear();
      setCursorIndex(-1);
      await refreshAll();
      return tokens;
    },
    [scope, starred, selection, refreshAll],
  );

  const askDelete = useCallback(
    (items, { permanent = false } = {}) => {
      if (!items.length) return;
      const fileCount = items.filter((x) => x.kind === 'file').length;
      const folderCount = items.filter((x) => x.kind === 'folder').length;
      const parts = [];
      if (folderCount) parts.push(`${folderCount} folder${folderCount > 1 ? 's' : ''}`);
      if (fileCount) parts.push(`${fileCount} file${fileCount > 1 ? 's' : ''}`);
      const what = parts.join(' and ');

      if (!permanent) {
        // Soft delete is reversible, so skip the confirm and offer undo instead.
        setBusy(true);
        performDelete(items, false)
          .then((tokens) => {
            toast.success(
              (t) => (
                <span className="flex items-center gap-3">
                  Moved {what} to trash
                  {tokens.length > 0 && (
                    <button
                      onClick={() => {
                        toast.dismiss(t.id);
                        undoTrash(tokens);
                      }}
                      className="rounded bg-white/15 px-2 py-0.5 text-xs font-medium hover:bg-white/25"
                    >
                      Undo
                    </button>
                  )}
                </span>
              ),
              { duration: 6000 },
            );
          })
          .catch((err) => toast.error(err.message || 'Delete failed'))
          .finally(() => setBusy(false));
        return;
      }

      setConfirm({
        title: 'Delete permanently?',
        message: `${what} will be erased from R2 immediately.\n\nThis cannot be undone.`,
        danger: true,
        confirmLabel: 'Delete forever',
        action: async () => {
          setConfirmBusy(true);
          try {
            await performDelete(items, true);
            toast.success('Deleted permanently');
            setConfirm(null);
          } catch (err) {
            toast.error(err.message || 'Delete failed');
          } finally {
            setConfirmBusy(false);
          }
        },
      });
    },
    [performDelete, undoTrash],
  );

  // ─── Clipboard ───────────────────────────────────────────────────────────
  const doClipCopy = useCallback(
    (items) => {
      const list = items || selectionItems();
      if (!list.length) return;
      clipboard.copy(list, prefix);
      toast.success(`Copied ${list.length} item${list.length > 1 ? 's' : ''}`);
    },
    [clipboard, selectionItems, prefix],
  );

  const doClipCut = useCallback(
    (items) => {
      const list = items || selectionItems();
      if (!list.length) return;
      clipboard.cut(list, prefix);
      toast.success(`Cut ${list.length} item${list.length > 1 ? 's' : ''}`);
    },
    [clipboard, selectionItems, prefix],
  );

  const doPaste = useCallback(
    async (destPrefix = prefix) => {
      const load = clipboard.payload();
      if (!load) return;
      if (load.mode === 'move' && load.sourcePrefix === destPrefix) {
        clipboard.clear();
        return;
      }

      setBusy(true);
      try {
        const args = { keys: load.keys, prefixes: load.prefixes, destPrefix };
        if (load.mode === 'cut') await driveApi.move(scope, args);
        else await driveApi.copy(scope, args);
        toast.success(load.mode === 'cut' ? 'Moved' : 'Copied');
        if (load.mode === 'cut') clipboard.clear();
        await refreshAll();
      } catch (err) {
        toast.error(err.message || 'Paste failed');
      } finally {
        setBusy(false);
      }
    },
    [clipboard, prefix, scope, refreshAll],
  );

  // ─── Drag and drop between items ─────────────────────────────────────────
  const onDragStartItem = useCallback(
    (e, entry) => {
      // Dragging an unselected item operates on that item alone.
      const list = selection.isSelected(entry.id) ? selectionItems() : [entry];
      const payload = {
        keys: list.filter((x) => x.kind === 'file').map((x) => x.item.key),
        prefixes: list.filter((x) => x.kind === 'folder').map((x) => x.item.prefix),
        count: list.length,
      };
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
      e.dataTransfer.effectAllowed = 'move';
    },
    [selection, selectionItems],
  );

  const onDropIntoFolder = useCallback(
    async (destPrefix, payload) => {
      if (!payload || (!payload.keys?.length && !payload.prefixes?.length)) return;
      // Dropping a folder on itself or its own parent is a no-op, not an error.
      if (payload.prefixes?.some((p) => p === destPrefix || destPrefix.startsWith(`${p}/`))) {
        toast.error('Cannot move a folder into itself');
        return;
      }

      setBusy(true);
      try {
        await driveApi.move(scope, { keys: payload.keys || [], prefixes: payload.prefixes || [], destPrefix });
        toast.success(`Moved ${payload.count || ''} to /${destPrefix || ''}`.replace('  ', ' '));
        selection.clear();
        await refreshAll();
      } catch (err) {
        toast.error(err.message || 'Move failed');
      } finally {
        setBusy(false);
      }
    },
    [scope, selection, refreshAll],
  );

  // ─── Upload ──────────────────────────────────────────────────────────────
  const handleUpload = useCallback(
    async (entries, label) => {
      if (!entries.length) return;
      const id = `up-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const controller = new AbortController();
      batchControllers.current.set(id, controller);
      setBatches((b) => [...b, { id, label, status: 'uploading', percent: 0 }]);
      try {
        await uploadEntries({
          scope,
          prefix,
          entries,
          signal: controller.signal,
          onProgress: ({ percent }) => patchBatch(id, { percent }),
        });
        patchBatch(id, { status: 'done', percent: 100 });
        await refreshAll();
      } catch (err) {
        const cancelled = err?.name === 'AbortError';
        patchBatch(id, { status: cancelled ? 'cancelled' : 'error', message: cancelled ? 'Cancelled' : err.message });
        if (!cancelled) toast.error(err.message || 'Upload failed');
        else toast('Upload cancelled');
      } finally {
        batchControllers.current.delete(id);
      }
    },
    [scope, prefix, refreshAll, patchBatch],
  );

  const cancelBatch = useCallback((id) => batchControllers.current.get(id)?.abort(), []);

  const onUploadFiles = useCallback(
    (fileList) => {
      const entries = Array.from(fileList).map((file) => ({ file, relativePath: file.name }));
      handleUpload(entries, `Uploading ${entries.length} file${entries.length > 1 ? 's' : ''}`);
    },
    [handleUpload],
  );

  const onUploadFolder = useCallback(
    (fileList) => {
      const entries = fileListToEntries(fileList);
      const folderName = entries[0]?.relativePath?.split('/')[0] || 'folder';
      handleUpload(entries, `Uploading folder “${folderName}” (${entries.length} files)`);
    },
    [handleUpload],
  );

  // ─── Page-level file drop ────────────────────────────────────────────────
  const onDragEnter = (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    dragCounter.current += 1;
    setDropOver(true);
  };
  const onDragLeave = (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDropOver(false);
    }
  };
  const onDragOver = (e) => {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };
  const onDrop = (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    setDropOver(false);
    dragCounter.current = 0;
    // Snapshot synchronously — the DataTransferItemList is invalidated once the
    // event dispatch returns.
    const items = e.dataTransfer.items;
    if (items?.length) {
      const snap = snapshotDataTransferEntries(items);
      walkSnapshot(snap).then((entries) => {
        if (entries.length) handleUpload(entries, `Uploading ${entries.length} item${entries.length > 1 ? 's' : ''}`);
      });
    } else if (e.dataTransfer.files?.length) {
      onUploadFiles(e.dataTransfer.files);
    }
  };

  // ─── Stars ───────────────────────────────────────────────────────────────
  const toggleStar = useCallback(
    (entry) => {
      if (!entry) return;
      const added = starred.toggle({ id: entry.id, kind: entry.kind, item: entry.item });
      toast.success(added ? `Starred “${entry.item.name}”` : `Removed star from “${entry.item.name}”`);
    },
    [starred],
  );

  // ─── Cursor movement ─────────────────────────────────────────────────────
  const gridColumns = useCallback(() => {
    if (view !== 'grid') return 1;
    const grid = contentRef.current?.querySelector('[data-grid]');
    if (!grid) return 1;
    const cols = window.getComputedStyle(grid).gridTemplateColumns;
    return Math.max(1, cols.split(' ').filter(Boolean).length);
  }, [view]);

  const moveCursor = useCallback(
    (delta, { extend = false } = {}) => {
      if (allCurrentIds.length === 0) return;
      const from = cursorIndex < 0 ? (delta > 0 ? -1 : allCurrentIds.length) : cursorIndex;
      const next = Math.max(0, Math.min(allCurrentIds.length - 1, from + delta));
      setCursorIndex(next);

      const id = allCurrentIds[next];
      if (extend) selection.click(id, next, allCurrentIds, { shiftKey: true });
      else selection.setOnly(id);

      contentRef.current
        ?.querySelector(`[data-item-index="${next}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    },
    [allCurrentIds, cursorIndex, selection],
  );

  const jumpCursor = useCallback(
    (target) => {
      if (allCurrentIds.length === 0) return;
      const next = target === 'first' ? 0 : allCurrentIds.length - 1;
      setCursorIndex(next);
      selection.setOnly(allCurrentIds[next]);
    },
    [allCurrentIds, selection],
  );

  // ─── Item handlers ───────────────────────────────────────────────────────
  const onItemClick = ({ id, index, ids, e }) => {
    setCursorIndex(index);
    selection.click(id, index, ids, e);
  };

  const onItemOpen = ({ kind, item }) => {
    if (kind === 'folder') navigate(item.prefix);
    else openPreview(item);
  };

  const onItemContext = ({ e, kind, item, id }) => {
    if (!selection.isSelected(id)) selection.setOnly(id);
    ctxMenu.open(e, { kind, item, id });
  };

  const openCursorItem = useCallback(() => {
    const entry = cursorEntry || (selection.size === 1 ? idToEntry(selection.ids[0]) : null);
    if (entry) onItemOpen(entry);
  }, [cursorEntry, selection.size, selection.ids, idToEntry]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Context menu contents ───────────────────────────────────────────────
  const contextItems = useCallback(
    (target) => {
      const sel = selection.ids;
      const isSelected = target ? sel.includes(target.id) : false;
      const operatingIds = isSelected && sel.length > 1 ? sel : target ? [target.id] : sel;
      const operating = operatingIds.map(idToEntry).filter(Boolean);
      const single = operating.length === 1 ? operating[0] : null;
      const items = [];

      if (single?.kind === 'file') {
        items.push({ label: 'Preview', icon: <Eye size={14} />, shortcut: shortcutLabel('open'), onClick: () => openPreview(single.item) });
        items.push({ label: 'Download', icon: <Download size={14} />, shortcut: shortcutLabel('download'), onClick: () => downloadOne(single.item) });
        if (single.item.url) {
          items.push({ label: 'Copy link', icon: <LinkIcon size={14} />, shortcut: shortcutLabel('copyLink'), onClick: () => copyLink(single.item.url) });
        }
        if (scope === 'private') {
          items.push({ label: 'Share (pre-signed)', icon: <Share2 size={14} />, onClick: () => setShareKey(single.item.key) });
        }
        items.push({ label: 'Copy object key', icon: <Copy size={14} />, onClick: () => copyLink(single.item.key) });
      }

      if (single?.kind === 'folder') {
        items.push({ label: 'Open', icon: <FolderOpen size={14} />, shortcut: shortcutLabel('open'), onClick: () => navigate(single.item.prefix) });
        items.push({ label: 'Download as ZIP', icon: <Archive size={14} />, onClick: () => zipFolder(single.item) });
      }

      if (operating.length > 1) {
        items.push({ label: `Download ${operating.length} as ZIP`, icon: <Archive size={14} />, onClick: () => zipMultiple(operating) });
      }

      if (single) {
        items.push({ divider: true });
        items.push({
          label: starred.isStarred(single.id) ? 'Remove star' : 'Star',
          icon: <Star size={14} />,
          shortcut: shortcutLabel('star'),
          onClick: () => toggleStar(single),
        });
        items.push({ label: 'Rename', icon: <Pencil size={14} />, shortcut: shortcutLabel('rename'), onClick: () => setRenameTarget(single) });
        items.push({ label: 'Details', icon: <Info size={14} />, shortcut: shortcutLabel('toggleDetails'), onClick: () => setDetailsOpen(true) });
      }

      if (operating.length >= 1) {
        items.push({ divider: true });
        items.push({ label: 'Cut', icon: <Scissors size={14} />, shortcut: shortcutLabel('clipCut'), onClick: () => doClipCut(operating) });
        items.push({ label: 'Copy', icon: <Copy size={14} />, shortcut: shortcutLabel('clipCopy'), onClick: () => doClipCopy(operating) });
        items.push({ label: 'Move to…', icon: <Move size={14} />, onClick: () => setMoveDialog({ mode: 'move', items: operating }) });
        items.push({ label: 'Copy to…', icon: <Copy size={14} />, onClick: () => setMoveDialog({ mode: 'copy', items: operating }) });
      }

      if (clipboard.has && viewMode === 'browse' && !activeSearch) {
        items.push({ label: `Paste here (${clipboard.payload()?.count || 0})`, icon: <ClipboardPaste size={14} />, shortcut: shortcutLabel('clipPaste'), onClick: () => doPaste() });
      }

      if (operating.length >= 1) {
        items.push({ divider: true });
        items.push({ label: 'Move to trash', icon: <Trash2 size={14} />, shortcut: shortcutLabel('trash'), onClick: () => askDelete(operating) });
        items.push({ label: 'Delete permanently', icon: <ShieldAlert size={14} />, danger: true, shortcut: shortcutLabel('purge'), onClick: () => askDelete(operating, { permanent: true }) });
      }

      return items;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selection.ids, idToEntry, scope, navigate, starred, clipboard.clip, viewMode, activeSearch],
  );

  // ─── Command palette entries ─────────────────────────────────────────────
  const commands = useMemo(
    () => [
      { id: 'cmd-upload-files', label: 'Upload files', keywords: 'add new', icon: <Upload size={15} />, shortcut: shortcutLabel('uploadFiles'), run: () => fileInputRef.current?.click() },
      { id: 'cmd-upload-folder', label: 'Upload folder', keywords: 'directory add', icon: <FolderUp size={15} />, shortcut: shortcutLabel('uploadFolder'), hidden: !canUploadFolder, run: () => folderInputRef.current?.click() },
      { id: 'cmd-new-folder', label: 'New folder', keywords: 'create mkdir', icon: <FolderPlus size={15} />, shortcut: shortcutLabel('newFolder'), run: () => setNewFolderOpen(true) },
      { id: 'cmd-refresh', label: 'Refresh listing', keywords: 'reload sync', icon: <RefreshCw size={15} />, shortcut: shortcutLabel('refresh'), run: refreshAll },
      { id: 'cmd-view', label: view === 'grid' ? 'Switch to list view' : 'Switch to grid view', keywords: 'layout toggle', icon: view === 'grid' ? <List size={15} /> : <LayoutGrid size={15} />, shortcut: shortcutLabel('toggleView'), run: () => setView(view === 'grid' ? 'list' : 'grid') },
      { id: 'cmd-details', label: detailsOpen ? 'Hide details panel' : 'Show details panel', keywords: 'info sidebar', icon: <PanelRight size={15} />, shortcut: shortcutLabel('toggleDetails'), run: () => setDetailsOpen(!detailsOpen) },
      { id: 'cmd-recent', label: 'Go to Recent', keywords: 'latest new', icon: <Clock size={15} />, run: () => setViewMode('recent') },
      { id: 'cmd-starred', label: 'Go to Starred', keywords: 'favourites bookmarks', icon: <Star size={15} />, run: () => setViewMode('starred') },
      { id: 'cmd-home', label: 'Go to drive root', keywords: 'home top', icon: <Files size={15} />, shortcut: shortcutLabel('goHome'), run: () => navigate('') },
      { id: 'cmd-trash', label: 'Open trash', keywords: 'deleted bin restore', icon: <Trash2 size={15} />, run: () => setTrashOpen(true) },
      { id: 'cmd-paste', label: 'Paste here', keywords: 'clipboard move copy', icon: <ClipboardPaste size={15} />, shortcut: shortcutLabel('clipPaste'), hidden: !clipboard.has, run: () => doPaste() },
      { id: 'cmd-zip', label: 'Download selection as ZIP', keywords: 'archive export', icon: <Archive size={15} />, hidden: selection.size === 0, run: () => zipMultiple(selectionItems()) },
      { id: 'cmd-trash-sel', label: 'Move selection to trash', keywords: 'delete remove', icon: <Trash2 size={15} />, hidden: selection.size === 0, shortcut: shortcutLabel('trash'), run: () => askDelete(selectionItems()) },
      { id: 'cmd-shortcuts', label: 'Keyboard shortcuts', keywords: 'help keys', icon: <Keyboard size={15} />, shortcut: shortcutLabel('help'), run: () => setShortcutsOpen(true) },
      { id: 'cmd-switch', label: scope === 'public' ? 'Switch to private drive' : 'Switch to public drive', keywords: 'scope bucket', icon: <Files size={15} />, run: () => router.push(scope === 'public' ? '/upload/private' : '/upload/public') },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, detailsOpen, clipboard.has, selection.size, scope, canUploadFolder, refreshAll, navigate, router],
  );

  // ─── Keyboard ────────────────────────────────────────────────────────────
  useKeyboardShortcuts(
    {
      palette: () => setPaletteOpen((v) => !v),
      help: () => setShortcutsOpen((v) => !v),
      helpAlt: () => setShortcutsOpen((v) => !v),
      search: focusSearch,
      searchAlt: focusSearch,
      refresh: refreshAll,
      toggleSidebar: () => setSidebarOpen((v) => !v),
      toggleView: () => setView(view === 'grid' ? 'list' : 'grid'),
      toggleDetails: () => setDetailsOpen(!detailsOpen),

      cursorDown: () => moveCursor(view === 'grid' ? gridColumns() : 1),
      cursorUp: () => moveCursor(view === 'grid' ? -gridColumns() : -1),
      cursorRight: () => moveCursor(1),
      cursorLeft: () => moveCursor(-1),
      cursorFirst: () => jumpCursor('first'),
      cursorLast: () => jumpCursor('last'),
      open: openCursorItem,
      goUp: goUp,
      goHome: () => navigate(''),

      selectAll: () => selection.setAll(allCurrentIds),
      toggleSelect: () => {
        if (cursorIndex >= 0) selection.toggle(allCurrentIds[cursorIndex]);
      },
      extendDown: () => moveCursor(view === 'grid' ? gridColumns() : 1, { extend: true }),
      extendUp: () => moveCursor(view === 'grid' ? -gridColumns() : -1, { extend: true }),
      clear: () => {
        if (activeSearch) clearSearch();
        selection.clear();
        ctxMenu.close();
        setCursorIndex(-1);
      },

      newFolder: () => setNewFolderOpen(true),
      uploadFiles: () => fileInputRef.current?.click(),
      uploadFolder: () => folderInputRef.current?.click(),
      rename: () => {
        const entry = detailsTarget;
        if (entry) setRenameTarget(entry);
      },
      download: () => {
        const items = selectionItems();
        if (items.length === 1 && items[0].kind === 'file') downloadOne(items[0].item);
        else if (items.length) zipMultiple(items);
      },
      star: () => toggleStar(detailsTarget),
      copyLink: () => {
        const entry = detailsTarget;
        if (entry?.kind === 'file' && entry.item.url) copyLink(entry.item.url);
        else toast.error('No public link for this item');
      },
      clipCopy: () => doClipCopy(),
      clipCut: () => doClipCut(),
      clipPaste: () => doPaste(),
      trash: () => askDelete(selectionItems()),
      trashAlt: () => askDelete(selectionItems()),
      purge: () => askDelete(selectionItems(), { permanent: true }),
    },
    { enabled: !anyModalOpen },
  );

  // The palette owns ⌘K while it is open, so it stays bound even then.
  useKeyboardShortcuts(
    { palette: () => setPaletteOpen((v) => !v) },
    { enabled: paletteOpen },
  );

  // ─── Dialog submits ──────────────────────────────────────────────────────
  const submitNewFolder = async (name) => {
    setCreatingFolder(true);
    try {
      await driveApi.createFolder(scope, prefix, name);
      toast.success('Folder created');
      setNewFolderOpen(false);
      await refreshAll();
    } catch (err) {
      toast.error(err.message || 'Failed');
    } finally {
      setCreatingFolder(false);
    }
  };

  const submitRename = async (newName) => {
    if (!renameTarget) return;
    setRenaming(true);
    try {
      const payload = renameTarget.kind === 'folder'
        ? { prefix: renameTarget.item.prefix, newName }
        : { key: renameTarget.item.key, newName };
      await driveApi.rename(scope, payload);
      // The key changed, so any star pointing at the old one is dead.
      starred.remove(renameTarget.id);
      toast.success('Renamed');
      setRenameTarget(null);
      await refreshAll();
    } catch (err) {
      toast.error(err.message || 'Rename failed');
    } finally {
      setRenaming(false);
    }
  };

  const submitMoveCopy = async (destPrefix) => {
    if (!moveDialog) return;
    setMoveBusy(true);
    try {
      const keys = moveDialog.items.filter((x) => x.kind === 'file').map((x) => x.item.key);
      const prefixes = moveDialog.items.filter((x) => x.kind === 'folder').map((x) => x.item.prefix);
      const args = { keys, prefixes, destPrefix };

      if (moveDialog.mode === 'move') await driveApi.move(scope, args);
      else await driveApi.copy(scope, args);

      if (moveDialog.mode === 'move') for (const item of moveDialog.items) starred.remove(item.id);
      toast.success(moveDialog.mode === 'move' ? 'Moved' : 'Copied');
      setMoveDialog(null);
      selection.clear();
      await refreshAll();
    } catch (err) {
      toast.error(err.message || 'Failed');
    } finally {
      setMoveBusy(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  const isEmpty = visible.folders.length === 0 && visible.files.length === 0;
  const isLoading = viewMode === 'recent' ? recent.loading : viewMode === 'browse' && loading;

  const gridProps = {
    folders: visible.folders,
    files: visible.files,
    selection,
    cursorIndex,
    onItemClick,
    onItemOpen,
    onItemContext,
    onDragStartItem,
    onDropIntoFolder,
    onToggleStar: toggleStar,
    isStarred: starred.isStarred,
    isCut: clipboard.isCut,
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-base text-ink">
      <Navbar onShowShortcuts={() => setShortcutsOpen(true)} />

      <div
        className="relative flex min-h-0 flex-1"
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <div className="hidden md:block">
          <Sidebar
            scope={scope}
            currentPrefix={prefix}
            view={viewMode}
            onNavigate={navigate}
            onSetView={setViewMode}
            onFileOpen={openPreview}
            onOpenTrash={() => setTrashOpen(true)}
            onDropItems={onDropIntoFolder}
            refreshKey={treeRefreshKey}
            starredCount={starred.count}
            usage={usage}
            usageLoading={usageLoading}
            usageError={usageError}
            onRefreshUsage={refreshUsage}
          />
        </div>

        {sidebarOpen && (
          // Above the selection bar (z-40) and upload toasts (z-50), below modals.
          <div className="fixed inset-0 z-[55] flex md:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
            <div className="relative">
              <Sidebar
                scope={scope}
                currentPrefix={prefix}
                view={viewMode}
                onNavigate={(p) => {
                  navigate(p);
                  setSidebarOpen(false);
                }}
                onSetView={(v) => {
                  setViewMode(v);
                  setSidebarOpen(false);
                }}
                onFileOpen={(file) => {
                  openPreview(file);
                  setSidebarOpen(false);
                }}
                onOpenTrash={() => {
                  setTrashOpen(true);
                  setSidebarOpen(false);
                }}
                onDropItems={onDropIntoFolder}
                refreshKey={treeRefreshKey}
                onClose={() => setSidebarOpen(false)}
                starredCount={starred.count}
                usage={usage}
                usageLoading={usageLoading}
                usageError={usageError}
                onRefreshUsage={refreshUsage}
              />
            </div>
          </div>
        )}

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-col gap-2 border-b border-line bg-base px-3 pb-2 pt-3 sm:gap-3 sm:px-6 sm:pb-3 sm:pt-4">
            <div className="hidden items-center gap-3 md:flex">
              <SearchBar
                ref={searchBarRef}
                scope={scope}
                prefix={prefix}
                onSubmit={({ q }) => runSearch(q)}
                onClearActive={clearSearch}
                activeQuery={activeSearch?.q}
              />
              <div className="flex-1" />
              {clipboard.has && (
                <button
                  onClick={() => doPaste()}
                  className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent/20"
                  title={`Paste ${clipboard.payload()?.count} item(s) here`}
                >
                  <ClipboardPaste size={13} />
                  Paste {clipboard.payload()?.count}
                  <span className="kbd">{MOD_LABEL} V</span>
                </button>
              )}
            </div>

            <Toolbar
              view={view}
              setView={setView}
              sort={sort}
              setSort={setSort}
              onNewFolder={() => setNewFolderOpen(true)}
              onUploadFiles={onUploadFiles}
              onUploadFolder={onUploadFolder}
              onOpenSearch={() => setSearchOverlay(true)}
              onOpenPalette={() => setPaletteOpen(true)}
              onToggleSidebar={() => setSidebarOpen(true)}
              onRefresh={refreshAll}
              refreshing={refreshing}
              onToggleDetails={() => setDetailsOpen(!detailsOpen)}
              detailsOpen={detailsOpen}
              fileInputRef={fileInputRef}
              folderInputRef={folderInputRef}
              disabled={viewMode !== 'browse'}
            />

            {viewMode !== 'browse' ? (
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                {viewMode === 'recent' ? <Clock size={14} className="text-accent" /> : <Star size={14} className="text-amber-300" />}
                <span className="font-medium capitalize">{viewMode}</span>
                <span className="text-ink-faint">
                  {viewMode === 'recent' ? 'Most recently modified files across this drive' : 'Items you starred, stored on this device'}
                </span>
                <div className="flex-1" />
                <button onClick={() => setViewMode('browse')} className="btn-neutral-small">
                  Back to files
                </button>
              </div>
            ) : activeSearch ? (
              <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">
                <span className="truncate font-medium">
                  Results for “{activeSearch.q}”: {sorted.files.length}
                  {activeSearch.truncated ? '+' : ''}
                </span>
                <div className="flex-1" />
                <button onClick={clearSearch} className="btn-neutral-small">
                  Clear search
                </button>
              </div>
            ) : (
              <Breadcrumbs scope={scope} prefix={prefix} onNavigate={navigate} onDropItems={onDropIntoFolder} />
            )}

            <FilterBar counts={categoryCounts} active={filterCat} onChange={setFilterCat} />
          </div>

          <div ref={contentRef} className="custom-scrollbar flex-1 overflow-y-auto p-3 pb-32 sm:p-6">
            {isLoading ? (
              view === 'grid' ? <GridSkeleton /> : <ListSkeleton />
            ) : isEmpty ? (
              <EmptyState
                viewMode={viewMode}
                filterCat={filterCat}
                onClearFilter={() => setFilterCat(null)}
                activeSearch={activeSearch}
                onClearSearch={clearSearch}
                onUpload={() => fileInputRef.current?.click()}
              />
            ) : view === 'grid' ? (
              <FileGrid {...gridProps} />
            ) : (
              <FileList {...gridProps} />
            )}
          </div>
        </main>

        <DetailsPanel
          open={detailsOpen}
          scope={scope}
          target={detailsTarget}
          selectionCount={selection.size}
          selectionBytes={selectionBytes}
          onClose={() => setDetailsOpen(false)}
          onPreview={openPreview}
          onDownload={downloadOne}
          onRename={setRenameTarget}
          onCopyLink={copyLink}
          onToggleStar={toggleStar}
          isStarred={detailsTarget ? starred.isStarred(detailsTarget.id) : false}
        />

        {dropOver && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center border-4 border-dashed border-accent/60 bg-accent/10">
            <div className="glass rounded-2xl px-6 py-4 font-medium text-accent">
              Drop to upload to <span className="text-ink">/{prefix || ''}</span>
            </div>
          </div>
        )}
      </div>

      {searchOverlay && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80 p-4 md:hidden" onClick={() => setSearchOverlay(false)}>
          <div onClick={(e) => e.stopPropagation()} className="glass rounded-xl p-3">
            <SearchBar
              scope={scope}
              prefix={prefix}
              onSubmit={({ q }) => {
                runSearch(q);
                setSearchOverlay(false);
              }}
              onClearActive={clearSearch}
              activeQuery={activeSearch?.q}
              autoFocus
            />
            <button onClick={() => setSearchOverlay(false)} className="btn-neutral mt-2 w-full">
              Close
            </button>
          </div>
        </div>
      )}

      <SelectionBar
        // The mobile drawer overlays the same corner; showing both is noise.
        count={sidebarOpen ? 0 : selection.size}
        totalCount={allCurrentIds.length}
        bytes={selectionBytes}
        onClear={selection.clear}
        onSelectAll={() => selection.setAll(allCurrentIds)}
        busy={busy}
        onDelete={() => askDelete(selectionItems())}
        onMove={() => setMoveDialog({ mode: 'move', items: selectionItems() })}
        onCopy={() => setMoveDialog({ mode: 'copy', items: selectionItems() })}
        onCut={() => doClipCut()}
        onClipboardCopy={() => doClipCopy()}
        onStar={() => selectionItems().forEach((e) => starred.toggle({ id: e.id, kind: e.kind, item: e.item }))}
        onDownloadZip={() => zipMultiple(selectionItems())}
      />

      <ContextMenu menu={ctxMenu.menu} items={ctxMenu.menu ? contextItems(ctxMenu.menu.target) : []} onClose={ctxMenu.close} />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        scope={scope}
        commands={commands}
        folders={visible.folders}
        onNavigate={navigate}
        onOpenFile={openPreview}
      />

      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <TrashDialog
        open={trashOpen}
        scope={scope}
        onClose={() => setTrashOpen(false)}
        onChanged={refreshAll}
      />

      <NewFolderModal open={newFolderOpen} onClose={() => setNewFolderOpen(false)} onSubmit={submitNewFolder} busy={creatingFolder} />

      <RenameDialog
        open={Boolean(renameTarget)}
        initialName={renameTarget?.item?.name || ''}
        title={renameTarget?.kind === 'folder' ? 'Rename folder' : 'Rename file'}
        onClose={() => setRenameTarget(null)}
        onSubmit={submitRename}
        busy={renaming}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm?.action()}
        busy={confirmBusy}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        danger={confirm?.danger}
      />

      <MoveCopyDialog
        open={Boolean(moveDialog)}
        scope={scope}
        mode={moveDialog?.mode}
        sourcePrefixes={moveDialog?.items?.filter((x) => x.kind === 'folder').map((x) => x.item.prefix) || []}
        onClose={() => setMoveDialog(null)}
        onSubmit={submitMoveCopy}
        busy={moveBusy}
      />

      {scope === 'private' && <ShareDialog open={Boolean(shareKey)} fileKey={shareKey} onClose={() => setShareKey(null)} />}

      {previewState && (
        <PreviewModal
          scope={scope}
          files={previewState.files || previewableFiles}
          startIndex={previewState.startIndex}
          onClose={() => setPreviewState(null)}
          onDownload={downloadOne}
          onCopyLink={copyLink}
          onToggleStar={(file) => toggleStar({ id: file.key, kind: 'file', item: file })}
          isStarred={(file) => starred.isStarred(file.key)}
        />
      )}

      <UploadProgress
        batches={batches}
        onDismiss={(id) => setBatches((b) => b.filter((x) => x.id !== id))}
        onCancel={cancelBatch}
        lift={selection.size > 0}
      />
    </div>
  );
}

function EmptyState({ viewMode, filterCat, onClearFilter, activeSearch, onClearSearch, onUpload }) {
  if (filterCat) {
    return (
      <Empty title="Nothing matches this filter" hint="Try a different file type.">
        <button onClick={onClearFilter} className="btn-neutral mt-4">Clear filter</button>
      </Empty>
    );
  }
  if (activeSearch) {
    return (
      <Empty title={`No matches for “${activeSearch.q}”`} hint="Try a different keyword.">
        <button onClick={onClearSearch} className="btn-neutral mt-4">Clear search</button>
      </Empty>
    );
  }
  if (viewMode === 'starred') {
    return <Empty title="No starred items" hint="Star a file or folder to pin it here. Stars are kept on this device." />;
  }
  if (viewMode === 'recent') {
    return <Empty title="Nothing here yet" hint="Recently modified files will appear here once you upload something." />;
  }
  return (
    <Empty title="This folder is empty" hint="Drag files anywhere on this page, or use the button below.">
      <button onClick={onUpload} className="btn-neutral mt-4 flex items-center gap-2">
        <Upload size={15} /> Upload files
      </button>
    </Empty>
  );
}

function Empty({ title, hint, children }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center text-ink-muted">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-surface">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-ink-faint">
          <path d="M3 7.8C3 6.12 3 5.28 3.327 4.638a3 3 0 0 1 1.311-1.311C5.28 3 6.12 3 7.8 3h1.6l2 2H16.2c1.68 0 2.52 0 3.162.327a3 3 0 0 1 1.311 1.311C21 7.28 21 8.12 21 9.8V14.2c0 1.68 0 2.52-.327 3.162a3 3 0 0 1-1.311 1.311C18.72 19 17.88 19 16.2 19H7.8c-1.68 0-2.52 0-3.162-.327a3 3 0 0 1-1.311-1.311C3 16.72 3 15.88 3 14.2z" />
        </svg>
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-xs text-xs">{hint}</p>
      {children}
    </div>
  );
}
