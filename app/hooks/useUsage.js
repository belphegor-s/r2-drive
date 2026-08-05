'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { driveApi } from '@/app/lib/driveClient';

/**
 * Storage/quota snapshot for the sidebar meter.
 *
 * The server caches the underlying bucket scan, so a poll here is cheap; the
 * interval only exists to pick up uploads made in another tab. `refresh(true)`
 * forces a fresh scan and is wired to the meter's manual refresh button.
 */
export default function useUsage({ pollMs = 120_000 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  const load = useCallback(async (force = false) => {
    if (force) setLoading(true);
    try {
      const res = await driveApi.usage({ refresh: force });
      if (!mounted.current) return;
      setData(res);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  useEffect(() => {
    if (!pollMs) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  return { usage: data, loading, error, refresh: load };
}
