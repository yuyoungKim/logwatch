import type { Anomaly } from '../../types';

const SERVICE_DOT: Record<string, string> = {
  'auth-service':    '#9f7aea',
  'payment-service': '#38b2ac',
  'api-gateway':     '#fc8181',
};

function scoreTier(score: number): { label: string; color: string; bg: string } {
  if (score < -0.2) return { label: 'CRITICAL', color: '#fc8181', bg: '#63171b' };
  return               { label: 'WARNING',  color: '#f6ad55', bg: '#744210' };
}

function extractVolume(summary: string | null | undefined): string {
  const m = summary?.match(/log_volume=(\d+)/);
  return m ? m[1] : '—';
}

export function AlertCard({ anomaly }: { anomaly: Anomaly }) {
  const tier = scoreTier(anomaly.score);
  const dot  = SERVICE_DOT[anomaly.service_name ?? ''] ?? '#a0aec0';

  return (
    <div
      style={{
        background:   '#1a1f2e',
        border:       `1px solid ${tier.color}33`,
        borderRadius: 8,
        padding:      16,
        display:      'flex',
        flexDirection:'column',
        gap:          12,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: dot, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: '#e2e8f0' }}>
            {anomaly.service_name ?? 'unknown'}
          </span>
        </div>
        <span style={{ background: tier.bg, color: tier.color, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
          {tier.label}
        </span>
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
        <Metric label="Score"        value={anomaly.score.toFixed(4)}                                                  color={tier.color} />
        <Metric label="Log volume"   value={extractVolume(anomaly.summary)} />
        <Metric label="Window start" value={anomaly.window_start ? new Date(anomaly.window_start).toLocaleTimeString() : '—'} />
        <Metric label="Window end"   value={anomaly.window_end   ? new Date(anomaly.window_end).toLocaleTimeString()   : '—'} />
      </div>

      {/* Summary / LLM placeholder */}
      <div
        style={{
          background:  '#0f1117',
          borderRadius: 6,
          padding:     '10px 12px',
          fontSize:    12,
          lineHeight:  1.6,
          color:       anomaly.summary ? '#a0aec0' : '#4a5568',
          fontStyle:   anomaly.summary ? 'normal'  : 'italic',
          borderLeft:  `3px solid ${anomaly.summary ? '#4a5568' : '#2d3748'}`,
        }}
      >
        {anomaly.summary ?? 'Analysis pending…'}
      </div>

      <div style={{ fontSize: 11, color: '#4a5568' }}>
        Detected {new Date(anomaly.detected_at).toLocaleString()}
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ color: '#718096', fontSize: 11, marginBottom: 2 }}>{label}</div>
      <div style={{ color: color ?? '#e2e8f0', fontFamily: 'monospace', fontSize: 13, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
