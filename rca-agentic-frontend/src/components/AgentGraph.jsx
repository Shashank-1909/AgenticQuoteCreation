import React from 'react';
import { Network, Search, FileText, Pencil, ClipboardList, TrendingUp, Target } from 'lucide-react';
import { config } from '../config';
import NodeCard from './NodeCard';
import ToolNode from './ToolNode';
import {
  GW, GH, DM_W, DM_H, DM_ACTIVE_TOP, DM_IDLE_TOP, DM_LEFT, DM_ACTIVE_BOT,
  NODE_W, NODE_H, NODE_TOP, NODE_BOT, MID_Y,
  getToolPositions, makeToolPath, shortLabel
} from '../constants';

const TOOL_R = 22;

const makeDynamicToolPath = (agentCx, agentBot, tp) => {
  const midY = (agentBot + tp.y - TOOL_R) / 2;
  return `M ${agentCx} ${agentBot} C ${agentCx} ${midY} ${tp.x} ${midY} ${tp.x} ${tp.y - TOOL_R}`;
};

const getShiftedToolPositions = (agentCx, agentOffset, tools, offsets) => {
  if (!tools || tools.length === 0) return [];
  const basePositions = getToolPositions(agentCx, tools.length);
  return basePositions.map((tp, idx) => {
    const tool = tools[idx];
    const tOffset = offsets[tool.name] || { x: 0, y: 0 };
    return {
      x: tp.x + tOffset.x,
      y: tp.y + agentOffset.y + tOffset.y
    };
  });
};

// ─────────────────────────────────────────────────────────────
// ORCHESTRATION GRAPH
// ─────────────────────────────────────────────────────────────
const AgentGraph = ({ orchestration, graphActive, graphReady, isDark = true, t }) => {
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

  const {
    coordinator,
    Requirements_Parser: parser,
    Catalog_Scout: scout,
    Quote_Architect: arch,
    Quote_Updator: updator,
    Quote_Analyst: analyst,
    Twin_Hunter: twin = { state: 'idle', tools: [], routedByDm: false },
  } = orchestration;

  const cActive = coordinator === 'active', cDone = coordinator === 'done', cLit = cActive || cDone;
  const pActive = parser?.state === 'active', pDone = parser?.state === 'done';
  const sActive = scout.state === 'active', sDone = scout.state === 'done';
  const aActive = arch.state === 'active', aDone = arch.state === 'done';
  const uActive = updator.state === 'active', uDone = updator.state === 'done';
  const anActive = analyst?.state === 'active', anDone = analyst?.state === 'done';
  const tActive = twin.state === 'active', tDone = twin.state === 'done';

  // Drag and drop state
  const [offsets, setOffsets] = React.useState({});
  const [draggedId, setDraggedId] = React.useState(null);
  const dragStartPos = React.useRef({ x: 0, y: 0 });
  const elementStartOffset = React.useRef({ x: 0, y: 0 });

  const startDrag = (e, id) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    setDraggedId(id);
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    dragStartPos.current = { x: clientX, y: clientY };
    const currentOffset = offsets[id] || { x: 0, y: 0 };
    elementStartOffset.current = { ...currentOffset };
  };

  React.useEffect(() => {
    if (!draggedId) return;

    const handleMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      
      const dx = clientX - dragStartPos.current.x;
      const dy = clientY - dragStartPos.current.y;
      
      setOffsets(prev => ({
        ...prev,
        [draggedId]: {
          x: elementStartOffset.current.x + dx,
          y: elementStartOffset.current.y + dy
        }
      }));
    };

    const handleEnd = () => {
      setDraggedId(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [draggedId]);

  // Agent is composing its reply: it's still active but no tool is currently running
  const parserComposing = pActive && parser.tools.length > 0 && !parser.tools.some(t => t.state === 'active');
  const scoutComposing = sActive && scout.tools.length > 0 && !scout.tools.some(t => t.state === 'active');
  const archComposing = aActive && arch.tools.length > 0 && !arch.tools.some(t => t.state === 'active');
  const updatorComposing = uActive && updator.tools.length > 0 && !updator.tools.some(t => t.state === 'active');
  const analystComposing = anActive && analyst?.tools?.length > 0 && !analyst.tools.some(t => t.state === 'active');
  const twinComposing = tActive && twin.tools.length > 0 && !twin.tools.some(t => t.state === 'active');

  // DM→Agent line flows ONLY during the brief handoff window:
  const parserHandoffActive  = pActive && parser.tools.length  === 0 && parser.routedByDm;
  const scoutHandoffActive = sActive && scout.tools.length === 0 && scout.routedByDm;
  const archHandoffActive  = aActive && arch.tools.length  === 0 && arch.routedByDm;
  const updatorHandoffActive = uActive && updator.tools.length === 0 && updator.routedByDm;
  const analystHandoffActive = anActive && analyst?.tools?.length === 0 && analyst.routedByDm;
  const twinHandoffActive = tActive && twin.tools.length === 0 && twin.routedByDm;

  const showParser  = parser?.state !== 'idle' && parser?.state !== undefined;
  const showScout = scout.state !== 'idle';
  const showArch = arch.state !== 'idle';
  const showUpdator = updator.state !== 'idle';
  const showAnalyst = analyst?.state !== 'idle';
  const showTwin = twin.state !== 'idle';

  // ── Dynamic agent positions ──────────────────────────────
  const visibleKeys = [];
  if (showParser)  visibleKeys.push('parser');
  if (showScout) visibleKeys.push('scout');
  if (showArch) visibleKeys.push('arch');
  if (showUpdator) visibleKeys.push('updator');
  if (showAnalyst) visibleKeys.push('analyst');
  if (showTwin) visibleKeys.push('twin');

  const getAgentCx = (agentKey) => {
    const total = visibleKeys.length;
    if (total === 0) return GW / 2;
    const idx = visibleKeys.indexOf(agentKey);
    if (idx === -1) return GW / 2;
    if (total === 1) return GW / 2;
    if (total === 2) return idx === 0 ? GW * 0.3 : GW * 0.7;
    if (total === 3) {
      if (idx === 0) return GW * 0.2;
      if (idx === 1) return GW * 0.5;
      return GW * 0.8;
    }
    if (total === 4) {
      return [GW * 0.14, GW * 0.38, GW * 0.62, GW * 0.86][idx];
    }
    if (total === 5) {
      return [GW * 0.12, GW * 0.31, GW * 0.50, GW * 0.69, GW * 0.88][idx];
    }
    if (total === 6) {
      return [GW * 0.10, GW * 0.26, GW * 0.42, GW * 0.58, GW * 0.74, GW * 0.90][idx];
    }
    if (total === 5) {
      if (idx === 0) return GW * 0.10;
      if (idx === 1) return GW * 0.30;
      if (idx === 2) return GW * 0.50;
      if (idx === 3) return GW * 0.70;
      return GW * 0.90;
    }
    return GW / 2;
  };

  // DM position details
  const dmTop = graphActive ? DM_ACTIVE_TOP : DM_IDLE_TOP;
  const coordinatorOffset = offsets['coordinator'] || { x: 0, y: 0 };
  const dmLeftPos = DM_LEFT + coordinatorOffset.x;
  const dmTopPos = dmTop + coordinatorOffset.y;
  const dmBotX = GW / 2 + coordinatorOffset.x;
  const dmBotY = dmTopPos + DM_H;

  const parserOffset = offsets['parser'] || { x: 0, y: 0 };
  const parserCx  = getAgentCx('parser') + parserOffset.x;
  const parserLeft  = parserCx  - NODE_W / 2;
  const parserTopY = NODE_TOP + parserOffset.y;
  const parserBotY = parserTopY + NODE_H;

  const scoutOffset = offsets['scout'] || { x: 0, y: 0 };
  const scoutCx = getAgentCx('scout') + scoutOffset.x;
  const scoutLeft = scoutCx - NODE_W / 2;
  const scoutTopY = NODE_TOP + scoutOffset.y;
  const scoutBotY = scoutTopY + NODE_H;

  const archOffset = offsets['arch'] || { x: 0, y: 0 };
  const archCx = getAgentCx('arch') + archOffset.x;
  const archLeft = archCx - NODE_W / 2;
  const archTopY = NODE_TOP + archOffset.y;
  const archBotY = archTopY + NODE_H;

  const updatorOffset = offsets['updator'] || { x: 0, y: 0 };
  const updatorCx = getAgentCx('updator') + updatorOffset.x;
  const updatorLeft = updatorCx - NODE_W / 2;
  const updatorTopY = NODE_TOP + updatorOffset.y;
  const updatorBotY = updatorTopY + NODE_H;

  const analystOffset = offsets['analyst'] || { x: 0, y: 0 };
  const analystCx = getAgentCx('analyst') + analystOffset.x;
  const analystLeft = analystCx - NODE_W / 2;
  const analystTopY = NODE_TOP + analystOffset.y;
  const analystBotY = analystTopY + NODE_H;

  const twinOffset = offsets['twin'] || { x: 0, y: 0 };
  const twinCx = getAgentCx('twin') + twinOffset.x;
  const twinLeft = twinCx - NODE_W / 2;
  const twinTopY = NODE_TOP + twinOffset.y;
  const twinBotY = twinTopY + NODE_H;

  // ── Dynamic SVG paths (coordinator → each agent) ─────────
  const pathToParser  = `M ${dmBotX} ${dmBotY} C ${dmBotX} ${(dmBotY + parserTopY) / 2} ${parserCx}   ${(dmBotY + parserTopY) / 2} ${parserCx}   ${parserTopY}`;
  const pathToScout   = `M ${dmBotX} ${dmBotY} C ${dmBotX} ${(dmBotY + scoutTopY) / 2} ${scoutCx} ${(dmBotY + scoutTopY) / 2} ${scoutCx}   ${scoutTopY}`;
  const pathToArch    = `M ${dmBotX} ${dmBotY} C ${dmBotX} ${(dmBotY + archTopY) / 2} ${archCx}    ${(dmBotY + archTopY) / 2} ${archCx}    ${archTopY}`;
  const pathToUpdator = `M ${dmBotX} ${dmBotY} C ${dmBotX} ${(dmBotY + updatorTopY) / 2} ${updatorCx} ${(dmBotY + updatorTopY) / 2} ${updatorCx} ${updatorTopY}`;
  const pathToAnalyst = `M ${dmBotX} ${dmBotY} C ${dmBotX} ${(dmBotY + analystTopY) / 2} ${analystCx} ${(dmBotY + analystTopY) / 2} ${analystCx} ${analystTopY}`;
  const pathToTwin    = `M ${dmBotX} ${dmBotY} C ${dmBotX} ${(dmBotY + twinTopY) / 2} ${twinCx}    ${(dmBotY + twinTopY) / 2} ${twinCx}    ${twinTopY}`;

  // ── Dynamic tool positions (relative to agent cx) ─────────
  const baseParserToolPos  = getShiftedToolPositions(parserCx, parserOffset, parser?.tools || [], offsets);
  const baseScoutToolPos   =   getShiftedToolPositions(scoutCx, scoutOffset, scout.tools, offsets);
  const baseArchToolPos    =   getShiftedToolPositions(archCx, archOffset, arch.tools, offsets);
  const baseUpdatorToolPos =   getShiftedToolPositions(updatorCx, updatorOffset, updator.tools, offsets);
  const baseAnalystToolPos =   getShiftedToolPositions(analystCx, analystOffset, analyst?.tools || [], offsets);
  const baseTwinToolPos    =   getShiftedToolPositions(twinCx, twinOffset, twin?.tools || [], offsets);

  // ── Overlap Resolution / Collision Avoidance ──────────────────
  const resolveToolCollisions = (allToolPositions) => {
    const resolved = allToolPositions.map(tp => ({ ...tp }));
    const minDistance = TOOL_R * 2.3; // minimum separation (diameter + padding)

    for (let iter = 0; iter < 20; iter++) {
      let shifted = false;
      for (let i = 0; i < resolved.length; i++) {
        for (let j = i + 1; j < resolved.length; j++) {
          const dx = resolved[j].x - resolved[i].x;
          const dy = resolved[j].y - resolved[i].y;
          const dist = Math.hypot(dx, dy);
          if (dist < minDistance) {
            const overlap = minDistance - dist;
            const angle = dist > 0 ? Math.atan2(dy, dx) : Math.random() * 2 * Math.PI;
            const forceX = Math.cos(angle) * (overlap / 2);
            const forceY = Math.sin(angle) * (overlap / 2);

            resolved[i].x -= forceX;
            resolved[i].y -= forceY;
            resolved[j].x += forceX;
            resolved[j].y += forceY;
            shifted = true;
          }
        }
      }
      if (!shifted) break;
    }
    return resolved;
  };

  // Build a list of all visible/rendered tools to resolve their collisions
  const visibleTools = [];

  if (showParser && parser?.tools) {
    parser.tools.slice(0, 4).forEach((tool, i) => {
      const basePos = baseParserToolPos[i] || { x: parserCx, y: 450 };
      visibleTools.push({
        agentKey: 'parser',
        index: i,
        name: tool.name,
        x: basePos.x,
        y: basePos.y
      });
    });
  }

  if (showScout && scout?.tools) {
    scout.tools.slice(0, 4).forEach((tool, i) => {
      const basePos = baseScoutToolPos[i] || { x: scoutCx, y: 450 };
      visibleTools.push({
        agentKey: 'scout',
        index: i,
        name: tool.name,
        x: basePos.x,
        y: basePos.y
      });
    });
  }

  if (showArch && arch?.tools) {
    arch.tools.slice(0, 4).forEach((tool, i) => {
      const basePos = baseArchToolPos[i] || { x: archCx, y: 450 };
      visibleTools.push({
        agentKey: 'arch',
        index: i,
        name: tool.name,
        x: basePos.x,
        y: basePos.y
      });
    });
  }

  if (showUpdator && updator?.tools) {
    updator.tools.slice(0, 4).forEach((tool, i) => {
      const basePos = baseUpdatorToolPos[i] || { x: updatorCx, y: 450 };
      visibleTools.push({
        agentKey: 'updator',
        index: i,
        name: tool.name,
        x: basePos.x,
        y: basePos.y
      });
    });
  }

  if (showAnalyst && analyst?.tools) {
    analyst.tools.slice(0, 4).forEach((tool, i) => {
      const basePos = baseAnalystToolPos[i] || { x: analystCx, y: 450 };
      visibleTools.push({
        agentKey: 'analyst',
        index: i,
        name: tool.name,
        x: basePos.x,
        y: basePos.y
      });
    });
  }

  if (showTwin && twin?.tools) {
    twin.tools.slice(0, 4).forEach((tool, i) => {
      const basePos = baseTwinToolPos[i] || { x: twinCx, y: 450 };
      visibleTools.push({
        agentKey: 'twin',
        index: i,
        name: tool.name,
        x: basePos.x,
        y: basePos.y
      });
    });
  }

  const resolvedVisibleTools = resolveToolCollisions(visibleTools);

  const getResolvedToolPos = (agentKey, index, fallback) => {
    const found = resolvedVisibleTools.find(t => t.agentKey === agentKey && t.index === index);
    return found ? { x: found.x, y: found.y } : fallback;
  };

  const parserToolPos = baseParserToolPos.map((tp, i) => getResolvedToolPos('parser', i, tp));
  const scoutToolPos = baseScoutToolPos.map((tp, i) => getResolvedToolPos('scout', i, tp));
  const archToolPos = baseArchToolPos.map((tp, i) => getResolvedToolPos('arch', i, tp));
  const updatorToolPos = baseUpdatorToolPos.map((tp, i) => getResolvedToolPos('updator', i, tp));
  const analystToolPos = baseAnalystToolPos.map((tp, i) => getResolvedToolPos('analyst', i, tp));
  const twinToolPos = baseTwinToolPos.map((tp, i) => getResolvedToolPos('twin', i, tp));


  // Path transition style for smooth morphing
  const pathTransition = 'd 0.72s cubic-bezier(0.4,0,0.2,1), stroke-opacity 0.5s';
  const isDraggingAny = draggedId !== null;
  const pathTransitionStyle = isDraggingAny ? { transition: 'none' } : { transition: pathTransition };


  return (
    <div style={{ position: 'relative', width: GW, height: GH, margin: '0 auto', flexShrink: 0 }}>

      {/* ── SVG layer ── */}
      <svg viewBox={`0 0 ${GW} ${GH}`} style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        overflow: 'visible', pointerEvents: 'none',
      }}>
        <defs>
          {[['cyan', '2.5'], ['amber', '2.5'], ['violet', '2.5'], ['green', '2.5'], ['teal', '2.5']].map(([n, s]) => (
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

          {/* Gradient: DM indigo → Parser emerald */}
          <linearGradient id="grad-parser"
            x1={GW / 2} y1={DM_ACTIVE_BOT}
            x2={parserCx} y2={NODE_TOP}
            gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={config.theme === 'Meta' ? '#0064E0' : '#818cf8'} />
            <stop offset="100%" stopColor={config.theme === 'Meta' ? '#00B2A9' : '#34d399'} />
          </linearGradient>

          {/* Gradient: DM indigo → Scout cyan  (follows the bezier direction) */}
          <linearGradient id="grad-scout"
            x1={dmBotX} y1={dmBotY}
            x2={scoutCx} y2={scoutTopY}
            gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={config.theme === 'Meta' ? '#0064E0' : '#818cf8'} />
            <stop offset="100%" stopColor={config.theme === 'Meta' ? '#0081FB' : '#22d3ee'} />
          </linearGradient>

          {/* Gradient: DM indigo → Arch amber */}
          <linearGradient id="grad-arch"
            x1={dmBotX} y1={dmBotY}
            x2={archCx} y2={archTopY}
            gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={config.theme === 'Meta' ? '#0064E0' : '#818cf8'} />
            <stop offset="100%" stopColor={config.theme === 'Meta' ? '#31A24C' : '#fbbf24'} />
          </linearGradient>

          {/* Gradient: DM indigo → Updator violet */}
          <linearGradient id="grad-updator"
            x1={dmBotX} y1={dmBotY}
            x2={updatorCx} y2={updatorTopY}
            gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={config.theme === 'Meta' ? '#0064E0' : '#818cf8'} />
            <stop offset="100%" stopColor={config.theme === 'Meta' ? '#9B59B6' : '#a78bfa'} />
          </linearGradient>

          {/* Gradient: DM indigo → Analyst green */}
          <linearGradient id="grad-analyst"
            x1={dmBotX} y1={dmBotY}
            x2={analystCx} y2={analystTopY}
            gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={config.theme === 'Meta' ? '#0064E0' : '#818cf8'} />
            <stop offset="100%" stopColor={config.theme === 'Meta' ? '#31A24C' : '#34d399'} />
          </linearGradient>

          {/* Gradient: DM indigo -> Twin teal */}
          <linearGradient id="grad-twin"
            x1={dmBotX} y1={dmBotY}
            x2={twinCx} y2={twinTopY}
            gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={config.theme === 'Meta' ? '#0064E0' : '#818cf8'} />
            <stop offset="100%" stopColor={config.theme === 'Meta' ? '#00A884' : '#14b8a6'} />
          </linearGradient>
        </defs>

        {graphReady && (
          <>
            {/* DM → Requirements Parser — Circuit Trace: 3 layers (emerald) */}
            {showParser && (
              <>
                {/* L1: Ghost channel — always visible, dim */}
                <path id="pcp" d={pathToParser}
                  stroke="url(#grad-parser)"
                  strokeWidth={csw} fill="none"
                  strokeOpacity={cLit ? ch : cq}
                  style={{ transition: pathTransition }}
                />
                {/* L2: Flowing dashes — handoff only */}
                {parserHandoffActive && (
                  <path d={pathToParser}
                    stroke="url(#grad-parser)"
                    strokeWidth={dsw} fill="none"
                    style={{
                      strokeDasharray: '6 18',
                      animation: 'flowDash 0.65s linear infinite',
                      transition: pathTransition
                    }}
                  />
                )}
                {/* L3: Leading dot — handoff only */}
                {parserHandoffActive && (
                  <circle r={dr} fill={config.theme === 'Meta' ? '#00B2A9' : '#34d399'}>
                    <animateMotion dur="1.5s" repeatCount="indefinite" calcMode="linear">
                      <mpath href="#pcp" />
                    </animateMotion>
                  </circle>
                )}
              </>
            )}

            {/* DM → Scout  — Circuit Trace: 3 layers */}
            {showScout && (
              <>
                {/* L1: Ghost channel — always visible, dim */}
                <path id="pcs" d={pathToScout}
                  stroke="url(#grad-scout)"
                  strokeWidth={csw} fill="none"
                  strokeOpacity={cLit ? ch : cq}
                  style={pathTransitionStyle}
                />
                {/* L2: Flowing dashes — handoff only (DM routed, no tools yet) */}
                {scoutHandoffActive && (
                  <path d={pathToScout}
                    stroke="url(#grad-scout)"
                    strokeWidth={dsw} fill="none"
                    style={{
                      strokeDasharray: '6 18',
                      animation: 'flowDash 0.65s linear infinite',
                      ...pathTransitionStyle
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
                  style={pathTransitionStyle}
                />
                {/* L2: Flowing dashes — handoff only (DM routed, no tools yet) */}
                {archHandoffActive && (
                  <path d={pathToArch}
                    stroke="url(#grad-arch)"
                    strokeWidth={dsw} fill="none"
                    style={{
                      strokeDasharray: '6 18',
                      animation: 'flowDash 0.65s linear infinite',
                      ...pathTransitionStyle
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
                  style={pathTransitionStyle}
                />
                {/* L2: Flowing dashes — handoff only */}
                {updatorHandoffActive && (
                  <path d={pathToUpdator}
                    stroke="url(#grad-updator)"
                    strokeWidth={dsw} fill="none"
                    style={{
                      strokeDasharray: '6 18',
                      animation: 'flowDash 0.65s linear infinite',
                      ...pathTransitionStyle
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

            {/* Parser → tool curves — Circuit Trace style (emerald) */}
            {(parser?.tools ?? []).slice(0, 4).map((tool, i) => {
              const tp = parserToolPos[i];
              const pid = `pp${i}`;
              const d = makeDynamicToolPath(parserCx, parserBotY, tp);
              const toolActive = tool.state === 'active';
              const toolDone = tool.state === 'done';
              return (
                <React.Fragment key={tool.name}>
                  <path id={pid} d={d}
                    stroke="#34d399" strokeWidth={tsw} fill="none"
                    strokeOpacity={toolActive ? ta : toolDone ? td : ti}
                    style={pathTransitionStyle}
                  />
                  {toolActive && (
                    <path d={d}
                      stroke="#34d399" strokeWidth={tdsw} fill="none"
                      style={{ strokeDasharray: '6 18', animation: 'flowDash 0.55s linear infinite', ...pathTransitionStyle }}
                    />
                  )}
                  {toolActive && (
                    <circle r={tdr} fill="#34d399" filter="url(#glow-cyan)">
                      <animateMotion dur="1.0s" repeatCount="indefinite" calcMode="linear">
                        <mpath href={`#${pid}`} />
                      </animateMotion>
                    </circle>
                  )}
                </React.Fragment>
              );
            })}

            {/* DM → Analyst  — Circuit Trace: 3 layers (green) */}
            {showAnalyst && (
              <>
                {/* L1: Ghost channel */}
                <path id="pcan" d={pathToAnalyst}
                  stroke="url(#grad-analyst)"
                  strokeWidth={csw} fill="none"
                  strokeOpacity={cLit ? ch : cq}
                  style={pathTransitionStyle}
                />
                {/* L2: Flowing dashes — handoff only */}
                {analystHandoffActive && (
                  <path d={pathToAnalyst}
                    stroke="url(#grad-analyst)"
                    strokeWidth={dsw} fill="none"
                    style={{
                      strokeDasharray: '6 18',
                      animation: 'flowDash 0.65s linear infinite',
                      ...pathTransitionStyle
                    }}
                  />
                )}
                {/* L3: Leading dot — handoff only */}
                {analystHandoffActive && (
                  <circle r={dr} fill={config.theme === 'Meta' ? '#31A24C' : '#34d399'}>
                    <animateMotion dur="1.5s" repeatCount="indefinite" calcMode="linear">
                      <mpath href="#pcan" />
                    </animateMotion>
                  </circle>
                )}
              </>
            )}

            {/* Scout → tool curves — Circuit Trace style */}
            {showTwin && (
              <>
                <path id="pct" d={pathToTwin}
                  stroke="url(#grad-twin)"
                  strokeWidth={csw} fill="none"
                  strokeOpacity={cLit ? ch : cq}
                  style={{ transition: pathTransition }}
                />
                {twinHandoffActive && (
                  <path d={pathToTwin}
                    stroke="url(#grad-twin)"
                    strokeWidth={dsw} fill="none"
                    style={{
                      strokeDasharray: '6 18',
                      animation: 'flowDash 0.65s linear infinite',
                      transition: pathTransition
                    }}
                  />
                )}
                {twinHandoffActive && (
                  <circle r={dr} fill={config.theme === 'Meta' ? '#00A884' : '#14b8a6'}>
                    <animateMotion dur="1.5s" repeatCount="indefinite" calcMode="linear">
                      <mpath href="#pct" />
                    </animateMotion>
                  </circle>
                )}
              </>
            )}

            {scout.tools.slice(0, 4).map((tool, i) => {
              const tp = scoutToolPos[i];
              const pid = `ps${i}`;
              const d = makeDynamicToolPath(scoutCx, scoutBotY, tp);
              const toolActive = tool.state === 'active';
              const toolDone = tool.state === 'done';
              return (
                <React.Fragment key={tool.name}>
                  {/* L1: Ghost channel — dims once tool is done */}
                  <path id={pid} d={d}
                    stroke="#22d3ee" strokeWidth={tsw} fill="none"
                    strokeOpacity={toolActive ? ta : toolDone ? td : ti}
                    style={pathTransitionStyle}
                  />
                  {/* L2: Flowing dashes — only while THIS tool is active */}
                  {toolActive && (
                    <path d={d}
                      stroke="#22d3ee" strokeWidth={tdsw} fill="none"
                      style={{ strokeDasharray: '6 18', animation: 'flowDash 0.55s linear infinite', ...pathTransitionStyle }}
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
              const d = makeDynamicToolPath(archCx, archBotY, tp);
              const toolActive = tool.state === 'active';
              const toolDone = tool.state === 'done';
              const strokeColor = '#fbbf24';
              const glowFilter = 'url(#glow-amber)';
              return (
                <React.Fragment key={tool.name}>
                  {/* L1: Ghost channel — dims once tool is done */}
                  <path id={pid} d={d}
                    stroke={strokeColor} strokeWidth={tsw} fill="none"
                    strokeOpacity={toolActive ? ta : toolDone ? td : ti}
                    style={pathTransitionStyle}
                  />
                  {/* L2: Flowing dashes — only while THIS tool is active */}
                  {toolActive && (
                    <path d={d}
                      stroke={strokeColor} strokeWidth={tdsw} fill="none"
                      style={{ strokeDasharray: '6 18', animation: 'flowDash 0.55s linear infinite', ...pathTransitionStyle }}
                    />
                  )}
                  {/* L3: Leading dot — only while THIS tool is active */}
                  {toolActive && (
                    <circle r={tdr} fill={strokeColor} filter={glowFilter}>
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
              const d = makeDynamicToolPath(updatorCx, updatorBotY, tp);
              const toolActive = tool.state === 'active';
              const toolDone = tool.state === 'done';
              return (
                <React.Fragment key={tool.name}>
                  <path id={pid} d={d} stroke="#a78bfa" strokeWidth={tsw} fill="none" strokeOpacity={toolActive ? ta : toolDone ? td : ti} style={pathTransitionStyle} />
                  {toolActive && <path d={d} stroke="#a78bfa" strokeWidth={tdsw} fill="none" style={{ strokeDasharray: '6 18', animation: 'flowDash 0.55s linear infinite', ...pathTransitionStyle }} />}
                  {toolActive && <circle r={tdr} fill="#a78bfa" filter="url(#glow-violet)"><animateMotion dur="1.0s" repeatCount="indefinite" calcMode="linear"><mpath href={`#${pid}`} /></animateMotion></circle>}
                </React.Fragment>
              );
            })}

            {/* Analyst → tool curves — Circuit Trace style (green) */}
            {analyst?.tools?.slice(0, 4).map((tool, i) => {
              const tp = analystToolPos[i];
              const pid = `pan${i}`;
              const d = makeDynamicToolPath(analystCx, analystBotY, tp);
              const toolActive = tool.state === 'active';
              const toolDone = tool.state === 'done';
              return (
                <React.Fragment key={tool.name}>
                  <path id={pid} d={d} stroke="#34d399" strokeWidth={tsw} fill="none" strokeOpacity={toolActive ? ta : toolDone ? td : ti} style={pathTransitionStyle} />
                  {toolActive && <path d={d} stroke="#34d399" strokeWidth={tdsw} fill="none" style={{ strokeDasharray: '6 18', animation: 'flowDash 0.55s linear infinite', ...pathTransitionStyle }} />}
                  {toolActive && <circle r={tdr} fill="#34d399" filter="url(#glow-green)"><animateMotion dur="1.0s" repeatCount="indefinite" calcMode="linear"><mpath href={`#${pid}`} /></animateMotion></circle>}
                </React.Fragment>
              );
            })}

            {/* Twin Hunter → tool curves — Circuit Trace style (teal) */}
            {twin?.tools?.slice(0, 4).map((tool, i) => {
              const tp = twinToolPos[i];
              const pid = `pt${i}`;
              const d = makeDynamicToolPath(twinCx, twinBotY, tp);
              const toolActive = tool.state === 'active';
              const toolDone = tool.state === 'done';
              return (
                <React.Fragment key={tool.name}>
                  <path id={pid} d={d} stroke="#14b8a6" strokeWidth={tsw} fill="none" strokeOpacity={toolActive ? ta : toolDone ? td : ti} style={pathTransitionStyle} />
                  {toolActive && <path d={d} stroke="#14b8a6" strokeWidth={tdsw} fill="none" style={{ strokeDasharray: '6 18', animation: 'flowDash 0.55s linear infinite', ...pathTransitionStyle }} />}
                  {toolActive && <circle r={tdr} fill="#14b8a6" filter="url(#glow-teal)"><animateMotion dur="1.0s" repeatCount="indefinite" calcMode="linear"><mpath href={`#${pid}`} /></animateMotion></circle>}
                </React.Fragment>
              );
            })}
          </>
        )}
      </svg>

      {/* ── DOM nodes ── */}

      {/* Deal Manager — slides from center to top on first query */}
      <div 
        onMouseDown={(e) => startDrag(e, 'coordinator')}
        onTouchStart={(e) => startDrag(e, 'coordinator')}
        style={{
          position: 'absolute',
          left: dmLeftPos, top: dmTopPos,
          width: DM_W, height: DM_H,
          transition: draggedId === 'coordinator' ? 'none' : 'top 0.78s cubic-bezier(0.4,0,0.2,1), left 0.72s cubic-bezier(0.4,0,0.2,1)',
          zIndex: 10,
          cursor: draggedId === 'coordinator' ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
      >
        <NodeCard
          label={t?.nodes?.dealManager || "Deal Manager"} subLabel={cActive ? (t?.nodes?.routing || 'Routing…') : cDone ? (t?.nodes?.dispatched || 'Dispatched') : (t?.nodes?.coordinator || 'Coordinator')}
          icon={Network} w={DM_W} h={DM_H} borderRadius={16}
          accentColor={config.theme === 'Meta' ? '#0064E0' : '#818cf8'} 
          glowColor={config.theme === 'Meta' ? 'rgba(0,100,224,0.5)' : 'rgba(99,102,241,0.5)'}
          isIdle={!cActive && !cDone} isActive={cActive} isDone={cDone}
        />
      </div>

      {/* Requirements Parser — emerald, appears when activated */}
      {graphReady && showParser && (
        <div 
          onMouseDown={(e) => startDrag(e, 'parser')}
          onTouchStart={(e) => startDrag(e, 'parser')}
          style={{
            position: 'absolute',
            left: parserLeft, top: parserTopY,
            transition: draggedId === 'parser' ? 'none' : 'left 0.72s cubic-bezier(0.4,0,0.2,1), top 0.72s cubic-bezier(0.4,0,0.2,1)',
            animation: 'slide-up-in 0.55s cubic-bezier(0.4,0,0.2,1) both',
            cursor: draggedId === 'parser' ? 'grabbing' : 'grab',
            userSelect: 'none',
            zIndex: 10,
          }}
        >
          <NodeCard
            label={t?.nodes?.requirementsParser || "Req. Parser"}
            subLabel={pActive ? (parserComposing ? (t?.nodes?.composing || 'Composing reply…') : (t?.nodes?.executing || 'Executing…')) : (t?.nodes?.completed || 'Completed')}
            icon={ClipboardList} w={NODE_W} h={NODE_H} borderRadius={16}
            accentColor={config.theme === 'Meta' ? '#00B2A9' : '#34d399'}
            glowColor={config.theme === 'Meta' ? 'rgba(0,178,169,0.5)' : 'rgba(52,211,153,0.5)'}
            isIdle={false} isActive={pActive} isDone={pDone}
          />
          <div style={{
            textAlign: 'center', fontSize: 7.5, fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: '#34d39955', marginTop: 8,
          }}>{t?.nodes?.requirementsParser || "Req. Parser"}</div>
        </div>
      )}

      {/* Agent cards — appear only when activated, shift horizontally dynamically */}
      {graphReady && showScout && (
        <div 
          onMouseDown={(e) => startDrag(e, 'scout')}
          onTouchStart={(e) => startDrag(e, 'scout')}
          style={{
            position: 'absolute',
            left: scoutLeft, top: scoutTopY,
            transition: draggedId === 'scout' ? 'none' : 'left 0.72s cubic-bezier(0.4,0,0.2,1), top 0.72s cubic-bezier(0.4,0,0.2,1)',
            animation: 'slide-up-in 0.55s cubic-bezier(0.4,0,0.2,1) both',
            cursor: draggedId === 'scout' ? 'grabbing' : 'grab',
            userSelect: 'none',
          }}
        >
          <NodeCard
            label={t?.nodes?.catalogScout || "Catalog Scout"}
            subLabel={sActive ? (scoutComposing ? (t?.nodes?.composing || 'Composing reply…') : (t?.nodes?.executing || 'Executing…')) : (t?.nodes?.completed || 'Completed')}
            icon={Search} w={NODE_W} h={NODE_H} borderRadius={16}
            accentColor={config.theme === 'Meta' ? '#0081FB' : '#22d3ee'} 
            glowColor={config.theme === 'Meta' ? 'rgba(0,129,251,0.5)' : 'rgba(6,182,212,0.5)'}
            isIdle={false} isActive={sActive} isDone={sDone}
          />
          <div style={{
            textAlign: 'center', fontSize: 7.5, fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: '#22d3ee55', marginTop: 8,
          }}>{t?.nodes?.catalogScout || "Catalog Scout"}</div>
        </div>
      )}

      {graphReady && showArch && (
        <div 
          onMouseDown={(e) => startDrag(e, 'arch')}
          onTouchStart={(e) => startDrag(e, 'arch')}
          style={{
            position: 'absolute',
            left: archLeft, top: archTopY,
            transition: draggedId === 'arch' ? 'none' : 'left 0.72s cubic-bezier(0.4,0,0.2,1), top 0.72s cubic-bezier(0.4,0,0.2,1)',
            animation: 'slide-up-in 0.55s cubic-bezier(0.4,0,0.2,1) both',
            animationDelay: showScout && visibleKeys.length === 2 ? '0.1s' : '0s',
            cursor: draggedId === 'arch' ? 'grabbing' : 'grab',
            userSelect: 'none',
          }}
        >
          <NodeCard
            label={t?.nodes?.quoteBuilder || "Quote Builder"}
            subLabel={aActive ? (archComposing ? (t?.nodes?.composing || 'Composing reply…') : (t?.nodes?.executing || 'Executing…')) : (t?.nodes?.completed || 'Completed')}
            icon={FileText} w={NODE_W} h={NODE_H} borderRadius={16}
            accentColor={config.theme === 'Meta' ? '#31A24C' : '#fbbf24'} 
            glowColor={config.theme === 'Meta' ? 'rgba(49,162,76,0.5)' : 'rgba(245,158,11,0.5)'}
            isIdle={false} isActive={aActive} isDone={aDone}
          />
          <div style={{
            textAlign: 'center', fontSize: 7.5, fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: '#fbbf2455', marginTop: 8,
          }}>{t?.nodes?.quoteBuilder || "Quote Builder"}</div>
        </div>
      )}

      {/* Quote Updator — violet, appears centered during update flow */}
      {graphReady && showUpdator && (
        <div 
          onMouseDown={(e) => startDrag(e, 'updator')}
          onTouchStart={(e) => startDrag(e, 'updator')}
          style={{
            position: 'absolute',
            left: updatorLeft, top: updatorTopY,
            transition: draggedId === 'updator' ? 'none' : 'left 0.72s cubic-bezier(0.4,0,0.2,1), top 0.72s cubic-bezier(0.4,0,0.2,1)',
            animation: 'slide-up-in 0.55s cubic-bezier(0.4,0,0.2,1) both',
            cursor: draggedId === 'updator' ? 'grabbing' : 'grab',
            userSelect: 'none',
          }}
        >
          <NodeCard
            label={t?.nodes?.quoteModifier || "Quote Modifier"}
            subLabel={uActive ? (updatorComposing ? (t?.nodes?.composing || 'Composing reply…') : (t?.nodes?.executing || 'Executing…')) : (t?.nodes?.completed || 'Completed')}
            icon={Pencil} w={NODE_W} h={NODE_H} borderRadius={16}
            accentColor={config.theme === 'Meta' ? '#9B59B6' : '#a78bfa'}
            glowColor={config.theme === 'Meta' ? 'rgba(155,89,182,0.5)' : 'rgba(167,139,250,0.5)'}
            isIdle={false} isActive={uActive} isDone={uDone}
          />
          <div style={{
            textAlign: 'center', fontSize: 7.5, fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: '#a78bfa55', marginTop: 8,
          }}>{t?.nodes?.quoteModifier || "Quote Modifier"}</div>
        </div>
      )}

      {graphReady && showAnalyst && (
        <div 
          onMouseDown={(e) => startDrag(e, 'analyst')}
          onTouchStart={(e) => startDrag(e, 'analyst')}
          style={{
            position: 'absolute',
            left: analystLeft, top: analystTopY,
            transition: draggedId === 'analyst' ? 'none' : 'left 0.72s cubic-bezier(0.4,0,0.2,1), top 0.72s cubic-bezier(0.4,0,0.2,1)',
            animation: 'slide-up-in 0.55s cubic-bezier(0.4,0,0.2,1) both',
            cursor: draggedId === 'analyst' ? 'grabbing' : 'grab',
            userSelect: 'none',
          }}
        >
          <NodeCard
            label="Quote Analyst"
            subLabel={anActive ? (analystComposing ? 'Composing reply…' : 'Executing…') : 'Completed'}
            icon={TrendingUp} w={NODE_W} h={NODE_H} borderRadius={16}
            accentColor={config.theme === 'Meta' ? '#31A24C' : '#34d399'}
            glowColor={config.theme === 'Meta' ? 'rgba(49,162,76,0.5)' : 'rgba(52,211,153,0.5)'}
            isIdle={false} isActive={anActive} isDone={anDone}
          />
          <div style={{
            textAlign: 'center', fontSize: 7.5, fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: '#34d39955', marginTop: 8,
          }}>Quote Analyst</div>
        </div>
      )}



      {/* Tool circles — per-tool active/done state */}
      {graphReady && (parser?.tools ?? []).slice(0, 4).map((tool, i) => {
        const tp = parserToolPos[i];
        return (
          <ToolNode key={tool.name} cx={tp.x} cy={tp.y}
            label={shortLabel(tool.name)} color="#34d399"
            active={tool.state === 'active'} done={tool.state === 'done'} isDark={isDark}
            style={{ transition: 'cx 0.72s cubic-bezier(0.4,0,0.2,1), cy 0.72s cubic-bezier(0.4,0,0.2,1)' }}
          />
        );
      })}

      {graphReady && showTwin && (
        <div 
          onMouseDown={(e) => startDrag(e, 'twin')}
          onTouchStart={(e) => startDrag(e, 'twin')}
          style={{
            position: 'absolute',
            left: twinLeft, top: twinTopY,
            transition: draggedId === 'twin' ? 'none' : 'left 0.72s cubic-bezier(0.4,0,0.2,1), top 0.72s cubic-bezier(0.4,0,0.2,1)',
            animation: 'slide-up-in 0.55s cubic-bezier(0.4,0,0.2,1) both',
            cursor: draggedId === 'twin' ? 'grabbing' : 'grab',
            userSelect: 'none',
          }}>
          <NodeCard
            label={t?.nodes?.twinHunter || "Twin Hunter"}
            subLabel={tActive ? (twinComposing ? (t?.nodes?.composing || 'Composing reply...') : (t?.nodes?.executing || 'Executing...')) : (t?.nodes?.completed || 'Completed')}
            icon={Target} w={NODE_W} h={NODE_H} borderRadius={16}
            accentColor={config.theme === 'Meta' ? '#00A884' : '#14b8a6'}
            glowColor={config.theme === 'Meta' ? 'rgba(0,168,132,0.5)' : 'rgba(20,184,166,0.5)'}
            isIdle={false} isActive={tActive} isDone={tDone}
          />
          <div style={{
            textAlign: 'center', fontSize: 7.5, fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: '#14b8a655', marginTop: 8,
          }}>{t?.nodes?.twinHunter || "Twin Hunter"}</div>
        </div>
      )}

      {graphReady && scout.tools.slice(0, 4).map((tool, i) => {
        const tp = scoutToolPos[i];
        return (
          <ToolNode key={tool.name} cx={tp.x} cy={tp.y}
            label={shortLabel(tool.name)} color="#22d3ee"
            active={tool.state === 'active'} done={tool.state === 'done'} isDark={isDark} 
            onMouseDown={(e) => startDrag(e, tool.name)}
            onTouchStart={(e) => startDrag(e, tool.name)}
            cursor={draggedId === tool.name ? 'grabbing' : 'grab'}
            style={{ transition: draggedId === tool.name ? 'none' : 'left 0.72s cubic-bezier(0.4,0,0.2,1), top 0.72s cubic-bezier(0.4,0,0.2,1)' }}
          />
        );
      })}

      {graphReady && arch.tools.slice(0, 4).map((tool, i) => {
        const tp = archToolPos[i];
        return (
          <ToolNode key={tool.name} cx={tp.x} cy={tp.y}
            label={shortLabel(tool.name)} color="#fbbf24"
            active={tool.state === 'active'} done={tool.state === 'done'} isDark={isDark} 
            onMouseDown={(e) => startDrag(e, tool.name)}
            onTouchStart={(e) => startDrag(e, tool.name)}
            cursor={draggedId === tool.name ? 'grabbing' : 'grab'}
            style={{ transition: draggedId === tool.name ? 'none' : 'left 0.72s cubic-bezier(0.4,0,0.2,1), top 0.72s cubic-bezier(0.4,0,0.2,1)' }}
          />
        );
      })}

      {graphReady && updator.tools.slice(0, 4).map((tool, i) => {
        const tp = updatorToolPos[i];
        return (
          <ToolNode key={tool.name} cx={tp.x} cy={tp.y}
            label={shortLabel(tool.name)} color="#a78bfa"
            active={tool.state === 'active'} done={tool.state === 'done'} isDark={isDark} 
            onMouseDown={(e) => startDrag(e, tool.name)}
            onTouchStart={(e) => startDrag(e, tool.name)}
            cursor={draggedId === tool.name ? 'grabbing' : 'grab'}
            style={{ transition: draggedId === tool.name ? 'none' : 'left 0.72s cubic-bezier(0.4,0,0.2,1), top 0.72s cubic-bezier(0.4,0,0.2,1)' }}
          />
        );
      })}

      {graphReady && analyst && analyst.tools && analyst.tools.slice(0, 4).map((tool, i) => {
        const tp = analystToolPos[i];
        return (
          <ToolNode key={tool.name} cx={tp.x} cy={tp.y}
            label={shortLabel(tool.name)} color="#34d399"
            active={tool.state === 'active'} done={tool.state === 'done'} isDark={isDark} 
            onMouseDown={(e) => startDrag(e, tool.name)}
            onTouchStart={(e) => startDrag(e, tool.name)}
            cursor={draggedId === tool.name ? 'grabbing' : 'grab'}
            style={{ transition: draggedId === tool.name ? 'none' : 'left 0.72s cubic-bezier(0.4,0,0.2,1), top 0.72s cubic-bezier(0.4,0,0.2,1)' }}
          />
        );
      })}

      {graphReady && twin && twin.tools && twin.tools.slice(0, 4).map((tool, i) => {
        const tp = twinToolPos[i];
        return (
          <ToolNode key={tool.name} cx={tp.x} cy={tp.y}
            label={shortLabel(tool.name)} color="#14b8a6"
            active={tool.state === 'active'} done={tool.state === 'done'} isDark={isDark} 
            onMouseDown={(e) => startDrag(e, tool.name)}
            onTouchStart={(e) => startDrag(e, tool.name)}
            cursor={draggedId === tool.name ? 'grabbing' : 'grab'}
            style={{ transition: draggedId === tool.name ? 'none' : 'left 0.72s cubic-bezier(0.4,0,0.2,1), top 0.72s cubic-bezier(0.4,0,0.2,1)' }}
          />
        );
      })}
    </div>
  );
};

export default AgentGraph;