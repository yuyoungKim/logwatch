import type { Anomaly } from '../../types';
import { AlertCard } from './AlertCard';

export function AlertCards({ anomalies, loading }: { anomalies: Anomaly[]; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: '#4a5568' }}>
        Loading alerts…
      </div>
    );
  }

  if (anomalies.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: '#4a5568' }}>
        No anomalies detected yet.
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 16 }}>
        Recent Anomalies
        <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: '#718096' }}>
          ({anomalies.length})
        </span>
      </h2>

      <div
        style={{
          display:               'grid',
          gridTemplateColumns:   'repeat(auto-fill, minmax(340px, 1fr))',
          gap:                   16,
        }}
      >
        {anomalies.map((a) => (
          <AlertCard key={a.id} anomaly={a} />
        ))}
      </div>
    </div>
  );
}
