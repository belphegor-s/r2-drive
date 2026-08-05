'use client';

import Modal from '@/app/components/Modal';

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  busy,
  title = 'Confirm',
  message,
  confirmLabel = 'Confirm',
  danger = false,
}) {
  return (
    <Modal open={open} onClose={busy ? () => {} : onClose}>
      <div className="p-6">
        <h3 className="text-lg font-semibold">{title}</h3>
        {message && <div className="mt-3 whitespace-pre-line text-sm text-ink-muted">{message}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="btn-neutral" disabled={busy}>Cancel</button>
          <button
            onClick={onConfirm}
            disabled={busy}
            autoFocus
            className={danger ? 'btn-danger-variant' : 'rounded-lg bg-accent px-4 py-2 text-sm text-white transition-colors hover:bg-accent-strong disabled:opacity-50'}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
