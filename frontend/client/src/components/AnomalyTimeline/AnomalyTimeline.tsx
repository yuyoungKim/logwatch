import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { Anomaly } from '../../types';

const SERVICE_COLORS: Record<string, string> = {
  'auth-service':    '#9f7aea', // purple
  'payment-service': '#38b2ac', // teal
  'api-gateway':     '#fc8181', // coral
};

const SERVICES = ['auth-service', 'payment-service', 'api-gateway'];

interface DataPoint {
  time:      number;
  timeLabel: string;
  [service: string]: number | string;
}

interface ChartClick {
  activePayload?: Array<{ dataKey: string; value: number; payload: DataPoint }>;
}

function buildChartData(anomalies: Anomaly[]): DataPoint[] {
  const byTime = new Map<string, DataPoint>();

  for (const a of anomalies) {
    if (!a.window_end || !a.service_name) continue;
    const t = new Date(a.window_end);
    // Round to 10 s buckets so overlapping windows merge cleanly.
    t.setSeconds(Math.floor(t.getSeconds() / 10) * 10, 0);
    const key = t.toISOString();

    if (!byTime.has(key)) {
      byTime.set(key, { time: t.getTime(), timeLabel: t.toLocaleTimeString() });
    }
    (byTime.get(key) as DataPoint)[a.service_name] = a.score;
  }

  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

export function AnomalyTimeline({ anomalies, loading }: { anomalies: Anomaly[]; loading: boolean }) {
  const [selected, setSelected] = useState<Anomaly | null>(null);

  if (loading) {
    return <Placeholder>Loading timeline…</Placeholder>;
  }
  if (anomalies.length === 0) {
    return <Placeholder>No anomalies yet — model is warming up.</Placeholder>;
  }

  const data = buildChartData(anomalies);

  const handleClick = (chartData: ChartClick) => {
    const payload = chartData?.activePayload?.[0];
    if (!payload) return;
    const match = anomalies.find(
      (a) => a.service_name === payload.dataKey && Math.abs(a.score - payload.value) < 1e-6,
    );
    if (match) setSelected(match);
  };

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 12 }}>
        Anomaly Score Over Time
      </h2>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 14, flexWrap: 'wrap' }}>
        {SERVICES.map((s) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#a0aec0' }}>
            <span style={{ width: 14, height: 3, background: SERVICE_COLORS[s], display: 'inline-block', borderRadius: 2 }} />
            {s}
          </div>
        ))}
        <span style={{ fontSize: 12, color: '#718096', marginLeft: 'auto' }}>
          Click a point to inspect the window
        </span>
      </div>

      <div style={{ background: '#1a1f2e', borderRadius: 8, border: '1px solid #2d3748', padding: '20px 8px 12px' }}>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data} onClick={handleClick} style={{ cursor: 'pointer' }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
            <XAxis
              dataKey="timeLabel"
              stroke="#4a5568"
              tick={{ fill: '#718096', fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="#4a5568"
              tick={{ fill: '#718096', fontSize: 11 }}
              domain={[-0.8, 0]}
              tickFormatter={(v: number) => v.toFixed(2)}
            />
            <Tooltip
              contentStyle={{ background: '#2d3748', border: '1px solid #4a5568', borderRadius: 6, fontSize: 12 }}
              labelStyle={{ color: '#e2e8f0' }}
              itemStyle={{ color: '#a0aec0' }}
              formatter={(v: number) => [v.toFixed(4), '']}
            />
            <ReferenceLine
              y={-0.1}
              stroke="#f6ad55"
              strokeDasharray="4 2"
              label={{ value: 'threshold', fill: '#f6ad55', fontSize: 10, position: 'insideTopRight' }}
            />
            {SERVICES.map((s) => (
              <Line
                key={s}
                type="monotone"
                dataKey={s}
                stroke={SERVICE_COLORS[s]}
                dot={false}
                strokeWidth={2}
                connectNulls={false}
                activeDot={{ r: 5, strokeWidth: 0 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Window detail panel */}
      {selected && (
        <div style={{
          marginTop: 14,
          background: '#1a1f2e',
          border: `1px solid ${SERVICE_COLORS[selected.service_name ?? ''] ?? '#4a5568'}`,
          borderRadius: 8,
          padding: 16,
          position: 'relative',
        }}>
          <button
            onClick={() => setSelected(null)}
            style={{ position: 'absolute', top: 10, right: 12, background: 'none', border: 'none', color: '#718096', cursor: 'pointer', fontSize: 18 }}
          >
            ✕
          </button>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 12 }}>
            Window Detail — {selected.service_name}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            <Detail label="Score"        value={selected.score.toFixed(4)} />
            <Detail label="Window start" value={selected.window_start ? new Date(selected.window_start).toLocaleString() : '—'} />
            <Detail label="Window end"   value={selected.window_end   ? new Date(selected.window_end).toLocaleString()   : '—'} />
            <Detail label="Detected at"  value={new Date(selected.detected_at).toLocaleString()} />
          </div>
          {selected.summary && (
            <p style={{ marginTop: 12, fontSize: 13, color: '#a0aec0', lineHeight: 1.6 }}>
              {selected.summary}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ textAlign: 'center', padding: '80px 0', color: '#4a5568', fontSize: 15 }}>
      {children}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: '#718096', fontSize: 11, marginBottom: 3 }}>{label}</div>
      <div style={{ color: '#e2e8f0', fontFamily: 'monospace', fontSize: 13 }}>{value}</div>
    </div>
  );
}
