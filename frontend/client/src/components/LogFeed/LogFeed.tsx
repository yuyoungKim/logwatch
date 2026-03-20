import type { Log, Severity } from '../../types';
import { FilterBar } from './FilterBar';
import { LogTable  } from './LogTable';

interface LogFeedProps {
  logs:             Log[];
  loading:          boolean;
  service:          string;
  severity:         Severity | '';
  paused:           boolean;
  onServiceChange:  (s: string)        => void;
  onSeverityChange: (s: Severity | '') => void;
  onPauseToggle:    ()                 => void;
}

export function LogFeed({
  logs, loading, service, severity, paused,
  onServiceChange, onSeverityChange, onPauseToggle,
}: LogFeedProps) {
  return (
    <div>
      <FilterBar
        service={service}
        severity={severity}
        paused={paused}
        onServiceChange={onServiceChange}
        onSeverityChange={onSeverityChange}
        onPauseToggle={onPauseToggle}
      />

      <div style={{ background: '#1a1f2e', borderRadius: 8, border: '1px solid #2d3748' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#4a5568' }}>
            Loading logs…
          </div>
        ) : (
          <LogTable logs={logs} paused={paused} />
        )}
      </div>

      {paused && (
        <div style={{
          marginTop: 8, textAlign: 'center', fontSize: 12, color: '#f6ad55',
          background: '#744210', padding: '4px 0', borderRadius: 4,
        }}>
          Live feed paused — new events are still being collected
        </div>
      )}
    </div>
  );
}
