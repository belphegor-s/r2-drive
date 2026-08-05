'use client';

import { useState } from 'react';
import { Check, Star } from 'lucide-react';
import { motion } from 'framer-motion';
import { FolderIcon, FileTypeIcon } from './fileIcons';
import { formatFileSize } from '@/utils/formatFileSize';
import { categoryOf } from '@/app/lib/fileTypes';
import useLongPress from '@/app/hooks/useLongPress';
import { DRAG_MIME } from '@/app/lib/dnd';

function GridItem({
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
  thumbUrl,
  index,
}) {
  const [dropActive, setDropActive] = useState(false);
  const longPress = useLongPress((coords) => {
    onContextMenu({ clientX: coords.x, clientY: coords.y, preventDefault() {}, stopPropagation() {} });
  });

  const cat = isFolder ? null : categoryOf(item.mime || '', item.name);
  const showThumb = !isFolder && cat === 'image' && thumbUrl;

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
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: isCut ? 0.45 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.22, delay: Math.min(index * 0.012, 0.2), ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      draggable
      // Capture phase: framer-motion claims `onDragStart` for its own gesture
      // system and never forwards it to the DOM, so the native HTML5 drag event
      // has to be caught here instead.
      onDragStartCapture={(e) => onDragStart?.(e)}
      className={`group relative cursor-pointer select-none overflow-hidden rounded-xl border transition-colors ${
        dropActive
          ? 'border-accent bg-accent/15 ring-2 ring-accent'
          : isSelected
            ? 'border-accent bg-accent/10 ring-1 ring-accent/40'
            : 'border-line bg-surface hover:border-line-strong hover:bg-raised'
      } ${isCursor ? 'item-cursor' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onTouchStart={longPress.onTouchStart}
      onTouchEnd={longPress.onTouchEnd}
      onTouchMove={longPress.onTouchMove}
      onTouchCancel={longPress.onTouchCancel}
      {...dropProps}
    >
      {/* Square thumbs are too tall on a phone — two columns of them fit barely
          two rows on screen. Shorter below sm. */}
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-sunken sm:aspect-square">
        {showThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbUrl} alt={item.name} className="h-full w-full object-cover" loading="lazy" draggable={false} />
        ) : isFolder ? (
          <FolderIcon size={56} />
        ) : (
          <FileTypeIcon name={item.name} mime={item.mime} size={48} />
        )}
      </div>

      <div className="px-3 py-2">
        <div className="truncate text-sm font-medium" title={item.name}>
          {item.name}
        </div>
        <div className="truncate text-[11px] text-ink-faint">
          {isFolder ? 'Folder' : formatFileSize(item.size)}
        </div>
      </div>

      {isSelected && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
          className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white shadow-md"
        >
          <Check size={12} strokeWidth={3} />
        </motion.div>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleStar?.();
        }}
        className={`absolute right-1.5 top-1.5 rounded-full p-1.5 transition-all ${
          isStarred
            ? 'text-amber-300 opacity-100'
            : 'text-ink-faint opacity-0 group-hover:opacity-100 hover:text-amber-300'
        }`}
        title={isStarred ? 'Remove star' : 'Star'}
        aria-label={isStarred ? 'Remove star' : 'Star'}
      >
        <Star size={14} className={isStarred ? 'fill-current' : ''} />
      </button>
    </motion.div>
  );
}

export default function FileGrid({
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
  thumbCache,
}) {
  const allIds = [...folders.map((f) => `folder:${f.prefix}`), ...files.map((f) => f.key)];

  return (
    // `data-grid` lets the keyboard cursor read the live column count so
    // ArrowUp/ArrowDown move by a visual row rather than by one item.
    <div data-grid className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {folders.map((f, i) => {
        const id = `folder:${f.prefix}`;
        return (
          <GridItem
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
          <GridItem
            key={id}
            index={fullIdx}
            item={f}
            isFolder={false}
            isSelected={selection.isSelected(id)}
            isCursor={cursorIndex === fullIdx}
            isCut={isCut?.(id)}
            isStarred={isStarred?.(id)}
            thumbUrl={thumbCache?.[f.key] || (f.url && categoryOf(f.mime || '', f.name) === 'image' ? f.url : null)}
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
