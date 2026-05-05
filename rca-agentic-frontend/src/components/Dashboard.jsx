import { Users, Network, FileText, ShieldCheck, TrendingUp, ArrowUpRight, Sparkles, ArrowLeft } from 'lucide-react';

const Dashboard = ({ onBack, onLaunchChat }) => {
  const stats = [
    { label: 'Accounts', value: '128', sub: '+12 this month', icon: Users, color: '#6366f1', gradient: 'from-indigo-500/10 via-indigo-500/5 to-transparent' },
    { label: 'Opportunities', value: '47', sub: '8 closing soon', icon: Network, color: '#0ea5e9', gradient: 'from-sky-500/10 via-sky-500/5 to-transparent' },
    { label: 'Quotes', value: '38', sub: '5 pending review', icon: FileText, color: '#10b981', gradient: 'from-emerald-500/10 via-emerald-500/5 to-transparent' },
    { label: 'Approvals', value: '14', sub: '3 need action', icon: ShieldCheck, color: '#f59e0b', gradient: 'from-amber-500/10 via-amber-500/5 to-transparent' },
  ];



  const quotes = [
    { id: 'Q-9210', opp: 'Quantum Tech Expansion', account: 'Quantum Tech Ltd', status: 'DRAFT', date: '2026-04-22' },
    { id: 'Q-9188', opp: 'Neon Dynamics Core', account: 'Neon Dynamics Inc', status: 'SENT', date: '2026-04-21' },
    { id: 'Q-9150', opp: 'Aether Logistics Hub', account: 'Aether Logistics', status: 'APPROVED', date: '2026-04-20' },
    { id: 'Q-9142', opp: 'Stellar Systems Launch', account: 'Stellar Systems Inc', status: 'DRAFT', date: '2026-04-19' },
    { id: 'Q-9130', opp: 'BluePeak Cloud Suite', account: 'BluePeak plc', status: 'SENT', date: '2026-04-18' },
    { id: 'Q-9102', opp: 'Global Freight Config', account: 'Atlas Logistics', status: 'EXPIRED', date: '2026-04-12' },
    { id: 'Q-9095', opp: 'Healthcare AI Core', account: 'MediTech Gen', status: 'DRAFT', date: '2026-04-10' },
  ];

  const statusStyle = (s) => ({
    DRAFT: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700',
    SENT: 'bg-amber-50  dark:bg-amber-500/10  text-amber-600  dark:text-amber-400 border border-amber-200 dark:border-amber-500/20',
    APPROVED: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20',
    EXPIRED: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20',
  }[s] || 'bg-slate-100 text-slate-400');

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-[var(--site-bg)] text-[var(--text-main)] transition-colors duration-500">

      {/* ─── Gradient mesh ─── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-indigo-500/8 dark:bg-indigo-500/5 blur-[120px]" />
        <div className="absolute -bottom-40 left-0 w-[600px] h-[600px] rounded-full bg-emerald-500/6 dark:bg-emerald-500/5 blur-[120px]" />
      </div>

      <div className="relative z-10 flex flex-col h-full px-8 lg:px-14 py-6 lg:py-8 max-w-[1600px] mx-auto w-full">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 -ml-2 rounded-full hover:bg-slate-500/10 dark:hover:bg-white/10 text-slate-500 hover:text-indigo-600 dark:hover:text-white transition-all mr-2"
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30 font-black text-white tracking-tight">
              AG
            </div>
            <div>
              <h1 className="text-2xl lg:text-[28px] font-black tracking-tight text-[var(--text-main)] leading-none mb-1">
                Deal Intelligence
              </h1>
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-muted)]">
                Salesforce Instance:
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Production-01
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 4 Stat Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className="group relative rounded-[24px] border border-[var(--glass-border)] bg-[var(--card-bg)] backdrop-blur-xl px-6 py-5 flex items-center gap-4 overflow-hidden transition-all duration-300 hover:-translate-y-1"
              style={{
                animation: `float-up 0.5s ease-out ${i * 60}ms both`,
                boxShadow: `0 4px 20px ${s.color}05`,
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = `0 12px 30px ${s.color}15`}
              onMouseLeave={e => e.currentTarget.style.boxShadow = `0 4px 20px ${s.color}05`}
            >
              {/* Wash overlay */}
              <div className={`absolute inset-0 bg-gradient-to-br ${s.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
              {/* Top border highlight */}
              <div className="absolute top-0 left-6 right-6 h-[1.5px] bg-gradient-to-r from-transparent via-current to-transparent opacity-0 group-hover:opacity-40 transition-opacity duration-300" style={{ color: s.color }} />

              <div className="relative z-10 flex items-center gap-4 w-full">
                <div className="w-12 h-12 rounded-[14px] flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110"
                  style={{ background: s.color + '15', border: `1.5px solid ${s.color}30` }}>
                  <s.icon size={22} style={{ color: s.color }} />
                </div>
                <div className="flex-1">
                  <div className="text-[26px] font-black tracking-tight leading-none text-[var(--text-main)]">{s.value}</div>
                  <div className="text-[11px] font-black text-[var(--text-muted)] uppercase tracking-widest mt-1 mb-0.5">{s.label}</div>
                  <div className="text-[10px] font-bold" style={{ color: s.color }}>{s.sub}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Recently Added Quotes Table ── */}
        <div className="flex-1 flex flex-col rounded-[24px] border border-[var(--glass-border)] bg-[var(--card-bg)] backdrop-blur-xl shadow-lg relative overflow-hidden" style={{ animation: 'float-up 0.5s ease-out 250ms both' }}>

          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-indigo-500/5 to-transparent pointer-events-none" />

          {/* Table Header */}
          <div className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-[var(--glass-border)]">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-indigo-500/10">
                <FileText size={16} className="text-indigo-500" />
              </div>
              <h2 className="text-[12px] font-black uppercase tracking-widest text-[var(--text-main)]">Recently Added Quotes</h2>
            </div>
            <button className="text-[10px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-600 transition-colors flex items-center gap-1.5 bg-indigo-500/5 px-3 py-1.5 rounded-lg hover:bg-indigo-500/10">
              View All <ArrowUpRight size={13} />
            </button>
          </div>

          {/* Table */}
          <div className="relative z-10 flex-1 overflow-auto scrollbar-hide">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-[var(--card-bg)]/90 backdrop-blur border-b border-[var(--glass-border)] z-20">
                <tr className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  <th className="px-8 py-4">Quote ID</th>
                  <th className="px-8 py-4">Opportunity</th>
                  <th className="px-8 py-4">Account</th>
                  <th className="px-8 py-4 text-center">Status</th>
                  <th className="px-8 py-4 text-right">Date</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((row, i) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--glass-border)]/50 hover:bg-[var(--glass-border)] transition-colors group cursor-pointer"
                  >
                    <td className="px-8 py-4">
                      <span className="font-mono font-bold text-indigo-500 dark:text-indigo-400 text-[12px] group-hover:text-indigo-600 transition-colors">
                        {row.id}
                      </span>
                    </td>
                    <td className="px-8 py-4 font-bold text-[var(--text-main)] text-[13px]">{row.opp}</td>
                    <td className="px-8 py-4 text-[var(--text-muted)] font-medium text-[12px]">{row.account}</td>
                    <td className="px-8 py-4 text-center">
                      <span className={`inline-block px-3 py-1 rounded-[6px] text-[9px] font-black uppercase tracking-widest shadow-sm ${statusStyle(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-8 py-4 text-right text-[var(--text-muted)] text-[12px] font-semibold">{row.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Floating Neural Orchestrator Button (fixed bottom-right) ── */}
      <button
        onClick={onLaunchChat}
        className="fixed bottom-8 right-10 group flex items-center gap-3 font-black text-[12px] uppercase tracking-widest text-indigo-600 dark:text-indigo-400 py-4 px-8 rounded-2xl bg-indigo-500/10 hover:bg-indigo-600 hover:text-white transition-all shadow-xl hover:shadow-indigo-500/30 overflow-hidden z-50 backdrop-blur-md border border-[var(--glass-border)] hover:border-transparent scale-100 hover:scale-105"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-sky-500 opacity-0 group-hover:opacity-100 transition-opacity" />
        <span className="relative z-10 flex items-center gap-2">
          <Sparkles size={16} className="group-hover:animate-pulse" />
          Neural Orchestrator
          <ArrowUpRight size={14} className="ml-1 opacity-50 group-hover:opacity-100 transition-opacity" />
        </span>
      </button>
    </div>
  );
};

export default Dashboard;
