import type { CSSProperties } from 'react';
import type { Stats } from '../../types';

type Tab = 'home' | 'logs' | 'timeline' | 'alerts';

interface HomePageProps {
  stats:       Stats | null;
  onTabChange: (tab: Tab) => void;
}

export function HomePage({ stats, onTabChange }: HomePageProps) {
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '48px 0 64px' }}>

      {/* ── Hero ── */}
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div style={{ fontFamily: 'monospace', fontSize: 48, fontWeight: 700, letterSpacing: '-1px', color: '#e2e8f0', marginBottom: 12 }}>
          logwatch
        </div>
        <div style={{ fontSize: 18, color: '#a0aec0', marginBottom: 24 }}>
          AI-powered log anomaly detector
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {['Go', 'Python', 'FastAPI', 'IsolationForest', 'Claude API', 'React', 'PostgreSQL', 'Docker'].map((t) => (
            <span key={t} style={badgeStyle}>{t}</span>
          ))}
        </div>
      </div>

      {/* ── Live stats ── */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 48 }}>
          <StatCard label="Errors / h"    value={stats.severity_counts.ERROR    ?? 0} color="#fc8181" />
          <StatCard label="Warns / h"     value={stats.severity_counts.WARN     ?? 0} color="#f6ad55" />
          <StatCard label="Anomalies / h" value={stats.anomaly_count_1h}              color="#f6ad55" />
          <StatCard label="Services"      value={stats.active_services.length}        color="#68d391" />
        </div>
      )}

      {/* ── Pipeline ── */}
      <div style={sectionCard}>
        <div style={sectionTitle}>How it works</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', padding: '8px 0' }}>
          {[
            { label: 'Go Producer',    sub: '3 microservices\n10 logs/s',           color: '#63b3ed' },
            { label: 'Go Consumer',    sub: 'Batch insert\nunnest()',                color: '#63b3ed' },
            { label: 'PostgreSQL',     sub: 'logs + anomalies\nJSONB',              color: '#68d391' },
            { label: 'IsolationForest',sub: 'Sliding window\n60s / 10s slide',      color: '#f6ad55' },
            { label: 'Claude API',     sub: 'Root cause\nsummary',                  color: '#b794f4' },
            { label: 'React Dashboard',sub: 'SSE live feed\nRecharts',              color: '#fc8181' },
          ].map((step, i, arr) => (
            <div key={step.label} style={{ display: 'flex', alignItems: 'center', flex: i < arr.length - 1 ? '0 0 auto' : 1 }}>
              <div style={{ textAlign: 'center', minWidth: 120 }}>
                <div style={{ background: '#1a1f2e', border: `1px solid ${step.color}33`, borderRadius: 8, padding: '10px 12px', marginBottom: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: step.color, marginBottom: 2 }}>{step.label}</div>
                  <div style={{ fontSize: 10, color: '#718096', whiteSpace: 'pre-line', lineHeight: 1.4 }}>{step.sub}</div>
                </div>
              </div>
              {i < arr.length - 1 && (
                <div style={{ color: '#4a5568', fontSize: 16, padding: '0 4px', flexShrink: 0 }}>→</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Feature cards + nav ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 24 }}>
        <NavCard
          title="Live Logs"
          color="#63b3ed"
          description="Real-time structured log stream from auth-service, payment-service, and api-gateway. Filter by service or severity."
          action="Open Live Logs"
          onClick={() => onTabChange('logs')}
        />
        <NavCard
          title="Anomaly Timeline"
          color="#f6ad55"
          description="IsolationForest anomaly scores over time. 60-second sliding windows scored every 10 seconds across all services."
          action="Open Timeline"
          onClick={() => onTabChange('timeline')}
        />
        <NavCard
          title="Alert Cards"
          color="#b794f4"
          description="WARNING and CRITICAL anomaly alerts with Claude-generated root cause summaries explaining what went wrong."
          action="Open Alert Cards"
          onClick={() => onTabChange('alerts')}
        />
      </div>

      {/* ── Footer ── */}
      <div style={{ textAlign: 'center', marginTop: 56, color: '#4a5568', fontSize: 12 }}>
        Portfolio project · UWaterloo Computer Engineering Co-op
      </div>

    </div>
  );
}

/* ── Sub-components ── */

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: '#1a1f2e', border: '1px solid #2d3748', borderRadius: 10, padding: '20px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 32, fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#718096', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function NavCard({ title, color, description, action, onClick }: {
  title: string; color: string; description: string; action: string; onClick: () => void;
}) {
  return (
    <div style={{ background: '#1a1f2e', border: '1px solid #2d3748', borderRadius: 10, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color }}>{title}</div>
      <div style={{ fontSize: 13, color: '#a0aec0', lineHeight: 1.6, flex: 1 }}>{description}</div>
      <button onClick={onClick} style={{
        background: 'none', border: `1px solid ${color}66`, color, borderRadius: 6,
        padding: '8px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
        transition: 'background 0.15s', alignSelf: 'flex-start',
      }}>
        {action} →
      </button>
    </div>
  );
}

const badgeStyle: CSSProperties = {
  fontSize: 11, background: '#1a1f2e', border: '1px solid #2d3748',
  color: '#a0aec0', padding: '3px 10px', borderRadius: 20,
};

const sectionCard: CSSProperties = {
  background: '#1a1f2e', border: '1px solid #2d3748', borderRadius: 10, padding: '24px 28px',
};

const sectionTitle: CSSProperties = {
  fontSize: 13, fontWeight: 600, color: '#718096', textTransform: 'uppercase',
  letterSpacing: '0.08em', marginBottom: 20,
};
