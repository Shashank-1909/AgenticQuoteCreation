import React from 'react';
import { Settings, CheckCircle2, Database, ArrowRight, Bot, Sparkles, ChevronRight, Sun, Moon } from 'lucide-react';
import LanguageToggle from './LanguageToggle';
import { config } from '../config';
import { translations } from '../translations';

const modules = [
  {
    id: 'cpq',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/f/f9/Salesforce.com_logo.svg',
    accent: config.theme === 'Meta' ? '#0064E0' : config.theme === 'Thermofisher' ? '#EE3124' : '#6366f1',
    gradient: config.theme === 'Meta' ? 'from-blue-700/10 via-blue-700/5 to-transparent' : config.theme === 'Thermofisher' ? 'from-[#EE3124]/10 via-[#EE3124]/5 to-transparent' : 'from-indigo-500/10 via-indigo-500/5 to-transparent',
  },
  {
    id: 'rca',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/f/f9/Salesforce.com_logo.svg',
    accent: config.theme === 'Meta' ? '#31A24C' : config.theme === 'Thermofisher' ? '#B71234' : '#10b981',
    gradient: config.theme === 'Meta' ? 'from-green-600/10 via-green-600/5 to-transparent' : config.theme === 'Thermofisher' ? 'from-[#B71234]/10 via-[#B71234]/5 to-transparent' : 'from-emerald-500/10 via-emerald-500/5 to-transparent',
  },
  {
    id: 'oracle',
    logo: 'https://www.vectorlogo.zone/logos/oracle/oracle-icon.svg',
    accent: config.theme === 'Meta' ? '#F7B928' : config.theme === 'Thermofisher' ? '#B71234' : '#f59e0b',
    gradient: config.theme === 'Meta' ? 'from-yellow-600/10 via-yellow-600/5 to-transparent' : config.theme === 'Thermofisher' ? 'from-[#B71234]/10 via-[#B71234]/5 to-transparent' : 'from-amber-500/10 via-amber-500/5 to-transparent',
  },
];

const SelectionHub = ({ onSelect, isDark, setIsDark, language, setLanguage }) => {
  const t = translations[language] || translations['en'];
  const stats = [
    { value: '10×', label: (t && t.stats && t.stats.accounts) || 'Accounts' },
    { value: '+10%', label: (t && t.stats && t.stats.opportunities) || 'Opportunities' },
    { value: '95%', label: (t && t.stats && t.stats.quotes) || 'Quotes' },
  ];
  
  const isThermofisher = config.theme === 'Thermofisher';
  const isMeta = config.theme === 'Meta';
  return (
  <div className={`h-screen w-full overflow-hidden flex flex-col bg-[var(--site-bg)] text-[var(--text-main)] transition-colors duration-500 relative ${config.theme === 'Meta' ? 'meta-theme' : ''}`}>

    {/* ─── Gradient mesh ─── */}
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      <div className={`absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full ${isThermofisher ? 'bg-[#EE3124]/10 dark:bg-[#EE3124]/6' : isMeta ? 'bg-blue-500/10 dark:bg-blue-500/6' : 'bg-indigo-500/10 dark:bg-indigo-500/6'} blur-[120px]`} />
      <div className={`absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full ${isThermofisher ? 'bg-[#B71234]/8 dark:bg-[#B71234]/5' : isMeta ? 'bg-green-500/8 dark:bg-green-500/5' : 'bg-emerald-500/8 dark:bg-emerald-500/5'} blur-[100px]`} />
    </div>

    <div className="relative z-10 flex flex-col h-full overflow-y-auto px-10 lg:px-20 py-6 lg:py-8 max-w-[1600px] mx-auto w-full">

      {/* ─── Top bar ─── */}
      <nav className="flex items-center justify-between mb-8">
        {/* Brand */}
        <div className="flex items-center gap-3">
          {config.theme === 'Meta' ? (
            <>
              <img src={config.META_LOGO_URL} alt="Meta" className="h-7 object-contain" />
              <div className="h-5 w-[1px] bg-slate-200 dark:bg-white/10 mx-2" />
              <div className="flex flex-col">
                <span className="text-[8.5px] font-bold text-[var(--text-muted)] uppercase tracking-[0.2em]">Meta AI Platform</span>
              </div>
            </>
          ) : config.theme === 'Thermofisher' ? (
            <>
              <img src={config.THERMOFISHER_LOGO_URL} alt="Thermo Fisher Scientific" className="h-7 object-contain" />
              <div className="h-5 w-[1px] bg-slate-200 dark:bg-white/10 mx-2" />
              <div className="flex flex-col">
                <span className="text-[8.5px] font-bold text-[var(--text-muted)] uppercase tracking-[0.2em]">{config.THERMOFISHER_TAGLINE}</span>
              </div>
            </>
          ) : (
            <>
              <img src={config.AGIVANT_LOGO_URL} alt="Agivant" className="h-7 object-contain" />
              <div className="h-5 w-[1px] bg-slate-200 dark:bg-white/10 mx-2" />
            </>
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-4">
          {/* Stats bar */}
          <div className="hidden md:flex items-center gap-px rounded-xl overflow-hidden border border-[var(--glass-border)] bg-[var(--card-bg)] backdrop-blur-xl shadow-sm">
            {stats.map((s, i) => (
              <div key={i} className="flex flex-col items-center px-4 py-1.5 gap-0">
                <span className={`text-xs font-black leading-none ${isThermofisher ? 'text-[#EE3124]' : isMeta ? 'text-blue-500' : 'text-indigo-500'}`}>{s.value}</span>
                <span className="text-[8px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Tag */}
          <div className={`hidden lg:flex items-center gap-2 px-4 py-2 rounded-full border ${isThermofisher ? 'bg-[#EE3124]/8 border-[#EE3124]/15 text-[#EE3124]' : isMeta ? 'bg-blue-500/8 border-blue-500/15 text-blue-600 dark:text-blue-400' : 'bg-indigo-500/8 border-indigo-500/15 text-indigo-600 dark:text-indigo-400'}`}>
            <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isThermofisher ? 'bg-[#EE3124]' : isMeta ? 'bg-blue-500' : 'bg-indigo-500'}`} />
            <span className="text-[10px] font-black uppercase tracking-widest">Intelligence Portal</span>
          </div>

          {/* Dark Mode Toggle */}
          <button 
            onClick={() => setIsDark(!isDark)}
            className={`p-2 rounded-xl transition-all shadow-sm border ${
              isDark 
                ? 'bg-white/5 border-white/10 text-amber-500 hover:bg-white/10' 
                : `bg-black/5 border-black/10 hover:bg-black/10 ${isThermofisher ? 'text-[#EE3124]' : isMeta ? 'text-blue-500' : 'text-indigo-500'}`
            }`}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <LanguageToggle language={language} setLanguage={setLanguage} isDark={isDark} />
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <div className="mb-6">
        {/* Agentic badge */}
        <div className="flex items-center gap-2 mb-3">
          <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full border text-[8.5px] font-black uppercase tracking-widest ${isThermofisher ? 'bg-gradient-to-r from-[#EE3124]/10 to-[#B71234]/10 border-[#EE3124]/15 text-[#EE3124]' : isMeta ? 'bg-gradient-to-r from-blue-500/10 to-green-500/10 border-blue-500/15 text-blue-600 dark:text-blue-400' : 'bg-gradient-to-r from-indigo-500/10 to-emerald-500/10 border-indigo-500/15 text-indigo-600 dark:text-indigo-400'}`}>
            <Bot size={10} />
            Autonomous Agentic AI 
          </div>
        </div>

        {/* Headline + sub */}
        <div className="flex items-end justify-between gap-8">
          <div>
            <h1 className="text-2xl lg:text-[28px] font-black tracking-tight text-[var(--text-main)] leading-none mb-1">{t.dashboard.header}</h1>
            <h1 className="text-2xl lg:text-[38px] font-black leading-[1.1] tracking-tight text-[var(--text-main)] mb-2">
              {t.selectionHub.explore}<br />
              <span className={`bg-gradient-to-r bg-clip-text text-transparent ${isThermofisher ? 'from-[#EE3124] via-[#EE3124]/80 to-[#B71234]' : isMeta ? 'from-blue-500 via-blue-400 to-green-500' : 'from-indigo-500 via-indigo-400 to-emerald-500'}`}>{t.selectionHub.headline}</span>
            </h1>
            <p className="text-[var(--text-muted)] text-xs lg:text-[13px] max-w-lg leading-relaxed opacity-80">
              {t.selectionHub.tagline}
            </p>
          </div>
          {/* Decorative agentic node graphic */}
          <div className="hidden xl:flex items-center gap-3 opacity-60 dark:opacity-40 flex-shrink-0">
            {(isThermofisher ? ['#EE3124', '#B71234', '#000000'] : isMeta ? ['#0064E0', '#31A24C', '#F7B928'] : ['#6366f1','#10b981','#f59e0b']).map((c, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-2xl border-2 flex items-center justify-center" style={{ borderColor: c + '55', background: c + '11' }}>
                  <Sparkles size={16} style={{ color: c }} />
                </div>
                {i < 2 && (
                  <div className="flex items-center gap-1">
                    <div className="w-8 h-px" style={{ background: `linear-gradient(90deg, ${c}55, ${isThermofisher ? '#EE3124' : isMeta ? '#0064E0' : '#6366f1'}55)` }} />
                    <ChevronRight size={10} className="text-slate-400" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Module Cards ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
        {modules.map((m, i) => (
          <button
            key={m.id}
            onClick={() => onSelect(m)}
            className={`group relative text-left rounded-[28px] border border-[var(--glass-border)] bg-[var(--card-bg)] backdrop-blur-xl overflow-hidden p-8 py-7 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl focus:outline-none`}
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
              {/* Logo */}
              <div className="flex items-start justify-between mb-6">
                <div className="h-12 px-4 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-105"
                  style={{ background: m.accent + '08', border: `1px solid ${m.accent}20` }}>
                  <img src={m.logo} alt={m.id} className="h-6 w-auto object-contain" />
                </div>
              </div>

              {/* Text */}
              <h3 className="text-lg font-black text-[var(--text-main)] mb-5 tracking-tight transition-colors group-hover:text-[var(--text-main)]">{t?.modules?.[m.id] ?? m.id}</h3>

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
          © 2026 {config.theme === 'Meta' ? 'Meta Technologies' : config.theme === 'Thermofisher' ? 'Thermo Fisher Scientific Inc.' : 'Agivant Technologies'} · All rights reserved
        </p>
        <a href={config.theme === 'Meta' ? "https://www.meta.com" : config.theme === 'Thermofisher' ? "https://www.thermofisher.com" : "https://www.agivant.com"} target="_blank" rel="noopener noreferrer"
          className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-indigo-500 transition-colors">
          {config.theme === 'Meta' ? 'meta.com' : config.theme === 'Thermofisher' ? 'thermofisher.com' : 'agivant.com'} ↗
        </a>
      </footer>
    </div>
  </div>
);
};

export default SelectionHub;
