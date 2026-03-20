import { useState, useEffect, useCallback } from 'react';
import type { Log, Severity } from '../types';

interface UseLogsOptions {
  service?:  string;
  severity?: Severity | '';
  limit?:    number;
}

const API_URL = import.meta.env.VITE_API_URL ?? '';

export function useLogs({ service = '', severity = '', limit = 100 }: UseLogsOptions = {}) {
  const [logs,    setLogs]    = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (service)  params.set('service',  service);
    if (severity) params.set('severity', severity);

    try {
      const res = await fetch(`${API_URL}/api/logs?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLogs(await res.json() as Log[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [service, severity, limit]);

  useEffect(() => { void load(); }, [load]);

  // Prepend a new live log (newest-first order, reversed for display).
  const prepend = useCallback((log: Log) => {
    setLogs((prev) => [log, ...prev].slice(0, limit));
  }, [limit]);

  return { logs, loading, error, prepend, refetch: load };
}
