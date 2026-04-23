import React from 'react';
import { Settings, CheckCircle2, Database, ArrowRight, LayoutGrid, Activity, History } from 'lucide-react';

const SelectionHub = ({ onSelect }) => {
  const modules = [
    { 
      id: 'cpq', 
      title: 'CPQ Orchestrator', 
      desc: 'Precision configuration and scalable pricing engine with real-time logic verification.', 
      icon: Settings, 
      color: 'text-indigo-500',
      badge: 'Advanced'
    },
    { 
      id: 'rca', 
      title: 'RCA Agentic Flow', 
      desc: 'Identify configuration errors and deal-blocking inconsistencies automatically.', 
      icon: CheckCircle2, 
      color: 'text-emerald-500',
      badge: 'Core'
    },
    { 
      id: 'oracle', 
      title: 'Oracle ERP Bridge', 
      desc: 'Universal data synchronization between Salesforce and Oracle Cloud infrastructures.', 
      icon: Database, 
      color: 'text-amber-500',
      badge: 'Enterprise'
    }
  ];

  return (
    <div className="min-h-screen w-full flex flex-col items-center overflow-x-hidden bg-[var(--site-bg)] text-[var(--text-main)] transition-colors duration-500">
      {/* Mesh Background */}
      <div className="mesh-bg opacity-30 dark:opacity-50">
        <div className="mesh-circle-1" />
        <div className="mesh-circle-2" />
      </div>

      {/* Main Content */}
      <main className="w-full max-w-7xl px-8 lg:px-20 py-16 lg:py-24 relative z-10">
        <header className="max-w-4xl mb-16 lg:mb-24 space-y-6">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl shadow-xl shadow-indigo-500/20 flex items-center justify-center mb-10">
            <LayoutGrid className="text-white" size={24} />
          </div>

          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-full text-[10px] font-black uppercase tracking-widest">
              Nexus Intelligence Portal
            </div>
            <h1 className="text-5xl lg:text-7xl font-bold tracking-tight text-blue-500 dark:text-blue-400 drop-shadow-2xl transition-colors duration-500">
              What would you like to <span className="text-blue-600 dark:text-blue-200">build today?</span>
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-lg lg:text-xl max-w-2xl leading-relaxed">
              Select a specialized intelligence engine to power your revenue operations. Each module is fully integrated with your Salesforce instance.
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-20">
          {modules.map((m, i) => (
            <div 
              key={m.id}
              onClick={() => onSelect(m.id)}
              className="group relative bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-white/5 rounded-[40px] p-8 lg:p-10 cursor-pointer transition-all hover:translate-y-[-10px] hover:shadow-2xl hover:shadow-indigo-500/10 hover:border-indigo-500/30 overflow-hidden"
              style={{ animation: 'float-up 0.6s ease-out both', animationDelay: `${i * 100}ms` }}
            >
              {/* Card Accent */}
              <div className={`absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity`} />
              
              <div className="flex justify-between items-start mb-10">
                <div className={`p-5 rounded-3xl bg-slate-50 dark:bg-white/5 ${m.color} group-hover:scale-110 transition-transform duration-500`}>
                  <m.icon size={32} />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 rounded-xl">{m.badge}</span>
              </div>

              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-4 transition-colors">{m.title}</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-10 min-h-[3rem] transition-colors">{m.desc}</p>

              <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400">
                <span className="text-xs font-black uppercase tracking-widest">Connect Module</span>
                <div className="p-2 rounded-full bg-indigo-500/10 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                  <ArrowRight size={20} className="group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <footer className="pt-20 border-t border-slate-200 dark:border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-300 dark:text-white/10">Enterprise AI Infrastructure</p>
          <div className="flex gap-8 text-[10px] font-black uppercase tracking-widest text-slate-400">
             <span className="hover:text-indigo-500 cursor-help transition-colors">Documentation</span>
             <span className="hover:text-indigo-500 cursor-help transition-colors">Support</span>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default SelectionHub;
