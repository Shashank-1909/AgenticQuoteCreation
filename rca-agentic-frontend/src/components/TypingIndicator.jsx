import React from 'react';

// ─────────────────────────────────────────────────────────────
// TYPING INDICATOR — shown in left pane while agent is composing reply after tools
// ─────────────────────────────────────────────────────────────
const TypingIndicator = () => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '8px 13px',
    background: 'rgba(129,140,248,0.04)',
    border: '1px solid rgba(129,140,248,0.1)',
    borderRadius: 12, width: 'fit-content',
    marginBottom: 6,
  }}>
    {[0, 1, 2].map(i => (
      <div key={i} style={{
        width: 5, height: 5, borderRadius: '50%',
        background: '#818cf8',
        animation: `typing-bounce 1.1s ease-in-out ${i * 0.18}s infinite`,
      }} />
    ))}
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: 'rgba(129,140,248,0.45)',
      marginLeft: 7,
    }}>Composing reply…</span>
  </div>
);

export default TypingIndicator;
