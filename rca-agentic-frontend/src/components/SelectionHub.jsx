import React from 'react';
import { Settings, CheckCircle2, Database, ArrowRight, Bot, Sparkles, ChevronRight } from 'lucide-react';

const modules = [
  {
    id: 'cpq',
    title: 'CPQ Orchestrator',
    desc: 'Precision pricing configuration with real-time logic verification and autonomous deal optimization.',
    icon: Settings,
    accent: '#6366f1',
    badge: 'Advanced',
    gradient: 'from-indigo-500/10 via-indigo-500/5 to-transparent',
  },
  {
    id: 'rca',
    title: 'RCA Agentic Flow',
    desc: 'LLM-driven root cause analysis that automatically surfaces and resolves deal-blocking inconsistencies.',
    icon: CheckCircle2,
    accent: '#10b981',
    badge: 'Core',
    gradient: 'from-emerald-500/10 via-emerald-500/5 to-transparent',
  },
  {
    id: 'oracle',
    title: 'Oracle ERP Bridge',
    desc: 'Seamless bi-directional synchronization between Salesforce CPQ and Oracle Cloud ERP at enterprise scale.',
    icon: Database,
    accent: '#f59e0b',
    badge: 'Enterprise',
    gradient: 'from-amber-500/10 via-amber-500/5 to-transparent',
  },
];

const stats = [
  { value: '10×', label: 'Faster Quoting' },
  { value: '99.4%', label: 'Data Accuracy' },
  { value: '< 2s', label: 'Agent Response' },
];

const SelectionHub = ({ onSelect }) => (
  <div className="h-screen w-full overflow-hidden flex flex-col bg-[var(--site-bg)] text-[var(--text-main)] transition-colors duration-500 relative">

    {/* ─── Gradient mesh ─── */}
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-indigo-500/10 dark:bg-indigo-500/6 blur-[120px]" />
      <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-emerald-500/8 dark:bg-emerald-500/5 blur-[100px]" />
    </div>

    <div className="relative z-10 flex flex-col h-full px-10 lg:px-20 py-6 lg:py-8 max-w-[1600px] mx-auto w-full">

      {/* ─── Top bar ─── */}
      <nav className="flex items-center justify-between mb-8">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <span className="text-white font-black text-xs tracking-tight">AG</span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-black text-[var(--text-main)] leading-none tracking-tight">Agivant</span>
            <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-[0.2em] mt-0.5">Agentic AI Platform</span>
          </div>
        </div>

        {/* Stats bar */}
        <div className="hidden md:flex items-center gap-px rounded-2xl overflow-hidden border border-[var(--glass-border)] bg-[var(--card-bg)] backdrop-blur-xl shadow-sm">
          {stats.map((s, i) => (
            <div key={i} className="flex flex-col items-center px-6 py-2.5 gap-0">
              <span className="text-sm font-black text-indigo-500 leading-none">{s.value}</span>
              <span className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Tag */}
        <div className="hidden lg:flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/8 border border-indigo-500/15 text-indigo-600 dark:text-indigo-400">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-widest">Intelligence Portal</span>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <div className="mb-8">
        {/* Agentic badge */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-indigo-500/10 to-emerald-500/10 border border-indigo-500/15 text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
            <Bot size={12} />
            Autonomous Agentic AI · Salesforce-Native
          </div>
        </div>

        {/* Headline + sub */}
        <div className="flex items-end justify-between gap-8">
          <div>
            <h1 className="text-4xl lg:text-[52px] font-black leading-[1.1] tracking-tight text-[var(--text-main)] mb-3">
              What would you like to<br />
              <span className="bg-gradient-to-r from-indigo-500 via-indigo-400 to-emerald-500 bg-clip-text text-transparent">build today?</span>
            </h1>
            <p className="text-[var(--text-muted)] text-sm lg:text-base max-w-xl leading-relaxed">
              Agivant's Agentic AI engines autonomously configure, validate, and synchronize your revenue stack — with zero manual intervention.
            </p>
          </div>
          {/* Decorative agentic node graphic */}
          <div className="hidden xl:flex items-center gap-3 opacity-60 dark:opacity-40 flex-shrink-0">
            {['#6366f1','#10b981','#f59e0b'].map((c, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-2xl border-2 flex items-center justify-center" style={{ borderColor: c + '55', background: c + '11' }}>
                  <Sparkles size={16} style={{ color: c }} />
                </div>
                {i < 2 && (
                  <div className="flex items-center gap-1">
                    <div className="w-8 h-px" style={{ background: `linear-gradient(90deg, ${c}55, #6366f155)` }} />
                    <ChevronRight size={10} className="text-slate-400" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Module Cards ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 flex-1 max-h-[320px]">
        {modules.map((m, i) => (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className={`group relative text-left rounded-[28px] border border-[var(--glass-border)] bg-[var(--card-bg)] backdrop-blur-xl overflow-hidden p-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl focus:outline-none`}
            style={{
              animation: `float-up 0.55s ease-out ${i * 80}ms both`,
              boxShadow: `0 4px 24px ${m.accent}08`,
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = `0 20px 60px ${m.accent}22`}
            onMouseLeave={e => e.currentTarget.style.boxShadow = `0 4px 24px ${m.accent}08`}
          >
            {/* Gradient wash on hover */}
            <div className={`absolute inset-0 bg-gradient-to-br ${m.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-[28px]`} />

            {/* Top accent line */}
            <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-0 group-hover:opacity-30 transition-opacity duration-300" style={{ color: m.accent }} />

            <div className="relative z-10">
              {/* Icon + badge */}
              <div className="flex items-start justify-between mb-5">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                  style={{ background: m.accent + '15', border: `1.5px solid ${m.accent}30` }}>
                  <m.icon size={22} style={{ color: m.accent }} />
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-[var(--glass-border)] text-[var(--text-muted)]">{m.badge}</span>
              </div>

              {/* Text */}
              <h3 className="text-lg font-black text-[var(--text-main)] mb-2 tracking-tight transition-colors group-hover:text-[var(--text-main)]">{m.title}</h3>
              <p className="text-[12px] text-[var(--text-muted)] leading-relaxed mb-4">{m.desc}</p>

              {/* CTA */}
              <div className="flex items-center gap-2 font-black text-[11px] uppercase tracking-widest transition-colors duration-200" style={{ color: m.accent }}>
                Connect Module
                <div className="w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200 group-hover:translate-x-1"
                  style={{ background: m.accent + '15' }}>
                  <ArrowRight size={12} />
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* ─── Footer ─── */}
      <footer className="mt-6 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--text-muted)] opacity-50">
          © 2026 Agivant Technologies · All rights reserved
        </p>
        <a href="https://www.agivant.com" target="_blank" rel="noopener noreferrer"
          className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-indigo-500 transition-colors">
          agivant.com ↗
        </a>
      </footer>
    </div>
  </div>
);

export default SelectionHub;
