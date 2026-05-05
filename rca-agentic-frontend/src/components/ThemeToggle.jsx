import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

const ThemeToggle = ({ isDark, setIsDark, className }) => {
  return (
    <button
      onClick={() => setIsDark(!isDark)}
      className={className || "fixed top-6 right-6 z-[100] p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl text-slate-400 hover:text-white transition-all shadow-lg active:scale-95 group"}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      {isDark ? (
        <Sun size={20} className="group-hover:rotate-45 transition-transform text-amber-500" />
      ) : (
        <Moon size={20} className="group-hover:-rotate-12 transition-transform text-indigo-500" />
      )}
    </button>
  );
};

export default ThemeToggle;
