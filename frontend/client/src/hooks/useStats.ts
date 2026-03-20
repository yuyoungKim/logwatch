import { useState, useEffect } from 'react';
import type { Stats } from '../types';

const API_URL = import.meta.env.VITE_API_URL ?? '';

export function useStats(refreshInterval = 10_000) {
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/api/stats`);
        if (!res.ok) return;
        setStats(await res.json() as Stats);
      } finally {
        setLoading(false);
      }
    };

    void load();
    const id = setInterval(() => void load(), refreshInterval);
    return () => clearInterval(id);
  }, [refreshInterval]);

  return { stats, loading };
}
