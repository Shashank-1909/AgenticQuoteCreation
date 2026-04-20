import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, CheckCircle2, Loader2, Zap, Settings,
  TrendingUp, ExternalLink, ArrowRight, Database,
  Search, FileText, Network
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// CSS KEYFRAMES
// ─────────────────────────────────────────────────────────────
const STYLES = `
  @keyframes pulse-ring {
    0%   { opacity: 0.8; transform: scale(1);    }
    100% { opacity: 0;   transform: scale(1.38); }
  }
  @keyframes tool-appear {
    from { opacity: 0; transform: scale(0.4) translateY(10px); }
    to   { opacity: 1; transform: scale(1)   translateY(0);   }
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes soft-pulse {
    0%, 100% { opacity: 0.75; }
    50%       { opacity: 1;   }
  }
  @keyframes float-up {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0);    }
  }
  @keyframes slide-up-in {
    from { opacity: 0; transform: translateY(30px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0)    scale(1);    }
  }
`;

// ─────────────────────────────────────────────────────────────
// GRAPH LAYOUT CONSTANTS  (SVG + DOM coordinate space, px)
// ─────────────────────────────────────────────────────────────
const GW = 480;   // graph canvas width
const GH = 560;   // graph canvas height

// Deal Manager card (active / top position)
const DM_W = 160, DM_H = 76;
const DM_ACTIVE_TOP  = 30;                            // top when active
const DM_IDLE_TOP    = GH / 2 - DM_H / 2 - 20;       // vertically centered when idle
const DM_LEFT        = GW / 2 - DM_W / 2;            // always horizontally centered
const DM_ACTIVE_CY   = DM_ACTIVE_TOP + DM_H / 2;     // = 68
const DM_ACTIVE_BOT  = DM_ACTIVE_TOP + DM_H;         // = 106

// Agent cards (Catalog Scout = left, Quote Architect = right)
const SC = { cx: 118, cy: 255, w: 140, h: 70 };  // Scout center
const AC = { cx: 362, cy: 255, w: 140, h: 70 };  // Arch  center
const SC_TOP  = SC.cy - SC.h / 2;  // 220
const AC_TOP  = AC.cy - AC.h / 2;  // 220
const SC_BOT  = SC.cy + SC.h / 2;  // 290
const AC_BOT  = AC.cy + AC.h / 2;  // 290
const MID_Y   = (DM_ACTIVE_BOT + SC_TOP) / 2;  // ≈ 163

// SVG bezier paths: DM-bottom → agent-top
const PATH_CS = `M ${GW/2} ${DM_ACTIVE_BOT} C ${GW/2} ${MID_Y} ${SC.cx} ${MID_Y} ${SC.cx} ${SC_TOP}`;
const PATH_CA = `M ${GW/2} ${DM_ACTIVE_BOT} C ${GW/2} ${MID_Y} ${AC.cx} ${MID_Y} ${AC.cx} ${AC_TOP}`;

// Tool circle radius
const TOOL_R = 22;
const TOOL_CURVE_MID_Y = 368;

// Dynamic tool positions — 4 circles spread symmetrically around the agent's cx
const getToolPositions = (agentCx) => [
  { x: agentCx - 80, y: 435 },
  { x: agentCx - 26, y: 450 },
  { x: agentCx + 26, y: 450 },
  { x: agentCx + 80, y: 435 },
];

// Curved bezier from agent-bottom to tool-top (same style as coordinator→agent paths)
const makeToolPath = (agentCx, agentBot, tp) =>
  `M ${agentCx} ${agentBot} C ${agentCx} ${TOOL_CURVE_MID_Y} ${tp.x} ${TOOL_CURVE_MID_Y} ${tp.x} ${tp.y - TOOL_R}`;

// Short display names for tools
const TOOL_LABELS = {
  check_field_values:        'Field Check',
  search_rca_products:       'Prod. Search',
  search_products_by_filter: 'Filter Search',
  resolve_pricebook_entries: 'Pricebook',
  evaluate_quote_graph:      'CPQ Quote',
  transfer_to_agent:         'Route',
};
const shortLabel = (t) => TOOL_LABELS[t] || t.replace(/_/g, ' ').slice(0, 12);

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

/** Pulsing animated ring for active nodes */
const PulseRing = ({ color, radius }) => (
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
      background: isActive
        ? `linear-gradient(135deg, ${accentColor}28, ${accentColor}10)`
        : 'rgba(8,10,20,0.96)',
      border: `1.5px solid ${
        isActive ? accentColor + 'cc'
        : isDone  ? accentColor + '55'
        : 'rgba(255,255,255,0.05)'    /* idle: nearly invisible */
      }`,
      boxShadow: isActive
        ? `0 0 30px ${glowColor}, 0 0 64px ${glowColor}50`
        : isDone
        ? `0 0 14px ${glowColor}30`
        : 'none',                     /* idle: no glow */
      display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px',
      backdropFilter: 'blur(20px)',
      transition: 'all 0.85s cubic-bezier(0.4,0,0.2,1)',
      position: 'relative',
      ...style,
    }}>
      {/* Icon circle */}
      <div style={{
        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
        background: lit ? `${accentColor}22` : 'rgba(255,255,255,0.02)',
        border: `1.5px solid ${lit ? accentColor + '88' : 'rgba(255,255,255,0.05)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: lit ? accentColor : 'rgba(255,255,255,0.12)',
        transition: 'all 0.85s',
      }}>
        {isActive
          ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: accentColor }} />
          : isDone
          ? <CheckCircle2 size={18} color={accentColor} />
          : <Icon size={18} />
        }
      </div>

      {/* Text */}
      <div>
        <div style={{
          fontSize: 10, fontWeight: 900, letterSpacing: '0.17em', textTransform: 'uppercase',
          color: isActive ? '#fff' : isDone ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.12)',
          transition: 'color 0.85s',
        }}>{label}</div>
        <div style={{
          fontSize: 8.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
          marginTop: 3,
          color: isActive ? accentColor + 'dd' : isDone ? accentColor + '77' : 'rgba(255,255,255,0.07)',
          transition: 'color 0.85s',
          animation: isActive ? 'soft-pulse 1.8s ease-in-out infinite' : 'none',
        }}>{subLabel}</div>
      </div>

      {isActive && <PulseRing color={accentColor} radius={borderRadius + 2} />}
    </div>
  );
};

/** Small circular tool node */
const ToolNode = ({ cx, cy, label, color, active, done }) => (
  <div style={{
    position: 'absolute',
    left: cx - TOOL_R, top: cy - TOOL_R,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    animation: 'tool-appear 0.5s cubic-bezier(0.34,1.56,0.64,1) both',
    transition: 'left 0.72s cubic-bezier(0.4,0,0.2,1)',
  }}>
    <div style={{
      width: TOOL_R * 2, height: TOOL_R * 2, borderRadius: '50%',
      background: `${color}18`,
      border: `1.5px solid ${color}${done ? '44' : '99'}`,
      boxShadow: active ? `0 0 18px ${color}44` : 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.5s',
    }}>
      {done
        ? <CheckCircle2 size={13} color={color} opacity={0.6} />
        : <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, opacity: 0.85 }} />
      }
    </div>
    <div style={{
      fontSize: 7, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase',
      color: `${color}88`, marginTop: 5, textAlign: 'center',
      whiteSpace: 'nowrap', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis',
    }}>{label}</div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// ORCHESTRATION GRAPH
// ─────────────────────────────────────────────────────────────
const AgentGraph = ({ orchestration, graphActive, graphReady }) => {
  const { coordinator, Catalog_Scout: scout, Quote_Architect: arch } = orchestration;

  const cActive = coordinator === 'active', cDone = coordinator === 'done', cLit = cActive || cDone;
  const sActive = scout.state === 'active', sDone = scout.state === 'done';
  const aActive = arch.state  === 'active', aDone = arch.state  === 'done';

  const showScout  = scout.state !== 'idle';
  const showArch   = arch.state  !== 'idle';
  const bothAgents = showScout && showArch;

  // ── Dynamic agent positions ──────────────────────────────
  // Single agent → centered (GW/2). Both agents → original left/right split.
  const scoutCx   = bothAgents ? SC.cx   : GW / 2;
  const archCx    = bothAgents ? AC.cx   : GW / 2;
  const scoutLeft = scoutCx - SC.w / 2;
  const archLeft  = archCx  - AC.w / 2;

  // ── Dynamic SVG paths (coordinator → each agent) ─────────
  const midY        = (DM_ACTIVE_BOT + SC_TOP) / 2;  // ≈ 163
  const pathToScout = `M ${GW/2} ${DM_ACTIVE_BOT} C ${GW/2} ${midY} ${scoutCx} ${midY} ${scoutCx} ${SC_TOP}`;
  const pathToArch  = `M ${GW/2} ${DM_ACTIVE_BOT} C ${GW/2} ${midY} ${archCx}  ${midY} ${archCx}  ${AC_TOP}`;

  // ── Dynamic tool positions (relative to agent cx) ─────────
  const scoutToolPos = getToolPositions(scoutCx);
  const archToolPos  = getToolPositions(archCx);

  // DM vertical position
  const dmTop = graphActive ? DM_ACTIVE_TOP : DM_IDLE_TOP;

  return (
    <div style={{ position: 'relative', width: GW, height: GH, margin: '0 auto', flexShrink: 0 }}>

      {/* ── SVG layer ── */}
      <svg viewBox={`0 0 ${GW} ${GH}`} style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        overflow: 'visible', pointerEvents: 'none',
      }}>
        <defs>
          {[['cyan','2.5'],['amber','2.5']].map(([n,s]) => (
            <filter key={n} id={`glow-${n}`}>
              <feGaussianBlur stdDeviation={s} result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          ))}
          {/* Dedicated glow for coordinator connector lines */}
          <filter id="glow-conn" filterUnits="userSpaceOnUse"
            x="0" y="0" width={GW} height={GH}>
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

          {/* Gradient: DM indigo → Scout cyan  (follows the bezier direction) */}
          <linearGradient id="grad-scout"
            x1={GW/2} y1={DM_ACTIVE_BOT}
            x2={scoutCx} y2={SC_TOP}
            gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#818cf8"/>
            <stop offset="100%" stopColor="#22d3ee"/>
          </linearGradient>

          {/* Gradient: DM indigo → Arch amber */}
          <linearGradient id="grad-arch"
            x1={GW/2} y1={DM_ACTIVE_BOT}
            x2={archCx} y2={AC_TOP}
            gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#818cf8"/>
            <stop offset="100%" stopColor="#fbbf24"/>
          </linearGradient>
        </defs>

        {graphReady && (
          <>
            {/* DM → Scout  — Circuit Trace: 3 layers */}
            {showScout && (
              <>
                {/* L1: Ghost channel — always visible, dim */}
                <path id="pcs" d={pathToScout}
                  stroke="url(#grad-scout)"
                  strokeWidth={1.5} fill="none"
                  strokeOpacity={cLit ? 0.22 : 0.06}
                />
                {/* L2: Flowing dashes — active only */}
                {sActive && (
                  <path d={pathToScout}
                    stroke="url(#grad-scout)"
                    strokeWidth={2} fill="none"
                    style={{
                      strokeDasharray: '6 18',
                      animation: 'flowDash 0.65s linear infinite',
                    }}
                  />
                )}
                {/* L3: Leading dot — active only */}
                {sActive && (
                  <circle r="4" fill="#22d3ee">
                    <animateMotion dur="1.5s" repeatCount="indefinite" calcMode="linear">
                      <mpath href="#pcs"/>
                    </animateMotion>
                  </circle>
                )}
              </>
            )}

            {/* DM → Architect  — Circuit Trace: 3 layers */}
            {showArch && (
              <>
                {/* L1: Ghost channel */}
                <path id="pca" d={pathToArch}
                  stroke="url(#grad-arch)"
                  strokeWidth={1.5} fill="none"
                  strokeOpacity={cLit ? 0.22 : 0.06}
                />
                {/* L2: Flowing dashes — active only */}
                {aActive && (
                  <path d={pathToArch}
                    stroke="url(#grad-arch)"
                    strokeWidth={2} fill="none"
                    style={{
                      strokeDasharray: '6 18',
                      animation: 'flowDash 0.65s linear infinite',
                    }}
                  />
                )}
                {/* L3: Leading dot — active only */}
                {aActive && (
                  <circle r="4" fill="#fbbf24">
                    <animateMotion dur="1.5s" repeatCount="indefinite" calcMode="linear">
                      <mpath href="#pca"/>
                    </animateMotion>
                  </circle>
                )}
              </>
            )}

            {/* Scout → tool curves — Circuit Trace style */}
            {scout.tools.slice(0, 4).map((tool, i) => {
              const tp = scoutToolPos[i];
              const pid = `ps${i}`;
              const d = makeToolPath(scoutCx, SC_BOT, tp);
              return (
                <React.Fragment key={tool}>
                  {/* L1: Ghost channel */}
                  <path id={pid} d={d}
                    stroke="#22d3ee" strokeWidth={1.2} fill="none"
                    strokeOpacity={sDone ? 0.12 : 0.22}
                  />
                  {/* L2: Flowing dashes — active only */}
                  {sActive && (
                    <path d={d}
                      stroke="#22d3ee" strokeWidth={1.5} fill="none"
                      style={{ strokeDasharray: '6 18', animation: 'flowDash 0.55s linear infinite' }}
                    />
                  )}
                  {/* L3: Leading dot — active only */}
                  {sActive && (
                    <circle r="3" fill="#22d3ee" filter="url(#glow-cyan)">
                      <animateMotion dur="1.0s" repeatCount="indefinite" calcMode="linear">
                        <mpath href={`#${pid}`}/>
                      </animateMotion>
                    </circle>
                  )}
                </React.Fragment>
              );
            })}

            {/* Arch → tool curves — Circuit Trace style */}
            {arch.tools.slice(0, 4).map((tool, i) => {
              const tp = archToolPos[i];
              const pid = `pa${i}`;
              const d = makeToolPath(archCx, AC_BOT, tp);
              return (
                <React.Fragment key={tool}>
                  {/* L1: Ghost channel */}
                  <path id={pid} d={d}
                    stroke="#fbbf24" strokeWidth={1.2} fill="none"
                    strokeOpacity={aDone ? 0.12 : 0.22}
                  />
                  {/* L2: Flowing dashes — active only */}
                  {aActive && (
                    <path d={d}
                      stroke="#fbbf24" strokeWidth={1.5} fill="none"
                      style={{ strokeDasharray: '6 18', animation: 'flowDash 0.55s linear infinite' }}
                    />
                  )}
                  {/* L3: Leading dot — active only */}
                  {aActive && (
                    <circle r="3" fill="#fbbf24" filter="url(#glow-amber)">
                      <animateMotion dur="1.0s" repeatCount="indefinite" calcMode="linear">
                        <mpath href={`#${pid}`}/>
                      </animateMotion>
                    </circle>
                  )}
                </React.Fragment>
              );
            })}
          </>
        )}
      </svg>

      {/* ── DOM nodes ── */}

      {/* Deal Manager — slides from center to top on first query */}
      <div style={{
        position: 'absolute',
        left: DM_LEFT, top: dmTop,
        width: DM_W, height: DM_H,
        transition: 'top 0.78s cubic-bezier(0.4,0,0.2,1)',
        zIndex: 10,
      }}>
        <NodeCard
          label="Deal Manager" subLabel={cActive ? 'Routing…' : cDone ? 'Dispatched' : 'Coordinator'}
          icon={Network} w={DM_W} h={DM_H} borderRadius={16}
          accentColor="#818cf8" glowColor="rgba(99,102,241,0.5)"
          isIdle={!cActive && !cDone} isActive={cActive} isDone={cDone}
        />
      </div>

      {/* Agent cards — appear only when activated, shift left when peer arrives */}
      {graphReady && showScout && (
        <div style={{
          position: 'absolute',
          left: scoutLeft, top: SC_TOP,
          transition: 'left 0.72s cubic-bezier(0.4,0,0.2,1)',
          animation: 'slide-up-in 0.55s cubic-bezier(0.4,0,0.2,1) both',
        }}>
          <NodeCard
            label="Catalog Scout" subLabel={sActive ? 'Executing…' : 'Completed'}
            icon={Search} w={SC.w} h={SC.h} borderRadius={16}
            accentColor="#22d3ee" glowColor="rgba(6,182,212,0.5)"
            isIdle={false} isActive={sActive} isDone={sDone}
          />
          <div style={{
            textAlign: 'center', fontSize: 7.5, fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: '#22d3ee55', marginTop: 8,
          }}>Catalog Scout</div>
        </div>
      )}

      {graphReady && showArch && (
        <div style={{
          position: 'absolute',
          left: archLeft, top: AC_TOP,
          transition: 'left 0.72s cubic-bezier(0.4,0,0.2,1)',
          animation: 'slide-up-in 0.55s cubic-bezier(0.4,0,0.2,1) both',
          animationDelay: showScout ? '0.1s' : '0s',
        }}>
          <NodeCard
            label="Quote Architect" subLabel={aActive ? 'Executing…' : 'Completed'}
            icon={FileText} w={AC.w} h={AC.h} borderRadius={16}
            accentColor="#fbbf24" glowColor="rgba(245,158,11,0.5)"
            isIdle={false} isActive={aActive} isDone={aDone}
          />
          <div style={{
            textAlign: 'center', fontSize: 7.5, fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: '#fbbf2455', marginTop: 8,
          }}>Quote Architect</div>
        </div>
      )}

      {/* Tool circles — positions follow their parent agent's cx */}
      {graphReady && scout.tools.slice(0, 4).map((tool, i) => {
        const tp = scoutToolPos[i];
        return (
          <ToolNode key={tool} cx={tp.x} cy={tp.y}
            label={shortLabel(tool)} color="#22d3ee"
            active={sActive} done={sDone} />
        );
      })}

      {graphReady && arch.tools.slice(0, 4).map((tool, i) => {
        const tp = archToolPos[i];
        return (
          <ToolNode key={tool} cx={tp.x} cy={tp.y}
            label={shortLabel(tool)} color="#fbbf24"
            active={aActive} done={aDone} />
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// INITIAL ORCHESTRATION STATE
// ─────────────────────────────────────────────────────────────
const INIT_ORCH = {
  coordinator: 'idle',
  Catalog_Scout:   { state: 'idle', tools: [] },
  Quote_Architect: { state: 'idle', tools: [] },
};

// ─────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────
const App = () => {
  const [messages, setMessages]           = useState([
    { id: 1, role: 'assistant', content: 'Command Center Online. Awaiting instructions for Salesforce RCA.' }
  ]);
  const [inputValue, setInputValue]       = useState('');
  const [workflowState, setWorkflowState] = useState('idle');
  const [orchestration, setOrchestration] = useState(INIT_ORCH);
  const [results, setResults]             = useState([]);
  const [quote, setQuote]                 = useState(null);

  // Graph animation state
  const [graphActive, setGraphActive]     = useState(false); // triggers DM slide-up
  const [graphReady, setGraphReady]       = useState(false); // shows paths+agents after slide

  const [leftWidth,  setLeftWidth]        = useState(260);
  const [rightWidth, setRightWidth]       = useState(300);
  const [isResizingLeft,  setIsResizingLeft]  = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  const chatEndRef = useRef(null);
  const ws         = useRef(null);
  const centerRef  = useRef(null);
  const [graphScale, setGraphScale] = useState(1);

  // ── Panel resizing ──────────────────────────────────────────
  const startResizingLeft  = useCallback(() => setIsResizingLeft(true),  []);
  const startResizingRight = useCallback(() => setIsResizingRight(true), []);
  const stopResizing = useCallback(() => { setIsResizingLeft(false); setIsResizingRight(false); }, []);
  const resize = useCallback((e) => {
    if (isResizingLeft)  setLeftWidth(Math.max(80, Math.min(e.clientX, window.innerWidth * 0.25)));
    if (isResizingRight) setRightWidth(Math.max(80, Math.min(window.innerWidth - e.clientX, window.innerWidth * 0.3)));
  }, [isResizingLeft, isResizingRight]);

  useEffect(() => {
    if (isResizingLeft || isResizingRight) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup',  stopResizing);
    }
    return () => { window.removeEventListener('mousemove', resize); window.removeEventListener('mouseup', stopResizing); };
  }, [isResizingLeft, isResizingRight, resize, stopResizing]);

  // ── Chat scroll ────────────────────────────────────────────
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Graph scale (responsive) ───────────────────────────────
  useEffect(() => {
    if (!centerRef.current) return;
    const obs = new ResizeObserver(([e]) => {
      setGraphScale(Math.min(1, (e.contentRect.width - 40) / GW));
    });
    obs.observe(centerRef.current);
    return () => obs.disconnect();
  }, []);

  // ── graphReady delay (750ms after graph becomes active) ────
  useEffect(() => {
    if (graphActive) {
      const t = setTimeout(() => setGraphReady(true), 750);
      return () => clearTimeout(t);
    } else {
      setGraphReady(false);
    }
  }, [graphActive]);

  // ── WebSocket ──────────────────────────────────────────────
  useEffect(() => {
    ws.current = new WebSocket('ws://localhost:8001/ws/orchestrate');
    ws.current.onopen = () => console.log('[WS] Connected to agent_v2.py');

    ws.current.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);

        switch (data.type) {

          case 'STATE':
            setWorkflowState(data.state);
            if (data.state === 'completed') {
              setOrchestration(prev => {
                const n = { ...prev };
                if (n.coordinator === 'active') n.coordinator = 'done';
                for (const k of ['Catalog_Scout', 'Quote_Architect']) {
                  if (n[k].state === 'active') n[k] = { ...n[k], state: 'done' };
                }
                return n;
              });
            }
            break;

          case 'AGENT_START':
            setOrchestration(prev => {
              const name = data.agent;
              const n = { ...prev };
              if (name === 'Deal_Manager') {
                n.coordinator = 'active';
              } else if (name === 'Catalog_Scout' || name === 'Quote_Architect') {
                for (const k of ['Catalog_Scout', 'Quote_Architect']) {
                  if (n[k].state === 'active') n[k] = { ...n[k], state: 'done' };
                }
                if (n.coordinator === 'active') n.coordinator = 'done';
                n[name] = { ...n[name], state: 'active' };
              }
              return n;
            });
            break;

          case 'TOOL_TRIGGER':
            setOrchestration(prev => {
              const n = { ...prev };
              for (const k of ['Catalog_Scout', 'Quote_Architect']) {
                if (n[k].state === 'active') {
                  if (!n[k].tools.includes(data.tool)) {
                    n[k] = { ...n[k], tools: [...n[k].tools, data.tool] };
                  }
                  break;
                }
              }
              return n;
            });
            break;

          case 'TOOL_RESULT':
            try {
              const parsed = JSON.parse(data.data);
              if ((data.tool === 'search_rca_products' || data.tool === 'search_products_by_filter') && parsed.results) {
                setResults(parsed.results.map((r, i) => ({
                  id: r.id || i, name: r.name || 'Unknown', sku: r.code || 'N/A',
                })));
              }
              if (data.tool === 'evaluate_quote_graph' && parsed.salesforce_response) {
                const resp  = parsed.salesforce_response;
                const graph = resp?.graphs?.[0];
                const qRec  = graph?.graphNodes?.find(n => n.referenceId === 'refQuote');
                const qId   = qRec?.record?.id || resp?.id || 'Generated';
                const inst  = parsed.instance_url || 'https://login.salesforce.com';
                setQuote({ id: qId, status: 'Draft', sfLink: qId !== 'Generated' ? `${inst}/lightning/r/Quote/${qId}/view` : null });
              }
            } catch (_) {}
            break;

          case 'FINAL_REPLY':
            if (data.data?.trim()) {
              setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: data.data }]);
            }
            break;

          case 'ERROR':
            setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: `⚠️ ${data.data}` }]);
            setWorkflowState('idle');
            break;
        }
      } catch (err) {
        console.error('[WS] parse error', err);
      }
    };

    return () => { if (ws.current) ws.current.close(); };
  }, []);

  // ── Send message ───────────────────────────────────────────
  const handleSend = (e) => {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text || workflowState === 'orchestrating' || workflowState === 'executing') return;

    setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: text }]);
    setInputValue('');

    // Trigger DM slide-up immediately on send
    if (!graphActive) setGraphActive(true);

    // Reset orchestration only on a fresh session (idle state)
    if (workflowState === 'idle') {
      setResults([]); setQuote(null); setOrchestration(INIT_ORCH);
    }

    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(text);
    } else {
      setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: 'Backend disconnected. Start agent_v2.py on port 8001.' }]);
    }
  };

  const reset = () => {
    setWorkflowState('idle');
    setOrchestration(INIT_ORCH);
    setGraphActive(false);
    setResults([]);
    setQuote(null);
  };

  const isBusy = workflowState === 'orchestrating' || workflowState === 'executing';

  // ─────────────────────────────────────────────────────────────
  return (
    <>
      <style>{STYLES}</style>

      <div className={`h-screen w-full bg-[#020306] text-slate-200 font-sans flex overflow-hidden selection:bg-indigo-500/30 ${isResizingLeft || isResizingRight ? 'cursor-col-resize select-none' : ''}`}>

        {/* ═══════════════════════════════════════════════════
            LEFT — COMMAND PANEL
        ═══════════════════════════════════════════════════ */}
        <section
          className="h-full border-r border-white/[0.04] bg-[#05060a] flex flex-col relative z-20 shrink-0 overflow-hidden"
          style={{ width: leftWidth }}
        >
          <div className="p-7 pb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-[0_0_20px_rgba(79,70,229,0.4)] shrink-0">
                <Zap size={16} fill="white" className="text-white" />
              </div>
              {leftWidth > 140 && <h1 className="text-[10px] font-black uppercase tracking-[0.3em] text-white whitespace-nowrap">Command</h1>}
            </div>
            {leftWidth > 140 && <Settings size={14} className="text-slate-700 hover:text-indigo-400 cursor-pointer transition-colors shrink-0" />}
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-6 scrollbar-hide">
            {leftWidth > 110 && messages.map(msg => (
              <div key={msg.id} className="animate-in fade-in">
                <div className={`text-[9px] uppercase font-black tracking-[0.2em] mb-2 ${msg.role === 'user' ? 'text-indigo-400' : 'text-slate-700'}`}>
                  {msg.role === 'user' ? 'Commander' : 'Nexus AI'}
                </div>
                <div className={`p-4 rounded-2xl text-[11px] leading-relaxed shadow-lg ${
                  msg.role === 'user'
                    ? 'bg-indigo-600/5 border border-indigo-500/20 text-indigo-100'
                    : 'bg-[#0a0c14] border border-white/[0.05] text-slate-400'}`}>
                  {msg.content}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="p-5">
            <form onSubmit={handleSend} className="relative">
              <input
                type="text" value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                placeholder={leftWidth > 150 ? 'Send instruction…' : '…'}
                disabled={isBusy}
                className="w-full bg-[#0d111d] border border-white/10 rounded-2xl py-4 pl-4 pr-10 text-[10px] focus:border-indigo-500/50 outline-none text-white placeholder-slate-800 transition-all"
              />
              <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-indigo-600">
                <Send size={15} />
              </button>
            </form>
          </div>
        </section>

        {/* LEFT RESIZER */}
        <div onMouseDown={startResizingLeft}
          className="w-1 hover:w-1.5 transition-all cursor-col-resize h-full bg-transparent hover:bg-indigo-500/30 flex items-center justify-center relative z-30">
          <div className={`w-0.5 h-12 rounded-full bg-white/5 transition-all ${isResizingLeft ? 'bg-indigo-500 shadow-[0_0_15px_#6366f1] h-24' : ''}`} />
        </div>

        {/* ═══════════════════════════════════════════════════
            CENTER — ORCHESTRATION GRAPH
        ═══════════════════════════════════════════════════ */}
        <section
          ref={centerRef}
          className="flex-1 h-full bg-[#020306] flex flex-col items-center overflow-hidden border-r border-white/[0.04]"
        >
          {/* Title bar */}
          <div className="w-full flex items-center justify-between px-8 pt-7 pb-2 shrink-0">
            <span className="text-[9px] font-black tracking-[0.75em] text-white/15 uppercase">
              Orchestration Flow
            </span>
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full transition-all duration-700 ${
                isBusy ? 'bg-emerald-400 animate-pulse' : workflowState === 'completed' ? 'bg-emerald-600' : 'bg-slate-800'
              }`} />
              <span className="text-[8px] font-black text-slate-700 uppercase tracking-widest">
                {workflowState === 'idle' ? 'Idle' : workflowState === 'completed' ? 'Done' : 'Live'}
              </span>
            </div>
          </div>

          {/* Graph viewport */}
          <div className="flex-1 w-full overflow-y-auto scrollbar-hide flex flex-col items-center">
            <div style={{
              transform: `scale(${graphScale})`,
              transformOrigin: 'top center',
              width: GW,
              marginTop: 16,
              flexShrink: 0,
            }}>
              <AgentGraph
                orchestration={orchestration}
                graphActive={graphActive}
                graphReady={graphReady}
              />
            </div>

            {/* Reset button */}
            {workflowState === 'completed' && (
              <button
                onClick={reset}
                className="mt-6 px-8 py-3.5 bg-white/[0.03] border border-white/10 rounded-2xl text-[9px] font-black uppercase tracking-[0.5em] text-white/35 hover:text-indigo-400 hover:border-indigo-500/40 transition-all group whitespace-nowrap"
                style={{ animation: 'float-up 0.5s ease-out both', animationDelay: '0.3s' }}
              >
                Reset Environment <ArrowRight size={12} className="inline ml-2 group-hover:translate-x-1 transition-transform" />
              </button>
            )}
          </div>
        </section>

        {/* RIGHT RESIZER */}
        <div onMouseDown={startResizingRight}
          className="w-1 hover:w-1.5 transition-all cursor-col-resize h-full bg-transparent hover:bg-indigo-500/30 flex items-center justify-center relative z-30">
          <div className={`w-0.5 h-12 rounded-full bg-white/5 transition-all ${isResizingRight ? 'bg-indigo-500 shadow-[0_0_10px_#6366f1] h-24' : ''}`} />
        </div>

        {/* ═══════════════════════════════════════════════════
            RIGHT — RESULTS VAULT
        ═══════════════════════════════════════════════════ */}
        <section
          className="h-full bg-[#05060a] flex flex-col relative z-20 shrink-0 overflow-hidden"
          style={{ width: rightWidth }}
        >
          <div className="p-7 flex items-center justify-between border-b border-white/[0.04]">
            <div className="flex items-center gap-3">
              <TrendingUp size={17} className="text-emerald-500 shrink-0" />
              {rightWidth > 140 && <h1 className="text-[10px] font-black uppercase tracking-[0.3em] text-white whitespace-nowrap">Results</h1>}
            </div>
            {rightWidth > 180 && (
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full transition-all duration-700 ${workflowState === 'idle' ? 'bg-slate-800' : 'bg-emerald-500 animate-pulse'}`} />
                <span className="text-[8.5px] font-black text-slate-700 tracking-widest uppercase whitespace-nowrap">Live</span>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">

            {workflowState === 'idle' && (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-10">
                <Database size={38} strokeWidth={1} className="mb-5" />
                {rightWidth > 190 && <p className="text-[10px] font-black uppercase tracking-widest">Awaiting Streams</p>}
              </div>
            )}

            {results.length > 0 && rightWidth > 110 && (
              <div className="animate-in fade-in slide-in-from-right-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-1 h-3 bg-indigo-500 rounded-full" />
                  {rightWidth > 190 && <h3 className="text-[8.5px] font-black uppercase tracking-[0.3em] text-white/35 whitespace-nowrap">Products Found</h3>}
                </div>
                <div className="space-y-2">
                  {results.map(prod => (
                    <div key={prod.id} className="px-4 py-3 bg-[#0a0c14] border border-white/[0.05] rounded-xl hover:bg-white/[0.015] transition-all">
                      <div className="text-[11px] font-bold text-white truncate">{prod.name}</div>
                      <div className="text-[8.5px] font-black text-slate-600 uppercase tracking-widest mt-1">{prod.sku}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {quote && rightWidth > 140 && (
              <div className="animate-in zoom-in-95" style={{ animationDelay: '0.1s' }}>
                <div className="text-[8.5px] font-black uppercase tracking-[0.3em] text-white/25 mb-3 flex items-center gap-2">
                  <div className="w-1 h-3 bg-emerald-500 rounded-full" />CPQ Quote
                </div>
                <div className="bg-gradient-to-br from-indigo-600/10 to-emerald-600/10 border border-emerald-500/20 p-5 rounded-2xl">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-[8.5px] font-black uppercase text-indigo-400 tracking-widest mb-1">Quote ID</div>
                      <div className="text-[11px] font-bold text-white font-mono">{quote.id}</div>
                    </div>
                    <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                      <CheckCircle2 size={12} className="text-emerald-400" />
                    </div>
                  </div>
                  <div className="border-t border-white/5 pt-3 flex items-center justify-between">
                    <span className="text-[8.5px] font-black text-slate-600 uppercase tracking-widest">{quote.status}</span>
                    {quote.sfLink && (
                      <a href={quote.sfLink} target="_blank" rel="noopener noreferrer"
                        className="text-[8.5px] font-black text-indigo-400 uppercase tracking-widest hover:text-indigo-300 transition-colors flex items-center gap-1">
                        Open in SF <ExternalLink size={9} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

      </div>
    </>
  );
};

export default App;
