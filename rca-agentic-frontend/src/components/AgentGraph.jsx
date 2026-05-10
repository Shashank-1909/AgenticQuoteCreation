import React from 'react';
import { Network, Search, FileText } from 'lucide-react';
import { config } from '../config';
import NodeCard from './NodeCard';
import ToolNode from './ToolNode';
import {
  GW, GH, DM_W, DM_H, DM_ACTIVE_TOP, DM_IDLE_TOP, DM_LEFT, DM_ACTIVE_BOT,
  SC, AC, SC_TOP, AC_TOP, SC_BOT, AC_BOT,
  getToolPositions, makeToolPath, shortLabel
} from '../constants';

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
            {scout.tools.slice(0, 7).map((tool, i) => {
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
            {arch.tools.slice(0, 7).map((tool, i) => {
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
      {graphReady && scout.tools.slice(0, 7).map((tool, i) => {
        const tp = scoutToolPos[i];
        return (
          <ToolNode key={tool.name} cx={tp.x} cy={tp.y}
            label={shortLabel(tool.name)} color="#22d3ee"
            active={tool.state === 'active'} done={tool.state === 'done'} isDark={isDark} />
        );
      })}

      {graphReady && arch.tools.slice(0, 7).map((tool, i) => {
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

export default AgentGraph;
