import { useState, useEffect, useCallback } from 'react';
import type { Anomaly } from '../types';

const API_URL = import.meta.env.VITE_API_URL ?? '';

export function useAnomalies(service?: string, limit = 100) {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (service) params.set('service', service);

    try {
      const res = await fetch(`${API_URL}/api/anomalies?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAnomalies(await res.json() as Anomaly[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [service, limit]);

  useEffect(() => { void load(); }, [load]);

  const prepend = useCallback((anomaly: Anomaly) => {
    setAnomalies((prev) => [anomaly, ...prev].slice(0, limit));
  }, [limit]);

  return { anomalies, loading, error, prepend, refetch: load };
}
