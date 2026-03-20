export type Severity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface Log {
  id:           string;
  timestamp:    string;
  severity:     Severity;
  service_name: string;
  message:      string;
  request_id?:  string | null;
}

export interface Anomaly {
  id:           string;
  log_id?:      string | null;
  score:        number;
  detected_at:  string;
  summary?:     string | null;
  window_start?: string | null;
  window_end?:   string | null;
  service_name?: string | null;
}

export interface Stats {
  severity_counts:  Partial<Record<Severity, number>>;
  anomaly_count_1h: number;
  active_services:  string[];
}
