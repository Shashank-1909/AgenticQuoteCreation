import { config } from './config';

// ─────────────────────────────────────────────────────────────
// GRAPH LAYOUT CONSTANTS  (SVG + DOM coordinate space, px)
// ─────────────────────────────────────────────────────────────
export const GW = 480;   // graph canvas width
export const GH = 560;   // graph canvas height

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

// Dynamic tool positions — 4 circles spread symmetrically around the agent's cx
export const getToolPositions = (agentCx) => [
  { x: agentCx - 110, y: 430 },
  { x: agentCx - 65, y: 460 },
  { x: agentCx - 22, y: 475 },
  { x: agentCx + 22, y: 475 },
  { x: agentCx + 65, y: 460 },
  { x: agentCx + 110, y: 430 },
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
  add_product_to_quote: 'Product Added',
  update_quote_discount: 'Discount Applied',
  update_quote_quantity: 'Quantity Updated',
  delete_product_from_quote: 'Product Removed',
  rename_quote: 'Quote Renamed',
  get_quote_details: 'Quote Details',
};
export const shortLabel = (t) => TOOL_LABELS[t] || t.replace(/_/g, ' ').slice(0, 12);

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
