'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Check, Minus, Star } from 'lucide-react';
import { motion } from 'framer-motion';
import { FolderIcon, FileTypeIcon } from './fileIcons';
import { formatFileSize } from '@/utils/formatFileSize';
import useLongPress from '@/app/hooks/useLongPress';
import { preventDoubleClickSelection } from '@/app/lib/interaction';
import { DRAG_MIME } from '@/app/lib/dnd';

function Row({
  item,
  isFolder,
  isSelected,
  isCursor,
  isCut,
  isStarred,
  onClick,
  onDoubleClick,
  onContextMenu,
  onToggleStar,
  onDragStart,
  onDropInto,
  index = 0,
}) {
  const [dropActive, setDropActive] = useState(false);
  const longPress = useLongPress((coords) => {
    onContextMenu({ clientX: coords.x, clientY: coords.y, preventDefault() {}, stopPropagation() {} });
  });

  const dropProps = isFolder
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
          e.stopPropagation();
          setDropActive(false);
          try {
            onDropInto?.(item.prefix, JSON.parse(e.dataTransfer.getData(DRAG_MIME)));
          } catch {
            // malformed payload — ignore
          }
        },
      }
    : {};

  return (
    <motion.div
      layout
      data-item-index={index}
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: isCut ? 0.45 : 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, delay: Math.min(index * 0.01, 0.18), ease: [0.22, 1, 0.36, 1] }}
      draggable
      // See FileGrid: framer-motion swallows `onDragStart`, so capture instead.
      onDragStartCapture={(e) => onDragStart?.(e)}
      onMouseDown={preventDoubleClickSelection}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onTouchStart={longPress.onTouchStart}
      onTouchEnd={longPress.onTouchEnd}
      onTouchMove={longPress.onTouchMove}
      onTouchCancel={longPress.onTouchCancel}
      {...dropProps}
      className={`grid cursor-pointer select-none grid-cols-[24px_1fr_auto_auto_28px] items-center gap-3 border-b border-line px-3 py-2 transition-colors last:border-0 ${
        dropActive
          ? 'bg-accent/20 ring-1 ring-inset ring-accent'
          : isSelected
            ? 'bg-accent/10'
            : 'hover:bg-raised'
      } ${isCursor ? 'ring-1 ring-inset ring-accent' : ''}`}
    >
      <div className="flex items-center justify-center">
        {isSelected ? (
          <div className="flex h-4 w-4 items-center justify-center rounded bg-accent">
            <Check size={10} strokeWidth={3} className="text-white" />
          </div>
        ) : (
          <div className="h-4 w-4 rounded border border-line-strong" />
        )}
      </div>

      <div className="flex min-w-0 items-center gap-2">
        {isFolder ? <FolderIcon size={18} /> : <FileTypeIcon name={item.name} mime={item.mime} />}
        <span className="truncate text-sm" title={item.name}>{item.name}</span>
      </div>

      <span className="whitespace-nowrap text-xs text-ink-faint">
        {isFolder ? '—' : formatFileSize(item.size)}
      </span>

      <span className="hidden whitespace-nowrap text-xs text-ink-faint sm:inline">
        {item.lastModified ? format(new Date(item.lastModified), 'PP p') : ''}
      </span>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleStar?.();
        }}
        className={`rounded p-1 transition-colors ${
          isStarred ? 'text-amber-300' : 'text-transparent hover:text-amber-300'
        }`}
        title={isStarred ? 'Remove star' : 'Star'}
        aria-label={isStarred ? 'Remove star' : 'Star'}
      >
        <Star size={13} className={isStarred ? 'fill-current' : ''} />
      </button>
    </motion.div>
  );
}

export default function FileList({
  folders,
  files,
  selection,
  cursorIndex = -1,
  onItemClick,
  onItemOpen,
  onItemContext,
  onDragStartItem,
  onDropIntoFolder,
  onToggleStar,
  isStarred,
  isCut,
}) {
  const allIds = [...folders.map((f) => `folder:${f.prefix}`), ...files.map((f) => f.key)];

  const totalCount = allIds.length;
  const selectedCount = allIds.filter((id) => selection.isSelected(id)).length;
  const allSelected = totalCount > 0 && selectedCount === totalCount;
  const someSelected = selectedCount > 0 && !allSelected;

  function handleHeaderCheckbox(e) {
    e.stopPropagation();
    if (allSelected) selection.clear();
    else selection.setAll(allIds);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="hidden grid-cols-[24px_1fr_auto_auto_28px] gap-3 border-b border-line px-3 py-2 text-[11px] uppercase tracking-wider text-ink-faint sm:grid">
        <div
          role="checkbox"
          aria-checked={allSelected ? true : someSelected ? 'mixed' : false}
          aria-label="Select all"
          tabIndex={0}
          className="flex cursor-pointer items-center justify-center"
          onClick={handleHeaderCheckbox}
          onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && handleHeaderCheckbox(e)}
        >
          {allSelected ? (
            <div className="flex h-4 w-4 items-center justify-center rounded bg-accent">
              <Check size={10} strokeWidth={3} className="text-white" />
            </div>
          ) : someSelected ? (
            <div className="flex h-4 w-4 items-center justify-center rounded border border-accent/50 bg-accent/20">
              <Minus size={10} strokeWidth={3} className="text-accent" />
            </div>
          ) : (
            <div className="h-4 w-4 rounded border border-line-strong transition-colors hover:border-ink-faint" />
          )}
        </div>
        <div>Name</div>
        <div>Size</div>
        <div>Modified</div>
        <div />
      </div>

      {folders.map((f, i) => {
        const id = `folder:${f.prefix}`;
        return (
          <Row
            key={id}
            index={i}
            item={f}
            isFolder
            isSelected={selection.isSelected(id)}
            isCursor={cursorIndex === i}
            isCut={isCut?.(id)}
            isStarred={isStarred?.(id)}
            onClick={(e) => onItemClick({ id, index: i, ids: allIds, kind: 'folder', item: f, e })}
            onDoubleClick={() => onItemOpen({ kind: 'folder', item: f })}
            onContextMenu={(e) => onItemContext({ e, kind: 'folder', item: f, id })}
            onToggleStar={() => onToggleStar?.({ kind: 'folder', item: f, id })}
            onDragStart={(e) => onDragStartItem?.(e, { kind: 'folder', item: f, id })}
            onDropInto={onDropIntoFolder}
          />
        );
      })}

      {files.map((f, i) => {
        const id = f.key;
        const fullIdx = folders.length + i;
        return (
          <Row
            key={id}
            index={fullIdx}
            item={f}
            isFolder={false}
            isSelected={selection.isSelected(id)}
            isCursor={cursorIndex === fullIdx}
            isCut={isCut?.(id)}
            isStarred={isStarred?.(id)}
            onClick={(e) => onItemClick({ id, index: fullIdx, ids: allIds, kind: 'file', item: f, e })}
            onDoubleClick={() => onItemOpen({ kind: 'file', item: f })}
            onContextMenu={(e) => onItemContext({ e, kind: 'file', item: f, id })}
            onToggleStar={() => onToggleStar?.({ kind: 'file', item: f, id })}
            onDragStart={(e) => onDragStartItem?.(e, { kind: 'file', item: f, id })}
          />
        );
      })}
    </div>
  );
}
