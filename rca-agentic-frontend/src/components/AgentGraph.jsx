import React from 'react';
import { Network, Search, FileText, Pencil } from 'lucide-react';
import { config } from '../config';
import NodeCard from './NodeCard';
import ToolNode from './ToolNode';
import {
  GW, GH, DM_W, DM_H, DM_ACTIVE_TOP, DM_IDLE_TOP, DM_LEFT, DM_ACTIVE_BOT,
  NODE_W, NODE_H, NODE_TOP, NODE_BOT, MID_Y,
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

  const { coordinator, Catalog_Scout: scout, Quote_Architect: arch, Quote_Updator: updator } = orchestration;

  const cActive = coordinator === 'active', cDone = coordinator === 'done', cLit = cActive || cDone;
  const sActive = scout.state === 'active', sDone = scout.state === 'done';
  const aActive = arch.state === 'active', aDone = arch.state === 'done';
  const uActive = updator.state === 'active', uDone = updator.state === 'done';

  // Agent is composing its reply: it's still active but no tool is currently running
  const scoutComposing = sActive && scout.tools.length > 0 && !scout.tools.some(t => t.state === 'active');
  const archComposing = aActive && arch.tools.length > 0 && !arch.tools.some(t => t.state === 'active');
  const updatorComposing = uActive && updator.tools.length > 0 && !updator.tools.some(t => t.state === 'active');

  // DM→Agent line flows ONLY during the brief handoff window:
  const scoutHandoffActive = sActive && scout.tools.length === 0 && scout.routedByDm;
  const archHandoffActive  = aActive && arch.tools.length  === 0 && arch.routedByDm;
  const updatorHandoffActive = uActive && updator.tools.length === 0 && updator.routedByDm;

  const showScout = scout.state !== 'idle';
  const showArch = arch.state !== 'idle';
  const showUpdator = updator.state !== 'idle';

  // ── Dynamic agent positions ──────────────────────────────
  const visibleKeys = [];
  if (showScout) visibleKeys.push('scout');
  if (showArch) visibleKeys.push('arch');
  if (showUpdator) visibleKeys.push('updator');

  const getAgentCx = (agentKey) => {
    const total = visibleKeys.length;
    if (total === 0) return GW / 2;
    const idx = visibleKeys.indexOf(agentKey);
    if (idx === -1) return GW / 2; // Shouldn't happen if showXYZ is true
    if (total === 1) return GW / 2;
    if (total === 2) return idx === 0 ? GW * 0.3 : GW * 0.7;
    if (total === 3) {
      if (idx === 0) return GW * 0.2;
      if (idx === 1) return GW * 0.5;
      return GW * 0.8;
    }
    return GW / 2;
  };

  const scoutCx = getAgentCx('scout');
  const archCx = getAgentCx('arch');
  const updatorCx = getAgentCx('updator');

  const scoutLeft = scoutCx - NODE_W / 2;
  const archLeft = archCx - NODE_W / 2;
  const updatorLeft = updatorCx - NODE_W / 2;

  // ── Dynamic SVG paths (coordinator → each agent) ─────────
  const pathToScout   = `M ${GW / 2} ${DM_ACTIVE_BOT} C ${GW / 2} ${MID_Y} ${scoutCx}   ${MID_Y} ${scoutCx}   ${NODE_TOP}`;
  const pathToArch    = `M ${GW / 2} ${DM_ACTIVE_BOT} C ${GW / 2} ${MID_Y} ${archCx}    ${MID_Y} ${archCx}    ${NODE_TOP}`;
  const pathToUpdator = `M ${GW / 2} ${DM_ACTIVE_BOT} C ${GW / 2} ${MID_Y} ${updatorCx} ${MID_Y} ${updatorCx} ${NODE_TOP}`;

  // ── Dynamic tool positions (relative to agent cx) ─────────
  const scoutToolPos   = getToolPositions(scoutCx, scout.tools.length);
  const archToolPos    = getToolPositions(archCx, arch.tools.length);
  const updatorToolPos = getToolPositions(updatorCx, updator.tools.length);

  // DM vertical position
  const dmTop = graphActive ? DM_ACTIVE_TOP : DM_IDLE_TOP;

  // Path transition style for smooth morphing
  const pathTransition = 'd 0.72s cubic-bezier(0.4,0,0.2,1), stroke-opacity 0.5s';

  return (
    <div style={{ position: 'relative', width: GW, height: GH, margin: '0 auto', flexShrink: 0 }}>

      {/* ── SVG layer ── */}
      <svg viewBox={`0 0 ${GW} ${GH}`} style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        overflow: 'visible', pointerEvents: 'none',
      }}>
        <defs>
          {[['cyan', '2.5'], ['amber', '2.5'], ['violet', '2.5']].map(([n, s]) => (
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
            x2={scoutCx} y2={NODE_TOP}
            gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={config.theme === 'Meta' ? '#0064E0' : '#818cf8'} />
            <stop offset="100%" stopColor={config.theme === 'Meta' ? '#0081FB' : '#22d3ee'} />
          </linearGradient>

          {/* Gradient: DM indigo → Arch amber */}
          <linearGradient id="grad-arch"
            x1={GW / 2} y1={DM_ACTIVE_BOT}
            x2={archCx} y2={NODE_TOP}
            gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={config.theme === 'Meta' ? '#0064E0' : '#818cf8'} />
            <stop offset="100%" stopColor={config.theme === 'Meta' ? '#31A24C' : '#fbbf24'} />
          </linearGradient>

          {/* Gradient: DM indigo → Updator violet */}
          <linearGradient id="grad-updator"
            x1={GW / 2} y1={DM_ACTIVE_BOT}
            x2={updatorCx} y2={NODE_TOP}
            gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={config.theme === 'Meta' ? '#0064E0' : '#818cf8'} />
            <stop offset="100%" stopColor={config.theme === 'Meta' ? '#9B59B6' : '#a78bfa'} />
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
                  style={{ transition: pathTransition }}
                />
                {/* L2: Flowing dashes — handoff only (DM routed, no tools yet) */}
                {scoutHandoffActive && (
                  <path d={pathToScout}
                    stroke="url(#grad-scout)"
                    strokeWidth={dsw} fill="none"
                    style={{
                      strokeDasharray: '6 18',
                      animation: 'flowDash 0.65s linear infinite',
                      transition: pathTransition
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
                  style={{ transition: pathTransition }}
                />
                {/* L2: Flowing dashes — handoff only (DM routed, no tools yet) */}
                {archHandoffActive && (
                  <path d={pathToArch}
                    stroke="url(#grad-arch)"
                    strokeWidth={dsw} fill="none"
                    style={{
                      strokeDasharray: '6 18',
                      animation: 'flowDash 0.65s linear infinite',
                      transition: pathTransition
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

            {/* DM → Updator  — Circuit Trace: 3 layers (violet) */}
            {showUpdator && (
              <>
                {/* L1: Ghost channel */}
                <path id="pcu" d={pathToUpdator}
                  stroke="url(#grad-updator)"
                  strokeWidth={csw} fill="none"
                  strokeOpacity={cLit ? ch : cq}
                  style={{ transition: pathTransition }}
                />
                {/* L2: Flowing dashes — handoff only */}
                {updatorHandoffActive && (
                  <path d={pathToUpdator}
                    stroke="url(#grad-updator)"
                    strokeWidth={dsw} fill="none"
                    style={{
                      strokeDasharray: '6 18',
                      animation: 'flowDash 0.65s linear infinite',
                      transition: pathTransition
                    }}
                  />
                )}
                {/* L3: Leading dot — handoff only */}
                {updatorHandoffActive && (
                  <circle r={dr} fill={config.theme === 'Meta' ? '#9B59B6' : '#a78bfa'}>
                    <animateMotion dur="1.5s" repeatCount="indefinite" calcMode="linear">
                      <mpath href="#pcu" />
                    </animateMotion>
                  </circle>
                )}
              </>
            )}

            {/* Scout → tool curves — Circuit Trace style */}
            {scout.tools.slice(0, 4).map((tool, i) => {
              const tp = scoutToolPos[i];
              const pid = `ps${i}`;
              const d = makeToolPath(scoutCx, NODE_BOT, tp);
              const toolActive = tool.state === 'active';
              const toolDone = tool.state === 'done';
              return (
                <React.Fragment key={tool.name}>
                  {/* L1: Ghost channel — dims once tool is done */}
                  <path id={pid} d={d}
                    stroke="#22d3ee" strokeWidth={tsw} fill="none"
                    strokeOpacity={toolActive ? ta : toolDone ? td : ti}
                    style={{ transition: pathTransition }}
                  />
                  {/* L2: Flowing dashes — only while THIS tool is active */}
                  {toolActive && (
                    <path d={d}
                      stroke="#22d3ee" strokeWidth={tdsw} fill="none"
                      style={{ strokeDasharray: '6 18', animation: 'flowDash 0.55s linear infinite', transition: pathTransition }}
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
              const d = makeToolPath(archCx, NODE_BOT, tp);
              const toolActive = tool.state === 'active';
              const toolDone = tool.state === 'done';
              return (
                <React.Fragment key={tool.name}>
                  {/* L1: Ghost channel — dims once tool is done */}
                  <path id={pid} d={d}
                    stroke="#fbbf24" strokeWidth={tsw} fill="none"
                    strokeOpacity={toolActive ? ta : toolDone ? td : ti}
                    style={{ transition: pathTransition }}
                  />
                  {/* L2: Flowing dashes — only while THIS tool is active */}
                  {toolActive && (
                    <path d={d}
                      stroke="#fbbf24" strokeWidth={tdsw} fill="none"
                      style={{ strokeDasharray: '6 18', animation: 'flowDash 0.55s linear infinite', transition: pathTransition }}
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

            {/* Updator → tool curves — Circuit Trace style (violet) */}
            {updator.tools.slice(0, 4).map((tool, i) => {
              const tp = updatorToolPos[i];
              const pid = `pu${i}`;
              const d = makeToolPath(updatorCx, NODE_BOT, tp);
              const toolActive = tool.state === 'active';
              const toolDone = tool.state === 'done';
              return (
                <React.Fragment key={tool.name}>
                  {/* L1: Ghost channel — dims once tool is done */}
                  <path id={pid} d={d}
                    stroke="#a78bfa" strokeWidth={tsw} fill="none"
                    strokeOpacity={toolActive ? ta : toolDone ? td : ti}
                    style={{ transition: pathTransition }}
                  />
                  {/* L2: Flowing dashes — only while THIS tool is active */}
                  {toolActive && (
                    <path d={d}
                      stroke="#a78bfa" strokeWidth={tdsw} fill="none"
                      style={{ strokeDasharray: '6 18', animation: 'flowDash 0.55s linear infinite', transition: pathTransition }}
                    />
                  )}
                  {/* L3: Leading dot — only while THIS tool is active */}
                  {toolActive && (
                    <circle r={tdr} fill="#a78bfa" filter="url(#glow-violet)">
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

      {/* Agent cards — appear only when activated, shift horizontally dynamically */}
      {graphReady && showScout && (
        <div style={{
          position: 'absolute',
          left: scoutLeft, top: NODE_TOP,
          transition: 'left 0.72s cubic-bezier(0.4,0,0.2,1)',
          animation: 'slide-up-in 0.55s cubic-bezier(0.4,0,0.2,1) both',
        }}>
          <NodeCard
            label="Catalog Scout"
            subLabel={sActive ? (scoutComposing ? 'Composing reply…' : 'Executing…') : 'Completed'}
            icon={Search} w={NODE_W} h={NODE_H} borderRadius={16}
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
          left: archLeft, top: NODE_TOP,
          transition: 'left 0.72s cubic-bezier(0.4,0,0.2,1)',
          animation: 'slide-up-in 0.55s cubic-bezier(0.4,0,0.2,1) both',
          animationDelay: showScout && visibleKeys.length === 2 ? '0.1s' : '0s',
        }}>
          <NodeCard
            label="Quote Builder"
            subLabel={aActive ? (archComposing ? 'Composing reply…' : 'Executing…') : 'Completed'}
            icon={FileText} w={NODE_W} h={NODE_H} borderRadius={16}
            accentColor={config.theme === 'Meta' ? '#31A24C' : '#fbbf24'} 
            glowColor={config.theme === 'Meta' ? 'rgba(49,162,76,0.5)' : 'rgba(245,158,11,0.5)'}
            isIdle={false} isActive={aActive} isDone={aDone}
          />
          <div style={{
            textAlign: 'center', fontSize: 7.5, fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: '#fbbf2455', marginTop: 8,
          }}>Quote Builder</div>
        </div>
      )}

      {/* Quote Updator — violet, appears centered during update flow */}
      {graphReady && showUpdator && (
        <div style={{
          position: 'absolute',
          left: updatorLeft, top: NODE_TOP,
          transition: 'left 0.72s cubic-bezier(0.4,0,0.2,1)',
          animation: 'slide-up-in 0.55s cubic-bezier(0.4,0,0.2,1) both',
        }}>
          <NodeCard
            label="Quote Updator"
            subLabel={uActive ? (updatorComposing ? 'Composing reply…' : 'Executing…') : 'Completed'}
            icon={Pencil} w={NODE_W} h={NODE_H} borderRadius={16}
            accentColor={config.theme === 'Meta' ? '#9B59B6' : '#a78bfa'}
            glowColor={config.theme === 'Meta' ? 'rgba(155,89,182,0.5)' : 'rgba(167,139,250,0.5)'}
            isIdle={false} isActive={uActive} isDone={uDone}
          />
          <div style={{
            textAlign: 'center', fontSize: 7.5, fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: '#a78bfa55', marginTop: 8,
          }}>Quote Updator</div>
        </div>
      )}

      {/* Tool circles — per-tool active/done state */}
      {graphReady && scout.tools.slice(0, 4).map((tool, i) => {
        const tp = scoutToolPos[i];
        return (
          <ToolNode key={tool.name} cx={tp.x} cy={tp.y}
            label={shortLabel(tool.name)} color="#22d3ee"
            active={tool.state === 'active'} done={tool.state === 'done'} isDark={isDark} 
            style={{ transition: 'cx 0.72s cubic-bezier(0.4,0,0.2,1), cy 0.72s cubic-bezier(0.4,0,0.2,1)' }}
          />
        );
      })}

      {graphReady && arch.tools.slice(0, 4).map((tool, i) => {
        const tp = archToolPos[i];
        return (
          <ToolNode key={tool.name} cx={tp.x} cy={tp.y}
            label={shortLabel(tool.name)} color="#fbbf24"
            active={tool.state === 'active'} done={tool.state === 'done'} isDark={isDark} 
            style={{ transition: 'cx 0.72s cubic-bezier(0.4,0,0.2,1), cy 0.72s cubic-bezier(0.4,0,0.2,1)' }}
          />
        );
      })}

      {graphReady && updator.tools.slice(0, 4).map((tool, i) => {
        const tp = updatorToolPos[i];
        return (
          <ToolNode key={tool.name} cx={tp.x} cy={tp.y}
            label={shortLabel(tool.name)} color="#a78bfa"
            active={tool.state === 'active'} done={tool.state === 'done'} isDark={isDark} 
            style={{ transition: 'cx 0.72s cubic-bezier(0.4,0,0.2,1), cy 0.72s cubic-bezier(0.4,0,0.2,1)' }}
          />
        );
      })}
    </div>
  );
};

export default AgentGraph;
