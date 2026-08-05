'use client';

import { useEffect, useState } from 'react';
import Modal from '@/app/components/Modal';

export default function NewFolderModal({ open, onClose, onSubmit, busy }) {
  const [name, setName] = useState('');
  useEffect(() => { if (!open) setName(''); }, [open]);

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSubmit(name.trim()); }}
        className="p-6 space-y-4"
      >
        <h3 className="text-lg font-semibold">New folder</h3>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Folder name"
          className="custom-input"
          disabled={busy}
        />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-neutral" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm text-white transition-colors hover:bg-accent-strong disabled:opacity-50" disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
