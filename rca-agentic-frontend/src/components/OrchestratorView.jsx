import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Send, Loader2, Zap, Settings, Sun, Moon,
  ExternalLink, ArrowRight, Database,
  Search, FileText, ArrowLeft, Eye, CheckCircle2, Package, TrendingUp
} from 'lucide-react';
import { config } from '../config';
import SelectionPanel from './SelectionPanel';
import AgentGraph from './AgentGraph';
import TypingIndicator from './TypingIndicator';
import QuotePreviewModal from './QuotePreviewModal';
import ProductConfigModal from './ProductConfigModal';
import {
  GW, INIT_ORCH, SUGGESTIONS, ACTION_LABELS, UPDATE_TOOLS, shortLabel
} from '../constants';


const OrchestratorView = ({ onBack, selectedModule, isDark = false, setIsDark }) => {
  const [messages, setMessages] = useState([
    { id: 1, role: 'assistant', content: `Command Center Online. Awaiting instructions for ${selectedModule?.title || 'Salesforce RCA'}.` }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [workflowState, setWorkflowState] = useState('idle');
  const [orchestration, setOrchestration] = useState(INIT_ORCH);
  const [results, setResults] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [selectionPanel, setSelectionPanel] = useState(null); 
  const [confirmedAccount, setConfirmedAccount] = useState(null); 
  const [confirmedSelections, setConfirmedSelections] = useState([]); 
  const [vaultHistory, setVaultHistory] = useState([]); 
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [vaultSearchQuery, setVaultSearchQuery] = useState('');

  const handleSuggestionClick = (text) => {
    setInputValue(text);
  };

  const pendingResultsRef = useRef(null);              
  const pendingSelectionRef = useRef(null);            
  const [composingReply, setComposingReply] = useState(false); 
  const [selectedProducts, setSelectedProducts] = useState(new Set()); 

  const [graphActive, setGraphActive] = useState(false); 
  const [graphReady, setGraphReady] = useState(false); 

  const [leftWidth, setLeftWidth] = useState(300);
  const [rightWidth, setRightWidth] = useState(465);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  const chatEndRef = useRef(null);
  const rightPanelEndRef = useRef(null);  
  const ws = useRef(null);
  const centerRef = useRef(null);
  const resultsScrollRef = useRef(null);
  const selectionScrollRef = useRef(null);
  const [graphScale, setGraphScale] = useState(1);
  const [userZoom, setUserZoom] = useState(1);
  const [showMinimap, setShowMinimap] = useState(false);
  const [showOrchestration, setShowOrchestration] = useState(true);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

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

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    rightPanelEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [vaultHistory]);

  useEffect(() => {
    if (results.length > 0) resultsScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [results]);

  useEffect(() => {
    if (selectionPanel) selectionScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [selectionPanel]);

  useEffect(() => {
    if (!centerRef.current) return;
    const obs = new ResizeObserver(([e]) => {
      setGraphScale(Math.max(0.1, Math.min(1, (e.contentRect.width - 40) / GW)));
    });
    obs.observe(centerRef.current);
    return () => obs.disconnect();
  }, [showOrchestration]);

  useEffect(() => {
    if (graphActive) {
      const t = setTimeout(() => setGraphReady(true), 750);
      return () => clearTimeout(t);
    } else {
      setGraphReady(false);
    }
  }, [graphActive]);

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

  const adjustZoom = (delta) => setUserZoom(prev => Math.min(2, Math.max(0.5, prev + delta)));

  useEffect(() => {
    ws.current = new WebSocket('ws://localhost:8001/ws/orchestrate');
    ws.current.onopen = () => console.log('[WS] Connected to main.py');

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

          case 'USER_SELECTION_NEEDED':
            pendingSelectionRef.current = { type: data.selection_for, options: data.options || [] };
            setComposingReply(true);
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
              // Derive a display-friendly tool name from action context
              let displayName = shortLabel(data.tool);
              if (data.tool === 'manage_quote_line_items' && data.args?.operations?.length > 0) {
                const method = data.args.operations[0].method?.toUpperCase();
                if (method === 'POST') displayName = 'Add Product';
                else if (method === 'DELETE') displayName = 'Delete Product';
                else if (method === 'PATCH') displayName = 'Update Qty';
              } else if (data.tool === 'update_quote_discount') {
                displayName = 'Discount';
              } else if (data.tool === 'rename_quote') {
                displayName = 'Rename';
              } else if (data.tool === 'get_quote_details') {
                displayName = 'Details';
              } else if (data.tool === 'get_quotes_for_opportunity') {
                displayName = 'Quote Query';
              }

              // Force tools to their correct agent regardless of which is currently active
              const QUOTE_TOOLS = ['get_my_accounts', 'get_opportunities_for_account', 'resolve_pricebook_entries', 'evaluate_quote_graph', 'update_quote_discount', 'get_quotes_for_opportunity', 'get_quote_details', 'rename_quote', 'manage_quote_line_items'];
              const isQuoteTool = QUOTE_TOOLS.includes(data.tool);
              const targetAgent = isQuoteTool ? 'Quote_Architect' : null; // null = use whichever is active

              // If a quote tool fires and Quote_Architect isn't active yet, activate it
              if (isQuoteTool && n.Quote_Architect.state === 'idle') {
                n.Quote_Architect = { ...n.Quote_Architect, state: 'active', routedByDm: false };
              }

              const agents = targetAgent
                ? [targetAgent]
                : ['Catalog_Scout', 'Quote_Architect'];

              for (const k of agents) {
                if (n[k].state === 'active') {
                  const settled = n[k].tools.map(t =>
                    t.state === 'active' ? { ...t, state: 'done' } : t
                  );

                  const isUpdate = UPDATE_TOOLS.has(data.tool);
                  const updateIdx = isUpdate ? settled.findIndex(t => UPDATE_TOOLS.has(t.rawTool)) : -1;

                  if (isUpdate && updateIdx >= 0) {
                    // REPLACE existing update node
                    n[k] = {
                      ...n[k],
                      tools: settled.map((t, i) =>
                        i === updateIdx ? { name: displayName, state: 'active', rawTool: data.tool } : t
                      )
                    };
                  } else {
                    const idx = settled.findIndex(t => t.name === displayName);
                    if (idx < 0) {
                      n[k] = { ...n[k], tools: [...settled, { name: displayName, state: 'active', rawTool: data.tool }] };
                    } else {
                      n[k] = {
                        ...n[k], tools: settled.map((t, i) =>
                          i === idx ? { ...t, state: 'active' } : t
                        )
                      };
                    }
                  }
                  break;
                }
              }
              return n;
            });
            break;

          case 'TOOL_RESULT':
            setOrchestration(prev => {
              const n = { ...prev };
              for (const k of ['Catalog_Scout', 'Quote_Architect']) {
                // Match by raw tool name OR display name (for contextual nodes)
                if (n[k].tools.some(t => t.name === data.tool || t.rawTool === data.tool)) {
                  n[k] = {
                    ...n[k], tools: n[k].tools.map(t =>
                      (t.name === data.tool || t.rawTool === data.tool) && t.state === 'active'
                        ? { ...t, state: 'done' } : t
                    )
                  };
                  break;
                }
              }
              return n;
            });
            try {
              const parsed = JSON.parse(data.data);
              if (data.tool === 'search_catalog' && parsed.results) {
                pendingResultsRef.current = parsed.results.map((r, i) => ({
                  id: r.id || i, name: r.name || 'Unknown', sku: r.code || 'N/A',
                }));
                setComposingReply(true);
              }
              if (data.tool === 'evaluate_quote_graph') {
                // Robust extraction of Quote ID from response
                let qId = 'Generated';
                if (parsed.salesforce_response?.graphs?.[0]?.records?.[0]?.id) {
                   qId = parsed.salesforce_response.graphs[0].records[0].id;
                } else {
                   const qIdMatch = data.data.match(/0Q0[a-zA-Z0-9]{12,15}/);
                   if (qIdMatch) qId = qIdMatch[0];
                }
                
                const inst = parsed.instance_url || 'https://login.salesforce.com';
                const newQuote = { 
                  id: qId, 
                  status: 'Draft', 
                  sfLink: qId && qId !== 'Generated' ? `${inst}/lightning/r/Quote/${qId}/view` : null 
                };
                const quoteItem = { type: 'quote', data: newQuote, id: Date.now() };
                setQuotes(prev => [...prev, newQuote]);
                setVaultHistory(prev => [...prev, quoteItem]);
              }
            } catch (_) { }
            break;

          case 'FINAL_REPLY':
            if (pendingResultsRef.current) {
              const newResults = pendingResultsRef.current;
              setResults(newResults);
              setVaultHistory(prev => [...prev, { type: 'products', data: newResults, id: Date.now() }]);
              pendingResultsRef.current = null;
            }
            if (pendingSelectionRef.current) {
              const newPanel = pendingSelectionRef.current;
              setSelectionPanel(newPanel);
              setVaultHistory(prev => [...prev, { type: 'selection', data: newPanel, id: Date.now() }]);
              pendingSelectionRef.current = null;
            }
            setComposingReply(false);
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

  const handlePreview = async (quoteId) => {
    if (!quoteId || quoteId === 'Generated') {
       alert('Cannot preview a quote that was not successfully generated in Salesforce.');
       return;
    }
    setLoadingPreview(true);
    try {
      const url = `${config.API_BASE_URL}/api/quote-preview/${quoteId}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP Error: ${resp.status}`);
      const data = await resp.json();
      if (data.status === 'success') {
        setPreviewData(data);
        setIsPreviewOpen(true);
      } else {
        alert(`Salesforce Error: ${data.message || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`Connection Error: ${err.message}`);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text || workflowState === 'orchestrating' || workflowState === 'executing') return;

    setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: text }]);
    setInputValue('');

    if (!graphActive) setGraphActive(true);

    if (workflowState === 'idle') {
      setResults([]); setQuotes([]); setOrchestration(INIT_ORCH);
      pendingResultsRef.current = null; setComposingReply(false);
    }

    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(text);
    } else {
      setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: 'Backend disconnected.' }]);
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
    setVaultSearchQuery('');
  };

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [configProducts, setConfigProducts] = useState([]);

  const handleOpenConfig = () => {
    const allProductsInHistory = vaultHistory
      .filter(item => item.type === 'products')
      .flatMap(item => item.data);
    const selected = allProductsInHistory.filter(p => selectedProducts.has(p.id));
    const uniqueSelected = [];
    const seenIds = new Set();
    for (const p of selected) {
      if (!seenIds.has(p.id)) {
        uniqueSelected.push({ ...p, quantity: 1, discount: 0 });
        seenIds.add(p.id);
      }
    }
    setConfigProducts(uniqueSelected);
    setIsConfigOpen(true);
  };

  const handleConfirmConfig = (configuredItems) => {
    if (isBusy) return;
    const list = configuredItems.map(p => `${p.name} (ID: ${p.id}, Quantity: ${p.quantity}, Discount: ${p.discount}%)`).join(', ');
    const text = configuredItems.length === 1 ? `Create a quote for ${list}` : `Create a quote for the following products: ${list}`;
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: text }]);
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(text);
    } else {
      console.warn('[WS] Cannot send configuration, socket closed');
    }
    setIsConfigOpen(false);
    setSelectedProducts(new Set());

  };

  const handleCardSelect = (option, selectionType) => {
    if (selectionType === 'account') setConfirmedAccount(option.name);
    const confirmedItem = { type: 'confirmed', data: { ...option, selectionType }, id: Date.now() };
    setConfirmedSelections(prev => [...prev, { ...option, type: selectionType }]);
    setVaultHistory(prev => [...prev, confirmedItem]);
    setSelectionPanel(null);
    const text = `${option.name} (ID: ${option.id})`;
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: text }]);
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(text);
    } else {
      console.warn('[WS] Cannot send selection, socket closed');
    }

  };

  const toggleProduct = (id) =>
    setSelectedProducts(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const toggleSelectAll = () => {
    const currentProducts = vaultHistory
      .filter(item => item.type === 'products')
      .flatMap(item => item.data);
    
    setSelectedProducts(
      selectedProducts.size === currentProducts.length ? new Set() : new Set(currentProducts.map(p => p.id))
    );
  };

  const isBusy = workflowState === 'orchestrating' || workflowState === 'executing';

  return (
    <>
      <div className={`h-screen w-full bg-[var(--site-bg)] text-[var(--text-main)] font-sans flex overflow-hidden selection:bg-indigo-500/30 transition-colors duration-500 ${config.theme === 'Meta' ? 'meta-theme' : ''} ${isResizingLeft || isResizingRight ? 'cursor-col-resize select-none' : ''}`}>

        {/* LEFT — COMMAND PANEL */}
        <section className="h-full border-r border-[var(--glass-border)] bg-[var(--site-bg)] flex flex-col relative z-20 shrink-0 overflow-hidden transition-colors duration-500" style={{ width: leftWidth }}>
          {/* Background Glow for Panel */}
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-indigo-500/[0.03] to-transparent pointer-events-none" />
          
          <div className="p-7 pb-6 flex items-center justify-between border-b border-[var(--glass-border)] bg-slate-500/[0.03] dark:bg-white/[0.02] relative z-10">
            <div className="flex items-center gap-3">
              {config.theme === 'Meta' ? (
                <div className="flex items-center gap-3">
                   <img src={config.META_LOGO_URL} alt="Meta" className="h-6 object-contain" />
                   {leftWidth > 160 && <div className="h-4 w-[1px] bg-slate-200 mx-1" />}
                   {leftWidth > 180 && <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-widest">Connect</span>}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                   <img src={config.AGIVANT_LOGO_URL} alt="Agivant" className="h-8 object-contain" />
                   {leftWidth > 160 && <div className="h-4 w-[1px] bg-slate-200 mx-1" />}
                   {leftWidth > 180 && <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-widest">Control Center</span>}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {leftWidth > 140 && <Settings size={14} className="text-slate-400 hover:text-indigo-600 cursor-pointer transition-colors shrink-0" />}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 scrollbar-hide custom-scrollbar relative z-10">
            {leftWidth > 110 && messages.map(msg => (
              <div key={msg.id} className="animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-2 mb-2.5">
                  <div className={`w-1 h-2.5 rounded-full ${msg.role === 'user' ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]' : 'bg-slate-300 dark:bg-slate-700'}`} />
                  <div className={`text-[8.5px] uppercase font-black tracking-[0.2em] ${msg.role === 'user' ? 'text-indigo-500' : 'text-slate-500 italic'}`}>
                    {msg.role === 'user' ? 'Commander' : config.theme === 'Meta' ? 'Meta AI' : 'Agivant AI'}
                  </div>
                </div>
                <div className={`p-5 rounded-2xl text-[11px] leading-relaxed transition-all ${msg.role === 'user' ? 'bg-indigo-600 dark:bg-indigo-500 text-white shadow-lg' : 'glass-card text-[var(--text-main)] shadow-xl border-white/5'}`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {composingReply && <TypingIndicator />}
            {leftWidth > 110 && messages.length === 1 && (
              <div className="pt-2 pb-6 space-y-4">
                <div className="flex items-center gap-2 mb-4 px-1">
                  <div className="w-1 h-3 bg-indigo-500 rounded-full" />
                  <span className="text-[8.5px] font-black uppercase tracking-[0.2em] text-slate-500">Suggestions</span>
                </div>
                {SUGGESTIONS.map((s, i) => (
                  <div key={i} onClick={() => handleSuggestionClick(s.text)} className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] group shadow-sm" style={{ background: isDark ? 'rgba(255,255,255,0.02)' : s.bg, borderColor: isDark ? 'rgba(255,255,255,0.05)' : s.border }}>
                    <div className="flex items-center gap-2 mb-2.5">
                      <div className="w-1.5 h-1.5 rounded-full shadow-sm" style={{ background: s.color }} />
                      <span className="text-[8.5px] font-black uppercase tracking-widest" style={{ color: s.color }}>{s.label}</span>
                    </div>
                    <div className="text-[10px] leading-relaxed text-[var(--text-main)] opacity-70 group-hover:opacity-100">{s.text}</div>
                  </div>
                ))}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-6 bg-slate-500/[0.03] dark:bg-white/[0.02] border-t border-[var(--glass-border)] relative z-10">
            <form onSubmit={handleSend} className="group">
              <div className="relative flex items-center">
                <div className="absolute inset-0 bg-indigo-500/10 blur-2xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
                <input type="text" value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder={leftWidth > 150 ? 'Send instruction…' : '…'} disabled={isBusy} className="w-full bg-[var(--site-bg)] dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-2xl py-4 pl-6 pr-14 text-[11px] font-medium outline-none text-[var(--text-main)] transition-all z-10 shadow-inner focus:border-indigo-500/50" />
                <button type="submit" className="absolute right-3.5 p-2.5 text-indigo-600 hover:scale-110 transition-transform z-20 flex items-center justify-center">
                  <Send size={16} />
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* LEFT RESIZER */}
        <div onMouseDown={startResizingLeft} className="w-4 hover:w-4 transition-all cursor-col-resize h-full bg-transparent hover:bg-indigo-500/5 flex items-center justify-center relative z-40 group/resizer">
          <div className={`w-1 h-24 rounded-full bg-slate-200 dark:bg-white/5 transition-all group-hover/resizer:bg-indigo-500/40 ${isResizingLeft ? '!bg-indigo-500 shadow-[0_0_20px_#6366f1] h-40' : ''}`} />
        </div>

        {/* CENTER — ORCHESTRATION GRAPH */}
        {showOrchestration && (
          <>
            <section ref={centerRef} className="flex-1 h-full bg-[var(--site-bg)] flex flex-col items-center overflow-hidden border-r border-[var(--glass-border)] transition-colors duration-500 animate-in fade-in">
              <div className="w-full flex items-center justify-between px-8 pt-5 pb-2 shrink-0">
                <div className="flex items-center gap-4">
                  {onBack && <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-slate-500/10 dark:hover:bg-white/10 text-slate-500 hover:text-indigo-600 transition-all"><ArrowLeft size={16} /></button>}
                  <span className="text-[10px] font-black tracking-[0.6em] uppercase flex items-center gap-3">
                    <span className="bg-gradient-to-r from-indigo-500 to-emerald-500 bg-clip-text text-transparent">Orchestration</span>
                    <span className="text-slate-400 dark:text-white/40 font-bold">Flow</span>
                  </span>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-3 bg-slate-500/5 dark:bg-black/5 px-4 py-2 rounded-full border border-slate-200 dark:border-white/5 shadow-inner hover:bg-slate-500/10 transition-all">
                    <span className="text-[8.5px] font-bold uppercase text-slate-500 tracking-wider">Minimap</span>
                    <button onClick={() => setShowMinimap(!showMinimap)} className={`w-9 h-4.5 rounded-full relative transition-all duration-300 ring-1 ring-inset ${showMinimap ? 'bg-indigo-500 ring-indigo-400/30' : 'bg-slate-300 dark:bg-slate-700'}`}>
                      <div className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-all duration-300 ${showMinimap ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>
              </div>

              <div className={`flex-1 w-full overflow-hidden flex flex-col items-center justify-center relative dot-grid ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`} onMouseDown={handlePanStart} onMouseMove={handlePanMove} onMouseUp={handlePanEnd} onMouseLeave={handlePanEnd}>
                <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${graphScale * userZoom})`, transformOrigin: 'center center', width: GW, flexShrink: 0, transition: isPanning ? 'none' : 'transform 0.1s ease-out' }}>
                  <AgentGraph orchestration={orchestration} graphActive={graphActive} graphReady={graphReady} isDark={isDark} />
                </div>
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[var(--card-bg)] backdrop-blur-xl border border-[var(--glass-border)] p-2 rounded-2xl z-40 shadow-2xl transition-all hover:scale-105 active:scale-95">
                  <button onClick={() => adjustZoom(-0.1)} className="p-3 hover:bg-white/10 rounded-xl text-[var(--text-muted)] transition-all">-</button>
                  <div className="px-4 text-[10px] font-black text-[var(--text-main)] w-16 text-center">{Math.round(userZoom * 100)}%</div>
                  <button onClick={() => adjustZoom(0.1)} className="p-3 hover:bg-white/10 rounded-xl text-[var(--text-muted)] transition-all">+</button>
                  <div className="w-[1px] h-6 bg-[var(--glass-border)] mx-2" />
                  <button onClick={() => { setUserZoom(1); setPan({ x: 0, y: 0 }); }} className="px-4 py-2 hover:bg-indigo-500/10 rounded-xl text-[9px] font-black uppercase text-indigo-500 transition-all">Reset</button>
                </div>
                {showMinimap && (
                  <div className="absolute top-8 right-8 w-44 h-52 bg-slate-100/80 dark:bg-slate-900/80 backdrop-blur-3xl border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden z-40 pointer-events-none shadow-2xl animate-in zoom-in-95">
                    <div className="absolute inset-0 opacity-40 p-4">
                      <div className="scale-[0.28] origin-top-left"><AgentGraph orchestration={orchestration} graphActive={true} graphReady={true} isDark={isDark} /></div>
                    </div>
                    <div className="absolute border-2 border-amber-500 bg-amber-500/10 rounded-lg shadow-[0_0_20px_rgba(245,158,11,0.4)]" style={{ left: 20 - (pan.x * 0.28) / (graphScale * userZoom), top: 20 - (pan.y * 0.28) / (graphScale * userZoom), width: 140 / userZoom, height: 160 / userZoom }} />
                  </div>
                )}
                {workflowState === 'completed' && (
                  <button onClick={reset} className="absolute top-24 left-1/2 -translate-x-1/2 px-8 py-3.5 bg-white/[0.03] border border-white/10 rounded-2xl text-[9px] font-black uppercase tracking-[0.5em] text-white/35 hover:text-indigo-400 transition-all z-30 shadow-2xl hover:scale-105 active:scale-95">Reset Environment <ArrowRight size={12} className="inline ml-2" /></button>
                )}
              </div>
            </section>
            <div onMouseDown={startResizingRight} className="w-4 hover:w-4 transition-all cursor-col-resize h-full bg-transparent hover:bg-indigo-500/5 flex items-center justify-center relative z-40 group/resizer">
              <div className={`w-1 h-24 rounded-full bg-slate-200 dark:bg-white/5 transition-all group-hover/resizer:bg-indigo-500/40 ${isResizingRight ? '!bg-indigo-500 shadow-[0_0_20px_#6366f1] h-40' : ''}`} />
            </div>
          </>
        )}

        {/* RIGHT — RESULTS VAULT */}
        <section className={`h-full border-l border-[var(--glass-border)] bg-[var(--site-bg)] flex flex-col relative z-20 shrink-0 overflow-hidden transition-colors duration-500 ${!showOrchestration ? 'flex-1' : ''}`} style={{ width: !showOrchestration ? 'auto' : rightWidth }}>
          <div className="p-5 pb-4 flex items-center justify-between border-b border-[var(--glass-border)] bg-slate-500/[0.03] dark:bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-4 bg-indigo-500 rounded-full shadow-[0_0_12px_rgba(99,102,241,0.5)]" />
              {rightWidth > 140 && (
                <div className="flex flex-col">
                  <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-900 dark:text-white leading-none">Insights</h2>
                  <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">Data Vault 01</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              {rightWidth > 180 && (
                <div className="flex items-center gap-3 bg-slate-500/5 dark:bg-black/5 px-4 py-2 rounded-full border border-slate-200 dark:border-white/5 shadow-inner mr-2 hover:bg-slate-500/10 transition-all">
                  <span className="text-[8.5px] font-bold uppercase text-slate-500 tracking-wider">Flow</span>
                  <button onClick={() => setShowOrchestration(!showOrchestration)} className={`w-9 h-4.5 rounded-full relative transition-all duration-300 ring-1 ring-inset ${showOrchestration ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-700'}`}>
                    <div className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-all duration-300 ${showOrchestration ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              )}
              <button onClick={() => setIsDark && setIsDark(!isDark)} className="p-1.5 ml-1 text-slate-400 hover:text-indigo-500 transition-colors" title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
                {isDark ? <Sun size={15} className="text-amber-500" /> : <Moon size={15} className="text-indigo-500" />}
              </button>
            </div>
          </div>

          {/* New Search Filter for Vault Items */}
          {vaultHistory.length > 0 && rightWidth > 200 && (
            <div className="px-5 py-3 border-b border-[var(--glass-border)] bg-white/[0.01]">
              <div className="relative group/search">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within/search:text-indigo-500 transition-colors" />
                <input 
                  type="text" 
                  placeholder="Filter results..." 
                  value={vaultSearchQuery}
                  onChange={(e) => setVaultSearchQuery(e.target.value)}
                  className="w-full bg-black/10 border border-white/5 rounded-xl py-2 pl-9 pr-3 text-[10px] font-bold text-[var(--text-main)] outline-none focus:border-indigo-500/30 transition-all placeholder-slate-600 shadow-inner"
                />
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar scroll-smooth">
            {vaultHistory.length === 0 && !isBusy && (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-10 py-20">
                <Database size={38} strokeWidth={1} className="mb-5" />
                {rightWidth > 190 && <p className="text-[10px] font-black uppercase tracking_widest">Awaiting Streams</p>}
              </div>
            )}

            {vaultHistory.map((item) => {
              if (item.type === 'products') {
                const filteredProds = item.data.filter(p => 
                  p.name.toLowerCase().includes(vaultSearchQuery.toLowerCase()) || 
                  (p.sku && p.sku.toLowerCase().includes(vaultSearchQuery.toLowerCase()))
                );
                if (vaultSearchQuery && filteredProds.length === 0) return null;

                return (
                  <div key={item.id} className="animate-in fade-in slide-in-from-right-4 mb-4 overflow-hidden">
                    <div className="glass-card rounded-[1.25rem] border-white/5 p-4 shadow-xl">
                      <div className="pb-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-1 h-3 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                          {rightWidth > 190 && <h3 className="text-[8.5px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Products Found</h3>}
                        </div>
                        <div className="flex items-center gap-3">
                          <button onClick={toggleSelectAll} className="text-[7.5px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-400 p-1 px-2 rounded-lg hover:bg-indigo-500/5 transition-colors">
                            {selectedProducts.size > 0 ? 'Reset' : 'Select All'}
                          </button>
                          <div className="px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-black text-indigo-500">{filteredProds.length}</div>
                        </div>
                      </div>
                      <div className="pt-2">
                        <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1.5 custom-scrollbar">
                          {filteredProds.map(prod => {
                            const isSel = selectedProducts.has(prod.id);
                            return (
                              <div key={prod.id} onClick={() => toggleProduct(prod.id)} className={`flex items-center justify-between p-2.5 min-h-[46px] rounded-xl cursor-pointer transition-all border group ${isSel ? 'bg-indigo-500/[0.08] border-indigo-500/40 shadow-inner' : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.06] hover:border-white/10'}`}>
                                <div className="flex items-center gap-3.5 min-w-0">
                                  <div style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, border: `1.5px solid ${isSel ? '#6366f1' : 'var(--text-muted)'}`, background: isSel ? '#6366f1' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: isSel ? '0 0 10px rgba(99,102,241,0.4)' : 'none', transition: 'all 0.3s' }}>
                                    {isSel && <CheckCircle2 size={10} color="white" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className={`text-[11px] font-bold uppercase tracking-tight leading-tight transition-colors ${isSel ? 'text-indigo-600 dark:text-indigo-400' : 'text-[var(--text-main)] group-hover:text-indigo-500'}`}>{prod.name}</div>
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
                if (vaultSearchQuery && !sel.name.toLowerCase().includes(vaultSearchQuery.toLowerCase())) return null;
                const isOpp = sel.selectionType === 'opportunity';
                const accentColor = isOpp ? '#fbbf24' : '#818cf8';
                return (
                  <div key={item.id} className="animate-in fade-in slide-in-from-right-4 mb-4 overflow-hidden">
                    <div className="glass-card rounded-[1.25rem] border-white/5 p-4 shadow-xl">
                      <div className="flex items-center gap-3 mb-2.5">
                        <div style={{ width: 4, height: 12, borderRadius: 99, background: accentColor, opacity: 0.5 }} />
                        <div className="text-[8.5px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Confirmed {isOpp ? 'Opportunity' : 'Account'}</div>
                      </div>
                      <div className="px-4 py-3 bg-white/[0.03] border border-white/5 rounded-xl hover:bg-white/[0.06] transition-all">
                        <div className="flex items-center gap-2.5">
                          <div style={{ width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${accentColor}33`, background: `${accentColor}11`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CheckCircle2 size={9} style={{ color: accentColor }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="text-[11px] font-bold text-[var(--text-main)] truncate uppercase tracking-tight">{sel.name}</div>
                              <div className="px-1.5 py-0.5 rounded-md bg-white/5 text-[7px] font-black uppercase text-indigo-500">SAVED</div>
                            </div>
                            {sel.detail && sel.detail !== '—' && <div className="text-[8.5px] font-black uppercase tracking-[0.12em] opacity-60" style={{ color: accentColor }}>{sel.detail}</div>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
              if (item.type === 'selection') {
                return (
                  <div key={item.id} className="animate-in fade-in z-10 relative mb-4">
                    <div className="glass-card rounded-[1.25rem] border-white/5 shadow-2xl overflow-hidden">
                      <SelectionPanel panel={item.data} confirmedAccount={confirmedAccount} onSelect={handleCardSelect} scrollRef={selectionScrollRef} />
                    </div>
                  </div>
                );
              }
              if (item.type === 'quote') {
                const q = item.data;
                if (vaultSearchQuery && !q.id.toLowerCase().includes(vaultSearchQuery.toLowerCase())) return null;
                return (
                  <div key={item.id} className="animate-in fade-in slide-in-from-right-4 mb-4 overflow-hidden">
                    <div className="glass-card rounded-[1.25rem] border-white/5 p-4 shadow-xl border-emerald-500/20 bg-emerald-500/5">
                      <div className="pb-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-1 h-3 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                          <h3 className="text-[8.5px] font-black uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-400">Quote Finalized</h3>
                        </div>
                        <TrendingUp size={14} className="text-emerald-500 animate-bounce" />
                      </div>
                      <div className="pt-2">
                        <div className="bg-white/5 border border-white/10 p-4 rounded-2xl group hover:shadow-2xl transition-all relative overflow-hidden">
                          <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-30 transition-opacity">
                             <Zap size={40} />
                          </div>
                          <div className="flex items-start justify-between mb-3 relative z-10">
                            <div className="flex flex-col gap-1">
                              <div className="text-[8.5px] font-black uppercase text-indigo-400 tracking-widest mb-1">Salesforce Record</div>
                              <div className="text-[11px] font-bold text-[var(--text-main)] font-mono opacity-80">{q.id}</div>
                            </div>
                            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                              <CheckCircle2 size={16} className="text-emerald-500" />
                            </div>
                          </div>
                          <div className="border-t border-white/5 pt-3 flex items-center justify-between relative z-10">
                            <span className="text-[8.5px] font-black text-[var(--text-muted)] uppercase tracking-widest">{q.status}</span>
                            <div className="flex items-center gap-4">
                              <button onClick={() => handlePreview(q.id)} disabled={loadingPreview} className="text-[8.5px] font-black text-indigo-500 uppercase tracking-widest hover:text-indigo-400 flex items-center gap-1.5 disabled:opacity-50 transition-colors">
                                {loadingPreview ? 'Loading...' : 'Preview Quote'} <Eye size={11} />
                              </button>
                              {q.sfLink && <a href={q.sfLink} target="_blank" rel="noopener noreferrer" className="text-[8.5px] font-black text-indigo-400 uppercase tracking-widest hover:text-indigo-300 flex items-center gap-1 hover:scale-105 transition-all">Open SF <ExternalLink size={10} /></a>}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            })}
            <div ref={rightPanelEndRef} />
          </div>
          {selectedProducts.size > 0 && (
            <div className="absolute bottom-0 left-0 right-0 p-4 pt-5 pb-5 border-t border-[var(--glass-border)] bg-[var(--card-bg)] backdrop-blur-3xl z-20 shadow-2xl transition-all" style={{ animation: 'slide-up-in 0.28s cubic-bezier(0.34,1.56,0.64,1) both' }}>
              <button onClick={handleOpenConfig} disabled={isBusy} className={`w-full p-4 rounded-xl text-[8.5px] font-extrabold tracking-widest uppercase flex items-center justify-center gap-3 transition-all active:scale-[0.98] ${isBusy ? 'bg-slate-500/10 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-0.5'}`}>
                {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} fill="currentColor" />}
                Enter Configuration Studio — {selectedProducts.size} Items
              </button>
            </div>
          )}
        </section>
      </div>

      <QuotePreviewModal isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} data={previewData} />
      <ProductConfigModal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} products={configProducts} onConfirm={handleConfirmConfig} />
    </>
  );
};

export default OrchestratorView;
