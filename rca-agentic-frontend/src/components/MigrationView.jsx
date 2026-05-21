import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Send, Loader2, Zap, Settings, ArrowLeft, BrainCircuit, 
  CheckCircle2, Package, TrendingUp, Sparkles, Database,
  Eye, ExternalLink, Search, LayoutDashboard, FileText,
  ZoomIn, ZoomOut, Sun, Moon, ArrowRightLeft
} from 'lucide-react';
import { config } from '../config';
import TypingIndicator from './TypingIndicator';
import './AgentforceView.css';

const MigrationView = ({ onBack, selectedModule, isDark = false, setIsDark }) => {
  const [rightWidth, setRightWidth] = useState(500);
  const [isResizingRight, setIsResizingRight] = useState(false);
  const [messages, setMessages] = useState([
    { 
      id: 1, 
      role: 'assistant', 
      aiName: config.theme === 'Meta' ? 'Meta AI' : 'Migration Assistant',
      content: `Hello! I'm your Migration Assistant for ${selectedModule?.title || 'Salesforce'}. I can help you analyze CPQ price rules and product rules, and migrate them to RCA. How can I help you today?`,
      type: 'text'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [workspaceView, setWorkspaceView] = useState('rules'); // rules, mapping
  
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startResizingRight = useCallback((e) => {
    e.preventDefault();
    setIsResizingRight(true);
  }, []);

  const stopResizingRight = useCallback(() => {
    setIsResizingRight(false);
  }, []);

  const resizeRight = useCallback((e) => {
    if (isResizingRight) {
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 350 && newWidth < 800) {
        setRightWidth(newWidth);
      }
    }
  }, [isResizingRight]);

  useEffect(() => {
    if (isResizingRight) {
      window.addEventListener('mousemove', resizeRight);
      window.addEventListener('mouseup', stopResizingRight);
    } else {
      window.removeEventListener('mousemove', resizeRight);
      window.removeEventListener('mouseup', stopResizingRight);
    }
    return () => {
      window.removeEventListener('mousemove', resizeRight);
      window.removeEventListener('mouseup', stopResizingRight);
    };
  }, [isResizingRight, resizeRight, stopResizingRight]);

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!inputValue.trim()) return;

    const userMsg = { 
      id: Date.now(), 
      role: 'user', 
      content: inputValue,
      type: 'text'
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    
    // Simulate thinking and responding for the mock UI
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        aiName: config.theme === 'Meta' ? 'Meta AI' : 'Migration Assistant',
        content: `I've received your request: "${userMsg.content}". Since this is a placeholder UI, I don't have backend connectivity for migration yet.`,
        type: 'text'
      }]);
    }, 1500);
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
                {config.theme === 'Meta' ? 'Meta Workspace' : 'Migration Accelerator'}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsDark(!isDark)}
              className={`p-2 rounded-xl transition-all shadow-sm border ${
                isDark 
                  ? 'bg-white/5 border-white/10 text-amber-500 hover:bg-white/10' 
                  : 'bg-black/5 border-black/10 text-indigo-500 hover:bg-black/10'
              }`}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            <div className="flex items-center gap-1 bg-black/5 p-1 rounded-xl border border-black/5">
              <button 
                onClick={() => setWorkspaceView('rules')}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${workspaceView === 'rules' ? 'bg-white shadow-sm text-indigo-500' : 'text-slate-500 hover:text-indigo-400'}`}
              >
                Rules Explorer
              </button>
              <button 
                onClick={() => setWorkspaceView('mapping')}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${workspaceView === 'mapping' ? 'bg-white shadow-sm text-indigo-500' : 'text-slate-500 hover:text-indigo-400'}`}
              >
                Data Mapping
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden flex flex-col items-center justify-center">
          <div className="text-center opacity-50">
            <ArrowRightLeft size={48} className="mx-auto mb-4 text-indigo-500" />
            <p className="text-sm font-bold uppercase tracking-widest text-slate-500">
              {workspaceView === 'rules' ? 'Select rules to migrate' : 'Configure data mapping'}
            </p>
          </div>
        </div>
      </section>

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
           <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-lg ${config.theme === 'Meta' ? 'bg-white' : 'bg-indigo-500 shadow-indigo-500/20'}`}>
              {config.theme === 'Meta' ? (
                <img src={config.META_LOGO_URL} alt="Meta" className="h-4 object-contain" />
              ) : (
                <img src={config.AGIVANT_LOGO_URL} alt="Agivant" className="h-4 object-contain invert" />
              )}
           </div>
           <div className="flex flex-col">
              <h3 className="text-xs font-black uppercase tracking-tighter">
                {config.theme === 'Meta' ? 'Meta Assistant' : 'Migration Accelerator'}
              </h3>
              <span className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest">Active</span>
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
                    {msg.aiName || (config.theme === 'Meta' ? 'Meta AI' : 'Migration Assistant')}
                  </span>
                </div>
              )}
              <div className="af-bubble">
                {msg.content}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="af-input-area">
          <form onSubmit={handleSend} className="relative group">
             <div className="absolute inset-0 bg-indigo-500/10 blur-xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity" />
             <input 
              type="text" 
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder={config.theme === 'Meta' ? 'Ask Meta Assistant...' : 'Ask Migration Assistant...'}
              className="w-full bg-black/20 border border-white/5 rounded-2xl py-4 px-6 text-sm outline-none focus:border-indigo-500/50 transition-all relative z-10"
             />
             <button className="absolute right-4 top-1/2 -translate-y-1/2 z-20 text-indigo-500 hover:scale-110 transition-transform">
                <Send size={20} />
             </button>
          </form>
        </div>
      </section>
    </div>
  );
};

export default MigrationView;
