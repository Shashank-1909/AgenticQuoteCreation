import React from 'react';
import { 
  LayoutGrid, 
  Network, 
  FileText, 
  Package, 
  ShieldCheck, 
  Settings as SettingsIcon,
  LogOut
} from 'lucide-react';
import { config } from '../config';

const Sidebar = ({ activeTab, onTabChange }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
    { id: 'opportunities', label: 'Opportunities', icon: Network },
    { id: 'quotes', label: 'Quotes', icon: FileText },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'approvals', label: 'Approvals', icon: ShieldCheck },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  return (
    <aside className="w-72 h-screen sticky top-0 flex flex-col bg-[var(--card-bg)] border-r border-[var(--glass-border)] transition-all duration-500 z-50">
      <div className="p-8 pb-12 flex items-center gap-4">
        {config.theme === 'Meta' ? (
          <>
            <img src={config.META_LOGO_URL} alt="Meta" className="h-10 object-contain" />
            <div className="h-6 w-[1px] bg-slate-200 mx-1" />
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-main)]">CPQ</h2>
          </>
        ) : (
          <>
            <img src={config.AGIVANT_LOGO_URL} alt="Agivant" className="h-10 object-contain" />
            <div className="h-6 w-[1px] bg-slate-200 mx-1" />
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-main)]">CPQ</h2>
          </>
        )}
      </div>

      <nav className="flex-1 px-4 space-y-2">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all group ${
              activeTab === item.id 
                ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-500/20' 
                : 'text-[var(--text-muted)] hover:bg-indigo-500/5 hover:text-indigo-500'
            }`}
          >
            <item.icon size={20} className={activeTab === item.id ? 'text-white' : 'group-hover:scale-110 transition-transform'} />
            <span className="text-[13px] font-bold tracking-wide">{item.label}</span>
            {activeTab === item.id && (
              <div className="ml-auto w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            )}
          </button>
        ))}
      </nav>

      <div className="p-8 border-t border-[var(--glass-border)]">
        <button className="flex items-center gap-4 px-6 py-4 w-full text-[var(--text-muted)] hover:text-rose-500 transition-colors">
          <LogOut size={20} />
          <span className="text-[13px] font-bold">Logout Session</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
