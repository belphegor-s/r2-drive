'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useState backed by localStorage.
 *
 * The initial render always uses `initialValue` and the stored value is adopted
 * in an effect — reading storage during render would desync server and client
 * markup and trip a hydration error.
 */
export default function usePersistentState(key, initialValue) {
  const [value, setValue] = useState(initialValue);
  const [hydrated, setHydrated] = useState(false);
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    setHydrated(false);
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw));
      else setValue(initialValue);
    } catch {
      // corrupt or unavailable storage — stay on the default
    }
    setHydrated(true);
    // `initialValue` is intentionally not a dependency: callers pass literals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(keyRef.current, JSON.stringify(value));
    } catch {
      // quota exceeded / private mode — the app still works, it just forgets
    }
  }, [value, hydrated]);

  const reset = useCallback(() => setValue(initialValue), [initialValue]);

  return [value, setValue, { hydrated, reset }];
}
