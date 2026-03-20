import { useState, useCallback } from 'react';
import { Layout }          from './components/Layout';
import { HomePage }        from './components/HomePage/HomePage';
import { LogFeed }         from './components/LogFeed/LogFeed';
import { AnomalyTimeline } from './components/AnomalyTimeline/AnomalyTimeline';
import { AlertCards }      from './components/AlertCards/AlertCards';
import { useSSE }          from './hooks/useSSE';
import { useLogs }         from './hooks/useLogs';
import { useAnomalies }    from './hooks/useAnomalies';
import { useStats }        from './hooks/useStats';
import type { Log, Anomaly, Severity } from './types';

type Tab = 'home' | 'logs' | 'timeline' | 'alerts';

export default function App() {
  const [tab,      setTab]      = useState<Tab>('home');
  const [service,  setService]  = useState('');
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [paused,   setPaused]   = useState(false);

  const { logs,      loading: logsLoading,     prepend: prependLog      } = useLogs({ service, severity });
  const { anomalies, loading: anomalyLoading,  prepend: prependAnomaly  } = useAnomalies();
  const { stats }                                                          = useStats();

  const handleLog = useCallback((log: Log) => {
    if (!paused) prependLog(log);
  }, [paused, prependLog]);

  const handleAnomaly = useCallback((anomaly: Anomaly) => {
    prependAnomaly(anomaly);
  }, [prependAnomaly]);

  useSSE({ onLog: handleLog, onAnomaly: handleAnomaly });

  return (
    <Layout tab={tab} onTabChange={setTab} stats={stats}>
      {tab === 'home' && (
        <HomePage stats={stats} onTabChange={setTab} />
      )}
      {tab === 'logs' && (
        <LogFeed
          logs={logs}
          loading={logsLoading}
          service={service}
          severity={severity}
          paused={paused}
          onServiceChange={setService}
          onSeverityChange={setSeverity}
          onPauseToggle={() => setPaused((p) => !p)}
        />
      )}
      {tab === 'timeline' && (
        <AnomalyTimeline anomalies={anomalies} loading={anomalyLoading} />
      )}
      {tab === 'alerts' && (
        <AlertCards anomalies={anomalies} loading={anomalyLoading} />
      )}
    </Layout>
  );
}
