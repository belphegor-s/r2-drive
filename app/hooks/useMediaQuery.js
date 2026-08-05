'use client';

import { useEffect, useState } from 'react';

/**
 * Reactive media query.
 *
 * Always reports `false` on the first render so server and client markup agree;
 * the real value is adopted in an effect.
 */
export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const onChange = (e) => setMatches(e.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
