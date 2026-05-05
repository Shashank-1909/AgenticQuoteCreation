import React, { useState, useEffect, useRef, useCallback } from 'react';
import SelectionHub from './components/SelectionHub';
import Dashboard from './components/Dashboard';
import ThemeToggle from './components/ThemeToggle';
import { config } from './config';
import './MetaTheme.css';
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
  .glass-card {
    background: var(--card-bg);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--glass-border);
    box-shadow: 0 4px 20px -5px rgba(0,0,0,0.05);
  }
  .glass-card:hover {
    border-color: rgba(99, 102, 241, 0.3);
    box-shadow: 0 12px 30px -10px rgba(99, 102, 241, 0.12);
    transform: translateY(-1px);
  }
  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(99, 102, 241, 0.1);
    border-radius: 10px;
  }
  .custom-scrollbar:hover::-webkit-scrollbar-thumb {
    background: rgba(99, 102, 241, 0.25);
  }
`;

// ─────────────────────────────────────────────────────────────
// GRAPH LAYOUT CONSTANTS  (SVG + DOM coordinate space, px)
// ─────────────────────────────────────────────────────────────
const GW = 480;   // graph canvas width
const GH = 560;   // graph canvas height

// Deal Manager card (active / top position)
const DM_W = 160, DM_H = 76;
const DM_ACTIVE_TOP = 30;                            // top when active
const DM_IDLE_TOP = GH / 2 - DM_H / 2 - 20;       // vertically centered when idle
const DM_LEFT = GW / 2 - DM_W / 2;            // always horizontally centered
const DM_ACTIVE_CY = DM_ACTIVE_TOP + DM_H / 2;     // = 68
const DM_ACTIVE_BOT = DM_ACTIVE_TOP + DM_H;         // = 106

// Agent cards (Catalog Scout = left, Quote Architect = right)
const SC = { cx: 118, cy: 255, w: 140, h: 70 };  // Scout center
const AC = { cx: 362, cy: 255, w: 140, h: 70 };  // Arch  center
const SC_TOP = SC.cy - SC.h / 2;  // 220
const AC_TOP = AC.cy - AC.h / 2;  // 220
const SC_BOT = SC.cy + SC.h / 2;  // 290
const AC_BOT = AC.cy + AC.h / 2;  // 290
const MID_Y = (DM_ACTIVE_BOT + SC_TOP) / 2;  // ≈ 163

// SVG bezier paths: DM-bottom → agent-top
const PATH_CS = `M ${GW / 2} ${DM_ACTIVE_BOT} C ${GW / 2} ${MID_Y} ${SC.cx} ${MID_Y} ${SC.cx} ${SC_TOP}`;
const PATH_CA = `M ${GW / 2} ${DM_ACTIVE_BOT} C ${GW / 2} ${MID_Y} ${AC.cx} ${MID_Y} ${AC.cx} ${AC_TOP}`;

// Tool circle radius
const TOOL_R = 22;
const TOOL_CURVE_MID_Y = 368;

// Dynamic tool positions — 4 circles spread symmetrically around the agent's cx
const getToolPositions = (agentCx) => [
  { x: agentCx - 80, y: 435 },
  { x: agentCx - 38, y: 450 },
  { x: agentCx + 38, y: 450 },
  { x: agentCx + 80, y: 435 },
];

// Curved bezier from agent-bottom to tool-top (same style as coordinator→agent paths)
const makeToolPath = (agentCx, agentBot, tp) =>
  `M ${agentCx} ${agentBot} C ${agentCx} ${TOOL_CURVE_MID_Y} ${tp.x} ${TOOL_CURVE_MID_Y} ${tp.x} ${tp.y - TOOL_R}`;

// Short display names for tools
const TOOL_LABELS = {
  check_field_values: 'Field Check',
  search_catalog:     'Product Search',
  resolve_pricebook_entries: 'Pricebook',
  evaluate_quote_graph: 'CPQ Quote',
  get_my_accounts: 'Accounts',
  get_opportunities_for_account: 'Opportunity',
  transfer_to_agent: 'Route',
};
const shortLabel = (t) => TOOL_LABELS[t] || t.replace(/_/g, ' ').slice(0, 12);

// ─────────────────────────────────────────────────────────────
// SELECTION PANEL — account / opportunity picklist
// ─────────────────────────────────────────────────────────────
const SelectionPanel = ({ panel, confirmedAccount, onSelect, scrollRef }) => {
  if (!panel) return null;
  const isOpp = panel.type === 'opportunity';
  const metaColors = {
    account: '#0064E0',
    opportunity: '#31A24C'
  };
  const accentColor = config.theme === 'Meta' 
    ? (isOpp ? metaColors.opportunity : metaColors.account)
    : (isOpp ? '#fbbf24' : '#818cf8');
  return (
    <div className="overflow-hidden p-4" style={{ animation: 'panel-in 0.28s ease' }}>
      {/* Confirmed account badge (shows above opportunity list) */}
      {isOpp && confirmedAccount && (
        <div className="flex items-center gap-2 mb-3 px-3 py-1.5 rounded-2xl w-fit bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.1)]">
          <CheckCircle2 size={10} className="text-emerald-500 shrink-0" />
          <span className="text-[9px] font-black tracking-widest text-emerald-600 uppercase">
            {confirmedAccount}
          </span>
        </div>
      )}

      {/* Section header — matches "Products Found" style */}
      <div className="flex items-center gap-3 mb-3">
        <div style={{ width: 4, height: 12, borderRadius: 99, background: accentColor, flexShrink: 0 }} />
        <div className="text-[8.5px] font-black uppercase tracking-[0.3em]"
          style={{ color: 'var(--text-muted)' }}
        >
          {isOpp ? 'Select Opportunity' : 'Select Account'}
        </div>
      </div>

      {/* Cards — Single Column for full names */}
      <div ref={scrollRef} className="space-y-2 max-h-[420px] overflow-y-auto pr-1.5 custom-scrollbar">
        {panel.options.length === 0 && (
          <div className="text-[10px] text-slate-600 px-1 py-4 text-center opacity-50 font-black uppercase tracking-widest">No records found</div>
        )}
        {panel.options.map(opt => (
          <div
            key={opt.id}
            onClick={() => onSelect(opt, panel.type)}
            title={opt.name}
            className="flex items-center justify-between p-3 bg-white/[0.03] border border-white/5 rounded-2xl cursor-pointer transition-all select-none hover:bg-white/[0.08] active:scale-[0.99] group relative overflow-hidden"
          >
            <div className="flex items-center gap-4 min-w-0">
              <div
                className="w-1.5 h-1.5 rounded-full shadow-[0_0_8px_currentColor]"
                style={{ background: accentColor, color: accentColor }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-bold text-[var(--text-main)] leading-tight uppercase tracking-tight group-hover:text-indigo-500 transition-colors whitespace-normal">{opt.name}</div>
                {opt.detail && opt.detail !== '—' && (
                  <div className="mt-1.5 inline-block px-1.5 py-0.5 rounded-md bg-white/5 border border-white/5 text-[7px] font-black uppercase tracking-widest opacity-60"
                    style={{ color: accentColor }}
                  >{opt.detail}</div>
                )}
              </div>
            </div>
            <div className="opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0 ml-4">
              <ArrowRight size={14} style={{ color: accentColor }} />
            </div>
          </div>
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
      whiteSpace: 'normal', wordBreak: 'break-word',
      maxWidth: 68, lineHeight: 1.25,
      overflow: 'visible',
      transition: 'color 0.4s',

    }}>{label}</div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// ORCHESTRATION GRAPH
// ─────────────────────────────────────────────────────────────
const AgentGraph = ({ orchestration, graphActive, graphReady, isDark = true }) => {
  // Theme-aware SVG opacity + stroke helpers — light mode needs higher values to be visible
  const ch = isDark ? 0.22 : 0.75;   // coordinator channel lit opacity
  const cq = isDark ? 0.06 : 0.28;   // coordinator channel quiet opacity
  const ta = isDark ? 0.30 : 0.75;   // tool channel active opacity
  const td = isDark ? 0.08 : 0.35;   // tool channel done opacity
  const ti = isDark ? 0.18 : 0.55;   // tool channel idle opacity
  const csw = isDark ? 1.5 : 2.5;    // coordinator channel stroke width
  const dsw = isDark ? 2.0 : 3.0;    // flowing dash stroke width
  const tsw = isDark ? 1.2 : 2.0;    // tool channel stroke width
  const tdsw = isDark ? 1.5 : 2.5;    // tool dash stroke width
  const dr = isDark ? 4 : 5;      // leading dot radius
  const tdr = isDark ? 3 : 4;      // tool leading dot radius

  const { coordinator, Catalog_Scout: scout, Quote_Architect: arch } = orchestration;

  const cActive = coordinator === 'active', cDone = coordinator === 'done', cLit = cActive || cDone;
  const sActive = scout.state === 'active', sDone = scout.state === 'done';
  const aActive = arch.state === 'active', aDone = arch.state === 'done';

  // Agent is composing its reply: it's still active but no tool is currently running
  const scoutComposing = sActive && scout.tools.length > 0 && !scout.tools.some(t => t.state === 'active');
  const archComposing = aActive && arch.tools.length > 0 && !arch.tools.some(t => t.state === 'active');

  // DM→Agent line flows ONLY during the brief handoff window:
  //   - Agent just activated (no tools called yet), AND DM was the one who routed it.
  // Once the first tool fires, or if DM was bypassed (Turn 2+ quote flow), the line dims.
  const scoutHandoffActive = sActive && scout.tools.length === 0 && scout.routedByDm;
  const archHandoffActive  = aActive && arch.tools.length  === 0 && arch.routedByDm;

  const showScout = scout.state !== 'idle';
  const showArch = arch.state !== 'idle';
  const bothAgents = showScout && showArch;

  // ── Dynamic agent positions ──────────────────────────────
  // Single agent → centered (GW/2). Both agents → original left/right split.
  const scoutCx = bothAgents ? SC.cx : GW / 2;
  const archCx = bothAgents ? AC.cx : GW / 2;
  const scoutLeft = scoutCx - SC.w / 2;
  const archLeft = archCx - AC.w / 2;

  // ── Dynamic SVG paths (coordinator → each agent) ─────────
  const midY = (DM_ACTIVE_BOT + SC_TOP) / 2;  // ≈ 163
  const pathToScout = `M ${GW / 2} ${DM_ACTIVE_BOT} C ${GW / 2} ${midY} ${scoutCx} ${midY} ${scoutCx} ${SC_TOP}`;
  const pathToArch = `M ${GW / 2} ${DM_ACTIVE_BOT} C ${GW / 2} ${midY} ${archCx}  ${midY} ${archCx}  ${AC_TOP}`;

  // ── Dynamic tool positions (relative to agent cx) ─────────
  const scoutToolPos = getToolPositions(scoutCx);
  const archToolPos = getToolPositions(archCx);

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
          {[['cyan', '2.5'], ['amber', '2.5']].map(([n, s]) => (
            <filter key={n} id={`glow-${n}`}>
              <feGaussianBlur stdDeviation={s} result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          ))}
          {/* Dedicated glow for coordinator connector lines */}
          <filter id="glow-conn" filterUnits="userSpaceOnUse"
            x="0" y="0" width={GW} height={GH}>
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Gradient: DM indigo → Scout cyan  (follows the bezier direction) */}
          <linearGradient id="grad-scout"
            x1={GW / 2} y1={DM_ACTIVE_BOT}
            x2={scoutCx} y2={SC_TOP}
            gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={config.theme === 'Meta' ? '#0064E0' : '#818cf8'} />
            <stop offset="100%" stopColor={config.theme === 'Meta' ? '#0081FB' : '#22d3ee'} />
          </linearGradient>

          {/* Gradient: DM indigo → Arch amber */}
          <linearGradient id="grad-arch"
            x1={GW / 2} y1={DM_ACTIVE_BOT}
            x2={archCx} y2={AC_TOP}
            gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={config.theme === 'Meta' ? '#0064E0' : '#818cf8'} />
            <stop offset="100%" stopColor={config.theme === 'Meta' ? '#31A24C' : '#fbbf24'} />
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
                {/* L2: Flowing dashes — handoff only (DM routed, no tools yet) */}
                {scoutHandoffActive && (
                  <path d={pathToScout}
                    stroke="url(#grad-scout)"
                    strokeWidth={dsw} fill="none"
                    style={{
                      strokeDasharray: '6 18',
                      animation: 'flowDash 0.65s linear infinite',
                    }}
                  />
                )}
                {/* L3: Leading dot — handoff only */}
                {scoutHandoffActive && (
                  <circle r={dr} fill={config.theme === 'Meta' ? '#0081FB' : '#22d3ee'}>
                    <animateMotion dur="1.5s" repeatCount="indefinite" calcMode="linear">
                      <mpath href="#pcs" />
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
                {/* L2: Flowing dashes — handoff only (DM routed, no tools yet) */}
                {archHandoffActive && (
                  <path d={pathToArch}
                    stroke="url(#grad-arch)"
                    strokeWidth={dsw} fill="none"
                    style={{
                      strokeDasharray: '6 18',
                      animation: 'flowDash 0.65s linear infinite',
                    }}
                  />
                )}
                {/* L3: Leading dot — handoff only */}
                {archHandoffActive && (
                  <circle r={dr} fill={config.theme === 'Meta' ? '#31A24C' : '#fbbf24'}>
                    <animateMotion dur="1.5s" repeatCount="indefinite" calcMode="linear">
                      <mpath href="#pca" />
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
              const toolDone = tool.state === 'done';
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
                        <mpath href={`#${pid}`} />
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
              const toolDone = tool.state === 'done';
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
                        <mpath href={`#${pid}`} />
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
          accentColor={config.theme === 'Meta' ? '#0064E0' : '#818cf8'} 
          glowColor={config.theme === 'Meta' ? 'rgba(0,100,224,0.5)' : 'rgba(99,102,241,0.5)'}
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
            accentColor={config.theme === 'Meta' ? '#0081FB' : '#22d3ee'} 
            glowColor={config.theme === 'Meta' ? 'rgba(0,129,251,0.5)' : 'rgba(6,182,212,0.5)'}
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
            accentColor={config.theme === 'Meta' ? '#31A24C' : '#fbbf24'} 
            glowColor={config.theme === 'Meta' ? 'rgba(49,162,76,0.5)' : 'rgba(245,158,11,0.5)'}
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
  Catalog_Scout: { state: 'idle', tools: [], routedByDm: false },
  Quote_Architect: { state: 'idle', tools: [], routedByDm: false },
};

// ─────────────────────────────────────────────────────────────
const SUGGESTIONS = [
  {
    label: 'QUOTE CREATION',
    text: 'Quote for CloudTech Module 1 with manager rules.',
    color: '#818cf8',
    bg: 'rgba(129, 140, 248, 0.08)',
    border: 'rgba(129, 140, 248, 0.3)'
  },
  {
    label: 'PRODUCT DISCOVERY',
    text: "Find 'manager rule' products.",
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.08)',
    border: 'rgba(16, 185, 129, 0.3)'
  },
  {
    label: 'DEAL HISTORY',
    text: 'Show CloudTech deal history.',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.08)',
    border: 'rgba(245, 158, 11, 0.3)'
  }
];

// MAIN APP
// ─────────────────────────────────────────────────────────────
const OrchestratorView = ({ onBack, selectedModule, isDark = false }) => {
  const [messages, setMessages] = useState([
    { id: 1, role: 'assistant', content: `Command Center Online. Awaiting instructions for ${selectedModule?.title || 'Salesforce RCA'}.` }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [workflowState, setWorkflowState] = useState('idle');
  const [orchestration, setOrchestration] = useState(INIT_ORCH);
  const [results, setResults] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [selectionPanel, setSelectionPanel] = useState(null); // { type, options }
  const [confirmedAccount, setConfirmedAccount] = useState(null); // string name (for badge)
  const [confirmedSelections, setConfirmedSelections] = useState([]); // history for right panel [{type, id, name, detail}]
  const [vaultHistory, setVaultHistory] = useState([]); // chronological feed [{type: 'products'|'selection'|'confirmed'|'quote', data, id}]

  const handleSuggestionClick = (text) => {
    setInputValue(text);
  };

  // Composing-reply bridge: buffer product results AND selection panel until FINAL_REPLY fires
  // so they appear in sync with the agent's text.
  const pendingResultsRef = useRef(null);              // buffered product array
  const pendingSelectionRef = useRef(null);            // buffered selection panel {type, options}
  const [composingReply, setComposingReply] = useState(false); // drives typing indicator
  const [selectedProducts, setSelectedProducts] = useState(new Set()); // right-pane selections

  // Graph animation state
  const [graphActive, setGraphActive] = useState(false); // triggers DM slide-up
  const [graphReady, setGraphReady] = useState(false); // shows paths+agents after slide

  const [leftWidth, setLeftWidth] = useState(300);
  const [rightWidth, setRightWidth] = useState(465);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  const chatEndRef = useRef(null);
  const rightPanelEndRef = useRef(null);  // auto-scroll for right panel
  const ws = useRef(null);
  const centerRef = useRef(null);
  const resultsScrollRef = useRef(null);
  const selectionScrollRef = useRef(null);
  const [graphScale, setGraphScale] = useState(1);
  const [userZoom, setUserZoom] = useState(1);
  const [showMinimap, setShowMinimap] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  // ── Panel resizing ──────────────────────────────────────────
  const startResizingLeft = useCallback(() => setIsResizingLeft(true), []);
  const startResizingRight = useCallback(() => setIsResizingRight(true), []);
  const stopResizing = useCallback(() => { setIsResizingLeft(false); setIsResizingRight(false); }, []);
  const resize = useCallback((e) => {
    if (isResizingLeft) setLeftWidth(Math.max(160, Math.min(e.clientX, window.innerWidth * 0.35)));
    if (isResizingRight) setRightWidth(Math.max(280, Math.min(window.innerWidth - e.clientX, window.innerWidth * 0.5)));
  }, [isResizingLeft, isResizingRight]);

  useEffect(() => {
    if (isResizingLeft || isResizingRight) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    }
    return () => { window.removeEventListener('mousemove', resize); window.removeEventListener('mouseup', stopResizing); };
  }, [isResizingLeft, isResizingRight, resize, stopResizing]);

  // ── Chat scroll ────────────────────────────────────────────
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Right-panel auto-scroll (selection panel + results + history) ───
  useEffect(() => {
    rightPanelEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [vaultHistory, selectionPanel, results, confirmedSelections]);

  // ── Internal auto-scroll for long lists ──
  useEffect(() => {
    if (results.length > 0) resultsScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [results]);

  useEffect(() => {
    if (selectionPanel) selectionScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [selectionPanel]);

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
            // Buffer the selection panel — show only when FINAL_REPLY fires.
            // This ensures the agent's text ("I've loaded your accounts...") and
            // the selection panel appear simultaneously, preventing the user from
            // selecting before they've read the instruction, and preventing the
            // stale "I've loaded accounts" message appearing after they've already selected.
            pendingSelectionRef.current = { type: data.selection_for, options: data.options || [] };
            setComposingReply(true); // show typing indicator while LLM generates reply
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
                // Was DM the one actively routing to this agent right now?
                // If coordinator was 'active' just before this agent started,
                // DM routed it. Otherwise (Turn 2+ quote flow), DM was bypassed.
                const dmWasActive = n.coordinator === 'active';
                if (n.coordinator === 'active') n.coordinator = 'done';
                n[name] = { ...n[name], state: 'active', routedByDm: dmWasActive };
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
                    n[k] = {
                      ...n[k], tools: settled.map((t, i) =>
                        i === idx ? { ...t, state: 'active' } : t
                      )
                    };
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
                  n[k] = {
                    ...n[k], tools: n[k].tools.map(t =>
                      t.name === data.tool ? { ...t, state: 'done' } : t
                    )
                  };
                  break;
                }
              }
              return n;
            });
            // 2. Parse results for right-pane cards
            try {
              const parsed = JSON.parse(data.data);
              if (data.tool === 'search_catalog' && parsed.results) {
                // ── Buffer products — release them only when FINAL_REPLY arrives ──
                // This way products and agent text appear together (Option A sync).
                pendingResultsRef.current = parsed.results.map((r, i) => ({
                  id: r.id || i, name: r.name || 'Unknown', sku: r.code || 'N/A',
                }));
                setComposingReply(true);  // show typing indicator
              }
              if (data.tool === 'evaluate_quote_graph') {
                // Regex scan the raw data string for the Quote ID (100% reliable)
                const qIdMatch = data.data.match(/0Q0[a-zA-Z0-9]{12,15}/);
                const qId = qIdMatch ? qIdMatch[0] : 'Generated';
                
                const inst = parsed.instance_url || 'https://login.salesforce.com';
                const newQuote = { 
                  id: qId, 
                  status: 'Draft', 
                  sfLink: qId !== 'Generated' ? `${inst}/lightning/r/Quote/${qId}/view` : null 
                };
                
                // Append to list of quotes
                const quoteItem = { type: 'quote', data: newQuote, id: Date.now() };
                setQuotes(prev => [...prev, newQuote]);
                setVaultHistory(prev => [...prev, quoteItem]);
              }
            } catch (_) { }
            break;

          case 'FINAL_REPLY':
            // Flush buffered product results — they appear at the same time as text
            if (pendingResultsRef.current) {
              const newResults = pendingResultsRef.current;
              setResults(newResults);
              setVaultHistory(prev => [...prev, { type: 'products', data: newResults, id: Date.now() }]);
              pendingResultsRef.current = null;
            }
            // Flush buffered selection panel — appears at the same time as agent text
            if (pendingSelectionRef.current) {
              const newPanel = pendingSelectionRef.current;
              setSelectionPanel(newPanel);
              setVaultHistory(prev => [...prev, { type: 'selection', data: newPanel, id: Date.now() }]);
              pendingSelectionRef.current = null;
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
      setResults([]); setQuotes([]); setOrchestration(INIT_ORCH);
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
    setQuotes([]);
    setSelectionPanel(null);
    setConfirmedAccount(null);
    setConfirmedSelections([]);
    setVaultHistory([]);
    pendingResultsRef.current = null;
    pendingSelectionRef.current = null;
    setComposingReply(false);
    setSelectedProducts(new Set());
  };

  // ── Card selection handler ─────────────────────────────────
  const handleCardSelect = (option, selectionType) => {
    if (selectionType === 'account') {
      setConfirmedAccount(option.name);
    }
    const confirmedItem = { type: 'confirmed', data: { ...option, selectionType }, id: Date.now() };
    setConfirmedSelections(prev => [...prev, { ...option, type: selectionType }]);
    setVaultHistory(prev => [...prev, confirmedItem]);
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
    
    // Find selected products across all historical product lists
    const allProductsInHistory = vaultHistory
      .filter(item => item.type === 'products')
      .flatMap(item => item.data);
      
    const selected = allProductsInHistory.filter(p => selectedProducts.has(p.id));
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

      <div className={`h-screen w-full bg-[var(--site-bg)] text-[var(--text-main)] font-sans flex overflow-hidden selection:bg-indigo-500/30 transition-colors duration-500 ${config.theme === 'Meta' ? 'meta-theme' : ''} ${isResizingLeft || isResizingRight ? 'cursor-col-resize select-none' : ''}`}>

        {/* ═══════════════════════════════════════════════════
            LEFT — COMMAND PANEL
        ═══════════════════════════════════════════════════ */}
        <section
          className="h-full border-r border-[var(--glass-border)] bg-[var(--site-bg)] flex flex-col relative z-20 shrink-0 overflow-hidden transition-colors duration-500"
          style={{ width: leftWidth }}
        >
          <div className="p-7 pb-6 flex items-center justify-between border-b border-[var(--glass-border)] bg-slate-500/[0.03] dark:bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-[0_8px_20px_-4px_rgba(79,70,229,0.4)] flex-shrink-0 relative overflow-hidden group">
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                <span className="text-white font-black text-[11px] tracking-tight relative z-10">{config.theme === 'Meta' ? 'M' : 'AG'}</span>
              </div>
              {leftWidth > 140 && (
                <div className="flex flex-col">
                  <h1 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-900 dark:text-white whitespace-nowrap">{config.theme === 'Meta' ? 'Meta' : 'Agivant'}</h1>
                  <span className="text-[7.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">{config.theme === 'Meta' ? 'Connect' : 'Control Center'}</span>
                </div>
              )}
            </div>
            {leftWidth > 140 && <Settings size={14} className="text-slate-400 hover:text-indigo-600 cursor-pointer transition-colors shrink-0" />}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 scrollbar-hide custom-scrollbar">
            {leftWidth > 110 && messages.map(msg => (
              <div key={msg.id} className="animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-2 mb-2.5">
                  <div className={`w-1 h-2.5 rounded-full ${msg.role === 'user' ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-700'}`} />
                  <div className={`text-[8.5px] uppercase font-black tracking-[0.2em] ${msg.role === 'user' ? 'text-indigo-500' : 'text-slate-500 italic'}`}>
                    {msg.role === 'user' ? 'Commander' : config.theme === 'Meta' ? 'Meta AI' : 'Agivant AI'}
                  </div>
                </div>
                <div className={`p-5 rounded-2xl text-[11px] leading-relaxed transition-all ${msg.role === 'user'
                    ? 'bg-indigo-600 dark:bg-indigo-500 text-white shadow-[0_12px_30px_-8px_rgba(79,70,229,0.3)]'
                    : 'glass-card text-[var(--text-main)] shadow-xl shadow-black/[0.02] border-slate-200/60 dark:border-white/5'}`}>
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
            {leftWidth > 110 && messages.length === 1 && (
              <div className="pt-2 pb-6 space-y-4">
                <div className="flex items-center gap-2 mb-4 px-1">
                  <div className="w-1 h-3 bg-indigo-500 rounded-full" />
                  <span className="text-[8.5px] font-black uppercase tracking-[0.2em] text-slate-500">Suggestions</span>
                </div>
                {SUGGESTIONS.map((s, i) => (
                  <div
                    key={i}
                    onClick={() => handleSuggestionClick(s.text)}
                    className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] group"
                    style={{
                      background: isDark ? 'rgba(255,255,255,0.02)' : s.bg,
                      borderColor: isDark ? 'rgba(255,255,255,0.05)' : s.border,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2.5">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                      <span className="text-[8.5px] font-black uppercase tracking-widest" style={{ color: s.color }}>{s.label}</span>
                    </div>
                    <div className="text-[10px] leading-relaxed text-[var(--text-main)] opacity-70 group-hover:opacity-100 transition-opacity">
                      {s.text}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>





          <div className="p-6 bg-slate-500/[0.03] dark:bg-white/[0.02] border-t border-[var(--glass-border)]">
            <form onSubmit={handleSend} className="group">
              <div className="relative flex items-center">
                <div className="absolute inset-0 bg-indigo-500/5 blur-2xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
                <input
                  type="text" value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  placeholder={leftWidth > 150 ? 'Send instruction…' : '…'}
                  disabled={isBusy}
                  className="w-full bg-[var(--site-bg)] dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-2xl py-4 pl-6 pr-14 text-[11px] font-medium focus:border-indigo-500/50 outline-none text-[var(--text-main)] placeholder-slate-400 dark:placeholder-slate-800 transition-all z-10 shadow-inner"
                />
                <button type="submit" className="absolute right-3.5 p-2.5 text-indigo-600 hover:scale-110 transition-transform z-20 flex items-center justify-center">
                  <Send size={16} />
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* LEFT RESIZER */}
        <div onMouseDown={startResizingLeft}
          className="w-4 hover:w-4 transition-all cursor-col-resize h-full bg-transparent hover:bg-indigo-500/5 flex items-center justify-center relative z-40 group/resizer">
          <div className={`w-1 h-24 rounded-full bg-slate-200 dark:bg-white/5 transition-all group-hover/resizer:bg-indigo-500/40 ${isResizingLeft ? '!bg-indigo-500 shadow-[0_0_20px_#6366f1] h-40' : ''}`} />
        </div>

        {/* ═══════════════════════════════════════════════════
            CENTER — ORCHESTRATION GRAPH
        ═══════════════════════════════════════════════════ */}
        <section
          ref={centerRef}
          className="flex-1 h-full bg-[var(--site-bg)] flex flex-col items-center overflow-hidden border-r border-[var(--glass-border)] transition-colors duration-500"
        >
          {/* Title bar */}
          <div className="w-full flex items-center justify-between px-8 pt-5 pb-2 shrink-0">
            <div className="flex items-center gap-4">
              {onBack && (
                <button
                  onClick={onBack}
                  className="p-2 -ml-2 rounded-full hover:bg-slate-500/10 dark:hover:bg-white/10 text-slate-500 hover:text-indigo-600 dark:hover:text-white transition-all"
                >
                  <ArrowLeft size={16} />
                </button>
              )}
              <span className="text-[10px] font-black tracking-[0.6em] uppercase flex items-center gap-3">
                <span className="bg-gradient-to-r from-indigo-500 to-emerald-500 bg-clip-text text-transparent">
                  Orchestration
                </span>
                <span className="text-slate-300 dark:text-white/20">Flow</span>
              </span>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3 bg-white/[0.03] dark:bg-black/5 px-4 py-2 rounded-full border border-white/5 shadow-inner transition-all hover:bg-white/5">
                <span className="text-[8.5px] font-bold uppercase text-slate-400 tracking-wider">Minimap</span>
                <button
                  onClick={() => setShowMinimap(!showMinimap)}
                  className={`w-9 h-4.5 rounded-full relative transition-all duration-300 ring-1 ring-inset ${showMinimap ? 'bg-indigo-500 ring-indigo-400/30' : 'bg-slate-300 dark:bg-slate-700 ring-slate-400/20 dark:ring-slate-600/30'
                    }`}
                >
                  <div className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full shadow-lg transition-all duration-300 ease-out ${showMinimap ? 'translate-x-4.5' : 'translate-x-0.5'
                    }`} />
                </button>
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
              <button onClick={() => { setUserZoom(1); setPan({ x: 0, y: 0 }); }} className="px-4 py-2 hover:bg-indigo-500/10 rounded-xl text-[9px] font-black uppercase text-indigo-500 transition-all">Reset</button>
            </div>

            {/* Minimap Widget */}
            {showMinimap && (
              <div className="absolute top-8 right-8 w-44 h-52 bg-slate-100/80 dark:bg-slate-900/80 backdrop-blur-3xl border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden z-40 pointer-events-none group shadow-2xl">
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
          className="w-4 hover:w-4 transition-all cursor-col-resize h-full bg-transparent hover:bg-indigo-500/5 flex items-center justify-center relative z-40 group/resizer">
          <div className={`w-1 h-24 rounded-full bg-slate-200 dark:bg-white/5 transition-all group-hover/resizer:bg-indigo-500/40 ${isResizingRight ? '!bg-indigo-500 shadow-[0_0_20px_#6366f1] h-40' : ''}`} />
        </div>

        {/* ═══════════════════════════════════════════════════
            RIGHT — RESULTS VAULT
        ═══════════════════════════════════════════════════ */}
        <section
          className="h-full border-l border-[var(--glass-border)] bg-[var(--site-bg)] flex flex-col relative z-20 shrink-0 overflow-hidden transition-colors duration-500"
          style={{ width: rightWidth }}
        >
          <div className="p-5 pb-4 flex items-center justify-between border-b border-[var(--glass-border)] bg-slate-500/[0.03] dark:bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-4 bg-indigo-500 rounded-full shadow-[0_0_12px_rgba(99,102,241,0.5)]" />
              {rightWidth > 140 && (
                <div className="flex flex-col">
                  <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-900 dark:text-white leading-none">Insights</h2>
                  <span className="text-[7.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1.5">Data Vault 01</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              {results.length > 0 && rightWidth > 180 && (
                <button onClick={toggleSelectAll}
                  className="text-[8.5px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-400 transition-colors p-1 px-2 rounded-lg hover:bg-indigo-500/5">
                  {selectedProducts.size === results.length ? 'Reset' : 'Select All'}
                </button>
              )}
              {rightWidth > 200 && (
                <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-white/10 dark:bg-black/20 border border-white/5 shadow-sm">
                  <div className={`w-1.5 h-1.5 rounded-full transition-all duration-700 ${workflowState === 'idle' ? 'bg-slate-700' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse'}`} />
                  <span className="text-[8.5px] font-black text-slate-500 dark:text-slate-400 tracking-widest uppercase">Streaming</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar scroll-smooth">

            {vaultHistory.length === 0 && !isBusy && (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-10 py-20">
                <Database size={38} strokeWidth={1} className="mb-5" />
                {rightWidth > 190 && <p className="text-[10px] font-black uppercase tracking_widest">Awaiting Streams</p>}
              </div>
            )}

            {vaultHistory.map((item, itemIdx) => {
              if (item.type === 'products') {
                return (
                  <div key={item.id} className="animate-in fade-in slide-in-from-right-6 mb-4 overflow-hidden">
                    <div className="glass-card rounded-[1.25rem] border-white/5 shadow-[0_8px_32px_rgba(0,0,0,0.1)] overflow-hidden">
                      <div className="p-4 pb-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-1 h-3 bg-indigo-500 rounded-full" />
                          {rightWidth > 190 && <h3 className="text-[8.5px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] whitespace-nowrap">Products Found</h3>}
                        </div>
                        <div className="px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-black text-indigo-500">{item.data.length}</div>
                      </div>
                      <div className="p-4 pt-2">
                        <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1.5 custom-scrollbar" style={{ paddingBottom: 6 }}>
                          {item.data.map(prod => {
                            const isSel = selectedProducts.has(prod.id);
                            return (
                              <div key={prod.id}
                                onClick={() => toggleProduct(prod.id)}
                                title={prod.name}
                                className={`flex items-center justify-between p-2.5 min-h-[46px] rounded-xl cursor-pointer transition-all select-none relative group border ${isSel
                                    ? 'bg-gradient-to-br from-indigo-500/[0.08] to-indigo-500/[0.03] border-indigo-500/40 shadow-[0_2px_12px_rgba(99,102,241,0.08)]'
                                    : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.06] hover:border-white/10'
                                  }`}
                              >
                                <div className="flex items-center gap-3.5 min-w-0">
                                  <div style={{
                                    width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                                    border: `1.5px solid ${isSel ? '#6366f1' : 'var(--text-muted)'}`,
                                    background: isSel ? '#6366f1' : 'transparent',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    opacity: isSel ? 1 : 0.25,
                                    boxShadow: isSel ? '0 0 10px rgba(99,102,241,0.3)' : 'none',
                                  }}>
                                    {isSel && <CheckCircle2 size={10} color="white" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className={`text-[11px] font-bold transition-colors uppercase tracking-tight leading-tight whitespace-normal ${isSel ? 'text-indigo-600 dark:text-indigo-400' : 'text-[var(--text-main)] group-hover:text-indigo-500'}`}>{prod.name}</div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              if (item.type === 'confirmed') {
                const sel = item.data;
                const isOpp = sel.selectionType === 'opportunity';
                const accentColor = isOpp ? '#fbbf24' : '#818cf8';
                return (
                  <div key={item.id} className="animate-in fade-in slide-in-from-right-4 mb-4 overflow-hidden">
                    <div className="glass-card rounded-[1.25rem] border-white/5 shadow-[0_8px_32px_rgba(0,0,0,0.1)] p-4">
                      <div className="flex items-center gap-3 mb-2.5">
                        <div style={{ width: 4, height: 12, borderRadius: 99, background: accentColor, opacity: 0.5 }} />
                        <div className="text-[8.5px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">
                          Confirmed {isOpp ? 'Opportunity' : 'Account'}
                        </div>
                      </div>
                      <div className="px-4 py-3 bg-white/[0.03] border border-white/5 rounded-xl transition-all">
                        <div className="flex items-center gap-2.5">
                          <div style={{
                            width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                            border: `1.5px solid ${accentColor}33`,
                            background: `${accentColor}11`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <CheckCircle2 size={9} style={{ color: accentColor }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="text-[11px] font-bold text-[var(--text-main)] truncate uppercase tracking-tight">{sel.name}</div>
                              <div className="px-1.5 py-0.5 rounded-md bg-indigo-500/5 border border-indigo-500/10 text-[7px] font-black text-indigo-500 uppercase tracking-widest">Saved</div>
                            </div>
                            {sel.detail && sel.detail !== '—' && (
                              <div className="text-[8.5px] font-black uppercase tracking-[0.12em] opacity-60"
                                style={{ color: accentColor }}
                              >{sel.detail}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              if (item.type === 'selection') {
                return (
                  <div key={item.id} className="animate-in fade-in slide-in-from-right-6 z-10 relative mb-4">
                    <div className="glass-card rounded-[1.25rem] border-white/5 shadow-[0_8px_32px_rgba(0,0,0,0.1)] overflow-hidden">
                      <SelectionPanel
                        panel={item.data}
                        confirmedAccount={confirmedAccount}
                        onSelect={handleCardSelect}
                        rightWidth={rightWidth}
                        scrollRef={selectionScrollRef}
                      />
                    </div>
                  </div>
                );
              }

              if (item.type === 'quote') {
                const q = item.data;
                return (
                  <div key={item.id} className="animate-in fade-in slide-in-from-right-8 mb-4 overflow-hidden">
                    <div className="glass-card rounded-[1.25rem] border-white/5 shadow-[0_8px_32px_rgba(0,0,0,0.1)] overflow-hidden">
                      <div className="p-4 pb-1.5 flex items-center gap-3">
                        <div className="w-1 h-3 bg-emerald-500 rounded-full" />
                        <h3 className="text-[8.5px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] whitespace-nowrap">CPQ Quotes</h3>
                      </div>
                      <div className="p-4 pt-2">
                        <div className="bg-gradient-to-br from-indigo-600/10 to-emerald-600/10 border border-emerald-500/20 p-4 rounded-2xl transition-all hover:bg-emerald-500/5 group relative overflow-hidden">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex flex-col gap-1">
                              <div className="text-[8.5px] font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-widest mb-1">Quote ID</div>
                              <div className="text-[11px] font-bold text-[var(--text-main)] font-mono opacity-80">{q.id}</div>
                            </div>
                            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-110">
                              <CheckCircle2 size={16} className="text-emerald-500" />
                            </div>
                          </div>
                          <div className="border-t border-[var(--glass-border)] pt-3 flex items-center justify-between">
                            <span className="text-[8.5px] font-black text-[var(--text-muted)] uppercase tracking-widest tracking-[0.2em]">{q.status}</span>
                            {q.sfLink && (
                              <a href={q.sfLink} target="_blank" rel="noopener noreferrer"
                                className="text-[8.5px] font-black text-indigo-400 uppercase tracking-widest hover:text-indigo-300 transition-colors flex items-center gap-1 z-10 relative">
                                Open in SF <ExternalLink size={9} />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            })}
            {/* Scroll anchor — right panel scrolls here on new data */}
            <div ref={rightPanelEndRef} />
          </div>
          {/* ── Floating action bar: slides up when products are selected ── */}
          {selectedProducts.size > 0 && (
            <div
              className="absolute bottom-0 left-0 right-0 p-4 pt-5 pb-5 border-t border-[var(--glass-border)] bg-[var(--card-bg)] backdrop-blur-3xl z-20 shadow-[0_-20px_40px_rgba(0,0,0,0.05)] transition-all"
              style={{
                animation: 'slide-up-in 0.28s cubic-bezier(0.34,1.56,0.64,1) both',
              }}>
              <button
                onClick={handleCreateQuoteFromSelection}
                disabled={isBusy}
                className={`w-full p-4 rounded-xl text-[8.5px] font-extrabold tracking-widest uppercase flex items-center justify-center gap-3 transition-all active:scale-[0.98] ${isBusy
                    ? 'bg-slate-500/10 text-slate-400 cursor-not-allowed'
                    : 'bg-indigo-600 dark:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-0.5'
                  }`}
              >
                {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                Create Quote — {selectedProducts.size} Product{selectedProducts.size > 1 ? 's' : ''}
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
          onBack={() => setView('selection')}
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
