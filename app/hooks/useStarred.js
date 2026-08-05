'use client';

import { useCallback, useMemo } from 'react';
import usePersistentState from './usePersistentState';

/**
 * Starred items, per scope, kept in localStorage.
 *
 * Entries are stored as full records rather than bare ids so the Starred view
 * can render without re-listing every folder the items live in. Renames and
 * moves change an item's key, which orphans its star — the view drops entries
 * whose key no longer resolves, which is the intended self-healing behaviour.
 */
export default function useStarred(scope) {
  const [items, setItems] = usePersistentState(`drive.starred.${scope}`, []);

  const ids = useMemo(() => new Set(items.map((i) => i.id)), [items]);

  const isStarred = useCallback((id) => ids.has(id), [ids]);

  const toggle = useCallback(
    (entry) => {
      if (!entry?.id) return false;
      let added = false;
      setItems((prev) => {
        const exists = prev.some((i) => i.id === entry.id);
        added = !exists;
        if (exists) return prev.filter((i) => i.id !== entry.id);
        return [{ ...entry, starredAt: Date.now() }, ...prev].slice(0, 200);
      });
      return added;
    },
    [setItems],
  );

  const remove = useCallback((id) => setItems((prev) => prev.filter((i) => i.id !== id)), [setItems]);

  const clear = useCallback(() => setItems([]), [setItems]);

  return { items, ids, isStarred, toggle, remove, clear, count: items.length };
}
