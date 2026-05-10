import { config } from './config';

// ─────────────────────────────────────────────────────────────
// GRAPH LAYOUT CONSTANTS  (SVG + DOM coordinate space, px)
// ─────────────────────────────────────────────────────────────
export const GW = 480;   // graph canvas width
export const GH = 640;   // graph canvas height

// Deal Manager card (active / top position)
export const DM_W = 160, DM_H = 76;
export const DM_ACTIVE_TOP = 30;                            // top when active
export const DM_IDLE_TOP = GH / 2 - DM_H / 2 - 20;       // vertically centered when idle
export const DM_LEFT = GW / 2 - DM_W / 2;            // always horizontally centered
export const DM_ACTIVE_CY = DM_ACTIVE_TOP + DM_H / 2;     // = 68
export const DM_ACTIVE_BOT = DM_ACTIVE_TOP + DM_H;         // = 106

// Agent cards (Catalog Scout = left, Quote Architect = right)
export const SC = { cx: 118, cy: 255, w: 140, h: 70 };  // Scout center
export const AC = { cx: 362, cy: 255, w: 140, h: 70 };  // Arch  center
export const SC_TOP = SC.cy - SC.h / 2;  // 220
export const AC_TOP = AC.cy - AC.h / 2;  // 220
export const SC_BOT = SC.cy + SC.h / 2;  // 290
export const AC_BOT = AC.cy + AC.h / 2;  // 290
export const MID_Y = (DM_ACTIVE_BOT + SC_TOP) / 2;  // ≈ 163

// SVG bezier paths: DM-bottom → agent-top
export const PATH_CS = `M ${GW / 2} ${DM_ACTIVE_BOT} C ${GW / 2} ${MID_Y} ${SC.cx} ${MID_Y} ${SC.cx} ${SC_TOP}`;
export const PATH_CA = `M ${GW / 2} ${DM_ACTIVE_BOT} C ${GW / 2} ${MID_Y} ${AC.cx} ${MID_Y} ${AC.cx} ${AC_TOP}`;

// Tool circle radius
export const TOOL_R = 22;
export const TOOL_CURVE_MID_Y = 368;

// Dynamic tool positions — up to 7 circles spread symmetrically around the agent's cx
export const getToolPositions = (agentCx) => [
  { x: agentCx - 120, y: 420 },
  { x: agentCx - 75,  y: 440 },
  { x: agentCx - 30,  y: 455 },
  { x: agentCx + 15,  y: 460 },
  { x: agentCx + 60,  y: 455 },
  { x: agentCx + 105, y: 440 },
  { x: agentCx + 150, y: 420 },
];

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
  // New separated quote tools
  update_quote_discount: 'Discount',
  get_quotes_for_opportunity: 'Quote Query',
  get_quote_details: 'Details',
  rename_quote: 'Rename',
  manage_quote_line_items: 'Line Items',
};

// Action-specific labels (kept for backward compatibility)
export const ACTION_LABELS = {};

// Update tools — these occupy a SINGLE dynamic slot that swaps labels
export const UPDATE_TOOLS = new Set([
  'update_quote_discount',
  'get_quotes_for_opportunity',
  'get_quote_details',
  'rename_quote',
  'manage_quote_line_items',
]);

export const shortLabel = (t) => {
  if (t === null || t === undefined) return '';
  const str = String(t);
  return TOOL_LABELS[str] || str.replace(/_/g, ' ').slice(0, 12);
};


// ─────────────────────────────────────────────────────────────
// INITIAL ORCHESTRATION STATE
// ─────────────────────────────────────────────────────────────
export const INIT_ORCH = {
  coordinator: 'idle',
  Catalog_Scout: { state: 'idle', tools: [], routedByDm: false },
  Quote_Architect: { state: 'idle', tools: [], routedByDm: false },
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
