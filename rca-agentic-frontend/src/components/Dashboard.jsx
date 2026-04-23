import React, { useState } from 'react';
import Sidebar from './Sidebar';
import { 
  FileText, 
  TrendingUp, 
  Settings, 
  Network, 
  Zap, 
  LayoutGrid,
  History,
  Activity,
  ArrowUpRight,
  Package,
  ShieldCheck,
  ArrowRight
} from 'lucide-react';

const Dashboard = ({ onLaunchChat, onEditQuote }) => {
  const [activeTab, setActiveTab] = useState('dashboard');

  const stats = [
    { label: 'Total Pipeline Value', value: '$4.28M', trend: '+14.2%', icon: TrendingUp, color: 'text-emerald-500' },
    { label: 'Open Quote Volume', value: '38', trend: '+8.4%', icon: FileText, color: 'text-indigo-500' },
    { label: 'Quote Aging (Avg Days)', value: '4.2', trend: '-1.8%', icon: Zap, color: 'text-amber-500' },
    { label: 'Revenue Integrity', value: '94.2%', trend: 'Stable', icon: Activity, color: 'text-cyan-500' },
  ];

  const renderDashboard = () => (
    <section className="space-y-12 animate-in fade-in duration-700">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {stats.map((stat, i) => (
          <div key={i} className="bg-[var(--card-bg)] border border-[var(--glass-border)] backdrop-blur-xl p-8 rounded-[40px] group hover:border-indigo-500/30 transition-all shadow-sm">
            <div className="flex justify-between items-start mb-6">
              <div className={`p-4 rounded-2xl bg-slate-50 dark:bg-white/5 ${stat.color} group-hover:scale-110 transition-transform duration-500`}>
                <stat.icon size={20} />
              </div>
              <span className={`text-[10px] font-black tracking-tight px-2.5 py-1 rounded-lg ${stat.trend.startsWith('+') ? 'bg-emerald-500/10 text-emerald-600' : stat.trend === 'Stable' ? 'bg-cyan-500/10 text-cyan-600' : 'bg-rose-500/10 text-rose-600'}`}>
                {stat.trend}
              </span>
            </div>
            <p className="text-[var(--text-muted)] text-[10px] font-black uppercase tracking-widest">{stat.label}</p>
            <h3 className="text-3xl font-bold text-[var(--text-main)] mt-2 transition-colors">{stat.value}</h3>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
        <div className="xl:col-span-2 space-y-6">
           <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-[0.3em] text-[var(--text-muted)] flex items-center gap-2">
              <FileText size={18} className="text-indigo-500" /> Recently Added Quotes
            </h2>
          </div>
          <div className="bg-[var(--card-bg)] border border-[var(--glass-border)] rounded-[48px] overflow-hidden backdrop-blur-md shadow-xl transition-all">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/5 text-[10px] font-black uppercase text-slate-400">
                  <th className="px-8 py-5">Quote ID</th>
                  <th className="px-8 py-5">Opportunity</th>
                  <th className="px-8 py-5 text-center">Status</th>
                  <th className="px-8 py-5 text-right">Created Date</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { id: 'Q-9210', opp: 'Quantum Tech Expansion', status: 'DRAFT', date: '2026-04-22' },
                  { id: 'Q-9188', opp: 'Neon Dynamics Core', status: 'SENT', date: '2026-04-21' },
                  { id: 'Q-9150', opp: 'Aether Logistics Hub', status: 'APPROVED', date: '2026-04-20' },
                  { id: 'Q-9142', opp: 'Stellar Systems Inc', status: 'DRAFT', date: '2026-04-20' }
                ].map((row, i) => (
                  <tr key={i} className="border-b border-[var(--glass-border)] hover:bg-white/5 transition-colors group">
                    <td className="px-8 py-5 font-mono font-bold text-indigo-500">{row.id}</td>
                    <td className="px-8 py-5 font-bold text-[var(--text-main)]">{row.opp}</td>
                    <td className="px-8 py-5 text-center">
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black tracking-widest ${
                        row.status === 'SENT' ? 'bg-amber-500/10 text-amber-500' : 
                        row.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-500' : 
                        'bg-slate-500/10 text-slate-400'
                      }`}>{row.status}</span>
                    </td>
                    <td className="px-8 py-5 text-right font-medium text-[var(--text-muted)]">{row.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-sm font-black uppercase tracking-[0.3em] text-[var(--text-muted)] flex items-center gap-2">
            <History size={18} className="text-emerald-500" /> Recent Actions
          </h2>
          <div className="space-y-4">
            {[
              { id: 'Q-2025', opp: 'CloudX Enterprise', val: '$442k', status: 'Draft' },
              { id: 'Q-2018', opp: 'Managed Svc', val: '$120k', status: 'Approved' },
              { id: 'Q-1992', opp: 'Helix Platform', val: '$85k', status: 'Synced' },
            ].map((q, i) => (
              <div key={i} className="bg-[var(--card-bg)] border border-[var(--glass-border)] p-8 rounded-[40px] group hover:border-indigo-500/30 transition-all shadow-sm">
                <div className="flex justify-between items-start mb-6">
                  <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">{q.id}</span>
                  <button onClick={() => onEditQuote(q.id)} className="p-2.5 bg-slate-50 dark:bg-white/5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-500/10 rounded-2xl transition-all">
                    <ArrowUpRight size={16} />
                  </button>
                </div>
                <h4 className="text-lg font-bold text-[var(--text-main)] group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors mb-4">{q.opp}</h4>
                <div className="flex justify-between items-center text-xl font-mono font-black text-indigo-500">{q.val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );

  const renderOpportunities = () => (
    <section className="space-y-12 animate-in slide-in-from-right duration-500">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-[0.3em] text-[var(--text-muted)] flex items-center gap-2">
          <Network size={18} className="text-indigo-500" /> All Active Opportunities
        </h2>
        <button className="text-[10px] font-black uppercase text-indigo-500 tracking-widest hover:text-indigo-600 transition-colors">Global Export</button>
      </div>
      <div className="bg-[var(--card-bg)] border border-[var(--glass-border)] rounded-[48px] overflow-hidden backdrop-blur-md shadow-xl transition-all">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100 dark:border-white/5 text-[10px] font-black uppercase text-slate-400">
              <th className="px-10 py-8">Opportunity Name</th>
              <th className="px-10 py-8">Account Name</th>
              <th className="px-10 py-8 text-center">Amount</th>
              <th className="px-10 py-8 text-right">Close Date</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: 'RioVerde Expansion', account: 'RioVerde Manufacturing', amount: '$450,000', date: '2026-12-12' },
              { name: 'Sakura Robotics Core', account: 'Sakura Robotics Co.', amount: '$1.2M', date: '2026-11-20' },
              { name: 'BluePeak Financial', account: 'BluePeak plc', amount: '$85,000', date: '2026-10-05' },
              { name: 'AtlasLogix Logistics', account: 'AtlasLogix LLC', amount: '$50,437', date: '2026-09-15' },
              { name: 'Quantum Cloud Hub', account: 'Quantum Tech', amount: '$220,000', date: '2026-08-30' }
            ].map((row, i) => (
              <tr key={i} className="border-b border-[var(--glass-border)] hover:bg-white/5 transition-colors group">
                <td className="px-10 py-8 font-bold text-[var(--text-main)] group-hover:text-indigo-600 transition-colors">{row.name}</td>
                <td className="px-10 py-8 text-[var(--text-muted)] font-medium">{row.account}</td>
                <td className="px-10 py-8 text-center font-mono text-emerald-500 font-bold">{row.amount}</td>
                <td className="px-10 py-8 text-right font-medium text-[var(--text-muted)]">{row.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderQuotes = () => (
    <section className="space-y-12 animate-in slide-in-from-right duration-500">
       <div className="flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-[0.3em] text-[var(--text-muted)] flex items-center gap-2">
          <FileText size={18} className="text-indigo-500" /> Enterprise Quote Ledger
        </h2>
      </div>
      <div className="bg-[var(--card-bg)] border border-[var(--glass-border)] rounded-[48px] overflow-hidden backdrop-blur-md shadow-xl transition-all">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100 dark:border-white/5 text-[10px] font-black uppercase text-slate-400">
              <th className="px-10 py-8">Quote #</th>
              <th className="px-10 py-8">Opportunity</th>
              <th className="px-10 py-8">Total Value</th>
              <th className="px-10 py-8 text-center">Status</th>
              <th className="px-10 py-8 text-right">Owner</th>
            </tr>
          </thead>
          <tbody>
            {[
              { id: 'Q-2025', opp: 'CloudX Enterprise', val: '$442,000', status: 'DRAFT', owner: 'Indra Gane' },
              { id: 'Q-2018', opp: 'Managed Services', val: '$120,500', status: 'APPROVED', owner: 'Brenna W.' },
              { id: 'Q-1992', opp: 'Helix Platform', val: '$85,000', status: 'SYNCED', owner: 'Fenton M.' },
              { id: 'Q-1980', opp: 'Legacy Core', val: '$33,000', status: 'EXPIRED', owner: 'Deepa A.' }
            ].map((row, i) => (
              <tr key={i} className="border-b border-[var(--glass-border)] hover:bg-white/5 transition-colors group">
                <td className="px-10 py-8 font-mono font-bold text-indigo-500">{row.id}</td>
                <td className="px-10 py-8 font-bold text-[var(--text-main)]">{row.opp}</td>
                <td className="px-10 py-8 font-mono font-black text-slate-900 dark:text-white">{row.val}</td>
                <td className="px-10 py-8 text-center text-[9px] font-black tracking-widest">{row.status}</td>
                <td className="px-10 py-8 text-right font-medium text-[var(--text-muted)]">{row.owner}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderPlaceholder = (title, icon) => (
    <section className="h-[600px] flex flex-col items-center justify-center space-y-6 animate-in slide-in-from-right duration-500">
       <div className="w-24 h-24 rounded-[32px] bg-indigo-500/10 flex items-center justify-center">
          {React.createElement(icon, { size: 40, className: "text-indigo-500" })}
       </div>
       <h1 className="text-3xl font-black text-[var(--text-main)] uppercase tracking-[0.2em]">{title}</h1>
       <p className="text-slate-400 font-medium text-center max-w-md">The agentic environment for {title.toLowerCase()} is being initialized. Real-time Salesforce synchronization will appear here.</p>
    </section>
  );

  return (
    <div className="flex bg-[var(--site-bg)] min-h-screen">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      
      <div className="flex-1 transition-colors duration-500 overflow-x-hidden relative">
        <div className="mesh-bg opacity-20 dark:opacity-40 pointer-events-none">
          <div className="mesh-circle-1" />
          <div className="mesh-circle-2" />
        </div>

        <main className="w-full max-w-7xl mx-auto p-8 lg:p-16 relative z-10">
          <header className="flex items-center justify-between mb-16">
            <div className="flex items-center gap-6">
              <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/20">
                <LayoutGrid className="text-white" size={24} />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-[var(--text-main)] transition-colors">Deal Intelligence</h1>
                <p className="text-sm text-[var(--text-muted)] font-medium">Monitoring Salesforce Instance: <span className="text-indigo-500 font-bold">Production-01</span></p>
              </div>
            </div>
            <div className="flex items-center gap-6">
               {/* <div className="hidden md:flex items-center gap-6 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> Live Feed</span>
                  <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" /> SF Sync</span>
               </div> */}
               <div className="w-10 h-10 bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-slate-200 dark:border-white/10" />
            </div>
          </header>

          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'opportunities' && renderOpportunities()}
          {activeTab === 'quotes' && renderQuotes()}
          {activeTab === 'products' && renderPlaceholder('Products', Package)}
          {activeTab === 'approvals' && renderPlaceholder('Approvals', ShieldCheck)}
          {activeTab === 'settings' && renderPlaceholder('Settings', Settings)}

          <footer className="mt-24 pt-10 border-t border-slate-200 dark:border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-300 dark:text-white/10">Enterprise Intelligence Nexus</p>
            <div className="flex gap-10 text-[10px] font-black uppercase tracking-widest text-slate-400">
               <span className="hover:text-indigo-500 cursor-help transition-colors">Documentation</span>
               <span className="hover:text-indigo-500 cursor-help transition-colors">System Logs</span>
               <span className="hover:text-indigo-500 cursor-help transition-colors">API Keys</span>
            </div>
          </footer>
        </main>

        <div className="fixed bottom-12 right-12 z-50">
          <button
            onClick={onLaunchChat}
            className="group relative h-14 px-8 flex items-center gap-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl transition-all hover:scale-110 active:scale-95"
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-2xl opacity-20 blur-xl group-hover:opacity-40 transition-opacity" />
            <div className="relative flex items-center gap-4">
              <Zap size={18} className="text-indigo-500 fill-indigo-500 animate-pulse" />
              <span>Neural Orchestrator</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
