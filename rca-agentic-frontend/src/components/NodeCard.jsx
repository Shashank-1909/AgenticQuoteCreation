import React from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';

/** Pulsing animated ring for active nodes */
export const PulseRing = ({ color, radius }) => (
  <div style={{
    position: 'absolute', inset: -3, borderRadius: radius ?? 18, pointerEvents: 'none',
    border: `1.5px solid ${color}`,
    animation: 'pulse-ring 2s ease-out infinite',
  }} />
);

/** Unified card node — used for both Deal Manager and sub-agents */
const NodeCard = ({
  label, subLabel, icon: Icon,
  w, h, borderRadius = 16,
  accentColor, glowColor,
  isIdle, isActive, isDone,
  style = {},
}) => {
  const lit = isActive || isDone;
  return (
    <div style={{
      width: w, height: h, borderRadius,
      background: 'var(--card-bg)',
      backgroundImage: isActive ? `linear-gradient(135deg, ${accentColor}11, transparent)` : 'none',
      border: `2px solid ${isActive ? accentColor
          : isDone ? accentColor + '55'
            : 'var(--glass-border)'
        }`,
      boxShadow: isActive
        ? `0 10px 40px -10px ${accentColor}80`
        : isDone
          ? `0 4px 15px rgba(0,0,0,0.05)`
          : 'none',
      display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px',
      backdropFilter: 'blur(20px)',
      transition: 'all 0.85s cubic-bezier(0.4,0,0.2,1)',
      position: 'relative',
      ...style,
    }}>
      {/* Icon circle - Solid LED effect when active */}
      <div style={{
        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
        background: isActive ? accentColor : lit ? `${accentColor}15` : 'var(--glass-border)',
        border: `2px solid ${isActive ? accentColor : lit ? accentColor + '66' : 'var(--glass-border)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: isActive ? '#fff' : lit ? accentColor : 'var(--text-muted)',
        transition: 'all 0.85s',
        boxShadow: isActive ? `0 0 20px ${accentColor}80` : 'none',
      }}>
        {isActive
          ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#fff' }} />
          : isDone
            ? <CheckCircle2 size={18} color={accentColor} />
            : <Icon size={18} />
        }
      </div>

      {/* Text */}
      <div>
        <div style={{
          fontSize: 10, fontWeight: 900, letterSpacing: '0.17em', textTransform: 'uppercase',
          color: 'var(--text-main)',
          opacity: isIdle ? 0.4 : 1,
          transition: 'color 0.85s',
        }}>{label}</div>
        <div style={{
          fontSize: 8.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
          marginTop: 3,
          color: isActive ? 'var(--text-main)' : isDone ? accentColor + 'aa' : 'var(--text-muted)',
          opacity: isIdle ? 0.3 : 1,
          transition: 'color 0.85s',
          animation: isActive ? 'soft-pulse 1.8s ease-in-out infinite' : 'none',
        }}>{subLabel}</div>
      </div>

      {isActive && <PulseRing color={accentColor} radius={borderRadius + 2} />}
    </div>
  );
};

export default NodeCard;
