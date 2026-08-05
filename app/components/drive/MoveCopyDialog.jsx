'use client';

import { useCallback, useEffect, useState } from 'react';
import Modal from '@/app/components/Modal';
import { driveApi } from '@/app/lib/driveClient';
import { ChevronRight, ChevronDown, HardDrive } from 'lucide-react';
import { FolderIcon } from './fileIcons';

function PickerNode({ scope, node, depth, selected, onSelect, disabledPrefixes }) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState(null);
  const isSelected = selected === node.prefix;
  const disabled = disabledPrefixes?.some((p) => node.prefix === p || node.prefix.startsWith(p + '/'));

  const load = useCallback(async () => {
    try {
      const res = await driveApi.tree(scope, node.prefix);
      setChildren(res.folders || []);
    } catch { setChildren([]); }
  }, [scope, node.prefix]);

  useEffect(() => { if (open && children === null) load(); }, [open, children, load]);

  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded-md text-sm select-none ${
          isSelected ? 'border-l-2 border-accent bg-accent/15' : 'border-l-2 border-transparent hover:bg-hover'
        } ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} className="p-1 text-ink-faint hover:text-ink">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelect(node.prefix)}
          className="flex-1 flex items-center gap-2 py-1.5 text-left truncate"
        >
          <FolderIcon size={14} />
          <span className="truncate">{node.name}</span>
        </button>
      </div>
      {open && children?.map((c) => (
        <PickerNode key={c.prefix} scope={scope} node={c} depth={depth + 1} selected={selected} onSelect={onSelect} disabledPrefixes={disabledPrefixes} />
      ))}
    </div>
  );
}

export default function MoveCopyDialog({ open, scope, mode = 'move', sourcePrefixes = [], onClose, onSubmit, busy }) {
  // mode: 'move' | 'copy'
  const [roots, setRoots] = useState([]);
  const [selected, setSelected] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelected('');
    driveApi.tree(scope, '').then((res) => setRoots(res.folders || [])).catch(() => setRoots([]));
  }, [open, scope]);

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} maxWidth="max-w-lg">
      <div className="p-6">
        <h3 className="text-lg font-semibold capitalize">{mode} to…</h3>
        <p className="mt-1 text-xs text-ink-faint">Pick a destination folder.</p>

        <div className="custom-scrollbar mt-4 max-h-[50vh] overflow-y-auto rounded-lg border border-line bg-sunken py-1">
          <div
            className={`flex cursor-pointer select-none items-center gap-2 px-2 py-1.5 text-sm ${
              selected === '' ? 'border-l-2 border-accent bg-accent/15' : 'border-l-2 border-transparent hover:bg-hover'
            }`}
            onClick={() => setSelected('')}
            style={{ paddingLeft: 12 }}
          >
            <HardDrive size={14} className="text-accent" />
            <span>Drive root</span>
          </div>
          {roots.map((r) => (
            <PickerNode
              key={r.prefix}
              scope={scope}
              node={r}
              depth={0}
              selected={selected}
              onSelect={setSelected}
              disabledPrefixes={mode === 'move' ? sourcePrefixes : []}
            />
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="btn-neutral" disabled={busy}>Cancel</button>
          <button
            onClick={() => onSubmit(selected)}
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-sm capitalize text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
          >
            {busy ? 'Working…' : mode}
          </button>
        </div>
      </div>
    </Modal>
  );
}
