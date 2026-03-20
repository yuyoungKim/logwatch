import type { ReactNode, CSSProperties } from 'react';
import type { Stats } from '../types';

type Tab = 'home' | 'logs' | 'timeline' | 'alerts';

interface LayoutProps {
  tab:         Tab;
  onTabChange: (tab: Tab) => void;
  stats:       Stats | null;
  children:    ReactNode;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'home',     label: 'Overview' },
  { id: 'logs',     label: 'Live Logs' },
  { id: 'timeline', label: 'Anomaly Timeline' },
  { id: 'alerts',   label: 'Alert Cards' },
];

const headerStyle: CSSProperties = {
  background:    '#1a1f2e',
  borderBottom:  '1px solid #2d3748',
  padding:       '12px 24px',
  display:       'flex',
  alignItems:    'center',
  justifyContent:'space-between',
  flexWrap:      'wrap',
  gap:           8,
};

export function Layout({ tab, onTabChange, stats, children }: LayoutProps) {
  return (
    <div style={{ background: '#0f1117', minHeight: '100vh', color: '#e2e8f0' }}>
      {/* ── Header ── */}
      <header style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.5px', fontFamily: 'monospace' }}>
            logwatch
          </span>
          <span style={{ fontSize: 11, color: '#718096', background: '#2d3748', padding: '2px 8px', borderRadius: 4 }}>
            ML anomaly detection
          </span>
        </div>

        {stats && (
          <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#a0aec0', flexWrap: 'wrap' }}>
            <Stat label="errors/h"    value={stats.severity_counts.ERROR    ?? 0} color="#fc8181" />
            <Stat label="warns/h"     value={stats.severity_counts.WARN     ?? 0} color="#f6ad55" />
            <Stat label="anomalies/h" value={stats.anomaly_count_1h}              color="#f6ad55" />
            <Stat label="services"    value={stats.active_services.length}        color="#68d391" />
          </div>
        )}
      </header>

      {/* ── Tab bar ── */}
      <nav style={{ background: '#1a1f2e', borderBottom: '1px solid #2d3748', padding: '0 24px', display: 'flex', gap: 2 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            style={{
              background:   'none',
              border:       'none',
              padding:      '12px 18px',
              cursor:       'pointer',
              fontSize:     14,
              color:        tab === t.id ? '#63b3ed' : '#a0aec0',
              borderBottom: tab === t.id ? '2px solid #63b3ed' : '2px solid transparent',
              transition:   'color 0.15s',
              fontWeight:   tab === t.id ? 600 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* ── Content ── */}
      <main style={{ padding: '20px 24px', maxWidth: 1440, margin: '0 auto' }}>
        {children}
      </main>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
      {' '}
      <span style={{ color: '#718096' }}>{label}</span>
    </span>
  );
}
