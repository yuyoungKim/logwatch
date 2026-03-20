import type { CSSProperties } from 'react';
import type { Severity } from '../../types';

const SERVICES:   string[]              = ['', 'auth-service', 'payment-service', 'api-gateway'];
const SEVERITIES: Array<Severity | ''> = ['', 'DEBUG', 'INFO', 'WARN', 'ERROR'];

interface FilterBarProps {
  service:          string;
  severity:         Severity | '';
  paused:           boolean;
  onServiceChange:  (s: string)          => void;
  onSeverityChange: (s: Severity | '')   => void;
  onPauseToggle:    ()                   => void;
}

const select: CSSProperties = {
  background:   '#2d3748',
  color:        '#e2e8f0',
  border:       '1px solid #4a5568',
  borderRadius: 6,
  padding:      '6px 12px',
  fontSize:     13,
  cursor:       'pointer',
};

export function FilterBar({
  service, severity, paused,
  onServiceChange, onSeverityChange, onPauseToggle,
}: FilterBarProps) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
      <select value={service} onChange={(e) => onServiceChange(e.target.value)} style={select}>
        {SERVICES.map((s) => (
          <option key={s} value={s}>{s || 'All services'}</option>
        ))}
      </select>

      <select value={severity} onChange={(e) => onSeverityChange(e.target.value as Severity | '')} style={select}>
        {SEVERITIES.map((s) => (
          <option key={s} value={s}>{s || 'All severities'}</option>
        ))}
      </select>

      <button
        onClick={onPauseToggle}
        style={{
          ...select,
          marginLeft:  'auto',
          background:  paused ? '#276749' : '#744210',
          fontWeight:  600,
        }}
      >
        {paused ? '▶  Resume' : '⏸  Pause'}
      </button>
    </div>
  );
}
