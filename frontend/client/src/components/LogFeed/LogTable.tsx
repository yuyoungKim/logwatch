import { useEffect, useRef } from 'react';
import type { Log } from '../../types';
import { SeverityBadge } from './SeverityBadge';

interface LogTableProps {
  logs:   Log[];
  paused: boolean;
}

const th: React.CSSProperties = {
  textAlign:    'left',
  padding:      '8px 14px',
  color:        '#718096',
  fontWeight:   500,
  fontSize:     12,
  borderBottom: '1px solid #2d3748',
  whiteSpace:   'nowrap',
};

const td: React.CSSProperties = {
  padding:      '6px 14px',
  borderBottom: '1px solid #1a1f2e',
  fontSize:     13,
};

export function LogTable({ logs, paused }: LogTableProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paused) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, paused]);

  if (logs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: '#4a5568' }}>
        Waiting for log events…
      </div>
    );
  }

  // logs are newest-first from the server; reverse so newest appears at the bottom.
  const displayed = [...logs].reverse();

  return (
    <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 220px)', fontFamily: 'monospace' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ position: 'sticky', top: 0, background: '#1a1f2e', zIndex: 1 }}>
          <tr>
            <th style={th}>Timestamp</th>
            <th style={th}>Severity</th>
            <th style={th}>Service</th>
            <th style={{ ...th, width: '100%' }}>Message</th>
          </tr>
        </thead>
        <tbody>
          {displayed.map((log) => (
            <tr key={log.id} style={{ transition: 'background 0.1s' }}>
              <td style={{ ...td, color: '#718096', whiteSpace: 'nowrap' }}>
                {new Date(log.timestamp).toLocaleTimeString()}
              </td>
              <td style={td}>
                <SeverityBadge severity={log.severity} />
              </td>
              <td style={{ ...td, color: '#a0aec0', whiteSpace: 'nowrap' }}>
                {log.service_name}
              </td>
              <td style={{ ...td, color: '#e2e8f0', wordBreak: 'break-word' }}>
                {log.message}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div ref={bottomRef} />
    </div>
  );
}
