import React from 'react';
import { Globe } from 'lucide-react';

const LanguageToggle = ({ language, setLanguage, isDark }) => {
  return (
    <div className="relative group z-50">
      <button className={`flex items-center gap-2 p-2 rounded-xl transition-all shadow-sm border ${
        isDark 
          ? 'bg-white/5 border-white/10 hover:bg-white/10' 
          : 'bg-black/5 border-black/10 hover:bg-black/10'
      }`}>
        <Globe size={16} className="text-indigo-500" />
        <span className={`text-[10px] font-black tracking-widest ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>
          {language.toUpperCase()}
        </span>
      </button>
      <div className={`absolute right-0 top-full mt-2 w-32 rounded-xl shadow-xl border overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 ${isDark ? 'bg-slate-800 border-white/10' : 'bg-white border-slate-200'}`}>
        {[
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'zh', label: '中文' }
].map(lang => (
          <button 
            key={lang.code} 
            onClick={() => setLanguage(lang.code)} 
            className={`w-full text-left px-4 py-2.5 text-[11px] font-bold transition-colors ${
              language === lang.code 
                ? (isDark ? 'text-indigo-400 bg-indigo-500/10' : 'text-indigo-600 bg-indigo-50') 
                : (isDark ? 'text-slate-300 hover:bg-white/5' : 'text-slate-600 hover:bg-slate-50')
            }`}
          >
            {lang.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default LanguageToggle;
