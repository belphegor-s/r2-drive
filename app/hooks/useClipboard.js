'use client';

import { useCallback, useState } from 'react';

/**
 * Cut / copy / paste for drive items.
 *
 * Holds the pending operation only — the actual R2 work is done by the caller's
 * `onPaste`, which receives `{ mode, keys, prefixes, sourcePrefix }`. Cut
 * entries stay visible but dimmed until the paste lands, matching how desktop
 * file managers behave.
 */
export default function useClipboard() {
  const [clip, setClip] = useState(null); // { mode: 'copy'|'cut', items: [{kind,item,id}], sourcePrefix }

  const copy = useCallback((items, sourcePrefix = '') => {
    if (!items?.length) return;
    setClip({ mode: 'copy', items, sourcePrefix });
  }, []);

  const cut = useCallback((items, sourcePrefix = '') => {
    if (!items?.length) return;
    setClip({ mode: 'cut', items, sourcePrefix });
  }, []);

  const clear = useCallback(() => setClip(null), []);

  const isCut = useCallback(
    (id) => clip?.mode === 'cut' && clip.items.some((i) => i.id === id),
    [clip],
  );

  const payload = useCallback(() => {
    if (!clip) return null;
    return {
      mode: clip.mode,
      sourcePrefix: clip.sourcePrefix,
      keys: clip.items.filter((i) => i.kind === 'file').map((i) => i.item.key),
      prefixes: clip.items.filter((i) => i.kind === 'folder').map((i) => i.item.prefix),
      count: clip.items.length,
    };
  }, [clip]);

  return { clip, copy, cut, clear, isCut, payload, has: Boolean(clip) };
}
