import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Send, Loader2, Zap, Settings, ArrowLeft, BrainCircuit, 
  CheckCircle2, Package, TrendingUp, Sparkles, Database,
  Eye, ExternalLink, Search, LayoutDashboard, FileText,
  ZoomIn, ZoomOut
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
      aiName: config.theme === 'Meta' ? 'Meta AI' : 'Agivant AI',
      content: `Hello! I'm your ${config.theme === 'Meta' ? 'Meta' : 'Quoting Accelerator'} Assistant for ${selectedModule?.title || 'Salesforce'}. How can I help you today?`,
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
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [productConfigs, setProductConfigs] = useState({}); // { id: { qty, discount } }
  const [bulkQty, setBulkQty] = useState('');
  const [bulkDiscount, setBulkDiscount] = useState('');
  const [workspaceView, setWorkspaceView] = useState('graph'); // graph, preview, account
  const [zoomLevel, setZoomLevel] = useState(0.75);
  const [quotes, setQuotes] = useState([]);
  const [quoteNumberMap, setQuoteNumberMap] = useState({}); // { id: number }
  const [showPreviewSuggestion, setShowPreviewSuggestion] = useState(false);
  const [showUpdateSuggestion, setShowUpdateSuggestion] = useState(false);
  const [showUpdateAllSuggestion, setShowUpdateAllSuggestion] = useState(false);

  const chatEndRef = useRef(null);
  const ws = useRef(null);
  const pendingResultsRef = useRef(null);
  const pendingSelectionRef = useRef(null);
  const pendingUpdateRef = useRef(false);
  const pendingCreationRef = useRef(false);

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

  const handleWsMessage = (data) => {
    switch (data.type) {
      case 'STATE':
        setWorkflowState(data.state);
        if (data.state === 'completed') {
          setReasoning(null);
          setOrchestration(prev => {
            const n = { ...prev };
            if (n.coordinator === 'active') n.coordinator = 'done';
            for (const k of ['Catalog_Scout', 'Quote_Architect', 'Quote_Updator']) {
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
          } else if (name === 'Catalog_Scout' || name === 'Quote_Architect' || name === 'Quote_Updator') {
            for (const k of ['Catalog_Scout', 'Quote_Architect', 'Quote_Updator']) {
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
          for (const k of ['Catalog_Scout', 'Quote_Architect', 'Quote_Updator']) {
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
          for (const k of ['Catalog_Scout', 'Quote_Architect', 'Quote_Updator']) {
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
            pendingResultsRef.current = parsed.results;
          }
          if (data.tool === 'evaluate_quote_graph') {
            let qId = extractQuoteId(data.data);
            const newQuote = { id: qId, status: 'Draft' };
            setQuotes(prev => [...prev, newQuote]);
            // Clear any pending cards since the quote is now finalized
            pendingResultsRef.current = null;
            pendingSelectionRef.current = null;
            
            /*
            addMessage({
              type: 'card',
              cardType: 'quote',
              data: newQuote,
              content: "Quote generated successfully in Salesforce."
            });
            */
            
            // Fetch quote number to replace ID in future messages
            fetch(`${config.API_BASE_URL}/api/quote-preview/${qId}`)
              .then(res => res.json())
              .then(d => {
                if (d.records?.[0]?.QuoteNumber) {
                  setQuoteNumberMap(prev => ({ ...prev, [qId]: d.records[0].QuoteNumber }));
                }
              })
              .catch(err => console.error('Error fetching quote number:', err));
            
            pendingCreationRef.current = true;
            // handlePreview(qId);
          }
        } catch (_) { }
        break;

      case 'USER_SELECTION_NEEDED':
        pendingSelectionRef.current = { type: data.selection_for, options: data.options || [] };
        break;

      case 'FINAL_REPLY':
        setReasoning(null);
        if (pendingResultsRef.current) {
          addMessage({
            type: 'card',
            cardType: 'products',
            data: pendingResultsRef.current,
            content: "I've searched the catalog and found these products:"
          });
          pendingResultsRef.current = null;
        }
        if (pendingSelectionRef.current) {
          addMessage({
            type: 'card',
            cardType: 'selection',
            data: pendingSelectionRef.current,
            content: `Please select an ${pendingSelectionRef.current.type}:`
          });
          pendingSelectionRef.current = null;
        }
        if (pendingUpdateRef.current || pendingCreationRef.current) {
          setShowPreviewSuggestion(true);
          pendingUpdateRef.current = false;
          pendingCreationRef.current = false;
        }
        if (data.data?.trim()) {
          if (data.data.includes('[ACTION: OPEN_CONFIG_MODAL]')) {
            setTimeout(() => handleOpenConfig(), 100);
          } else {
            let processedText = data.data;
            // Replace any Quote IDs with their Numbers if we have them
            Object.entries(quoteNumberMap).forEach(([id, num]) => {
              processedText = processedText.replace(new RegExp(id, 'g'), num);
            });
            // Also handle any potential 0Q0 matches that might have just arrived
            const idMatch = processedText.match(/0Q0[a-zA-Z0-9]{12,15}/);
            if (idMatch && quoteNumberMap[idMatch[0]]) {
              processedText = processedText.replace(idMatch[0], quoteNumberMap[idMatch[0]]);
            }

            addMessage({ type: 'text', content: processedText });

            // If AI asks which one to update or offers to update all, show "Update All" suggestion
            const lcText = processedText.toLowerCase();
            if (lcText.includes('update') && (lcText.includes('which one') || lcText.includes('all of them') || lcText.includes('specific ones'))) {
              setShowUpdateAllSuggestion(true);
            }
          }
        }
        break;

      case 'QUOTE_UPDATED':
        // Quote modification complete — set flag to show preview recommendation after the final reply
        if (data.quote_id) {
          pendingUpdateRef.current = true;
        }
        break;

      case 'ERROR':
        addMessage({ type: 'text', content: `⚠️ ${data.data}` });
        setReasoning(null);
        break;
    }
  };

  const addMessage = (msg) => {
    const aiName = config.theme === 'Meta' ? 'Meta AI' : 'Agivant AI';
    setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', aiName, ...msg }]);
  };

  const handleSend = (e, overrideText = null) => {
    e?.preventDefault();
    const text = overrideText || inputValue.trim();
    if (!text || workflowState === 'orchestrating' || workflowState === 'executing') return;

    // Support dynamic preview/summary commands
    const cmd = text.toLowerCase();
    
    // Support dynamic preview/summary/overview commands
    const isPreviewCmd = (cmd.includes('preview') || cmd.includes('overview') || cmd.includes('summary')) && (cmd.includes('quote') || cmd.split(' ').length <= 4);
    if (isPreviewCmd) {
      let quoteIdToPreview = null;
      const latestFromState = quotes[quotes.length - 1]?.id;
      
      if (latestFromState && latestFromState !== 'Generated') {
        quoteIdToPreview = latestFromState;
      } else {
        // Fallback: search messages for a quote ID pattern (0Q0...)
        const allContent = messages.map(m => m.content).join(' ');
        const match = allContent.match(/0Q0[a-zA-Z0-9]{12,15}/);
        if (match) quoteIdToPreview = match[0];
      }

      if (quoteIdToPreview) {
        setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: text, type: 'text' }]);
        handlePreview(quoteIdToPreview);
        setInputValue('');
        return;
      }
    }


    let finalMessage = text;
    if (selectedProducts.size > 0) {
      const productMessages = messages.filter(m => m.type === 'card' && m.cardType === 'products');
      const allProds = productMessages.flatMap(m => m.data);
      const selected = allProds.filter(p => selectedProducts.has(p.id));
      if (selected.length > 0) {
        const list = selected.map(p => {
          const cfg = productConfigs[p.id] || { qty: 1, discount: 0 };
          return `${p.name} (ID: ${p.id}, Quantity: ${cfg.qty}, Discount: ${cfg.discount}%)`;
        }).join(', ');
        finalMessage += `\n\n[Products in context: ${list}]`;
      }
    }

    setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: text, type: 'text' }]);
    setInputValue('');
    ws.current?.send(JSON.stringify({
      text: finalMessage,
      module: selectedModule?.id || 'sales'
    }));

    // Reset suggestions unless specifically triggered
    setShowUpdateSuggestion(false);
    setShowPreviewSuggestion(false);
    setShowUpdateAllSuggestion(false);

    // Clear selections and configs after sending to prevent stale context and hide recommendations
    setSelectedProducts(new Set());
    setProductConfigs({});
    setBulkQty('');
    setBulkDiscount('');
  };

  const extractQuoteId = (dataStr) => {
    const match = dataStr.match(/0Q0[a-zA-Z0-9]{12,15}/);
    return match ? match[0] : 'Generated';
  };

  const handleOpenConfig = () => {
    // Collect all unique products from the chat history
    const productMessages = messages.filter(m => m.type === 'card' && m.cardType === 'products');
    const allProds = productMessages.flatMap(m => m.data);
    const selected = allProds.filter(p => selectedProducts.has(p.id));
    
    if (selected.length > 0) {
      const mapped = selected.map(p => ({
        ...p,
        quantity: productConfigs[p.id]?.qty || 1,
        discount: productConfigs[p.id]?.discount || 0
      }));
      const unique = Array.from(new Map(mapped.map(item => [item.id, item])).values());
      setConfigProducts(unique);
      setIsConfigOpen(true);
    }
  };

  const handlePreview = async (quoteId) => {
    if (!quoteId || quoteId === 'Generated') return;
    setLoadingPreview(true);
    try {
      const resp = await fetch(`${config.API_BASE_URL}/api/quote-preview/${quoteId}`);
      const data = await resp.json();
      if (data.status === 'success') {
        setPreviewData(data);
        setWorkspaceView('preview');
        // Show update suggestion ONLY after preview is successfully displayed
        setShowUpdateSuggestion(true);
        setShowPreviewSuggestion(false);
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
    setInputValue(text);
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
    <div className={`agentforce-container ${isDark ? 'dark' : ''} ${config.theme === 'Meta' ? 'meta-theme' : ''}`}>
      
      {/* LEFT WORKSPACE — CONTEXT VIEW */}
      <section className="af-workspace">
        <div className="af-workspace-header">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 text-slate-400">
              <ArrowLeft size={18} />
            </button>
            <div className="flex flex-col">
              <h2 className="text-xs font-black uppercase tracking-widest text-indigo-500">
                {config.theme === 'Meta' ? 'Meta Workspace' : 'Quoting Accelerator'}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-black/5 p-1 rounded-xl border border-black/5">
            <button 
              onClick={() => setWorkspaceView('graph')}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${workspaceView === 'graph' ? 'bg-white shadow-sm text-indigo-500' : 'text-slate-500 hover:text-indigo-400'}`}
            >
              Orchestration Flow
            </button>
            <button 
              onClick={() => setWorkspaceView('preview')}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${workspaceView === 'preview' ? 'bg-white shadow-sm text-indigo-500' : 'text-slate-500 hover:text-indigo-400'}`}
            >
              Record Preview
            </button>
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden flex flex-col items-center justify-center">
          {workspaceView === 'graph' && (
             <div className="w-full h-full relative overflow-hidden flex items-center justify-center">
                <div className="absolute top-4 right-4 z-50 flex flex-col gap-2">
                  <button 
                    onClick={() => setZoomLevel(z => Math.min(1.5, z + 0.1))}
                    className={`p-2 rounded-lg transition-colors backdrop-blur-md border ${
                      isDark 
                        ? 'bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border-white/10' 
                        : 'bg-black/5 hover:bg-black/10 text-slate-500 hover:text-black border-black/10'
                    }`}
                    title="Zoom In"
                  >
                    <ZoomIn size={16} />
                  </button>
                  <button 
                    onClick={() => setZoomLevel(z => Math.max(0.4, z - 0.1))}
                    className={`p-2 rounded-lg transition-colors backdrop-blur-md border ${
                      isDark 
                        ? 'bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border-white/10' 
                        : 'bg-black/5 hover:bg-black/10 text-slate-500 hover:text-black border-black/10'
                    }`}
                    title="Zoom Out"
                  >
                    <ZoomOut size={16} />
                  </button>
                </div>
                <div style={{ transform: `scale(${zoomLevel})`, transition: 'transform 0.3s ease-out' }} className="origin-center">
                  <AgentGraph orchestration={orchestration} graphActive={true} graphReady={true} isDark={isDark} />
                </div>
             </div>
          )}
          {workspaceView === 'preview' && (
            <div className="w-full h-full p-8 overflow-y-auto custom-scrollbar">
               {previewData ? (
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

      {/* RIGHT SIDEBAR — AGENT INTELLIGENCE */}
      <section className="af-sidebar">
        <div className="af-sidebar-header">
           <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-lg ${config.theme === 'Meta' ? 'bg-white' : 'bg-indigo-500 shadow-indigo-500/20'}`}>
              {config.theme === 'Meta' ? (
                <img src={config.META_LOGO_URL} alt="Meta" className="h-4 object-contain" />
              ) : (
                <img src={config.AGIVANT_LOGO_URL} alt="Agivant" className="h-4 object-contain invert" />
              )}
           </div>
           <div className="flex flex-col">
              <h3 className="text-xs font-black uppercase tracking-tighter">
                {config.theme === 'Meta' ? 'Meta Assistant' : 'Quoting Accelerator'}
              </h3>
              <span className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest">Active & Thinking</span>
           </div>
           <Settings size={14} className="ml-auto text-slate-500 cursor-pointer" />
        </div>

        <div className="af-chat-area">
          {messages.map(msg => (
            <div key={msg.id} className={`af-message ${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  <div className="w-1 h-2 bg-indigo-500/40 rounded-full" />
                  <span className="text-[7px] font-black uppercase tracking-widest text-slate-500">
                    {msg.aiName || (config.theme === 'Meta' ? 'Meta AI' : 'Agivant AI')}
                  </span>
                </div>
              )}
              <div className="af-bubble">
                {msg.content}
              </div>
              
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
                         
                          </div>
                       </div>
                    </div>
                  )}

                  <div className="af-card-content max-h-[400px] overflow-y-auto custom-scrollbar">
                    {msg.data.map(p => {
                      const isSelected = selectedProducts.has(p.id);
                      return (
                        <div key={p.id} className={`p-3 mb-2 rounded-2xl border transition-all ${isSelected ? 'bg-indigo-500/[0.04] border-indigo-500/30 shadow-inner' : 'border-white/5 hover:bg-white/5'}`}>
                           <div onClick={() => toggleProduct(p)} className="flex items-center gap-2 cursor-pointer mb-2">
                              {isSelected && <CheckCircle2 size={14} className="text-indigo-500" />}
                              <span className={`text-xs font-bold truncate ${isSelected ? 'text-indigo-500' : 'text-slate-600'}`}>{p.name}</span>
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
          ))}
          
          {reasoning && (
            <div className="af-reasoning">
              <Loader2 size={12} className="animate-spin" />
              {reasoning}
            </div>
          )}
          
          {workflowState === 'orchestrating' && <TypingIndicator />}

          <div className="flex flex-col gap-2 mt-4 mb-2 animate-in fade-in slide-in-from-bottom-2">
             {selectedProducts.size > 0 && (
                <div className="flex justify-start">
                   <button 
                     onClick={() => setInputValue('Create a quote for the selected products')}
                     className="px-4 py-2 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-[11px] font-black uppercase text-indigo-500 hover:bg-indigo-500/20 transition-all flex items-center gap-2"
                   >
                     ✨ Create a Quote
                   </button>
                </div>
             )}

             {showPreviewSuggestion && (
                <div className="flex justify-start">
                   <button 
                     onClick={() => {
                       setInputValue('Preview the quote');
                       setShowPreviewSuggestion(false);
                     }}
                     className="px-4 py-2 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-[11px] font-black uppercase text-indigo-500 hover:bg-indigo-500/20 transition-all flex items-center gap-2"
                   >
                     ✨ Preview Quote
                   </button>
                </div>
             )}

             {showUpdateSuggestion && (
                <div className="flex justify-start">
                   <button 
                     onClick={() => {
                       setInputValue('Can you update the quantity to 10 and discount to 10% in this quote');
                       setShowUpdateSuggestion(false);
                     }}
                     className="px-4 py-2 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-[11px] font-black uppercase text-indigo-500 hover:bg-indigo-500/20 transition-all flex items-center gap-2"
                   >
                     ✨ Update Quote
                   </button>
                </div>
             )}

             {showUpdateAllSuggestion && (
                <div className="flex justify-start">
                   <button 
                     onClick={() => {
                       setInputValue('Update all the quote line items with quantity 10 and discount 10%');
                       setShowUpdateAllSuggestion(false);
                     }}
                     className="px-4 py-2 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-[11px] font-black uppercase text-indigo-500 hover:bg-indigo-500/20 transition-all flex items-center gap-2"
                   >
                     ✨ Update All Items
                   </button>
                </div>
             )}
          </div>
          
          <div ref={chatEndRef} />
        </div>

        <div className="af-input-area">
          <form onSubmit={handleSend} className="relative group">
             <div className="absolute inset-0 bg-indigo-500/10 blur-xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity" />
             <input 
              type="text" 
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder={config.theme === 'Meta' ? 'Ask Meta Assistant...' : 'Ask Quoting Accelerator...'}
              className="w-full bg-black/20 border border-white/5 rounded-2xl py-4 px-6 text-sm outline-none focus:border-indigo-500/50 transition-all relative z-10"
             />
             <button className="absolute right-4 top-1/2 -translate-y-1/2 z-20 text-indigo-500 hover:scale-110 transition-transform">
                <Send size={20} />
             </button>
          </form>
          {/* <div className="mt-4 flex flex-wrap gap-2">
             <div className="flex items-center gap-2 mb-2 w-full">
               <div className="h-[1px] flex-1 bg-white/5"></div>
               <span className="text-[7px] font-black text-slate-600 uppercase tracking-[0.2em]">Quick Actions</span>
               <div className="h-[1px] flex-1 bg-white/5"></div>
             </div>
             
             {SUGGESTIONS.slice(0, 3).map((s, i) => (
               <button 
                key={i} 
                onClick={() => setInputValue(s.text)}
                className="px-3 py-1.5 rounded-full border border-white/5 bg-white/5 text-[9px] font-bold uppercase text-slate-400 hover:bg-white/10 transition-all"
               >
                 {s.label}
               </button>
             ))}
          </div> */}
        </div>
      </section>

      <ProductConfigModal 
        isOpen={isConfigOpen} 
        onClose={() => setIsConfigOpen(false)} 
        products={configProducts} 
        onConfirm={(configuredItems) => {
          const list = configuredItems.map(p => `${p.name} (Qty: ${p.quantity}, Disc: ${p.discount}%)`).join(', ');
          setInputValue(`Create a quote for: ${list}`);
          handleSend(); // This will add the message to the UI and send the JSON
          setIsConfigOpen(false);
        }} 
      />
    </div>
  );
};

export default AgentforceView;
