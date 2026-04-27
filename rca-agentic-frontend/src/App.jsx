import React, { useState, useEffect, useRef, useCallback } from 'react';
import SelectionHub from './components/SelectionHub';
import Dashboard from './components/Dashboard';
import ThemeToggle from './components/ThemeToggle';
import {
  Send, CheckCircle2, Loader2, Zap, Settings,
  TrendingUp, ExternalLink, ArrowRight, Database,
  Search, FileText, Network, ArrowLeft
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
  check_field_values:             'Field Check',
  search_rca_products:            'Prod. Search',
  search_products_by_filter:      'Filter Search',
  resolve_pricebook_entries:      'Pricebook',
  evaluate_quote_graph:           'CPQ Quote',
  get_my_accounts:                'Accounts',
  get_opportunities_for_account:  'Opportunities',
  transfer_to_agent:              'Route',
};
const shortLabel = (t) => TOOL_LABELS[t] || t.replace(/_/g, ' ').slice(0, 12);

// ─────────────────────────────────────────────────────────────
// SELECTION PANEL — account / opportunity picklist
// ─────────────────────────────────────────────────────────────
const SelectionPanel = ({ panel, confirmedAccount, onSelect }) => {
  if (!panel) return null;
  const isOpp = panel.type === 'opportunity';
  return (
    <div style={{ animation: 'panel-in 0.28s ease' }} className="mx-5 mb-2">

      {/* Confirmed account badge (shows above opportunity list) */}
      {isOpp && confirmedAccount && (
        <div className="flex items-center gap-1.5 mb-3 px-3 py-1.5 rounded-full w-fit"
          style={{
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.22)',
          }}
        >
          <CheckCircle2 size={9} className="text-emerald-400 shrink-0" />
          <span className="text-[9px] font-bold tracking-wide"
            style={{ color: '#34d399' }}
          >
            {confirmedAccount}
          </span>
        </div>
      )}

      {/* Section label */}
      <div className="text-[8.5px] uppercase tracking-[0.22em] font-black mb-2.5"
        style={{ color: isOpp ? '#fbbf2480' : '#818cf880' }}
      >
        {isOpp ? '↳ Select Opportunity' : 'Select Account'}
      </div>

      {/* Cards */}
      <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5 scrollbar-hide">
        {panel.options.length === 0 && (
          <div className="text-[10px] text-slate-600 px-1">No records found.</div>
        )}
        {panel.options.map(opt => (
          <button
            key={opt.id}
            onClick={() => onSelect(opt, panel.type)}
            className="selection-card w-full text-left rounded-xl cursor-pointer"
            style={{
              padding: '10px 12px',
              background: 'var(--card-bg)',
              border: '1px solid var(--glass-border)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            {/* Left accent strip */}
            <div style={{
              width: 3, borderRadius: 99, alignSelf: 'stretch', flexShrink: 0,
              background: isOpp
                ? 'linear-gradient(180deg,#fbbf24,#f59e0b)'
                : 'linear-gradient(180deg,#818cf8,#6366f1)',
              opacity: 0.5,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="text-[11px] font-semibold truncate"
                style={{ color: 'var(--text-main)' }}
              >{opt.name}</div>
              {opt.detail && opt.detail !== '—' && (
                <div className="text-[9px] mt-0.5 truncate"
                  style={{ color: isOpp ? '#fbbf2470' : '#818cf870' }}
                >{opt.detail}</div>
              )}
            </div>
            {/* Chevron */}
            <ArrowRight size={11} style={{ color: isOpp ? '#fbbf2440' : '#6366f140', flexShrink: 0 }} />
          </button>
        ))}
      </div>
    </div>
  );
};

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
      background: 'var(--card-bg)',
      backgroundImage: isActive ? `linear-gradient(135deg, ${accentColor}11, transparent)` : 'none',
      border: `2px solid ${
        isActive ? accentColor
        : isDone  ? accentColor + '55'
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

/** Small circular tool node — active=pulsing, done=checkmark, idle=dim */
const ToolNode = ({ cx, cy, label, color, active, done, isDark = true }) => (
  <div style={{
    position: 'absolute',
    left: cx - TOOL_R, top: cy - TOOL_R,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    animation: 'tool-appear 0.5s cubic-bezier(0.34,1.56,0.64,1) both',
    transition: 'left 0.72s cubic-bezier(0.4,0,0.2,1)',
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
      whiteSpace: 'nowrap', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis',
      transition: 'color 0.4s',

    }}>{label}</div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// ORCHESTRATION GRAPH
// ─────────────────────────────────────────────────────────────
const AgentGraph = ({ orchestration, graphActive, graphReady, isDark = true }) => {
  // Theme-aware SVG opacity + stroke helpers — light mode needs higher values to be visible
  const ch   = isDark ? 0.22 : 0.75;   // coordinator channel lit opacity
  const cq   = isDark ? 0.06 : 0.28;   // coordinator channel quiet opacity
  const ta   = isDark ? 0.30 : 0.75;   // tool channel active opacity
  const td   = isDark ? 0.08 : 0.35;   // tool channel done opacity
  const ti   = isDark ? 0.18 : 0.55;   // tool channel idle opacity
  const csw  = isDark ? 1.5  : 2.5;    // coordinator channel stroke width
  const dsw  = isDark ? 2.0  : 3.0;    // flowing dash stroke width
  const tsw  = isDark ? 1.2  : 2.0;    // tool channel stroke width
  const tdsw = isDark ? 1.5  : 2.5;    // tool dash stroke width
  const dr   = isDark ? 4    : 5;      // leading dot radius
  const tdr  = isDark ? 3    : 4;      // tool leading dot radius

  const { coordinator, Catalog_Scout: scout, Quote_Architect: arch } = orchestration;

  const cActive = coordinator === 'active', cDone = coordinator === 'done', cLit = cActive || cDone;
  const sActive = scout.state === 'active', sDone = scout.state === 'done';
  const aActive = arch.state  === 'active', aDone = arch.state  === 'done';

  // Agent is composing its reply: it's still active but no tool is currently running
  const scoutComposing = sActive && scout.tools.length > 0 && !scout.tools.some(t => t.state === 'active');
  const archComposing  = aActive && arch.tools.length  > 0 && !arch.tools.some(t  => t.state === 'active');

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
                  strokeWidth={csw} fill="none"
                  strokeOpacity={cLit ? ch : cq}
                />
                {/* L2: Flowing dashes — active only */}
                {sActive && (
                  <path d={pathToScout}
                    stroke="url(#grad-scout)"
                    strokeWidth={dsw} fill="none"
                    style={{
                      strokeDasharray: '6 18',
                      animation: 'flowDash 0.65s linear infinite',
                    }}
                  />
                )}
                {/* L3: Leading dot — active only */}
                {sActive && (
                  <circle r={dr} fill="#22d3ee">
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
                  strokeWidth={csw} fill="none"
                  strokeOpacity={cLit ? ch : cq}
                />
                {/* L2: Flowing dashes — active only */}
                {aActive && (
                  <path d={pathToArch}
                    stroke="url(#grad-arch)"
                    strokeWidth={dsw} fill="none"
                    style={{
                      strokeDasharray: '6 18',
                      animation: 'flowDash 0.65s linear infinite',
                    }}
                  />
                )}
                {/* L3: Leading dot — active only */}
                {aActive && (
                  <circle r={dr} fill="#fbbf24">
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
              const toolActive = tool.state === 'active';
              const toolDone   = tool.state === 'done';
              return (
                <React.Fragment key={tool.name}>
                  {/* L1: Ghost channel — dims once tool is done */}
                  <path id={pid} d={d}
                    stroke="#22d3ee" strokeWidth={tsw} fill="none"
                    strokeOpacity={toolActive ? ta : toolDone ? td : ti}
                    style={{ transition: 'stroke-opacity 0.5s' }}
                  />
                  {/* L2: Flowing dashes — only while THIS tool is active */}
                  {toolActive && (
                    <path d={d}
                      stroke="#22d3ee" strokeWidth={tdsw} fill="none"
                      style={{ strokeDasharray: '6 18', animation: 'flowDash 0.55s linear infinite' }}
                    />
                  )}
                  {/* L3: Leading dot — only while THIS tool is active */}
                  {toolActive && (
                    <circle r={tdr} fill="#22d3ee" filter="url(#glow-cyan)">
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
              const toolActive = tool.state === 'active';
              const toolDone   = tool.state === 'done';
              return (
                <React.Fragment key={tool.name}>
                  {/* L1: Ghost channel — dims once tool is done */}
                  <path id={pid} d={d}
                    stroke="#fbbf24" strokeWidth={tsw} fill="none"
                    strokeOpacity={toolActive ? ta : toolDone ? td : ti}
                    style={{ transition: 'stroke-opacity 0.5s' }}
                  />
                  {/* L2: Flowing dashes — only while THIS tool is active */}
                  {toolActive && (
                    <path d={d}
                      stroke="#fbbf24" strokeWidth={tdsw} fill="none"
                      style={{ strokeDasharray: '6 18', animation: 'flowDash 0.55s linear infinite' }}
                    />
                  )}
                  {/* L3: Leading dot — only while THIS tool is active */}
                  {toolActive && (
                    <circle r={tdr} fill="#fbbf24" filter="url(#glow-amber)">
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
            label="Catalog Scout"
            subLabel={sActive ? (scoutComposing ? 'Composing reply…' : 'Executing…') : 'Completed'}
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
            label="Quote Architect"
            subLabel={aActive ? (archComposing ? 'Composing reply…' : 'Executing…') : 'Completed'}
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

      {/* Tool circles — per-tool active/done state */}
      {graphReady && scout.tools.slice(0, 4).map((tool, i) => {
        const tp = scoutToolPos[i];
        return (
          <ToolNode key={tool.name} cx={tp.x} cy={tp.y}
            label={shortLabel(tool.name)} color="#22d3ee"
            active={tool.state === 'active'} done={tool.state === 'done'} isDark={isDark} />
        );
      })}

      {graphReady && arch.tools.slice(0, 4).map((tool, i) => {
        const tp = archToolPos[i];
        return (
          <ToolNode key={tool.name} cx={tp.x} cy={tp.y}
            label={shortLabel(tool.name)} color="#fbbf24"
            active={tool.state === 'active'} done={tool.state === 'done'} isDark={isDark} />
        );
      })}
    </div>
  );
};

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
const OrchestratorView = ({ onBack, selectedModule, isDark = false }) => {
  const [messages, setMessages]           = useState([
    { id: 1, role: 'assistant', content: `Command Center Online. Awaiting instructions for ${selectedModule?.title || 'Salesforce RCA'}.` }
  ]);
  const [inputValue, setInputValue]       = useState('');
  const [workflowState, setWorkflowState] = useState('idle');
  const [orchestration, setOrchestration] = useState(INIT_ORCH);
  const [results, setResults]             = useState([]);
  const [quote, setQuote]                 = useState(null);
  const [selectionPanel, setSelectionPanel]       = useState(null); // { type, options }
  const [confirmedAccount, setConfirmedAccount]   = useState(null); // string name

  // Composing-reply bridge: buffer product results until FINAL_REPLY fires
  // so they appear in sync with the agent's text (Option A sync).
  const pendingResultsRef = useRef(null);              // buffered product array
  const [composingReply, setComposingReply] = useState(false); // drives typing indicator
  const [selectedProducts, setSelectedProducts] = useState(new Set()); // right-pane selections

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
  const [userZoom, setUserZoom]     = useState(1);
  const [showMinimap, setShowMinimap] = useState(true);
  const [pan, setPan]               = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning]   = useState(false);

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

  // ── Panning ────────────────────────────────────────────────
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
  
  const handlePanStart = (e) => {
    if (e.target.closest('button') || e.target.closest('form')) return;
    setIsPanning(true);
    setLastPos({ x: e.clientX, y: e.clientY });
  };
  const handlePanMove = (e) => {
    if (isPanning) {
      const dx = e.clientX - lastPos.x;
      const dy = e.clientY - lastPos.y;
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastPos({ x: e.clientX, y: e.clientY });
    }
  };
  const handlePanEnd = () => setIsPanning(false);

  // ── Zoom logic ──────────────────────────────────────────────
  const adjustZoom = (delta) => setUserZoom(prev => Math.min(2, Math.max(0.5, prev + delta)));

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
              // NOTE: selectionPanel is intentionally NOT cleared here.
              // It is only cleared when the user clicks a card (handleCardSelect)
              // or resets the session. Clearing here would hide the panel before
              // the user has a chance to interact with it.
            }
            break;

          case 'USER_SELECTION_NEEDED':
            setSelectionPanel({ type: data.selection_for, options: data.options || [] });
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
                  // Step 1: mark the currently-active tool as done (a new one is starting)
                  const settled = n[k].tools.map(t =>
                    t.state === 'active' ? { ...t, state: 'done' } : t
                  );
                  // Step 2: upsert — add if new, re-activate if this tool was called before
                  const idx = settled.findIndex(t => t.name === data.tool);
                  if (idx < 0) {
                    // New tool — append it
                    n[k] = { ...n[k], tools: [...settled, { name: data.tool, state: 'active' }] };
                  } else {
                    // Re-called tool (e.g. search retried) — flip it back to active
                    n[k] = { ...n[k], tools: settled.map((t, i) =>
                      i === idx ? { ...t, state: 'active' } : t
                    )};
                  }
                  break;
                }
              }
              return n;
            });
            break;

          case 'TOOL_RESULT':
            // 1. Mark the specific tool as done in the orchestration graph
            setOrchestration(prev => {
              const n = { ...prev };
              for (const k of ['Catalog_Scout', 'Quote_Architect']) {
                if (n[k].tools.some(t => t.name === data.tool)) {
                  n[k] = { ...n[k], tools: n[k].tools.map(t =>
                    t.name === data.tool ? { ...t, state: 'done' } : t
                  )};
                  break;
                }
              }
              return n;
            });
            // 2. Parse results for right-pane cards
            try {
              const parsed = JSON.parse(data.data);
              if ((data.tool === 'search_rca_products' || data.tool === 'search_products_by_filter') && parsed.results) {
                // ── Buffer products — release them only when FINAL_REPLY arrives ──
                // This way products and agent text appear together (Option A sync).
                pendingResultsRef.current = parsed.results.map((r, i) => ({
                  id: r.id || i, name: r.name || 'Unknown', sku: r.code || 'N/A',
                }));
                setComposingReply(true);  // show typing indicator
              }
              if (data.tool === 'evaluate_quote_graph' && parsed.salesforce_response) {
                // Quote card is NOT buffered — show immediately
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
            // Flush buffered product results — they appear at the same time as text
            if (pendingResultsRef.current) {
              setResults(pendingResultsRef.current);
              pendingResultsRef.current = null;
            }
            setComposingReply(false);  // hide typing indicator
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
      pendingResultsRef.current = null; setComposingReply(false);
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
    setSelectionPanel(null);
    setConfirmedAccount(null);
    pendingResultsRef.current = null;
    setComposingReply(false);
    setSelectedProducts(new Set());
  };

  // ── Card selection handler ─────────────────────────────────
  const handleCardSelect = (option, selectionType) => {
    if (selectionType === 'account') {
      setConfirmedAccount(option.name);
    }
    setSelectionPanel(null);
    const text = `${option.name} (ID: ${option.id})`;
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: text }]);
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(text);
  };

  // ── Product selection handlers (right pane) ────────────────
  const toggleProduct = (id) =>
    setSelectedProducts(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const toggleSelectAll = () =>
    setSelectedProducts(
      selectedProducts.size === results.length ? new Set() : new Set(results.map(p => p.id))
    );

  const handleCreateQuoteFromSelection = () => {
    if (selectedProducts.size === 0 || isBusy) return;
    const selected = results.filter(p => selectedProducts.has(p.id));
    const list = selected.map(p => `${p.name} (${p.sku})`).join(', ');
    const text = selected.length === 1
      ? `Create a quote for ${list}`
      : `Create a quote for the following products: ${list}`;
    // Inject as visible user message + send to agent — same path as typing
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: text }]);
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(text);
    setSelectedProducts(new Set()); // clear selection after dispatch
  };

  const isBusy = workflowState === 'orchestrating' || workflowState === 'executing';

  // ─────────────────────────────────────────────────────────────
  return (
    <>
      <style>{STYLES}</style>

      {/* Mesh Background */}
      <div className="mesh-bg opacity-20 dark:opacity-40">
        <div className="mesh-circle-1" />
        <div className="mesh-circle-2" />
      </div>

      <div className={`h-screen w-full bg-[var(--site-bg)] text-[var(--text-main)] font-sans flex overflow-hidden selection:bg-indigo-500/30 transition-colors duration-500 ${isResizingLeft || isResizingRight ? 'cursor-col-resize select-none' : ''}`}>

        {/* ═══════════════════════════════════════════════════
            LEFT — COMMAND PANEL
        ═══════════════════════════════════════════════════ */}
        <section
          className="h-full border-r border-[var(--glass-border)] bg-[var(--card-bg)] flex flex-col relative z-20 shrink-0 overflow-hidden transition-colors duration-500"
          style={{ width: leftWidth }}
        >
          <div className="p-7 pb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-[0_0_20px_rgba(79,70,229,0.4)] shrink-0">
                <Zap size={16} fill="white" className="text-white" />
              </div>
              {leftWidth > 140 && <h1 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-900 dark:text-white whitespace-nowrap">Command</h1>}
            </div>
            {leftWidth > 140 && <Settings size={14} className="text-slate-400 hover:text-indigo-600 cursor-pointer transition-colors shrink-0" />}
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-6 scrollbar-hide">
            {leftWidth > 110 && messages.map(msg => (
              <div key={msg.id} className="animate-in fade-in">
                <div className={`text-[9px] uppercase font-black tracking-[0.2em] mb-2 ${msg.role === 'user' ? 'text-indigo-400' : 'text-slate-700'}`}>
                  {msg.role === 'user' ? 'Commander' : 'Nexus AI'}
                </div>
                <div className={`p-5 rounded-2xl text-[11px] leading-relaxed shadow-sm transition-all ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-500/20'
                    : 'bg-[var(--card-bg)] border border-[var(--glass-border)] text-[var(--text-main)]'}`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {/* Typing indicator — visible while agent is composing reply after tool results */}
            {composingReply && (
              <div style={{ paddingLeft: 2, paddingBottom: 2 }}>
                <TypingIndicator />
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* ── Selection Panel — slides in above input when agent needs a pick ── */}
          {leftWidth > 110 && (
            <SelectionPanel
              panel={selectionPanel}
              confirmedAccount={confirmedAccount}
              onSelect={handleCardSelect}
            />
          )}

          {/* Thin separator when panel is active */}
          {selectionPanel && leftWidth > 110 && (
            <div className="mx-5 mb-2" style={{ height: 1, background: 'rgba(255,255,255,0.04)' }} />
          )}



          <div className="p-5">
            <form onSubmit={handleSend} className="relative">
              <input
                type="text" value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                placeholder={leftWidth > 150 ? 'Send instruction…' : '…'}
                disabled={isBusy}
                className="w-full bg-[var(--site-bg)] border border-[var(--glass-border)] rounded-2xl py-4 pl-4 pr-10 text-[11px] font-medium focus:border-indigo-500/50 outline-none text-[var(--text-main)] placeholder-slate-400 dark:placeholder-slate-800 transition-all"
              />
              <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-indigo-600">
                <Send size={15} />
              </button>
            </form>
          </div>
        </section>

        {/* LEFT RESIZER */}
        <div onMouseDown={startResizingLeft}
          className="w-2 hover:w-2 transition-all cursor-col-resize h-full bg-transparent hover:bg-indigo-500/10 flex items-center justify-center relative z-40 group/resizer">
          <div className={`w-1 h-20 rounded-full bg-slate-200 dark:bg-white/5 transition-all group-hover/resizer:bg-indigo-500/50 ${isResizingLeft ? '!bg-indigo-500 shadow-[0_0_20px_#6366f1] h-32' : ''}`} />
        </div>

        {/* ═══════════════════════════════════════════════════
            CENTER — ORCHESTRATION GRAPH
        ═══════════════════════════════════════════════════ */}
        <section
          ref={centerRef}
          className="flex-1 h-full bg-[var(--site-bg)] flex flex-col items-center overflow-hidden border-r border-[var(--glass-border)] transition-colors duration-500"
        >
          {/* Title bar */}
            <div className="w-full flex items-center justify-between px-8 pt-7 pb-2 shrink-0">
              <div className="flex items-center gap-4">
                {onBack && (
                  <button 
                    onClick={onBack}
                    className="p-2 -ml-2 rounded-full hover:bg-white/5 text-slate-500 hover:text-white transition-all"
                  >
                    <ArrowLeft size={16} />
                  </button>
                )}
                <span className="text-[9px] font-black tracking-[0.75em] text-slate-400 dark:text-white/15 uppercase">
                  Orchestration Flow
                </span>
              </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
                <span className="text-[8px] font-black uppercase text-slate-500">Minimap</span>
                <button 
                  onClick={() => setShowMinimap(!showMinimap)}
                  className={`w-8 h-4 rounded-full relative transition-colors ${showMinimap ? 'bg-indigo-500' : 'bg-slate-700'}`}
                >
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${showMinimap ? 'left-4.5' : 'left-0.5'}`} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full transition-all duration-700 ${
                  isBusy ? 'bg-emerald-400 animate-pulse' : workflowState === 'completed' ? 'bg-emerald-600' : 'bg-slate-800'
                }`} />
                <span className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">
                  {workflowState === 'idle' ? 'Idle' : workflowState === 'completed' ? 'Done' : 'Live'}
                </span>
              </div>
            </div>
          </div>

          {/* Graph viewport */}
          <div 
            className={`flex-1 w-full overflow-hidden flex flex-col items-center relative dot-grid ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
            onMouseDown={handlePanStart}
            onMouseMove={handlePanMove}
            onMouseUp={handlePanEnd}
            onMouseLeave={handlePanEnd}
          >
            <div style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${graphScale * userZoom})`,
              transformOrigin: 'center center',
              width: GW,
              marginTop: 100,
              flexShrink: 0,
              transition: isPanning ? 'none' : 'transform 0.1s ease-out',
            }}>
              <AgentGraph
                orchestration={orchestration}
                graphActive={graphActive}
                graphReady={graphReady}
                isDark={isDark}
              />
            </div>

            {/* Floating Zoom Controls */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[var(--card-bg)] backdrop-blur-xl border border-[var(--glass-border)] p-2 rounded-2xl z-40 shadow-2xl transition-all duration-500">
              <button onClick={() => adjustZoom(-0.1)} className="p-3 hover:bg-white/10 rounded-xl text-[var(--text-muted)] transition-all">-</button>
              <div className="px-4 text-[10px] font-black text-[var(--text-main)] w-16 text-center">{Math.round(userZoom * 100)}%</div>
              <button onClick={() => adjustZoom(0.1)} className="p-3 hover:bg-white/10 rounded-xl text-[var(--text-muted)] transition-all">+</button>
              <div className="w-[1px] h-6 bg-[var(--glass-border)] mx-2" />
              <button onClick={() => { setUserZoom(1); setPan({x:0, y:0}); }} className="px-4 py-2 hover:bg-indigo-500/10 rounded-xl text-[9px] font-black uppercase text-indigo-500 transition-all">Reset</button>
            </div>

            {/* Minimap Widget */}
            {showMinimap && (
              <div className="absolute top-8 right-8 w-44 h-52 bg-slate-900/80 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden z-40 pointer-events-none group shadow-2xl">
                {/* Background Representation */}
                <div className="absolute inset-0 opacity-40 pointer-events-none p-4">
                  <div className="scale-[0.28] origin-top-left transition-all">
                    <AgentGraph orchestration={orchestration} graphActive={true} graphReady={true} isDark={isDark} />
                  </div>
                </div>
                
                {/* Viewport Indicator — Energy Orange */}
                <div 
                  className="absolute border-2 border-amber-500 bg-amber-500/10 rounded-lg shadow-[0_0_20px_rgba(245,158,11,0.4)] transition-all duration-75"
                  style={{
                    left: 20 - (pan.x * 0.28) / (graphScale * userZoom),
                    top: 20 - (pan.y * 0.28) / (graphScale * userZoom),
                    width: 140 / userZoom,
                    height: 160 / userZoom,
                  }}
                />
                
                <div className="absolute bottom-2 right-3 text-[7px] font-mono font-black text-amber-500 drop-shadow-lg">{(graphScale * userZoom).toFixed(2)}x</div>
              </div>
            )}

            {/* Reset button (Environment) */}
            {workflowState === 'completed' && (
              <button
                onClick={reset}
                className="absolute top-24 left-1/2 -translate-x-1/2 px-8 py-3.5 bg-white/[0.03] border border-white/10 rounded-2xl text-[9px] font-black uppercase tracking-[0.5em] text-white/35 hover:text-indigo-400 hover:border-indigo-500/40 transition-all group whitespace-nowrap z-30"
                style={{ animation: 'float-up 0.5s ease-out both', animationDelay: '0.3s' }}
              >
                Reset Environment <ArrowRight size={12} className="inline ml-2 group-hover:translate-x-1 transition-transform" />
              </button>
            )}
          </div>
        </section>

        {/* RIGHT RESIZER */}
        <div onMouseDown={startResizingRight}
          className="w-2 hover:w-2 transition-all cursor-col-resize h-full bg-transparent hover:bg-indigo-500/10 flex items-center justify-center relative z-40 group/resizer">
          <div className={`w-1 h-20 rounded-full bg-slate-200 dark:bg-white/5 transition-all group-hover/resizer:bg-indigo-500/50 ${isResizingRight ? '!bg-indigo-500 shadow-[0_0_20px_#6366f1] h-32' : ''}`} />
        </div>

        {/* ═══════════════════════════════════════════════════
            RIGHT — RESULTS VAULT
        ═══════════════════════════════════════════════════ */}
        <section
          className="h-full bg-[var(--card-bg)] flex flex-col relative z-20 shrink-0 overflow-hidden transition-colors duration-500"
          style={{ width: rightWidth }}
        >
          <div className="p-7 flex items-center justify-between border-b border-white/[0.04]">
            <div className="flex items-center gap-3">
              <TrendingUp size={17} className="text-emerald-500 shrink-0" />
              {rightWidth > 140 && <h1 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-900 dark:text-white whitespace-nowrap">Results</h1>}
            </div>
            <div className="flex items-center gap-3">
              {results.length > 0 && rightWidth > 180 && (
                <button onClick={toggleSelectAll}
                  className="text-[7.5px] font-black uppercase tracking-widest text-slate-600 hover:text-indigo-400 transition-colors whitespace-nowrap">
                  {selectedProducts.size === results.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
              {rightWidth > 180 && (
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full transition-all duration-700 ${workflowState === 'idle' ? 'bg-slate-800' : 'bg-emerald-500 animate-pulse'}`} />
                  <span className="text-[8.5px] font-black text-slate-700 tracking-widest uppercase whitespace-nowrap">Live</span>
                </div>
              )}
            </div>
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
                  {rightWidth > 190 && <h3 className="text-[8.5px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] whitespace-nowrap">Products Found</h3>}
                </div>
                <div className="space-y-2" style={{ paddingBottom: selectedProducts.size > 0 ? 72 : 0, transition: 'padding-bottom 0.3s' }}>
                  {results.map(prod => {
                    const isSel = selectedProducts.has(prod.id);
                    return (
                      <div key={prod.id}
                        onClick={() => toggleProduct(prod.id)}
                        className="px-4 py-3.5 border rounded-xl cursor-pointer transition-all select-none shadow-sm hover:shadow"
                        style={{
                          background: isSel ? 'rgba(99,102,241,0.08)' : 'var(--card-bg)',
                          borderColor: isSel ? 'rgba(99,102,241,0.4)' : 'var(--glass-border)',
                        }}>
                        <div className="flex items-center gap-2.5">
                          {/* Checkbox */}
                          <div style={{
                            width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                            border: `1.5px solid ${isSel ? '#6366f1' : 'var(--glass-border)'}`,
                            background: isSel ? '#6366f1' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.15s',
                          }}>
                            {isSel && <CheckCircle2 size={9} color="white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-bold text-[var(--text-main)] truncate">{prod.name}</div>
                            <div className="text-[8.5px] font-black text-[var(--text-muted)] uppercase tracking-widest mt-0.5">{prod.sku}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {quote && rightWidth > 140 && (
              <div className="animate-in zoom-in-95" style={{ animationDelay: '0.1s' }}>
                <div className="text-[8.5px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] mb-3 flex items-center gap-2">
                  <div className="w-1 h-3 bg-emerald-500 rounded-full" />CPQ Quote
                </div>
                <div className="bg-gradient-to-br from-indigo-600/10 to-emerald-600/10 border border-emerald-500/20 p-5 rounded-2xl">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-[8.5px] font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-widest mb-1.5">Quote ID</div>
                      <div className="text-[11px] font-bold text-[var(--text-main)] font-mono">{quote.id}</div>
                    </div>
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 shadow-sm">
                      <CheckCircle2 size={16} className="text-emerald-500" />
                    </div>
                  </div>
                  <div className="border-t border-[var(--glass-border)] pt-4 flex items-center justify-between">
                    <span className="text-[8.5px] font-black text-[var(--text-muted)] uppercase tracking-widest tracking-[0.2em]">{quote.status}</span>
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
          {/* ── Floating action bar: slides up when products are selected ── */}
          {selectedProducts.size > 0 && (
            <div 
              className="absolute bottom-0 left-0 right-0 p-4 pt-5 pb-5 border-t border-[var(--glass-border)] bg-[var(--card-bg)] backdrop-blur-2xl z-20 shadow-[0_-20px_40px_rgba(0,0,0,0.05)] transition-colors"
              style={{
                animation: 'slide-up-in 0.28s cubic-bezier(0.34,1.56,0.64,1) both',
            }}>
              <button
                onClick={handleCreateQuoteFromSelection}
                disabled={isBusy}
                style={{
                  width: '100%', padding: '9px 14px',
                  background: isBusy ? 'rgba(99,102,241,0.04)' : 'rgba(99,102,241,0.12)',
                  border: `1px solid rgba(99,102,241,${isBusy ? 0.1 : 0.35})`,
                  borderRadius: 10,
                  color: isBusy ? 'var(--text-muted)' : '#6366f1',
                  fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em',
                  textTransform: 'uppercase', cursor: isBusy ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                ⚡ Create Quote — {selectedProducts.size} Product{selectedProducts.size > 1 ? 's' : ''}
              </button>
            </div>
          )}
        </section>

      </div>
    </>
  );
};

const App = () => {
  const [view, setView] = useState('selection'); // selection, dashboard, chat
  const [selectedModule, setSelectedModule] = useState(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const handleSelect = (module) => {
    setSelectedModule(module);
    setView('dashboard');
  };

  const handleLaunchChat = () => {
    setView('chat');
  };

  return (
    <div className={isDark ? 'dark' : ''}>
      <ThemeToggle isDark={isDark} setIsDark={setIsDark} />
      {view === 'selection' && <SelectionHub onSelect={handleSelect} />}
      {view === 'dashboard' && (
        <Dashboard 
          onLaunchChat={handleLaunchChat} 
          onEditQuote={(id) => console.log('Edit quote', id)} 
        />
      )}
      {view === 'chat' && (
        <OrchestratorView onBack={() => setView('dashboard')} selectedModule={selectedModule} isDark={isDark} />
      )}
    </div>
  );
};

export default App;
