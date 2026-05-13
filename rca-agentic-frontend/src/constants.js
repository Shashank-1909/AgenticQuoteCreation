import { config } from './config';

// ─────────────────────────────────────────────────────────────
// GRAPH LAYOUT CONSTANTS  (SVG + DOM coordinate space, px)
// ─────────────────────────────────────────────────────────────
export const GW = 680;   // graph canvas width
export const GH = 560;   // graph canvas height

// Deal Manager card (active / top position)
export const DM_W = 160, DM_H = 76;
export const DM_ACTIVE_TOP = 30;                            // top when active
export const DM_IDLE_TOP = GH / 2 - DM_H / 2 - 20;       // vertically centered when idle
export const DM_LEFT = GW / 2 - DM_W / 2;            // always horizontally centered
export const DM_ACTIVE_CY = DM_ACTIVE_TOP + DM_H / 2;     // = 68
export const DM_ACTIVE_BOT = DM_ACTIVE_TOP + DM_H;         // = 106

// Generic Agent Node Dimensions
export const NODE_W = 140;
export const NODE_H = 70;
export const NODE_CY = 255;
export const NODE_TOP = NODE_CY - NODE_H / 2; // 220
export const NODE_BOT = NODE_CY + NODE_H / 2; // 290
export const MID_Y = (DM_ACTIVE_BOT + NODE_TOP) / 2;  // ≈ 163

// Tool circle radius
export const TOOL_R = 22;
export const TOOL_CURVE_MID_Y = 368;

// Dynamic tool positions — spread symmetrically around the agent's cx based on count
export const getToolPositions = (agentCx, numTools = 4) => {
  if (numTools === 1) {
    return [{ x: agentCx, y: 465 }];
  }
  if (numTools === 2) {
    return [
      { x: agentCx - 45, y: 450 },
      { x: agentCx + 45, y: 450 }
    ];
  }
  if (numTools === 3) {
    return [
      { x: agentCx - 70, y: 435 },
      { x: agentCx, y: 465 },
      { x: agentCx + 70, y: 435 }
    ];
  }
  // 4 tools
  return [
    { x: agentCx - 85, y: 425 },
    { x: agentCx - 30, y: 465 },
    { x: agentCx + 30, y: 465 },
    { x: agentCx + 85, y: 425 }
  ];
};

// Curved bezier from agent-bottom to tool-top (same style as coordinator→agent paths)
export const makeToolPath = (agentCx, agentBot, tp) =>
  `M ${agentCx} ${agentBot} C ${agentCx} ${TOOL_CURVE_MID_Y} ${tp.x} ${TOOL_CURVE_MID_Y} ${tp.x} ${tp.y - TOOL_R}`;

// Short display names for tools
export const TOOL_LABELS = {
  check_field_values: 'Field Check',
  search_catalog:     'Product Search',
  resolve_pricebook_entries: 'Pricebook',
  evaluate_quote_graph: 'CPQ Quote',
  get_my_accounts: 'Accounts',
  get_opportunities_for_account: 'Opportunity',
  transfer_to_agent: 'Route',
  get_quote_line_items:    'Line Items',
  manage_quote_line_items: 'Update Lines',
};
export const shortLabel = (t) => TOOL_LABELS[t] || t.replace(/_/g, ' ').slice(0, 12);

// ─────────────────────────────────────────────────────────────
// INITIAL ORCHESTRATION STATE
// ─────────────────────────────────────────────────────────────
export const INIT_ORCH = {
  coordinator: 'idle',
  Catalog_Scout:   { state: 'idle', tools: [], routedByDm: false },
  Quote_Architect: { state: 'idle', tools: [], routedByDm: false },
  Quote_Updator:   { state: 'idle', tools: [], routedByDm: false },
};

// ─────────────────────────────────────────────────────────────
export const SUGGESTIONS = [
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
