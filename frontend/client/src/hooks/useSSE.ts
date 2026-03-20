import { useEffect, useRef } from 'react';
import type { Log, Anomaly } from '../types';

interface SSEHandlers {
  onLog?:     (log: Log)         => void;
  onAnomaly?: (anomaly: Anomaly) => void;
}

const API_URL = import.meta.env.VITE_API_URL ?? '';

export function useSSE({ onLog, onAnomaly }: SSEHandlers): void {
  // Keep handlers in a ref so the EventSource is only created once,
  // but always calls the latest handler closures.
  const handlersRef = useRef<SSEHandlers>({ onLog, onAnomaly });
  handlersRef.current = { onLog, onAnomaly };

  useEffect(() => {
    const es = new EventSource(`${API_URL}/api/stream`);

    es.addEventListener('log', (e: MessageEvent) => {
      handlersRef.current.onLog?.(JSON.parse(e.data) as Log);
    });

    es.addEventListener('anomaly', (e: MessageEvent) => {
      handlersRef.current.onAnomaly?.(JSON.parse(e.data) as Anomaly);
    });

    es.onerror = () => {
      console.warn('[SSE] connection error — browser will reconnect automatically');
    };

    return () => es.close();
  }, []); // intentionally empty — single subscription for the app lifetime
}
