'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '@/app/components/Modal';
import copyToClipboard from '@/utils/copyToClipboard';

const MULTIPLIERS = { seconds: 1, minutes: 60, hours: 3600, days: 86400 };
const MAX_EXPIRY = 604800; // 7 days

export default function ShareDialog({ open, fileKey, onClose }) {
  const [expiry, setExpiry] = useState(30);
  const [customExpiry, setCustomExpiry] = useState('');
  const [customExpiryUnit, setCustomExpiryUnit] = useState('minutes');
  const [sendEmail, setSendEmail] = useState(false);
  const [emails, setEmails] = useState(['']);
  const [generating, setGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const emailsRef = useRef([]);

  useEffect(() => {
    if (!open) {
      setExpiry(30); setCustomExpiry(''); setCustomExpiryUnit('minutes');
      setSendEmail(false); setEmails(['']); setGenerating(false);
      setGeneratedLink(''); setCopySuccess(false);
    }
  }, [open]);

  const calcExpirySeconds = (cap = true) => {
    if (expiry !== 'custom') return Number(expiry);
    const v = parseInt(customExpiry);
    if (!v || v <= 0) return 30;
    const total = v * MULTIPLIERS[customExpiryUnit];
    return cap ? Math.min(total, MAX_EXPIRY) : total;
  };

  const generate = async () => {
    if (generating || !fileKey) return;
    if (expiry === 'custom') {
      const v = parseInt(customExpiry);
      if (!v || v <= 0) { toast.error('Enter a valid duration'); return; }
      if (calcExpirySeconds(false) > MAX_EXPIRY) {
        toast.error('Max expiry is 7 days');
        return;
      }
    }
    setGenerating(true);
    try {
      const res = await fetch('/api/upload/private/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: fileKey,
          expiry: calcExpirySeconds(true),
          emails: sendEmail ? emails.filter((e) => e.trim()) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      setGeneratedLink(data.url);
      await copyToClipboard(data.url);
      toast.success(data?.message || 'Pre-signed URL generated', { duration: 5000 });
    } catch (err) {
      toast.error(err.message || 'Failed to generate');
    } finally {
      setGenerating(false);
    }
  };

  const updateEmail = (idx, value) => {
    setEmails((prev) => prev.map((v, i) => (i === idx ? value : v)));
  };
  const addEmail = () => {
    if (emails.length >= 10) { toast.error('Up to 10 recipients'); return; }
    setEmails((prev) => [...prev, '']);
  };
  const removeEmail = (idx) => setEmails((prev) => prev.filter((_, i) => i !== idx).length ? prev.filter((_, i) => i !== idx) : ['']);

  const expiryDisplay = (() => {
    if (expiry !== 'custom' || !customExpiry) return null;
    const total = calcExpirySeconds(false);
    if (total > MAX_EXPIRY) return <span className="text-red-400">⚠️ Exceeds 7-day limit. Will be capped.</span>;
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (seconds) parts.push(`${seconds}s`);
    return `Duration: ${parts.join(' ')}`;
  })();

  return (
    <Modal open={open} onClose={generating ? () => {} : onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); generate(); }}
        className="p-6 space-y-5"
      >
        <h3 className="border-b border-line pb-3 text-lg font-semibold">Generate pre-signed URL</h3>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-muted">Expiry</label>
          <select
            value={expiry}
            onChange={(e) => setExpiry(e.target.value === 'custom' ? 'custom' : Number(e.target.value))}
            className="custom-input"
            disabled={generating}
          >
            <optgroup label="Short">
              <option value={30}>30 seconds</option>
              <option value={60}>1 minute</option>
              <option value={120}>2 minutes</option>
              <option value={300}>5 minutes</option>
            </optgroup>
            <optgroup label="Medium">
              <option value={600}>10 minutes</option>
              <option value={900}>15 minutes</option>
              <option value={1800}>30 minutes</option>
            </optgroup>
            <optgroup label="Long">
              <option value={2700}>45 minutes</option>
              <option value={3600}>1 hour</option>
            </optgroup>
            <option value="custom">Custom</option>
          </select>
          {expiry === 'custom' && (
            <div className="mt-2 flex gap-2">
              <input
                type="number"
                min="1"
                value={customExpiry}
                onChange={(e) => setCustomExpiry(e.target.value)}
                placeholder="Duration"
                className="flex-1 custom-input"
                disabled={generating}
              />
              <select value={customExpiryUnit} onChange={(e) => setCustomExpiryUnit(e.target.value)} className="custom-input" style={{ width: 'auto' }} disabled={generating}>
                <option value="seconds">Sec</option>
                <option value="minutes">Min</option>
                <option value="hours">Hrs</option>
                <option value="days">Days</option>
              </select>
            </div>
          )}
          {expiryDisplay && <div className="mt-2 text-xs text-ink-faint">{expiryDisplay}</div>}
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={sendEmail} onChange={() => setSendEmail((p) => !p)} className="accent-blue-600" disabled={generating} />
          Send link via email
        </label>

        {sendEmail && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-muted">Recipients</label>
            <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
              {emails.map((v, i) => (
                <div key={i} className="flex gap-2" ref={(el) => (emailsRef.current[i] = el)}>
                  <input
                    type="email"
                    placeholder="name@example.com"
                    value={v}
                    onChange={(e) => updateEmail(i, e.target.value)}
                    className="flex-1 custom-input"
                    required={sendEmail}
                    disabled={generating}
                  />
                  <button
                    type="button"
                    onClick={() => removeEmail(i)}
                    className={`text-red-400 hover:text-red-600 text-xs font-bold ${i === 0 ? 'invisible' : ''}`}
                    disabled={generating}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addEmail} className="mt-2 text-sm text-accent hover:underline" disabled={generating}>
              + Add email
            </button>
          </div>
        )}

        {generatedLink && (
          <div className="space-y-2 rounded-lg border border-line bg-sunken p-3 text-xs">
            <div className="text-ink-faint">Generated link:</div>
            <a href={generatedLink} target="_blank" rel="noopener noreferrer" className="break-all text-accent hover:underline">{generatedLink}</a>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  copyToClipboard(generatedLink).then(() => {
                    setCopySuccess(true);
                    setTimeout(() => setCopySuccess(false), 1200);
                  });
                }}
                className="btn-neutral-small"
              >
                {copySuccess ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-line pt-2">
          <button type="button" onClick={onClose} className="btn-neutral" disabled={generating}>Cancel</button>
          <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50" disabled={generating}>
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
