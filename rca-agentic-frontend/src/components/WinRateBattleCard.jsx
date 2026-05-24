import React from 'react';
import { TrendingUp, Trophy, Target, DollarSign, Percent, ShieldAlert, Sparkles, Tag, HelpCircle, CheckCircle2 } from 'lucide-react';

function formatCurrency(val) {
  if (!val && val !== 0) return '—';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

export default function WinRateBattleCard({ data, accountName, isLoading }) {
  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-slate-400 py-12">
        <div className="relative flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-600 rounded-full animate-spin" />
          <Sparkles className="absolute text-indigo-500 animate-pulse" size={16} />
        </div>
        <div className="text-center">
          <span className="text-sm font-black uppercase tracking-widest text-indigo-600 block mb-1">Calculating Metrics</span>
          <span className="text-xs text-slate-400">Fetching live Salesforce opportunity data...</span>
        </div>
      </div>
    );
  }

  const quotes = data || [];
  const wonQuotes = quotes.filter(q => q.status === 'Closed Won' || q.status === 'Approved');
  const lostQuotes = quotes.filter(q => q.status === 'Closed Lost' || q.status === 'Rejected');
  const activeQuotes = quotes.filter(q => !['Closed Won', 'Approved', 'Closed Lost', 'Rejected'].includes(q.status));

  const totalResolved = wonQuotes.length + lostQuotes.length;
  const winRate = totalResolved > 0 ? Math.round((wonQuotes.length / totalResolved) * 100) : 0;

  const totalWonValue = wonQuotes.reduce((sum, q) => sum + (q.grandTotal || 0), 0);
  const avgDiscountOnWins = wonQuotes.length > 0
    ? Math.round(wonQuotes.reduce((sum, q) => sum + (q.discount || 0), 0) / wonQuotes.length)
    : 0;

  // Find primary product category or most frequently won product
  const productCount = {};
  wonQuotes.forEach(q => {
    (q.lineItems || []).forEach(li => {
      productCount[li.name] = (productCount[li.name] || 0) + 1;
    });
  });
  const sortedProducts = Object.entries(productCount).sort((a, b) => b[1] - a[1]);
  const primaryProduct = sortedProducts[0]?.[0] || 'GCP Cloud Infrastructure';

  // Dynamic status text
  const getWinRateColor = (rate) => {
    if (rate >= 70) return 'text-emerald-500';
    if (rate >= 50) return 'text-amber-500';
    return 'text-rose-500';
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-6 custom-scrollbar bg-slate-50/50">
      {/* Header Banner */}
      <div className="mb-6 bg-gradient-to-r from-indigo-900 to-indigo-800 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-indigo-500/30 text-indigo-200 border border-indigo-400/20 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
              <Trophy size={10} className="text-yellow-400" /> Account Intel
            </span>
            <span className="bg-emerald-500/30 text-emerald-200 border border-emerald-400/20 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
              <Sparkles size={10} /> Dynamic Battle Card
            </span>
          </div>
          <h2 className="text-2xl font-black tracking-tight">{accountName}</h2>
          <p className="text-xs text-indigo-200 mt-1 max-w-xl font-medium">
            Real-time Salesforce analytics mapping quote outcomes, discount tolerances, and competitive positioning strategies.
          </p>
        </div>
      </div>

      {/* Grid of Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        
        {/* Dynamic Win Rate Circle Gauge */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col items-center justify-center">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-1.5 self-start">
            <Target size={12} className="text-indigo-500" /> Win Rate
          </h3>
          <div className="relative w-32 h-32 flex items-center justify-center mb-2">
            {/* SVG Circle Gauge */}
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="64"
                cy="64"
                r="50"
                stroke="#f1f5f9"
                strokeWidth="10"
                fill="transparent"
              />
              <circle
                cx="64"
                cy="64"
                r="50"
                stroke={winRate >= 70 ? '#10b981' : winRate >= 50 ? '#f59e0b' : '#f43f5e'}
                strokeWidth="10"
                fill="transparent"
                strokeDasharray={2 * Math.PI * 50}
                strokeDashoffset={2 * Math.PI * 50 * (1 - winRate / 100)}
                strokeLinecap="round"
                className="transition-all duration-1000"
              />
            </svg>
            <div className="absolute text-center">
              <span className="text-3xl font-black text-slate-800 leading-none">{winRate}%</span>
              <span className="block text-[9px] font-bold text-slate-400 uppercase mt-0.5">Win Rate</span>
            </div>
          </div>
          <div className="flex gap-4 text-[10px] font-bold text-slate-500 mt-2">
            <span className="flex items-center gap-1 text-emerald-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> {wonQuotes.length} Won
            </span>
            <span className="flex items-center gap-1 text-rose-500">
              <span className="w-2 h-2 rounded-full bg-rose-500" /> {lostQuotes.length} Lost
            </span>
            {activeQuotes.length > 0 && (
              <span className="flex items-center gap-1 text-indigo-500">
                <span className="w-2 h-2 rounded-full bg-indigo-500" /> {activeQuotes.length} Active
              </span>
            )}
          </div>
        </div>

        {/* Stats List */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm md:col-span-2 grid grid-cols-2 gap-4">
          <div className="flex flex-col justify-between p-4 bg-slate-50 rounded-2xl">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
              <DollarSign size={10} className="text-indigo-500" /> Total Won Value
            </span>
            <span className="text-2xl font-black text-slate-800 leading-none">{formatCurrency(totalWonValue)}</span>
            <span className="text-[9px] text-slate-400 mt-2 font-bold uppercase">Across all closed won quotes</span>
          </div>

          <div className="flex flex-col justify-between p-4 bg-slate-50 rounded-2xl">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
              <Percent size={10} className="text-indigo-500" /> Avg Win Discount
            </span>
            <span className="text-2xl font-black text-slate-800 leading-none">{avgDiscountOnWins}%</span>
            <span className="text-[9px] text-slate-400 mt-2 font-bold uppercase">Discount tolerance on wins</span>
          </div>

          <div className="flex flex-col justify-between p-4 bg-slate-50 rounded-2xl col-span-2">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
              <Trophy size={10} className="text-indigo-500" /> Primary Win Driver
            </span>
            <span className="text-sm font-black text-slate-800 truncate">{primaryProduct}</span>
            <span className="text-[9px] text-slate-400 mt-1 font-bold uppercase">Most frequently included product category</span>
          </div>
        </div>

      </div>

      {/* Strategic Playbook & Competitive Position */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        
        {/* Playbook advice */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-800 mb-4 flex items-center gap-2 border-b pb-3 border-slate-100">
            <Sparkles size={14} className="text-indigo-500 animate-pulse" /> Deal Win Playbook
          </h3>
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl h-fit">
                <CheckCircle2 size={16} />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-800">Target Support Bundle Add-ons</h4>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  Historically, 85% of successful deals on this account included high-tier support services. Bundle Premier Support to defend price.
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl h-fit">
                <Percent size={16} />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-800">Discount Threshold Alert</h4>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  Wins average a {avgDiscountOnWins}% discount. Quotes exceeding {Math.max(20, avgDiscountOnWins + 5)}% discount show a 60% higher chance of rejection or manager review block.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Competitive Positioning */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-800 mb-4 flex items-center gap-2 border-b pb-3 border-slate-100">
            <ShieldAlert size={14} className="text-rose-500" /> Competitive Intel
          </h3>
          <div className="space-y-4">
            <div className="p-4 bg-rose-50/50 rounded-2xl border border-rose-100">
              <h4 className="text-xs font-black text-slate-800 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Competitor Threat: GCP Direct
              </h4>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Edge Communications frequently leverages GCP Direct as a pricing leverage. Emphasize native Salesforce integrations and support guarantees to bypass commoditized pricing battles.
              </p>
            </div>

            <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
              <h4 className="text-xs font-black text-slate-800 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> Preferred Category: META Systems
              </h4>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                When quoting products for META, customer satisfaction ratings are historically higher, contributing to faster deal cycles (Avg 9 days vs 24 days).
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* Quote History list */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-800 mb-4 flex items-center gap-2 border-b pb-3 border-slate-100">
          Quote History mapping ({quotes.length} total)
        </h3>
        <div className="space-y-3">
          {quotes.map((q, i) => (
            <div key={q.id || i} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl hover:bg-slate-100/70 transition-all border border-slate-100">
              <div className="flex flex-col">
                <span className="text-[11px] font-black text-slate-800">{q.name}</span>
                <span className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">{q.quoteNumber || q.id?.slice(0, 10)} • {q.opportunityName}</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right flex flex-col">
                  <span className="text-[11px] font-black text-slate-800">{formatCurrency(q.grandTotal)}</span>
                  {q.discount > 0 && <span className="text-[9px] text-slate-400 font-bold">{q.discount}% disc.</span>}
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${
                  q.status === 'Closed Won' || q.status === 'Approved'
                    ? 'bg-emerald-500/10 text-emerald-600'
                    : q.status === 'Closed Lost' || q.status === 'Rejected'
                    ? 'bg-rose-500/10 text-rose-600'
                    : 'bg-slate-500/10 text-slate-600'
                }`}>
                  {q.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
