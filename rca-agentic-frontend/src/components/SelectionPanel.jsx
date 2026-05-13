import React from 'react';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { config } from '../config';

const SelectionPanel = ({ panel, confirmedAccount, onSelect, scrollRef }) => {
  if (!panel) return null;
  const isOpp = panel.type === 'opportunity';
  const metaColors = {
    account: '#0064E0',
    opportunity: '#31A24C'
  };
  const accentColor = config.theme === 'Meta' 
    ? (isOpp ? metaColors.opportunity : metaColors.account)
    : (isOpp ? '#fbbf24' : '#818cf8');
  return (
    <div className="overflow-hidden p-4" style={{ animation: 'panel-in 0.28s ease' }}>
      {/* Confirmed account badge (shows above opportunity list) */}
      {isOpp && confirmedAccount && (
        <div className="flex items-center gap-2 mb-3 px-3 py-1.5 rounded-2xl w-fit bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.1)]">
          <CheckCircle2 size={10} className="text-emerald-500 shrink-0" />
          <span className="text-[9px] font-black tracking-widest text-emerald-600 uppercase">
            {confirmedAccount}
          </span>
        </div>
      )}

      {/* Section header — matches "Products Found" style */}
      <div className="flex items-center gap-3 mb-3">
        <div style={{ width: 4, height: 12, borderRadius: 99, background: accentColor, flexShrink: 0 }} />
        <div className="text-[8.5px] font-black uppercase tracking-[0.3em]"
          style={{ color: 'var(--text-muted)' }}
        >
          {isOpp ? 'Select Opportunity' : 'Select Account'}
        </div>
      </div>

      {/* Cards — Single Column for full names */}
      <div ref={scrollRef} className="space-y-2 max-h-[420px] overflow-y-auto pr-1.5 custom-scrollbar">
        {panel.options.length === 0 && (
          <div className="text-[10px] text-slate-600 px-1 py-4 text-center opacity-50 font-black uppercase tracking-widest">No records found</div>
        )}
        {panel.options.map(opt => (
          <div
            key={opt.id}
            onClick={() => onSelect(opt, panel.type)}
            title={opt.name}
            className="flex items-center justify-between p-3 bg-white/[0.03] border border-white/5 rounded-2xl cursor-pointer transition-all select-none hover:bg-white/[0.08] active:scale-[0.99] group relative overflow-hidden"
          >
            <div className="flex items-center gap-4 min-w-0">
              <div
                className="w-1.5 h-1.5 rounded-full shadow-[0_0_8px_currentColor]"
                style={{ background: accentColor, color: accentColor }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-bold text-[var(--text-main)] leading-tight uppercase tracking-tight group-hover:text-indigo-500 transition-colors whitespace-normal">{opt.name}</div>
                {opt.detail && opt.detail !== '—' && (
                  <div className="mt-1.5 inline-block px-1.5 py-0.5 rounded-md bg-white/5 border border-white/5 text-[7px] font-black uppercase tracking-widest opacity-60"
                    style={{ color: accentColor }}
                  >{opt.detail}</div>
                )}
              </div>
            </div>
            <div className="opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0 ml-4">
              <ArrowRight size={14} style={{ color: accentColor }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SelectionPanel;
