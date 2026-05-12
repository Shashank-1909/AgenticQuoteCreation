import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Send, Loader2, Zap, Settings, ArrowLeft, BrainCircuit, 
  CheckCircle2, Package, TrendingUp, Sparkles, Database,
  Eye, ExternalLink, Search, LayoutDashboard, FileText, Plus, Minus
} from 'lucide-react';
import { config } from '../config';
import SelectionPanel from './SelectionPanel';
import AgentGraph from './AgentGraph';
import TypingIndicator from './TypingIndicator';
import QuotePreviewModal from './QuotePreviewModal';
import ProductConfigModal from './ProductConfigModal';
import { INIT_ORCH, SUGGESTIONS } from '../constants';
import './AgentforceView.css';

const AgentforceView = ({ onBack, selectedModule, isDark = false }) => {
  const [messages, setMessages] = useState([
    { 
      id: 1, 
      role: 'assistant', 
      content: `Hello! I'm your Agentforce Assistant for ${selectedModule?.title || 'Salesforce'}. How can I help you today?`,
      type: 'text'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [workflowState, setWorkflowState] = useState('idle');
  const [orchestration, setOrchestration] = useState(INIT_ORCH);
  const [reasoning, setReasoning] = useState(null);
  
  // UI States
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [configProducts, setConfigProducts] = useState([]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewType, setPreviewType] = useState('details'); // details, summary
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [productConfigs, setProductConfigs] = useState({}); // { id: { qty, discount } }
  const [bulkQty, setBulkQty] = useState('');
  const [bulkDiscount, setBulkDiscount] = useState('');
  const [workspaceView, setWorkspaceView] = useState('graph'); // graph, preview, account
  const [zoomLevel, setZoomLevel] = useState(0.75);
  const [sidebarWidth, setSidebarWidth] = useState(450);
  const [isResizing, setIsResizing] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

  const chatEndRef = useRef(null);
  const ws = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, reasoning]);

  useEffect(() => {
    ws.current = new WebSocket('ws://localhost:8001/ws/orchestrate');
    ws.current.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        handleWsMessage(data);
      } catch (err) {
        console.error('[WS] parse error', err);
      }
    };
    return () => ws.current?.close();
  }, []);

  // Resizing Logic
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 320 && newWidth < 800) {
        setSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => setIsResizing(false);

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Panning Logic
  const handlePanStart = (e) => {
    if (e.target.closest('button')) return;
    setIsPanning(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handlePanMove = (e) => {
    if (!isPanning) return;
    const dx = e.clientX - lastMousePos.x;
    const dy = e.clientY - lastMousePos.y;
    setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handlePanEnd = () => setIsPanning(false);

  const handleWsMessage = (data) => {
    switch (data.type) {
      case 'STATE':
        setWorkflowState(data.state);
        if (data.state === 'completed') {
          setReasoning(null);
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
        setReasoning(`Agent ${data.agent.replace('_', ' ')} is thinking...`);
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
        setReasoning(`Running tool: ${data.tool.replace('_', ' ')}...`);
        setOrchestration(prev => {
          const n = { ...prev };
          for (const k of ['Catalog_Scout', 'Quote_Architect']) {
            if (n[k].state === 'active') {
              const settled = n[k].tools.map(t =>
                t.state === 'active' ? { ...t, state: 'done' } : t
              );
              const idx = settled.findIndex(t => t.name === data.tool);
              if (idx < 0) {
                n[k] = { ...n[k], tools: [...settled, { name: data.tool, state: 'active' }] };
              } else {
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
        try {
          const parsed = JSON.parse(data.data);
          if (data.tool === 'search_catalog' && parsed.results) {
            addMessage({
              type: 'card',
              cardType: 'products',
              data: parsed.results,
              content: "I've searched the catalog and found these products:"
            });
          }
          if (data.tool === 'evaluate_quote_graph') {
            let qId = extractQuoteId(data.data);
            const newQuote = { id: qId, status: 'Draft' };
            addMessage({
              type: 'card',
              cardType: 'quote',
              data: newQuote,
              content: "Quote generated successfully in Salesforce."
            });
            handlePreview(qId);
          }
        } catch (_) { }
        break;

      case 'USER_SELECTION_NEEDED':
        addMessage({
          type: 'card',
          cardType: 'selection',
          data: { type: data.selection_for, options: data.options || [] },
          content: `Please select an ${data.selection_for}:`
        });
        break;

      case 'FINAL_REPLY':
        setReasoning(null);
        if (data.data?.trim()) {
          addMessage({ type: 'text', content: data.data });
        }
        break;

      case 'QUOTE_SUMMARY':
        setSummaryData(data.data);
        setPreviewType('summary');
        setWorkspaceView('preview');
        break;

      case 'ERROR':
        addMessage({ type: 'text', content: `⚠️ ${data.data}` });
        setReasoning(null);
        break;
    }
  };

  const addMessage = (msg) => {
    setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', ...msg }]);
  };

  const handleSend = (e) => {
    e?.preventDefault();
    const text = inputValue.trim();
    if (!text || workflowState === 'orchestrating' || workflowState === 'executing') return;

    let textToSend = text;

    // Intercept if user types about selected products
    if (text.toLowerCase().includes('quote') && selectedProducts.size > 0) {
      let allProducts = [];
      messages.forEach(m => {
        if (m.type === 'card' && m.cardType === 'products' && Array.isArray(m.data)) {
          allProducts = [...allProducts, ...m.data];
        }
      });
      
      const selectedList = allProducts
        .filter(p => selectedProducts.has(p.id))
        .map(p => ({
          ...p,
          quantity: productConfigs[p.id]?.qty || 1,
          discount: productConfigs[p.id]?.discount || 0
        }));
        
      if (selectedList.length > 0) {
        // Only get unique products by ID
        const uniqueProducts = Array.from(new Map(selectedList.map(item => [item.id, item])).values());
        const listStr = uniqueProducts.map(p => `${p.name} (Qty: ${p.quantity}, Disc: ${p.discount}%)`).join(', ');
        textToSend = `${text} -> Products: ${listStr}`;
        
        // Clear selections
        setSelectedProducts(new Set());
        setProductConfigs({});
        setBulkQty('');
        setBulkDiscount('');
      }
    }

    setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: text, type: 'text' }]);
    setInputValue('');
    ws.current?.send(textToSend);
  };

  const extractQuoteId = (dataStr) => {
    const match = dataStr.match(/0Q0[a-zA-Z0-9]{12,15}/);
    return match ? match[0] : 'Generated';
  };

  const handlePreview = async (quoteId) => {
    if (!quoteId || quoteId === 'Generated') return;
    setLoadingPreview(true);
    try {
      const resp = await fetch(`${config.API_BASE_URL}/api/quote-preview/${quoteId}`);
      const data = await resp.json();
      if (data.status === 'success') {
        setPreviewData(data);
        setPreviewType('details');
        setWorkspaceView('preview');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPreview(false);
    }
  };

  const toggleProduct = (prod) => {
    setSelectedProducts(prev => {
      const n = new Set(prev);
      if (n.has(prod.id)) {
        n.delete(prod.id);
        const newConfigs = { ...productConfigs };
        delete newConfigs[prod.id];
        setProductConfigs(newConfigs);
      } else {
        n.add(prod.id);
        setProductConfigs(prev => ({ 
          ...prev, 
          [prod.id]: { qty: 1, discount: 0 } 
        }));
      }
      return n;
    });
  };

  const updateConfig = (id, field, value) => {
    setProductConfigs(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value }
    }));
  };

  const handleConfirmInline = (products) => {
    const selectedList = products
      .filter(p => selectedProducts.has(p.id))
      .map(p => ({
        ...p,
        quantity: productConfigs[p.id]?.qty || 1,
        discount: productConfigs[p.id]?.discount || 0
      }));
    
    const listStr = selectedList.map(p => `${p.name} (Qty: ${p.quantity}, Disc: ${p.discount}%)`).join(', ');
    const text = `Create a quote for: ${listStr}`;
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: text, type: 'text' }]);
    ws.current?.send(text);
    
    // Clear selections after confirm
    setSelectedProducts(new Set());
    setProductConfigs({});
    setBulkQty('');
    setBulkDiscount('');
  };

  const applyBulk = (field, val) => {
    if (val === '' || isNaN(val)) return;
    const num = parseFloat(val);
    setProductConfigs(prev => {
      const next = { ...prev };
      selectedProducts.forEach(id => {
        next[id] = { 
          ...(next[id] || { qty: 1, discount: 0 }), 
          [field]: num 
        };
      });
      return next;
    });
  };

  const toggleSelectAll = (products) => {
    const allIdsInCard = products.map(p => p.id);
    const areAllSelected = allIdsInCard.every(id => selectedProducts.has(id));
    
    setSelectedProducts(prev => {
      const n = new Set(prev);
      if (areAllSelected) {
        allIdsInCard.forEach(id => n.delete(id));
      } else {
        allIdsInCard.forEach(id => n.add(id));
      }
      return n;
    });

    if (!areAllSelected) {
      setProductConfigs(prev => {
        const next = { ...prev };
        allIdsInCard.forEach(id => {
          if (!next[id]) next[id] = { qty: 1, discount: 0 };
        });
        return next;
      });
    }
  };

  return (
    <div className={`agentforce-container ${isDark ? 'dark' : ''}`}>
      
      {/* LEFT WORKSPACE — CONTEXT VIEW */}
      <section className="af-workspace" style={{ flex: 1 }}>
        <div className="af-workspace-header">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 text-slate-400">
              <ArrowLeft size={18} />
            </button>
            <div className="flex flex-col">
              <h2 className="text-xs font-black uppercase tracking-widest text-indigo-500">Agent Workspace</h2>
              <span className="text-[10px] text-slate-500 font-bold uppercase">{selectedModule?.title}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setWorkspaceView('graph')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-tight transition-all ${workspaceView === 'graph' ? 'bg-indigo-500 text-white' : 'text-slate-500 hover:bg-white/5'}`}
            >
              Orchestration Flow
            </button>
            <button 
              onClick={() => setWorkspaceView('preview')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-tight transition-all ${workspaceView === 'preview' ? 'bg-indigo-500 text-white' : 'text-slate-500 hover:bg-white/5'}`}
            >
              Record Preview
            </button>
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden flex flex-col items-center justify-center">
           {workspaceView === 'graph' && (
             <div 
                className={`w-full h-full relative overflow-hidden flex items-center justify-center ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
                onMouseDown={handlePanStart}
                onMouseMove={handlePanMove}
                onMouseUp={handlePanEnd}
                onMouseLeave={handlePanEnd}
             >
                <div 
                  style={{ 
                    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`, 
                    transition: isPanning ? 'none' : 'transform 0.3s ease-out',
                    transformOrigin: 'center center'
                  }} 
                  className="origin-center"
                >
                  <AgentGraph orchestration={orchestration} graphActive={true} graphReady={true} isDark={isDark} />
                </div>
                
                {/* Zoom Controls */}
                <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-10">
                   <button 
                     onClick={(e) => { e.stopPropagation(); setZoomLevel(z => Math.min(z + 0.1, 2)); }} 
                     className="w-10 h-10 bg-white text-slate-600 rounded-xl shadow-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                     title="Zoom In"
                   >
                     <Plus size={20} strokeWidth={2.5} />
                   </button>
                   <button 
                     onClick={(e) => { e.stopPropagation(); setZoomLevel(z => Math.max(z - 0.1, 0.2)); }} 
                     className="w-10 h-10 bg-white text-slate-600 rounded-xl shadow-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                     title="Zoom Out"
                   >
                     <Minus size={20} strokeWidth={2.5} />
                   </button>
                </div>
             </div>
          )}
          {workspaceView === 'preview' && (
            <div className="w-full h-full p-8 overflow-y-auto custom-scrollbar">
               {previewType === 'details' && previewData ? (
                 <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex items-center justify-between mb-2">
                       <div className="flex items-center gap-3">
                          <div className="p-2 bg-emerald-500/10 rounded-xl">
                             <FileText size={20} className="text-emerald-500" />
                          </div>
                          <div>
                             <h1 className="text-xl font-black tracking-tight">{previewData.records?.[0]?.Name || 'Quote Detail'}</h1>
                             <span className="text-[10px] font-black uppercase text-emerald-500 tracking-widest">{previewData.records?.[0]?.QuoteNumber} — {previewData.records?.[0]?.Status}</span>
                          </div>
                       </div>
                       <button 
                        onClick={() => {
                          const qId = previewData.records?.[0]?.Id;
                          const inst = previewData.instance_url || 'https://login.salesforce.com';
                          if (qId) window.open(`${inst}/lightning/r/Quote/${qId}/view`, '_blank');
                        }}
                        className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-500/20"
                       >
                         Open in Salesforce <ExternalLink size={14} />
                       </button>
                    </div>

                    {/* Rich Details Table */}
                    <div className="glass-card rounded-3xl border-white/5 overflow-hidden shadow-2xl">
                       <div className="p-6 border-b border-white/5 bg-white/[0.02]">
                          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Financial Summary</h3>
                       </div>
                       <div className="p-0">
                          <table className="w-full text-left">
                             <thead className="bg-white/[0.01] border-b border-white/5">
                                <tr className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                                   <th className="px-6 py-4">Account</th>
                                   <th className="px-6 py-4">Opportunity</th>
                                   <th className="px-6 py-4 text-right">Grand Total</th>
                                </tr>
                             </thead>
                             <tbody>
                                <tr className="text-sm font-bold border-b border-white/5">
                                   <td className="px-6 py-6">{previewData.records?.[0]?.Account?.Name || '—'}</td>
                                   <td className="px-6 py-6">{previewData.records?.[0]?.Opportunity?.Name || '—'}</td>
                                   <td className="px-6 py-6 text-right text-indigo-400 text-lg font-black">${(previewData.records?.[0]?.GrandTotal || 0).toLocaleString()}</td>
                                </tr>
                             </tbody>
                          </table>
                       </div>

                       <div className="p-6 border-b border-white/5 bg-white/[0.02] mt-4">
                          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Line Items</h3>
                       </div>
                       <div className="p-0">
                          <table className="w-full text-left">
                             <thead className="bg-white/[0.01] border-b border-white/5">
                                <tr className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                                   <th className="px-6 py-4">Product</th>
                                   <th className="px-6 py-4 text-center">Qty</th>
                                   <th className="px-6 py-4 text-right">Sales Price</th>
                                   <th className="px-6 py-4 text-center">Discount</th>
                                   <th className="px-6 py-4 text-right">Total</th>
                                </tr>
                             </thead>
                             <tbody className="divide-y divide-white/5">
                                {(previewData.records?.[0]?.QuoteLineItems || []).map((line, idx) => (
                                   <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                                      <td className="px-6 py-4 text-xs font-bold">{line.Product2?.Name}</td>
                                      <td className="px-6 py-4 text-xs font-bold text-center">{line.Quantity}</td>
                                      <td className="px-6 py-4 text-xs font-bold text-right text-slate-400">${line.UnitPrice?.toLocaleString()}</td>
                                      <td className="px-6 py-4 text-xs font-black text-indigo-400 text-center">{line.Discount || 0}%</td>
                                      <td className="px-6 py-4 text-xs font-black text-right">${line.TotalPrice?.toLocaleString()}</td>
                                   </tr>
                                ))}
                             </tbody>
                          </table>
                       </div>
                    </div>
                 </div>
               ) : previewType === 'summary' && summaryData ? (
                 <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div className="af-card overflow-hidden rounded-[2.5rem] border border-slate-100 bg-white shadow-xl p-12">
                       <div className="flex justify-between items-start mb-10">
                          <div className="flex-1">
                             <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3">
                                {summaryData.opportunity || 'GLOBAL FINANCE CORP'}
                             </div>
                             <h2 className="text-[2rem] leading-tight font-black text-[#1e1b4b] mb-3 tracking-tight">
                                {summaryData.quote_title || 'Quote Summary'}
                             </h2>
                             <div className="flex items-center gap-3 text-xs font-bold text-slate-400">
                                <span>{summaryData.quote_id}</span>
                                <div className="w-1 h-1 rounded-full bg-slate-300" />
                                <span>{summaryData.date || '2024-09-12'}</span>
                             </div>
                          </div>

                          <div className="text-right">
                             <div className={`inline-flex items-center px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-4 ${
                               summaryData.status_label === 'CLOSED WON' || summaryData.status_label === 'APPROVED'
                                 ? 'bg-emerald-50 text-emerald-600'
                                 : 'bg-indigo-50 text-indigo-600'
                             }`}>
                                {summaryData.status_label || 'DRAFT'}
                             </div>
                             <div className="text-[2.5rem] leading-none font-black text-[#1e1b4b] tracking-tight">
                                ${summaryData.grand_total?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                {summaryData.grand_total > 1000000 ? 'M' : ''}
                             </div>
                             <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2">
                                {summaryData.overall_discount || '0% DISC.'}
                             </div>
                          </div>
                       </div>

                       <div className="h-px bg-slate-100/50 w-full mb-10" />

                       <div className="mb-10">
                          <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 block mb-6">LINE ITEMS</label>
                          <div className="flex flex-col gap-5">
                             {summaryData.line_items?.map((item, i) => (
                               <div key={i} className="flex justify-between items-center group">
                                 <div className="text-[15px] font-black text-[#1e1b4b] group-hover:text-indigo-600 transition-colors truncate pr-4">
                                   {item.name}
                                 </div>
                                 <div className="text-[15px] font-black text-indigo-500 whitespace-nowrap">
                                   ${(item.total / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })}K
                                 </div>
                               </div>
                             ))}
                          </div>
                       </div>

                       <div className="h-px bg-slate-100/50 w-full mb-10" />

                       <div>
                          <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 block mb-6">DEAL ANALYSIS</label>
                          <p className="text-[15px] font-medium text-slate-600 leading-relaxed mb-8 max-w-4xl">
                             {summaryData.summary_analysis || 'No analysis available.'}
                          </p>
                          <div className="flex flex-wrap gap-3">
                             {summaryData.tags?.map((tag, i) => (
                               <div key={i} className="px-4 py-2 rounded-xl bg-indigo-50 text-indigo-600 text-[9px] font-black uppercase tracking-widest">
                                 {tag}
                               </div>
                             ))}
                          </div>
                       </div>
                    </div>
                 </div>
               ) : (
                 <div className="flex flex-col items-center opacity-20 py-40">
                    <LayoutDashboard size={64} strokeWidth={1} className="mb-4" />
                    <p className="font-bold uppercase tracking-widest text-xs">Awaiting Quote Data</p>
                 </div>
               )}
            </div>
          )}
        </div>
      </section>

      {/* RESIZER HANDLE */}
      <div 
        className={`af-resizer ${isResizing ? 'active' : ''}`}
        onMouseDown={() => setIsResizing(true)}
      />

      {/* RIGHT SIDEBAR — AGENT INTELLIGENCE */}
      <section className="af-sidebar" style={{ width: sidebarWidth, flexShrink: 0 }}>
        <div className="af-sidebar-header">
           <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <BrainCircuit size={18} color="white" />
           </div>
           <div className="flex flex-col">
              <h3 className="text-xs font-black uppercase tracking-tighter">Agentforce</h3>
              <span className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest">Active & Thinking</span>
           </div>
           <Settings size={14} className="ml-auto text-slate-500 cursor-pointer" />
        </div>

        <div className="af-chat-area">
          {messages.map(msg => (
            <div key={msg.id} className={`af-message ${msg.role} flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center flex-shrink-0 mt-1 shadow-sm border border-indigo-500/20">
                   <BrainCircuit size={16} className="text-indigo-500" />
                </div>
              )}
              <div className="flex flex-col gap-3 flex-1 min-w-0">
                {msg.content && (
                  <div className={`af-bubble ${msg.role === 'user' ? 'bg-indigo-500 text-white' : 'bg-white border border-slate-100 text-slate-700 shadow-sm'}`}>
                    {msg.content}
                  </div>
                )}
              
              {msg.type === 'card' && msg.cardType === 'products' && (
                <div className="af-card">
                  <div className="af-card-header flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Package size={14} className="text-indigo-500" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Product Catalog</span>
                    </div>
                    <button 
                      onClick={() => toggleSelectAll(msg.data)}
                      title="Select All"
                      className={`p-1.5 rounded-lg transition-all ${msg.data.every(p => selectedProducts.has(p.id)) ? 'bg-indigo-500 text-white' : 'hover:bg-white/5 text-slate-500'}`}
                    >
                      <CheckCircle2 size={12} />
                    </button>
                  </div>
                  
                  {selectedProducts.size > 1 && (
                    <div className="px-4 py-3 bg-indigo-500/[0.03] border-b border-white/5 flex items-center gap-4 animate-in fade-in">
                       <div className="flex-1">
                          <label className="text-[7px] font-black uppercase text-indigo-500 block mb-1">Bulk Qty</label>
                          <div className="flex gap-1">
                             <input 
                              type="number" 
                              value={bulkQty}
                              onChange={(e) => {
                                const v = e.target.value;
                                setBulkQty(v);
                                if (v !== '') applyBulk('qty', v);
                              }}
                              placeholder="All"
                              className="w-full bg-black/20 border border-indigo-500/20 rounded-lg py-1 px-2 text-[10px] font-bold outline-none"
                             />
                             <button onClick={() => applyBulk('qty', bulkQty)} className="p-1 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors">
                                <CheckCircle2 size={12} />
                             </button>
                          </div>
                       </div>
                       <div className="flex-1">
                          <label className="text-[7px] font-black uppercase text-indigo-500 block mb-1">Bulk Disc %</label>
                          <div className="flex gap-1">
                             <input 
                              type="number" 
                              value={bulkDiscount}
                              onChange={(e) => {
                                const v = e.target.value;
                                setBulkDiscount(v);
                                if (v !== '') applyBulk('discount', v);
                              }}
                              placeholder="All"
                              className="w-full bg-black/20 border border-indigo-500/20 rounded-lg py-1 px-2 text-[10px] font-bold outline-none"
                             />
                             <button onClick={() => applyBulk('discount', bulkDiscount)} className="p-1 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors">
                                <CheckCircle2 size={12} />
                             </button>
                          </div>
                       </div>
                    </div>
                  )}

                  <div className="af-card-content max-h-[400px] overflow-y-auto custom-scrollbar">
                    {msg.data.map(p => {
                      const isSelected = selectedProducts.has(p.id);
                      return (
                        <div key={p.id} className={`p-3 mb-2 rounded-2xl border transition-all ${isSelected ? 'bg-indigo-500/[0.04] border-indigo-500/30 shadow-inner' : 'border-white/5 hover:bg-white/5'}`}>
                           <div onClick={() => toggleProduct(p)} className="flex items-center gap-3 cursor-pointer mb-2">
                              <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-500 border-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.4)]' : 'border-slate-500'}`}>
                                 {isSelected && <CheckCircle2 size={10} color="white" />}
                              </div>
                              <span className={`text-xs font-bold truncate ${isSelected ? 'text-indigo-500' : ''}`}>{p.name}</span>
                           </div>
                           
                           {isSelected && (
                             <div className="flex items-center gap-3 pl-7 animate-in fade-in slide-in-from-left-2">
                                <div className="flex-1">
                                   <label className="text-[8px] font-black uppercase text-slate-500 block mb-1">Quantity</label>
                                   <input 
                                    type="number" 
                                    value={productConfigs[p.id]?.qty || 1}
                                    onChange={(e) => updateConfig(p.id, 'qty', parseFloat(e.target.value))}
                                    className="w-full bg-black/20 border border-white/5 rounded-lg py-1.5 px-2 text-[11px] font-bold outline-none focus:border-indigo-500/30"
                                   />
                                </div>
                                <div className="flex-1">
                                   <label className="text-[8px] font-black uppercase text-slate-500 block mb-1">Discount %</label>
                                   <input 
                                    type="number" 
                                    value={productConfigs[p.id]?.discount || 0}
                                    onChange={(e) => updateConfig(p.id, 'discount', parseFloat(e.target.value))}
                                    className="w-full bg-black/20 border border-white/5 rounded-lg py-1.5 px-2 text-[11px] font-bold outline-none focus:border-indigo-500/30"
                                   />
                                </div>
                             </div>
                           )}
                        </div>
                      );
                    })}
                  </div>
                  {selectedProducts.size > 0 && (
                    <div className="p-3 border-t border-white/5 bg-indigo-500/5">
                       <button 
                        onClick={() => handleConfirmInline(msg.data)}
                        className="w-full py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-500/20"
                       >
                         <Zap size={12} fill="currentColor" /> Create Quote ({selectedProducts.size} Items)
                       </button>
                    </div>
                  )}
                </div>
              )}

              {msg.type === 'card' && msg.cardType === 'selection' && (
                 <div className="af-card">
                    <SelectionPanel 
                      panel={msg.data} 
                      onSelect={(opt) => {
                        const text = `${opt.name} (ID: ${opt.id})`;
                        setInputValue(text);
                        handleSend();
                      }} 
                    />
                 </div>
              )}

              {msg.type === 'card' && msg.cardType === 'quote' && (
                <div className="af-card">
                   <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
                      <div className="flex items-center gap-2 mb-2">
                         <CheckCircle2 size={16} className="text-emerald-500" />
                         <span className="text-[10px] font-black uppercase text-emerald-500">Quote Finalized</span>
                      </div>
                      <div className="text-sm font-mono font-bold mb-3">{msg.data.id}</div>
                      <button 
                        onClick={() => handlePreview(msg.data.id)}
                        className="flex items-center gap-2 text-[10px] font-black uppercase text-indigo-500 hover:text-indigo-400"
                      >
                        Preview in Workspace <ExternalLink size={12} />
                      </button>
                   </div>
                </div>
              )}
              </div>
            </div>
          ))}
          
          {reasoning && (
            <div className="af-reasoning">
              <Loader2 size={12} className="animate-spin" />
              {reasoning}
            </div>
          )}
          
          {workflowState === 'orchestrating' && <TypingIndicator />}
          <div ref={chatEndRef} />
        </div>

        <div className="af-input-area">
          <form onSubmit={handleSend} className="relative group">
             <div className="absolute inset-0 bg-indigo-500/10 blur-xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity" />
             <input 
              type="text" 
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="Ask Agivant Agentforce..."
              className="w-full bg-black/20 border border-white/5 rounded-2xl py-4 px-6 text-sm outline-none focus:border-indigo-500/50 transition-all relative z-10"
             />
             <button className="absolute right-4 top-1/2 -translate-y-1/2 z-20 text-indigo-500 hover:scale-110 transition-transform">
                <Send size={20} />
             </button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2">
             {SUGGESTIONS.slice(0, 2).map((s, i) => (
               <button 
                key={i} 
                onClick={() => setInputValue(s.text)}
                className="px-3 py-1.5 rounded-full border border-white/5 bg-white/5 text-[9px] font-bold uppercase text-slate-400 hover:bg-white/10 transition-all"
               >
                 {s.label}
               </button>
             ))}
          </div>
        </div>
      </section>

      <ProductConfigModal 
        isOpen={isConfigOpen} 
        onClose={() => setIsConfigOpen(false)} 
        products={configProducts} 
        onConfirm={(configuredItems) => {
          const list = configuredItems.map(p => `${p.name} (Qty: ${p.quantity}, Disc: ${p.discount}%)`).join(', ');
          setInputValue(`Create a quote for: ${list}`);
          handleSend();
          setIsConfigOpen(false);
        }} 
      />
    </div>
  );
};

export default AgentforceView;
