import React from 'react';
import { CheckCircle2 } from 'lucide-react';

const TOOL_R = 22;

/** Small circular tool node — active=pulsing, done=checkmark, idle=dim */
const ToolNode = ({ cx, cy, label, color, active, done, isDark = true }) => (
  <div style={{
    position: 'absolute',
    left: cx - TOOL_R, top: cy - TOOL_R,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    animation: 'tool-appear 0.5s cubic-bezier(0.34,1.56,0.64,1) both',
    transition: 'left 0.72s cubic-bezier(0.4,0,0.2,1), top 0.72s cubic-bezier(0.4,0,0.2,1)',
  }}>
    <div style={{
      width: TOOL_R * 2, height: TOOL_R * 2, borderRadius: '50%',
      background: active ? `${color}22` : done ? `${color}0e` : `${color}10`,
      border: `${isDark ? 1.5 : 2}px solid ${color}${active ? (isDark ? 'cc' : 'ee') : done ? (isDark ? '40' : '99') : (isDark ? '55' : 'bb')}`,
      boxShadow: active ? `0 0 ${isDark ? 14 : 20}px ${color}${isDark ? '55' : '99'}, 0 0 ${isDark ? 28 : 40}px ${color}${isDark ? '22' : '44'}` : 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.4s',
      animation: active ? 'tool-glow-pulse 1.4s ease-in-out infinite' : 'none',
    }}>
      {done
        ? <CheckCircle2 size={13} color={color} />
        : active
          ? <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', boxShadow: `0 0 6px #fff` }} />
          : <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', opacity: 0.35 }} />
      }
    </div>
    <div style={{
      fontSize: 7, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase',
      color: active
        ? (isDark ? `${color}cc` : color)
        : done
          ? (isDark ? `${color}55` : `${color}cc`)
          : (isDark ? `${color}66` : `${color}dd`),
      marginTop: 5, textAlign: 'center',
      whiteSpace: 'normal', wordBreak: 'break-word',
      maxWidth: 54, lineHeight: 1.25,
      overflow: 'visible',
      transition: 'color 0.4s',

    }}>{label}</div>
  </div>
);

export default ToolNode;
