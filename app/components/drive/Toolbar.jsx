'use client';

import { motion } from 'framer-motion';
import {
  FolderPlus, Upload, FolderUp, LayoutGrid, List, ArrowUpDown, Menu, Search,
  RefreshCw, PanelRight, Command,
} from 'lucide-react';
import { MOD_LABEL } from '@/app/lib/shortcuts';

const tap = { whileTap: { scale: 0.96 }, whileHover: { y: -1 } };

const SORT_OPTIONS = [
  { value: 'modified:desc', label: 'Newest first' },
  { value: 'modified:asc', label: 'Oldest first' },
  { value: 'name:asc', label: 'Name A → Z' },
  { value: 'name:desc', label: 'Name Z → A' },
  { value: 'size:desc', label: 'Size large → small' },
  { value: 'size:asc', label: 'Size small → large' },
  { value: 'type:asc', label: 'Type A → Z' },
];

export default function Toolbar({
  view,
  setView,
  sort,
  setSort,
  onNewFolder,
  onUploadFiles,
  onUploadFolder,
  onOpenSearch,
  onOpenPalette,
  onToggleSidebar,
  onRefresh,
  refreshing,
  onToggleDetails,
  detailsOpen,
  fileInputRef,
  folderInputRef,
  disabled = false,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <motion.button
        {...tap}
        onClick={onToggleSidebar}
        className="rounded-lg bg-raised p-2 transition-colors hover:bg-hover md:hidden"
        aria-label="Toggle sidebar"
      >
        <Menu size={18} />
      </motion.button>

      <motion.button {...tap} onClick={onNewFolder} disabled={disabled} className="btn-neutral flex items-center gap-2" title="New folder (N)">
        <FolderPlus size={16} /> <span className="hidden sm:inline">New folder</span>
      </motion.button>

      <motion.button
        {...tap}
        onClick={() => fileInputRef?.current?.click()}
        disabled={disabled}
        className="btn-neutral flex items-center gap-2"
        title="Upload files (U)"
      >
        <Upload size={16} /> <span className="hidden sm:inline">Upload files</span>
      </motion.button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onUploadFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Hidden on phones: `webkitdirectory` is not implemented by mobile
          Safari or Android Chrome, so the picker would open with no way to
          choose a folder. */}
      <motion.button
        {...tap}
        onClick={() => folderInputRef?.current?.click()}
        disabled={disabled}
        className="btn-neutral hidden items-center gap-2 sm:flex"
        title="Upload folder (Shift+U)"
      >
        <FolderUp size={16} /> <span className="hidden sm:inline">Upload folder</span>
      </motion.button>
      <input
        ref={folderInputRef}
        type="file"
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onUploadFolder(e.target.files);
          e.target.value = '';
        }}
      />

      {/* On phones this group wraps to its own line; stretching it stops the
          row from ending in a dead gap. */}
      <div className="flex w-full items-center justify-end gap-2 sm:ml-auto sm:w-auto">
        {/* Command palette. Touch devices have no ⌘K, so the button is the only
            way in there — icon-only, and distinct from the search magnifier. */}
        <motion.button
          {...tap}
          onClick={onOpenPalette}
          className="flex items-center gap-2 rounded-lg border border-line bg-raised px-2.5 py-2 text-xs text-ink-faint transition-colors hover:bg-hover hover:text-ink"
          title="Command palette"
          aria-label="Command palette"
        >
          <Command size={15} className="lg:hidden" />
          <Search size={13} className="hidden lg:block" />
          <span className="kbd hidden lg:inline">{MOD_LABEL} K</span>
        </motion.button>

        <motion.button {...tap} onClick={onOpenSearch} className="btn-neutral flex items-center gap-2 md:hidden" aria-label="Search this drive">
          <Search size={16} />
        </motion.button>

        <motion.button
          {...tap}
          onClick={onRefresh}
          className="rounded-lg border border-line bg-raised p-2 text-ink-muted transition-colors hover:bg-hover hover:text-ink"
          title="Refresh (R)"
          aria-label="Refresh"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
        </motion.button>

        <div className="relative hidden items-center rounded-lg border border-line bg-surface p-0.5 sm:flex">
          {['grid', 'list'].map((mode) => (
            <button
              key={mode}
              onClick={() => setView(mode)}
              className={`relative rounded-md px-2 py-1.5 transition-colors ${
                view === mode ? 'text-ink' : 'text-ink-faint hover:text-ink-muted'
              }`}
              aria-label={`${mode} view`}
              aria-pressed={view === mode}
            >
              {view === mode && (
                <motion.span
                  layoutId="viewModeIndicator"
                  className="absolute inset-0 rounded-md bg-raised shadow-sm ring-1 ring-white/5"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 inline-flex">
                {mode === 'grid' ? <LayoutGrid size={15} /> : <List size={15} />}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={onToggleDetails}
          className={`hidden rounded-lg border p-2 transition-colors lg:block ${
            detailsOpen
              ? 'border-accent/40 bg-accent/15 text-accent'
              : 'border-line bg-raised text-ink-muted hover:bg-hover hover:text-ink'
          }`}
          title="Details panel (I)"
          aria-label="Toggle details panel"
          aria-pressed={detailsOpen}
        >
          <PanelRight size={15} />
        </button>

        <div className="relative min-w-0 flex-1 sm:flex-none">
          <select
            value={`${sort.by}:${sort.dir}`}
            onChange={(e) => {
              const [by, dir] = e.target.value.split(':');
              setSort({ by, dir });
            }}
            className="custom-input w-full appearance-none pl-3 pr-9 text-xs sm:w-auto sm:min-w-[170px] sm:text-sm"
            aria-label="Sort order"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ArrowUpDown size={12} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint" />
        </div>
      </div>
    </div>
  );
}
