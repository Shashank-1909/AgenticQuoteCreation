import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, Loader2, Zap, Settings, ArrowLeft, ArrowRight, BrainCircuit,
  CheckCircle2, Package, TrendingUp, Sparkles, Database,
  Eye, ExternalLink, Search, LayoutDashboard, FileText,
  ZoomIn, ZoomOut, Paperclip, MapPin, Layers, ShieldCheck, PlusCircle, Sun, Moon
} from 'lucide-react';
import { config } from '../config';
import SelectionPanel from './SelectionPanel';
import AgentGraph from './AgentGraph';
import TypingIndicator from './TypingIndicator';
import QuotePreviewModal from './QuotePreviewModal';
import ProductConfigModal from './ProductConfigModal';
import DealHistoryPanel from './DealHistoryPanel';
import WinRateBattleCard from './WinRateBattleCard';
import LanguageToggle from './LanguageToggle';
import LookalikeCards from './LookalikeCards';
import { INIT_ORCH, SUGGESTIONS } from '../constants';
import { translations } from '../translations';
import './AgentforceView.css';

const getActionIcon = (label) => {
  const lc = label.toLowerCase();
  if (lc.includes('filter') || lc.includes('region') || lc.includes('north') || lc.includes('south') || lc.includes('east') || lc.includes('west')) {
    return <MapPin size={14} className="text-indigo-500 flex-shrink-0" />;
  }
  if (lc.includes('compare') || lc.includes('analytics') || lc.includes('history')) {
    return <Layers size={14} className="text-indigo-500 flex-shrink-0" />;
  }
  if (lc.includes('spec') || lc.includes('technical') || lc.includes('detail') || lc.includes('feature')) {
    return <ShieldCheck size={14} className="text-indigo-500 flex-shrink-0" />;
  }
  if (lc.includes('add-on') || lc.includes('addon') || lc.includes('compatible') || lc.includes('extra')) {
    return <Package size={14} className="text-indigo-500 flex-shrink-0" />;
  }
  if (lc.includes('create') || lc.includes('new') || lc.includes('generate')) {
    return <PlusCircle size={14} className="text-indigo-500 flex-shrink-0" />;
  }
  return <Sparkles size={14} className="text-indigo-500 flex-shrink-0" />;
};

const AgentforceView = ({ onBack, selectedModule, isDark = false, language, setLanguage }) => {
  const [rightWidth, setRightWidth] = useState(500);
  const [isResizingRight, setIsResizingRight] = useState(false);

  const sendPayload = useCallback((payloadStr) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    try {
      const t = translations[language] || translations['en'];
      let parsed = JSON.parse(payloadStr);
      if (language !== 'en' && t?.languageContext && parsed.text) {
        parsed.text = `${parsed.text}\n\n[System Context: ${t.languageContext}]`;
      }
      ws.current.send(JSON.stringify(parsed));
    } catch (e) {
      const t = translations[language] || translations['en'];
      let text = payloadStr;
      if (language !== 'en' && t?.languageContext) {
        text = `${text}\n\n[System Context: ${t.languageContext}]`;
      }
      ws.current.send(text);
    }
  }, [language]);

  const startResizingRight = useCallback((e) => {
    setIsResizingRight(true);
  }, []);

  const stopResizingRight = useCallback(() => {
    setIsResizingRight(false);
  }, []);

  const resizeRight = useCallback((e) => {
    if (isResizingRight) {
      setRightWidth(prev => {
        const newWidth = document.body.clientWidth - e.clientX;
        return Math.max(350, Math.min(newWidth, 800));
      });
    }
  }, [isResizingRight]);

  useEffect(() => {
    if (isResizingRight) {
      window.addEventListener('mousemove', resizeRight);
      window.addEventListener('mouseup', stopResizingRight);
    }
    return () => {
      window.removeEventListener('mousemove', resizeRight);
      window.removeEventListener('mouseup', stopResizingRight);
    };
  }, [isResizingRight, resizeRight, stopResizingRight]);
  useEffect(() => { setMessages(prev => prev.map(msg => msg.isGreeting ? { ...msg, content: (translations[language?.toLowerCase()] || translations['en']).greeting.replace('{name}', config.theme === 'Meta' ? 'Meta' : config.theme === 'Thermofisher' ? 'Thermo Fisher Sales' : 'Quoting Accelerator') } : msg)); }, [language]);
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'assistant',
      aiName: config.theme === 'Meta' ? 'Meta AI' : config.theme === 'Thermofisher' ? 'Thermo Fisher AI' : 'Agivant AI',
      content: `Hello! I'm your ${config.theme === 'Meta' ? 'Meta' : config.theme === 'Thermofisher' ? 'Thermo Fisher Sales' : 'Quoting Accelerator'} Assistant. How can I help you today?`,
      type: 'text',
      isGreeting: true
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
  const [lookalikeData, setLookalikeData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [productConfigs, setProductConfigs] = useState({}); // { id: { qty, discount } }
  const [bulkQty, setBulkQty] = useState('');
  const [bulkDiscount, setBulkDiscount] = useState('');
  const [workspaceView, setWorkspaceView] = useState('graph'); // graph, preview, account
  const [zoomLevel, setZoomLevel] = useState(0.75);
  const graphContainerRef = useRef(null);

  useEffect(() => {
    if (workspaceView !== 'graph' || !graphContainerRef.current) return;
    const updateScale = () => {
      const rect = graphContainerRef.current.getBoundingClientRect();
      const scaleX = (rect.width - 40) / 980; // 980 is GW
      const scaleY = (rect.height - 40) / 580; // 580 is GH
      const fitScale = Math.min(scaleX, scaleY);
      setZoomLevel(Math.max(0.4, Math.min(fitScale, 1.15)));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(graphContainerRef.current);
    return () => observer.disconnect();
  }, [workspaceView]);

  const [quotes, setQuotes] = useState([]);
  const [quoteNumberMap, setQuoteNumberMap] = useState({}); // { id: number }
  const [showPreviewSuggestion, setShowPreviewSuggestion] = useState(false);
  const [showUpdateSuggestion, setShowUpdateSuggestion] = useState(false);
  const [showUpdateAllSuggestion, setShowUpdateAllSuggestion] = useState(false);

  // Deal History States
  const [dealHistoryData, setDealHistoryData] = useState(null);
  const [dealHistoryAccount, setDealHistoryAccount] = useState('');
  const [dealHistoryLoading, setDealHistoryLoading] = useState(false);
  const [dealHistoryFilter, setDealHistoryFilter] = useState('All');

  const chatEndRef = useRef(null);
  const ws = useRef(null);
  const pendingResultsRef = useRef(null);
  const pendingSelectionRef = useRef(null);
  const pendingUpdateRef = useRef(false);
  const pendingCreationRef = useRef(false);
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);

  const dealHistoryLoadingRef = useRef(false);
  const isSummarizeRequestRef = useRef(false);
  const isWinRateRequestRef = useRef(false);
  const isDealHistoryRequestRef = useRef(false);
  const isQuoteWinRateRequestRef = useRef(false);
  const summarizeTimeoutsRef = useRef([]);
  const clearSummarizeTimeouts = () => {
    summarizeTimeoutsRef.current.forEach(clearTimeout);
    summarizeTimeoutsRef.current = [];
  };

  const connectWebSocket = useCallback(() => {
    if (ws.current && (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const socket = new WebSocket('ws://localhost:8001/ws/orchestrate');
    socket.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        handleWsMessageRef.current?.(data);
      } catch (err) {
        console.error('[WS] parse error', err);
      }
    };
    socket.onclose = () => {
      setTimeout(connectWebSocket, 3000);
    };
    socket.onerror = () => {
      socket.close();
    };
    ws.current = socket;
  }, []);

  useEffect(() => {
    if (workflowState === 'completed') {
      if (isWinRateRequestRef.current || isSummarizeRequestRef.current || isDealHistoryRequestRef.current) {
        setWorkspaceView('preview');
      }
    }
  }, [workflowState]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, reasoning]);


  const handleWsMessageRef = useRef(null);
  useEffect(() => {
    handleWsMessageRef.current = handleWsMessage;
  });

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (ws.current) {
        ws.current.onclose = null;
        ws.current.close();
      }
    };
  }, [connectWebSocket]);

  const handleWsMessage = (data) => {
    switch (data.type) {
      case 'STATE':
        setWorkflowState(data.state);
        if (data.state === 'completed') {
          clearSummarizeTimeouts();
          setReasoning(null);
          setOrchestration(prev => {
            const n = { ...prev };
            if (isWinRateRequestRef.current) {
              n.coordinator = 'done';
              n.Quote_Analyst = {
                state: 'done',
                routedByDm: true,
                tools: [
                  { name: 'get_my_accounts', state: 'done' },
                  { name: 'get_deal_history', state: 'done' },
                  { name: 'win_rate', state: 'done' }
                ]
              };
            } else if (isSummarizeRequestRef.current) {
              n.coordinator = 'done';
              n.Quote_Analyst = {
                state: 'done',
                routedByDm: true,
                tools: [
                  { name: 'get_my_accounts', state: 'done' },
                  { name: 'get_deal_history', state: 'done' },
                  { name: 'summary_node', state: 'done' }
                ]
              };
            } else {
              if (n.coordinator === 'active') n.coordinator = 'done';
              for (const k of ['Requirements_Parser', 'Catalog_Scout', 'Quote_Architect', 'Quote_Updator', 'Quote_Analyst', 'Twin_Hunter']) {
                if (n[k] && n[k].state === 'active') {
                  n[k] = { ...n[k], state: 'done' };
                  if (n[k].tools) {
                    n[k].tools = n[k].tools.map(t => ({ ...t, state: 'done' }));
                  }
                }
              }
            }
            return n;
          });
          if (dealHistoryLoadingRef.current) {
            setDealHistoryLoading(false);
            dealHistoryLoadingRef.current = false;
            setWorkspaceView('preview');
          }
        }
        break;

      case 'AGENT_START':
        const name = data.agent;
        if (name === 'Deal_Manager' && isWinRateRequestRef.current) {
          clearSummarizeTimeouts();
          setReasoning("Analyzing win rate request...");
          setOrchestration(prev => {
            const n = { ...prev };
            n.coordinator = 'active';
            n.Quote_Analyst = { state: 'idle', tools: [], routedByDm: false };
            return n;
          });

          // Timeout 1: Handoff to Quote_Analyst and trigger get_my_accounts tool
          const t1 = setTimeout(() => {
            setOrchestration(prev => {
              const n = { ...prev };
              n.coordinator = 'done';
              if (n.Quote_Analyst) {
                n.Quote_Analyst = {
                  ...n.Quote_Analyst,
                  state: 'active',
                  tools: [
                    { name: 'get_my_accounts', state: 'active' }
                  ]
                };
              }
              return n;
            });
            setReasoning("Fetching account details...");
          }, 800);

          // Timeout 2: Transition get_my_accounts to done, and get_deal_history to active
          const t2 = setTimeout(() => {
            setOrchestration(prev => {
              const n = { ...prev };
              if (n.Quote_Analyst) {
                n.Quote_Analyst = {
                  ...n.Quote_Analyst,
                  tools: [
                    { name: 'get_my_accounts', state: 'done' },
                    { name: 'get_deal_history', state: 'active' }
                  ]
                };
              }
              return n;
            });
            setReasoning("Retrieving Salesforce deal history...");
          }, 2000);

          summarizeTimeoutsRef.current = [t1, t2];
          break;
        }

        if (name === 'Deal_Manager' && isSummarizeRequestRef.current) {
          clearSummarizeTimeouts();
          setReasoning("Analyzing deal history...");
          setOrchestration(prev => {
            const n = { ...prev };
            n.coordinator = 'active';
            n.Quote_Analyst = { state: 'idle', tools: [], routedByDm: false };
            return n;
          });

          // Timeout 1: Handoff to Quote_Analyst and trigger get_my_accounts tool
          const t1 = setTimeout(() => {
            setOrchestration(prev => {
              const n = { ...prev };
              n.coordinator = 'done';
              if (n.Quote_Analyst) {
                n.Quote_Analyst = {
                  ...n.Quote_Analyst,
                  state: 'active',
                  tools: [
                    { name: 'get_my_accounts', state: 'active' }
                  ]
                };
              }
              return n;
            });
            setReasoning("Fetching account details...");
          }, 800);

          // Timeout 2: Transition get_my_accounts to done, and get_deal_history to active
          const t2 = setTimeout(() => {
            setOrchestration(prev => {
              const n = { ...prev };
              if (n.Quote_Analyst) {
                n.Quote_Analyst = {
                  ...n.Quote_Analyst,
                  tools: [
                    { name: 'get_my_accounts', state: 'done' },
                    { name: 'get_deal_history', state: 'active' }
                  ]
                };
              }
              return n;
            });
            setReasoning("Fetching deal history records...");
          }, 2000);

          summarizeTimeoutsRef.current = [t1, t2];
          break;
        }

        if (name === 'Summary_Node' || name === 'Win_Rate_Node') {
          if (name === 'Win_Rate_Node') {
            clearSummarizeTimeouts();
            setReasoning("Running dynamic win rate analytics & competitor battle card compilation...");
            setOrchestration(prev => {
              const n = { ...prev };
              if (n.Quote_Analyst) {
                n.Quote_Analyst = {
                  ...n.Quote_Analyst,
                  state: 'active',
                  tools: [
                    { name: 'get_my_accounts', state: 'done' },
                    { name: 'get_deal_history', state: 'done' },
                    { name: 'win_rate', state: 'active' }
                  ]
                };
              }
              return n;
            });

            // After a delay, set win_rate tool to done
            const t3 = setTimeout(() => {
              setOrchestration(prev => {
                const n = { ...prev };
                if (n.Quote_Analyst) {
                  n.Quote_Analyst = {
                    ...n.Quote_Analyst,
                    tools: [
                      { name: 'get_my_accounts', state: 'done' },
                      { name: 'get_deal_history', state: 'done' },
                      { name: 'win_rate', state: 'done' }
                    ]
                  };
                }
                return n;
              });
            }, 1200);

            summarizeTimeoutsRef.current = [t3];
          }
          break;
        }

        setReasoning(`Agent ${data.agent.replace('_', ' ')} is thinking...`);
        setOrchestration(prev => {
          const name = data.agent;
          const n = { ...prev };
          if (name === 'Deal_Manager') {
            n.coordinator = 'active';
          } else if (
            name === 'Requirements_Parser' ||
            name === 'Catalog_Scout' ||
            name === 'Quote_Architect' ||
            name === 'Quote_Updator' ||
            name === 'Quote_Analyst' ||
            name === 'Twin_Hunter'
          ) {
            for (const k of ['Requirements_Parser', 'Catalog_Scout', 'Quote_Architect', 'Quote_Updator', 'Quote_Analyst', 'Twin_Hunter']) {
              if (n[k] && n[k].state === 'active') n[k] = { ...n[k], state: 'done' };
            }
            const dmWasActive = n.coordinator === 'active';
            if (n.coordinator === 'active') n.coordinator = 'done';
            if (n[name]) {
              n[name] = { ...n[name], state: 'active', routedByDm: dmWasActive };
            }
          }
          return n;
        });
        break;

      case 'TOOL_TRIGGER':
        if (data.tool === 'get_deal_history') {
          if (!isWinRateRequestRef.current && !isSummarizeRequestRef.current) {
            isDealHistoryRequestRef.current = true;
            isWinRateRequestRef.current = false;
            isSummarizeRequestRef.current = false;
          }
          // Trigger get_my_accounts first to represent going to accounts
          setOrchestration(prev => {
            const n = { ...prev };
            if (n.Quote_Analyst) {
              n.Quote_Analyst.state = 'active';
              if (n.coordinator === 'active') n.coordinator = 'done';
              const tools = n.Quote_Analyst.tools || [];
              const hasAccounts = tools.some(t => t.name === 'get_my_accounts');
              
              let newTools = tools.map(t => 
                t.name === 'get_my_accounts' ? { ...t, state: 'active' } : t
              );
              if (!hasAccounts) {
                newTools.push({ name: 'get_my_accounts', state: 'active' });
              }
              // Ensure get_deal_history is NOT in the tools array yet so it doesn't appear
              newTools = newTools.filter(t => t.name !== 'get_deal_history');
              n.Quote_Analyst.tools = newTools;
            }
            return n;
          });

          // After a delay, set get_my_accounts to done and get_deal_history to active
          setTimeout(() => {
            setOrchestration(prev => {
              const n = { ...prev };
              if (n.Quote_Analyst) {
                const tools = n.Quote_Analyst.tools || [];
                const hasDealHistory = tools.some(t => t.name === 'get_deal_history');
                
                let newTools = tools.map(t => 
                  t.name === 'get_my_accounts' ? { ...t, state: 'done' } : t
                );
                if (!hasDealHistory) {
                  newTools.push({ name: 'get_deal_history', state: 'active' });
                } else {
                  newTools = newTools.map(t => 
                    t.name === 'get_deal_history' ? { ...t, state: 'active' } : t
                  );
                }
                n.Quote_Analyst.tools = newTools;
              }
              return n;
            });
          }, 1500);

          setReasoning("Checking customer accounts...");
          break;
        }

        setReasoning(`${(translations[language?.toLowerCase()] || translations['en']).nodes?.executing?.replace('…', '') || 'Running tool:'} ${data.tool.replace('_', ' ')}...`);
        setOrchestration(prev => {
          const n = { ...prev };
          for (const k of ['Requirements_Parser', 'Catalog_Scout', 'Quote_Architect', 'Quote_Updator', 'Quote_Analyst', 'Twin_Hunter']) {
            if (n[k] && n[k].state === 'active') {
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
          for (const k of ['Requirements_Parser', 'Catalog_Scout', 'Quote_Architect', 'Quote_Updator', 'Quote_Analyst', 'Twin_Hunter']) {
            if (n[k] && n[k].tools && n[k].tools.some(t => t.name === data.tool)) {
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
          if (data.tool === 'get_quote_line_items' && parsed.quote_id) {
            // Automatically switch to preview when Quote Updator fetches line items
            fetch(`${config.API_BASE_URL}/api/quote-preview/${parsed.quote_id}`)
              .then(res => res.json())
              .then(d => {
                setPreviewData(d);
                setWorkspaceView('preview');
              })
              .catch(err => console.error('Error fetching quote preview:', err));
          }
          if ((data.tool === 'search_catalog' || data.tool === 'parse_transcript_to_requirements' || data.tool === 'parse_requirements_doc' || data.tool === 'map_requirements_to_catalog') && parsed.results && parsed.results.length > 0) {
            pendingResultsRef.current = parsed.results;

            if (parsed.requirements) {
              const newSelected = new Set();
              const newConfigs = {};

              parsed.requirements.forEach(req => {
                const need = req.extracted_need;
                const mappedList = req.mapped_catalog_products;

                if (mappedList && mappedList.length > 0) {
                  if (req.confidence === 'High' || req.confidence === 'Medium') {
                    const p = mappedList[0];
                    newSelected.add(p.id);
                    newConfigs[p.id] = {
                      qty: need.quantity || 1,
                      discount: need.discount || 0
                    };
                  }
                }
              });

              setSelectedProducts(prev => new Set([...prev, ...newSelected]));
              setProductConfigs(prev => ({ ...prev, ...newConfigs }));
            }
          }
          if (data.tool === 'get_deal_history') {
            if (!isWinRateRequestRef.current && !isSummarizeRequestRef.current) {
              isDealHistoryRequestRef.current = true;
              isWinRateRequestRef.current = false;
              isSummarizeRequestRef.current = false;
            }
            if (parsed.status === 'success' || parsed.quotes) {
              setDealHistoryData(parsed.quotes || []);
              setDealHistoryAccount(parsed.accountName || '');
            }
          }
          if (data.tool === 'build_twin_hunter_cards' && Array.isArray(parsed.cards)) {
            setLookalikeData(parsed);
            setPreviewData(null);
            setWorkspaceView('preview');
          }
          if (data.tool === 'evaluate_quote_graph') {
            let qId = extractQuoteId(data.data);
            const newQuote = { id: qId, status: 'Draft' };
            setQuotes(prev => [...prev, newQuote]);
            setLookalikeData(null);
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

            // Fetch quote number and auto-redirect to preview
            fetch(`${config.API_BASE_URL}/api/quote-preview/${qId}`)
              .then(res => res.json())
              .then(d => {
                if (d.records?.[0]?.QuoteNumber) {
                  setQuoteNumberMap(prev => ({ ...prev, [qId]: d.records[0].QuoteNumber }));
                }
                setPreviewData(d);
                setWorkspaceView('preview');
              })
              .catch(err => console.error('Error fetching quote number:', err));

            pendingCreationRef.current = true;
          }
        } catch (_) { }
        break;

      case 'USER_SELECTION_NEEDED':
        pendingSelectionRef.current = { type: data.selection_for, options: data.options || [] };
        break;

      case 'FINAL_REPLY':
        setReasoning(null);
        if (pendingResultsRef.current && pendingResultsRef.current.length > 0) {
          addMessage({
            type: 'card',
            cardType: 'products',
            data: pendingResultsRef.current,
            content: "Based on the document you uploaded, these are the products:"
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
            let actions = [];

            // Parse [ACTIONS: Action 1 | Action 2 | ...]
            const actionsMatch = processedText.match(/\[ACTIONS:\s*([^\]]+)\]/);
            if (actionsMatch) {
              actions = actionsMatch[1].split('|').map(act => act.trim()).filter(Boolean);
              processedText = processedText.replace(/\[ACTIONS:\s*[^\]]+\]/, '').trim();
            }

            // Replace any Quote IDs with their Numbers if we have them
            Object.entries(quoteNumberMap).forEach(([id, num]) => {
              processedText = processedText.replace(new RegExp(id, 'g'), num);
            });
            // Also handle any potential 0Q0 matches that might have just arrived
            const idMatch = processedText.match(/0Q0[a-zA-Z0-9]{12,15}/);
            if (idMatch && quoteNumberMap[idMatch[0]]) {
              processedText = processedText.replace(idMatch[0], quoteNumberMap[idMatch[0]]);
            }

            addMessage({ type: 'text', content: processedText, actions });

            // Detect if AI is asking for a document upload
            const lcText = processedText.toLowerCase();
            if (
              lcText.includes('upload') ||
              lcText.includes('paste') ||
              lcText.includes('share') ||
              lcText.includes('document') ||
              lcText.includes('transcript') ||
              lcText.includes('file') ||
              lcText.includes('sow') ||
              lcText.includes('rfp') ||
              lcText.includes('analyse') ||
              lcText.includes('analyze') ||
              lcText.includes('[action: show_upload_card]')
            ) {
              addMessage({
                type: 'card',
                cardType: 'upload',
                content: (translations[language] || translations['en']).uploadDocumentCTA
              });
            }

            // If AI asks which one to update or offers to update all, show "Update All" suggestion
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
          // Refresh the preview pane automatically if we are currently looking at it
          fetch(`${config.API_BASE_URL}/api/quote-preview/${data.quote_id}`)
            .then(res => res.json())
            .then(d => {
              setPreviewData(d);
            })
            .catch(err => console.error('Error refreshing quote preview:', err));
        }
        break;

      case 'ERROR':
        addMessage({ type: 'text', content: `⚠️ ${data.data}` });
        setReasoning(null);
        break;
    }
  };

  const addMessage = (msg) => {
    const aiName = config.theme === 'Meta' ? 'Meta AI' : config.theme === 'Thermofisher' ? 'Thermo Fisher AI' : 'Agivant AI';
    setMessages(prev => {
      // Prevent any duplicate dealHistorySummary messages for the same account
      if (msg.type === 'dealHistorySummary') {
        const alreadyExists = prev.some(
          m => m.type === 'dealHistorySummary' && m.accountName === msg.accountName
        );
        if (alreadyExists) return prev;
      }
      return [...prev, { id: Date.now(), role: 'assistant', aiName, ...msg }];
    });
  };

  const handleSuggestionClick = (text) => {
    setInputValue(text);
    handleSend(null, text);
  };

  const handleSend = async (e, overrideText = null) => {
    e?.preventDefault();
    const text = overrideText || inputValue.trim();
    if (!text || workflowState === 'orchestrating' || workflowState === 'executing') return;

    const detectAccountName = (inputStr) => {
      const s = inputStr.toLowerCase();
      if (s.includes('edge') || s.includes('communications')) return 'Edge Communications';
      if (s.includes('aurobindo') || s.includes('pharma')) return 'Aurobindo Pharma R&D';
      if (s.includes('pyramid') || s.includes('construction')) return 'Pyramid Construction Inc.';
      if (s.includes('pfizer')) return 'Pfizer';
      if (s.includes('moderna')) return 'Moderna';
      if (s.includes('novartis')) return 'Novartis';
      if (s.includes('roche')) return 'Roche';
      if (s.includes('merck')) return 'Merck';
      if (s.includes('genentech')) return 'Genentech';
      if (s.includes('biogen')) return 'Biogen';
      if (s.includes('gilead')) return 'Gilead';
      return null;
    };

    // Support dynamic preview/summary commands
    const cmd = text.toLowerCase();

    // Set deal history filter based on command
    if (cmd.includes('drafted quote') || cmd.includes('draft quote')) {
      setDealHistoryFilter('Draft');
    } else if (cmd.includes('accepted quote')) {
      setDealHistoryFilter('Accepted');
    } else if (cmd.includes('rejected quote')) {
      setDealHistoryFilter('Rejected');
    } else if (cmd.includes('deal history') || cmd.includes('all quote')) {
      setDealHistoryFilter('All');
    }

    if (cmd.includes('different account') || cmd.includes('list my accounts') || cmd.includes('list accounts')) {
      setDealHistoryData(null);
      setOrchestration(prev => {
        const n = { ...prev };
        if (n.Quote_Architect) {
          n.Quote_Architect = {
            ...n.Quote_Architect,
            tools: []
          };
        }
        return n;
      });
    }

    let isStatusFilterRequest = cmd.includes('drafted quote') || cmd.includes('draft quote') || cmd.includes('accepted quote') || cmd.includes('rejected quote') || cmd.includes('all quote') || cmd.includes('all quotes') || cmd.includes('view quote');

    // Deal history intent – intercept before WebSocket ONLY for explicit deal history requests
    let isWinRateRequest = (cmd.includes('win rate') || cmd.includes('win percentage') || cmd.includes('win probability') || cmd.includes('success rate') || cmd.includes('winning chance') || cmd.includes('quote analysis') || cmd.includes('analyze quote')) && !cmd.includes('preview') && !cmd.includes('overview');
    
    // If we're already in a win rate context, keep it alive for follow-up answers, quote numbers, or account selections, unless they ask for a filter or updating/modifying quotes, or requesting quote preview/overview
    const isQuoteUpdateKeyword = cmd.includes('update') || cmd.includes('modify') || cmd.includes('change') || cmd.includes('add') || cmd.includes('delete') || cmd.includes('remove') || cmd.includes('discount');
    if (!isWinRateRequest && !isStatusFilterRequest && !isQuoteUpdateKeyword && isWinRateRequestRef.current && !cmd.includes('preview') && !cmd.includes('overview')) {
      isWinRateRequest = true;
    }
    isWinRateRequestRef.current = isWinRateRequest;

    // A win rate request is an ACCOUNT win rate request ONLY if they explicitly mention account win rate
    const isExplicitAccountWinRate = cmd.includes('account win rate') || 
                                     cmd.includes('win rate of the account') || 
                                     cmd.includes('win rate of this account') || 
                                     cmd.includes('account\'s win rate') || 
                                     cmd.includes('account win');
    
    let isQuoteWinRateRequest = isWinRateRequest && !isExplicitAccountWinRate;
    isQuoteWinRateRequestRef.current = isQuoteWinRateRequest;

    const isSummarizeOrPrioritize = !isWinRateRequest && (cmd.includes('summarize') || cmd.includes('summarise') || cmd.includes('prioritize') || cmd.includes('prioritise') || cmd.includes('which deal'));
    isSummarizeRequestRef.current = isSummarizeOrPrioritize;
    let isDealHistoryRequest = !isSummarizeOrPrioritize && !isWinRateRequest && (
      isStatusFilterRequest || 
      cmd.includes('deal history') || 
      cmd.includes('previous quotes') || 
      cmd.includes('historical quotes') || 
      cmd.includes('detailed view of') ||
      cmd.includes('view all deals') ||
      cmd.includes('get all deals') ||
      cmd.includes('show all deals') ||
      cmd.includes('view all quotes') ||
      cmd.includes('get all quotes') ||
      cmd.includes('show all quotes') ||
      cmd.includes('deal history of')
    );

    // If we're already in a deal history context, keep it alive for follow-up account selection, filters, or resetting account
    if (!isDealHistoryRequest && !isSummarizeOrPrioritize && !isWinRateRequest && isDealHistoryRequestRef.current && (
      detectAccountName(text) || 
      cmd.includes('yes') || 
      cmd.includes('all') || 
      cmd.includes('list') || 
      cmd.includes('show') || 
      cmd.includes('current') ||
      cmd.includes('different') ||
      cmd.includes('account')
    )) {
      isDealHistoryRequest = true;
    }

    if (!isDealHistoryRequest && !isSummarizeOrPrioritize && !isWinRateRequest) {
      setDealHistoryData(null);
    }
    setWorkspaceView('graph'); // Auto redirect to orchestration flow (graph) for all requests initially
    isDealHistoryRequestRef.current = isDealHistoryRequest;

    // Update global account tracker if any account is mentioned
    const newlyDetectedAcc = detectAccountName(text);
    if (newlyDetectedAcc) {
      setDealHistoryAccount(newlyDetectedAcc);
    }

    // Lazy load deal history for win rate request if not loaded yet or if the account changed
    if (isWinRateRequest && (!dealHistoryData || dealHistoryData.length === 0 || (detectAccountName(text) && detectAccountName(text) !== dealHistoryAccount))) {
      const detectedAcc = detectAccountName(text) || dealHistoryAccount;
      if (detectedAcc) {
        setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: text, type: 'text' }]);
        setInputValue('');
        setDealHistoryAccount(detectedAcc);
        setDealHistoryLoading(true);
        dealHistoryLoadingRef.current = true;
        try {
          const resp = await fetch(`${config.API_BASE_URL}/api/deal-history?account_name=${encodeURIComponent(detectedAcc)}`);
        const data = await resp.json();
        if (data.status === 'success') {
          setDealHistoryData(data.quotes);
          const quotesText = data.quotes.map(q => {
            const items = (q.lineItems || []).map(li => `${li.name} (Qty: ${li.quantity}, Price: $${li.totalPrice || li.unitPrice})`).join(', ');
            return `Quote: ${q.quoteNumber || q.id}, Name: ${q.name}, Status: ${q.status}, Amount: $${q.grandTotal}, Discount: ${q.discount}%, Opportunity: ${q.opportunityName || '—'}, Line Items: [${items}]`;
          }).join('\n');

          sendPayload(JSON.stringify({
            text: text + `\n\n[Historical Quotes in context:\n${quotesText}]`,
            module: selectedModule?.id || 'sales'
          }));
        } else {
          sendPayload(JSON.stringify({
            text: text,
            module: selectedModule?.id || 'sales'
          }));
        }
      } catch (err) {
        console.error("Error lazy-loading deal history for win rate:", err);
        sendPayload(JSON.stringify({
          text: text,
          module: selectedModule?.id || 'sales'
        }));
      } finally {
        setDealHistoryLoading(false);
        dealHistoryLoadingRef.current = false;
      }
      return;
      }
    }

    if (isWinRateRequest) {
      setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: text, type: 'text' }]);
      setInputValue('');
      setDealHistoryLoading(true);
      dealHistoryLoadingRef.current = true;
      const quotesText = (dealHistoryData || []).map(q => {
        const items = (q.lineItems || []).map(li => `${li.name} (Qty: ${li.quantity}, Price: $${li.totalPrice || li.unitPrice})`).join(', ');
        return `Quote: ${q.quoteNumber || q.id}, Name: ${q.name}, Status: ${q.status}, Amount: $${q.grandTotal}, Discount: ${q.discount}%, Opportunity: ${q.opportunityName || '—'}, Line Items: [${items}]`;
      }).join('\n');

      sendPayload(JSON.stringify({
        text: text + (quotesText ? `\n\n[Historical Quotes in context:\n${quotesText}]` : ''),
        module: selectedModule?.id || 'sales'
      }));
      return;
    }

    // Lazy load deal history for summarization/prioritization if not loaded yet or if the account changed
    if (isSummarizeOrPrioritize && (!dealHistoryData || dealHistoryData.length === 0 || (detectAccountName(text) && detectAccountName(text) !== dealHistoryAccount))) {
      const detectedAcc = detectAccountName(text) || dealHistoryAccount;
      if (detectedAcc) {
        setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: text, type: 'text' }]);
        setInputValue('');
        setDealHistoryAccount(detectedAcc);
        setDealHistoryLoading(true);
        dealHistoryLoadingRef.current = true;
        try {
          const resp = await fetch(`${config.API_BASE_URL}/api/deal-history?account_name=${encodeURIComponent(detectedAcc)}`);
        const data = await resp.json();
        if (data.status === 'success') {
          setDealHistoryData(data.quotes);
          const quotesText = data.quotes.map(q => {
            const items = (q.lineItems || []).map(li => `${li.name} (Qty: ${li.quantity}, Price: $${li.totalPrice || li.unitPrice})`).join(', ');
            return `Quote: ${q.quoteNumber || q.id}, Name: ${q.name}, Status: ${q.status}, Amount: $${q.grandTotal}, Discount: ${q.discount}%, Opportunity: ${q.opportunityName || '—'}, Line Items: [${items}]`;
          }).join('\n');

          sendPayload(JSON.stringify({
            text: text + `\n\n[Historical Quotes in context:\n${quotesText}]`,
            module: selectedModule?.id || 'sales'
          }));
        } else {
          sendPayload(JSON.stringify({
            text: text,
            module: selectedModule?.id || 'sales'
          }));
        }
      } catch (err) {
        console.error("Error lazy-loading deal history:", err);
        sendPayload(JSON.stringify({
          text: text,
          module: selectedModule?.id || 'sales'
        }));
      } finally {
        setDealHistoryLoading(false);
        dealHistoryLoadingRef.current = false;
      }
      return;
      }
    }

    if (isDealHistoryRequest) {
      setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: text, type: 'text' }]);
      setInputValue('');
      
      const detectedAcc = detectAccountName(text) || dealHistoryAccount;
      setDealHistoryAccount(detectedAcc);
      setDealHistoryLoading(true);
      dealHistoryLoadingRef.current = true;
      try {
        const resp = await fetch(`${config.API_BASE_URL}/api/deal-history?account_name=${encodeURIComponent(detectedAcc)}`);
        const data = await resp.json();
        if (data.status === 'success') {
          setDealHistoryData(data.quotes);
          const quotesText = data.quotes.map(q => {
            const items = (q.lineItems || []).map(li => `${li.name} (Qty: ${li.quantity}, Price: $${li.totalPrice || li.unitPrice})`).join(', ');
            return `Quote: ${q.quoteNumber || q.id}, Name: ${q.name}, Status: ${q.status}, Amount: $${q.grandTotal}, Discount: ${q.discount}%, Opportunity: ${q.opportunityName || '—'}, Line Items: [${items}]`;
          }).join('\n');
          
          ws.current?.send(JSON.stringify({
            text: text + `\n\n[Historical Quotes in context:\n${quotesText}]`,
            module: selectedModule?.id || 'sales'
          }));
        } else {
          setDealHistoryData([]);
          ws.current?.send(JSON.stringify({ text: text, module: selectedModule?.id || 'sales' }));
        }
      } catch (err) {
        console.error("Error fetching deal history proactively:", err);
        setDealHistoryData([]);
        ws.current?.send(JSON.stringify({ text: text, module: selectedModule?.id || 'sales' }));
      } finally {
        setDealHistoryLoading(false);
        dealHistoryLoadingRef.current = false;
      }
      return;
    }

    // Support dynamic preview/summary/overview commands
    const isPreviewCmd = !isSummarizeOrPrioritize && (cmd.includes('preview') || cmd.includes('overview') || cmd.includes('summary')) && (cmd.includes('quote') || cmd.split(' ').length <= 4);
    if (isPreviewCmd) {
      let quoteIdToPreview = null;
      
      // Check if user explicitly provided an ID or Number
      const explicitNumMatch = text.match(/\b\d{8}\b/);
      const explicitIdMatch = text.match(/\b0Q0[a-zA-Z0-9]{12,15}\b/);
      
      if (explicitIdMatch) {
        quoteIdToPreview = explicitIdMatch[0];
      } else if (explicitNumMatch) {
        const foundQuote = (dealHistoryData || []).find(q => q.quoteNumber === explicitNumMatch[0]) || (quotes || []).find(q => q.quoteNumber === explicitNumMatch[0]);
        if (foundQuote) quoteIdToPreview = foundQuote.id;
      }

      if (!quoteIdToPreview) {
        const latestFromState = quotes[quotes.length - 1]?.id;
        if (latestFromState && latestFromState !== 'Generated') {
          quoteIdToPreview = latestFromState;
        } else {
          // Fallback: search messages for a quote ID pattern (0Q0...)
          const allContent = messages.map(m => m.content).join(' ');
          const match = allContent.match(/0Q0[a-zA-Z0-9]{12,15}/);
          if (match) quoteIdToPreview = match[0];
        }
      }

      if (quoteIdToPreview) {
        setMessages(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, role: 'user', content: text, type: 'text' }]);
        handlePreview(quoteIdToPreview);
        setInputValue('');
        return;
      }
    }


    let finalMessage = text;
    if (isSummarizeOrPrioritize) {
      if (dealHistoryData && dealHistoryData.length > 0) {
        const quotesText = dealHistoryData.map(q => {
          const items = (q.lineItems || []).map(li => `${li.name} (Qty: ${li.quantity}, Price: $${li.totalPrice || li.unitPrice})`).join(', ');
          return `Quote: ${q.quoteNumber || q.id}, Name: ${q.name}, Status: ${q.status}, Amount: $${q.grandTotal}, Discount: ${q.discount}%, Opportunity: ${q.opportunityName || '—'}, Line Items: [${items}]`;
        }).join('\n');
        finalMessage += `\n\n[Historical Quotes in context:\n${quotesText}]`;
      }
    }

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

    setMessages(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, role: 'user', content: text, type: 'text' }]);
    setInputValue('');
    sendPayload(JSON.stringify({
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

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const resp = await fetch(`${config.API_BASE_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await resp.json();

      if (data.status === 'success') {
        // Clear old selections, configs, and orchestration graph
        setSelectedProducts(new Set());
        setProductConfigs({});
        setBulkQty('');
        setBulkDiscount('');
        setOrchestration(prev => {
          const n = { ...prev };
          for (const k of ['Catalog_Scout', 'Quote_Architect', 'Quote_Updator', 'Quote_Analyst', 'Twin_Hunter']) {
            n[k] = { state: 'idle', tools: [], routedByDm: false };
          }
          return n;
        });

        // Immediately notify the user in the UI
        setMessages(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, role: 'user', content: `${(translations[language?.toLowerCase()] || translations['en']).documentUploaded}: ${data.filename}`, type: 'text' }]);

        // FIX: Must enter orchestrating state before sending — otherwise the
        // frontend state machine desyncs and FINAL_REPLY renders nothing.
        setWorkflowState('orchestrating');

        // Ensure the orchestration flow is visible
        setWorkspaceView('graph');

        // Send the extracted text (already truncated server-side) to the agent
        sendPayload(JSON.stringify({
          text: data.user_message,
          module: selectedModule?.id || 'sales'
        }));
      } else {
        addMessage({ type: 'text', content: `Error uploading file: ${data.message}` });
      }
    } catch (err) {
      console.error('Upload error:', err);
      addMessage({ type: 'text', content: `Error uploading file: ${err.message}` });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
        setLookalikeData(null);
        setDealHistoryData(null);
        isWinRateRequestRef.current = false;
        isSummarizeRequestRef.current = false;
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

  const handleDealHistory = async (accountName = '', switchView = true) => {
    // Guard: prevent concurrent/duplicate calls
    if (dealHistoryLoadingRef.current) return;
    dealHistoryLoadingRef.current = true;
    setDealHistoryAccount(accountName);
    setDealHistoryLoading(true);
    if (switchView) {
      setWorkspaceView('preview');
    }
    try {
      const resp = await fetch(`${config.API_BASE_URL}/api/deal-history?account_name=${encodeURIComponent(accountName)}`);
      const data = await resp.json();
      if (data.status === 'success') {
        setDealHistoryData(data.quotes);
        // Inject AI message about the results — addMessage guards against duplicates
        const count = data.quoteCount || data.quotes?.length || 0;
        addMessage({
          type: 'dealHistorySummary',
          content: `Pulled up ${count} historical quote${count !== 1 ? 's' : ''} for ${data.accountName}. Each has been fetched with full line item detail — you can view the breakdown on the left or ask me to summarize the patterns across all of them.`,
          accountName: data.accountName,
          quoteCount: count,
        });
      } else {
        addMessage({ type: 'text', content: `❌ Could not fetch deal history: ${data.message}` });
      }
    } catch (err) {
      console.error(err);
      addMessage({ type: 'text', content: '❌ Failed to fetch deal history. Please try again.' });
    } finally {
      setDealHistoryLoading(false);
      dealHistoryLoadingRef.current = false;
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
    setMessages(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, role: 'user', content: text, type: 'text' }]);
    sendPayload(text);

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
                {config.theme === 'Meta' ? `Meta ${(translations[language?.toLowerCase()] || translations['en']).workspace}` : config.theme === 'Thermofisher' ? `Thermo Fisher ${(translations[language?.toLowerCase()] || translations['en']).workspace}` : 'Quoting Accelerator'}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-black/5 p-1 rounded-xl border border-black/5">
              <button
                onClick={() => setWorkspaceView('graph')}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${workspaceView === 'graph' ? 'bg-white shadow-sm text-indigo-500' : 'text-slate-500 hover:text-indigo-400'}`}
              >
                {(translations[language?.toLowerCase()] || translations['en']).orchestrationFlow || 'Orchestration Flow'}
              </button>
              <button
                onClick={() => {
                  setWorkspaceView('preview');
                  if (quotes && quotes.length > 0) {
                    handlePreview(quotes[quotes.length - 1].id);
                  }
                }}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${workspaceView === 'preview' ? 'bg-white shadow-sm text-indigo-500' : 'text-slate-500 hover:text-indigo-400'}`}
              >
                {(translations[language?.toLowerCase()] || translations['en']).recordPreview || 'Record Preview'}
              </button>
            </div>
            <LanguageToggle language={language} setLanguage={setLanguage} isDark={isDark} />
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden flex flex-col items-center justify-center">
          {workspaceView === 'graph' && (
            <div ref={graphContainerRef} className="w-full h-full relative overflow-hidden flex items-center justify-center">
              <div className="absolute top-4 right-4 z-50 flex flex-col gap-2">
                <button
                  onClick={() => setZoomLevel(z => Math.min(1.5, z + 0.1))}
                  className={`p-2 rounded-lg transition-colors backdrop-blur-md border ${isDark
                    ? 'bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border-white/10'
                    : 'bg-black/5 hover:bg-black/10 text-slate-500 hover:text-black border-black/10'
                    }`}
                  title="Zoom In"
                >
                  <ZoomIn size={16} />
                </button>
                <button
                  onClick={() => setZoomLevel(z => Math.max(0.4, z - 0.1))}
                  className={`p-2 rounded-lg transition-colors backdrop-blur-md border ${isDark
                    ? 'bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border-white/10'
                    : 'bg-black/5 hover:bg-black/10 text-slate-500 hover:text-black border-black/10'
                    }`}
                  title="Zoom Out"
                >
                  <ZoomOut size={16} />
                </button>
              </div>
              <div style={{ transform: `scale(${zoomLevel})`, transition: 'transform 0.3s ease-out' }} className="origin-center">
                <AgentGraph orchestration={orchestration} graphActive={true} graphReady={true} isDark={isDark} t={translations[language?.toLowerCase()] || translations['en']} />
              </div>
            </div>
          )}
          {workspaceView === 'preview' && (
            (isWinRateRequestRef.current || isSummarizeRequestRef.current || dealHistoryLoading || (dealHistoryData && isDealHistoryRequestRef.current)) ? (
              <div className="w-full h-full bg-slate-50 overflow-hidden">
                {isWinRateRequestRef.current ? (
                  <WinRateBattleCard
                    data={dealHistoryData}
                    accountName={dealHistoryAccount}
                    isLoading={dealHistoryLoading}
                    isQuoteMode={isQuoteWinRateRequestRef.current}
                    messages={messages}
                    previewData={previewData}
                    selectedProducts={selectedProducts}
                  />
                ) : (
                  <DealHistoryPanel
                    data={dealHistoryData ? dealHistoryData.filter(q => dealHistoryFilter === 'All' || (q.status && q.status.toLowerCase() === dealHistoryFilter.toLowerCase())) : null}
                    accountName={dealHistoryAccount}
                    isLoading={dealHistoryLoading}
                    filter={dealHistoryFilter}
                  />
                )}
              </div>
            ) : (
            <div className="w-full h-full p-8 overflow-y-auto custom-scrollbar">
              {lookalikeData ? (
                <LookalikeCards
                  variant="workspace"
                  cards={lookalikeData.cards || []}
                  summary={lookalikeData.summary || ''}
                  sourceAccount={lookalikeData.source_account}
                  limitations={lookalikeData.limitations || []}
                />
              ) : previewData ? (
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
            )
          )}
        </div>
      </section>

      {/* RIGHT SIDEBAR — AGENT INTELLIGENCE */}
      {/* RESIZER HANDLE */}
      <div
        onMouseDown={startResizingRight}
        className={`w-6 cursor-col-resize h-full bg-transparent flex items-center justify-center relative z-[60] group/resizer -mx-3`}
      >
        <div className={`w-[2px] h-32 rounded-full bg-slate-200 dark:bg-white/5 transition-all group-hover/resizer:bg-indigo-500/50 group-hover/resizer:w-1 group-hover/resizer:h-48 ${isResizingRight ? '!bg-indigo-500 shadow-[0_0_20px_#6366f1] !w-1 !h-full' : ''}`} />
        <div className="absolute flex flex-col gap-1.5 opacity-0 group-hover/resizer:opacity-100 transition-opacity">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="w-1 h-1 rounded-full bg-indigo-500/60" />
          ))}
        </div>
      </div>

      <section className="af-sidebar" style={{ width: rightWidth }}>
        <div className="af-sidebar-header">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-lg ${(config.theme === 'Meta' || config.theme === 'Thermofisher') ? 'bg-white' : 'bg-indigo-500 shadow-indigo-500/20'}`}>
              {config.theme === 'Meta' ? (
                <img src={config.META_LOGO_URL} alt="Meta" className="h-4 object-contain" />
              ) : config.theme === 'Thermofisher' ? (
                <img src={config.THERMOFISHER_LOGO_URL} alt="Thermo Fisher" className="h-3 object-contain" />
              ) : (
              <img src={config.AGIVANT_LOGO_URL} alt="Agivant" className="h-4 object-contain invert" />
            )}
          </div>
          <div className="flex flex-col">
            <h3 className="text-xs font-black uppercase tracking-tighter">
              {config.theme === 'Meta' ? `Meta ${(translations[language?.toLowerCase()] || translations['en']).salesAssistant || 'Assistant'}` : config.theme === 'Thermofisher' ? `Thermo Fisher ${(translations[language?.toLowerCase()] || translations['en']).salesAssistant || 'Sales Assistant'}` : 'Quoting Accelerator'}
            </h3>
            <span className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest">{(translations[language?.toLowerCase()] || translations['en']).activeThinking || 'Active & Thinking'}</span>
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
              {msg.type === 'dealHistorySummary' ? (
                <div className="w-full animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-1.5 mb-2 mt-1">
                    <Sparkles size={9} className="text-indigo-500" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-indigo-500">Solution Advisor</span>
                  </div>
                  <div className="af-bubble mb-3">{msg.isGreeting ? (translations[language?.toLowerCase()] || translations['en']).greeting.replace('{name}', config.theme === 'Meta' ? 'Meta' : config.theme === 'Thermofisher' ? 'Thermo Fisher Sales' : 'Quoting Accelerator') : msg.content}</div>
                  <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-2">Quick Replies</div>
                  <div className="flex flex-col gap-2">
                    {[
                      { label: 'Summarize all quotes', text: `Summarize all quotes for ${msg.accountName}` },
                      { label: 'Which deal should I prioritize?', text: `Which deal should I prioritize for ${msg.accountName}?` },
                    ].map((qr, qi) => (
                      <button
                        key={qi}
                        onClick={() => handleSend(null, qr.text)}
                        className="flex items-center justify-between w-full px-4 py-2.5 rounded-xl border border-indigo-500/20 bg-indigo-500/5 text-[11px] font-bold text-indigo-600 hover:bg-indigo-500/15 transition-all text-left"
                      >
                        {qr.label}
                        <ArrowRight size={12} className="text-indigo-400 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="af-bubble">
                    {msg.content
                      .replace(/<EXPLAIN>[\s\S]*?<\/EXPLAIN>/gi, '')
                      .replace(/<PLAYBOOK>[\s\S]*?<\/PLAYBOOK>/gi, '')
                      .replace(/<RISKS>[\s\S]*?<\/RISKS>/gi, '')
                      .replace(/<STRENGTHS>[\s\S]*?<\/STRENGTHS>/gi, '')
                      .replace(/<MATH>[\s\S]*?<\/MATH>/gi, '')
                      .replace(/^Header:\s*/i, '')
                      .trim()}
                  </div>
                </>
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
                      const text = opt.name;
                      setInputValue(text);
                      handleSend();
                    }}
                  />
                </div>
              )}

              {msg.type === 'card' && msg.cardType === 'upload' && (
                <div className="af-card animate-in fade-in slide-in-from-bottom-2">
                  <div className="p-6 bg-indigo-500/[0.03] border border-indigo-500/20 rounded-[1.5rem] shadow-xl shadow-indigo-500/5">
                    <div className="flex items-center gap-4 mb-5">
                      <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <FileText size={20} className="text-white" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-indigo-600">{(translations[language?.toLowerCase()] || translations['en']).uploadCard.title}</span>
                        <span className="text-[10px] font-medium text-slate-500">{(translations[language?.toLowerCase()] || translations['en']).uploadCard.subtitle}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="w-full flex items-center justify-center gap-3 py-4 bg-indigo-600 text-white rounded-xl text-[12px] font-bold hover:bg-indigo-500 hover:shadow-2xl hover:shadow-indigo-500/40 active:scale-[0.98] transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                    >
                      {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
                      {(translations[language?.toLowerCase()] || translations['en']).uploadCard.buttonText}
                    </button>
                  </div>
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

              {msg.actions && msg.actions.length > 0 && (
                <div className="suggested-actions-container">
                  <div className="suggested-actions-header">
                    <span className="suggested-actions-title">Recommended Actions</span>
                    <div className="suggested-actions-line" />
                  </div>
                  <div className="suggested-actions-grid">
                    {msg.actions.map((act, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSend(null, act)}
                        className="suggested-action-btn"
                      >
                        {getActionIcon(act)}
                        <span className="truncate">{act}</span>
                      </button>
                    ))}
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

          {workflowState === 'orchestrating' && <TypingIndicator text={(translations[language?.toLowerCase()] || translations['en']).nodes?.composing?.replace('…', '') || 'COMPOSING'} />}

          <div ref={chatEndRef} />
        </div>

        <div className="af-input-area">
          <form onSubmit={handleSend} className="relative group flex items-center gap-2">
            <div className="absolute inset-0 bg-indigo-500/10 blur-xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity" />
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept=".pdf,.docx,.txt,.xlsx,.xls"
            />

            <div className="relative flex-1">
              <input
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                placeholder={(translations[language?.toLowerCase()] || translations['en']).chatInputPlaceholder.replace('{name}', config.theme === 'Meta' ? 'Meta Assistant' : config.theme === 'Thermofisher' ? 'Thermo Fisher AI' : 'Quoting Accelerator')}
                className="w-full bg-black/20 border border-white/5 rounded-2xl py-4 px-6 text-sm outline-none focus:border-indigo-500/50 transition-all relative z-10"
              />
              <button className="absolute right-4 top-1/2 -translate-y-1/2 z-20 text-indigo-500 hover:scale-110 transition-transform">
                <Send size={20} />
              </button>
            </div>
          </form>
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
