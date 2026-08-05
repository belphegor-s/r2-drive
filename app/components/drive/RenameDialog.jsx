'use client';

import { useEffect, useState } from 'react';
import Modal from '@/app/components/Modal';

export default function RenameDialog({ open, initialName = '', onClose, onSubmit, busy, title = 'Rename' }) {
  const [name, setName] = useState(initialName);
  useEffect(() => { setName(initialName); }, [initialName, open]);

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSubmit(name.trim()); }}
        className="p-6 space-y-4"
      >
        <h3 className="text-lg font-semibold">{title}</h3>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="custom-input"
          disabled={busy}
          onFocus={(e) => {
            const dot = e.target.value.lastIndexOf('.');
            if (dot > 0) e.target.setSelectionRange(0, dot);
          }}
        />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-neutral" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm text-white transition-colors hover:bg-accent-strong disabled:opacity-50" disabled={busy || !name.trim() || name === initialName}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
