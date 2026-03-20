import type { Severity } from '../../types';

const PALETTE: Record<Severity, { bg: string; text: string }> = {
  DEBUG: { bg: '#2d3748', text: '#a0aec0' },
  INFO:  { bg: '#1a365d', text: '#63b3ed' },
  WARN:  { bg: '#744210', text: '#f6ad55' },
  ERROR: { bg: '#63171b', text: '#fc8181' },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const { bg, text } = PALETTE[severity] ?? PALETTE.DEBUG;
  return (
    <span
      style={{
        background:    bg,
        color:         text,
        padding:       '2px 8px',
        borderRadius:  4,
        fontSize:      11,
        fontWeight:    700,
        fontFamily:    'monospace',
        letterSpacing: '0.04em',
        whiteSpace:    'nowrap',
      }}
    >
      {severity}
    </span>
  );
}
