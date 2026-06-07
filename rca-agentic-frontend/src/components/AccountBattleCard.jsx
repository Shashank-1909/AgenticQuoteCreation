import React, { useState } from 'react';
import { TrendingUp, Trophy, Target, DollarSign, Percent, Sparkles, BookOpen, BarChart2 } from 'lucide-react';

function formatCurrency(val) {
  if (!val && val !== 0) return '—';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toLocaleString('en-US')}`;
}

const AccountBattleCard = ({ data, accountName, isLoading, messages }) => {
  const [historyTab, setHistoryTab] = useState('accepted');
  // Extract playbook from messages
  let parsedPlaybook = [];
  if (messages && messages.length > 0) {
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    if (assistantMessages.length > 0) {
      const lastContent = assistantMessages[assistantMessages.length - 1].content || '';
      const playbookMatch = lastContent.match(/<ACCOUNT_PLAYBOOK>([\s\S]*?)(?:<\/ACCOUNT_PLAYBOOK>|$)/i);
      if (playbookMatch) {
        const lines = playbookMatch[1].trim().split('\n');
        lines.forEach(line => {
          const parts = line.split('|');
          if (parts.length >= 2) {
            parsedPlaybook.push({
              title: parts[0].trim(),
              description: parts[1].trim()
            });
          }
        });
      }
    }
  }

  const quotes = data || [];
  const totalResolved = quotes.filter(q => q.status === 'Closed Won' || q.status === 'Closed Lost' || q.status === 'Approved' || q.status === 'Accepted' || q.status === 'Rejected' || q.status === 'Denied').length;
  const wonQuotes = quotes.filter(q => q.status === 'Closed Won' || q.status === 'Approved' || q.status === 'Accepted');
  const lostQuotes = quotes.filter(q => q.status === 'Closed Lost' || q.status === 'Rejected' || q.status === 'Denied');
  
  const winRate = totalResolved > 0 ? Math.round((wonQuotes.length / totalResolved) * 100) : 0;
  
  const totalDealValueWon = wonQuotes.reduce((acc, q) => acc + (q.grandTotal || 0), 0);
  
  let totalDiscount = 0;
  let discountCount = 0;
  wonQuotes.forEach(q => {
    (q.lineItems || []).forEach(li => {
      if (li.discount !== undefined && li.discount !== null) {
        totalDiscount += parseFloat(li.discount);
        discountCount++;
      }
    });
  });
  const avgDiscountOnWins = discountCount > 0 ? (totalDiscount / discountCount).toFixed(2) : 0;

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4 text-indigo-500">
          <Sparkles className="animate-spin" size={32} />
          <span className="text-[10px] font-black uppercase tracking-widest">Analyzing Account History...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-slate-50 flex flex-col font-sans overflow-y-auto overflow-x-hidden p-6 custom-scrollbar">
      
      {/* HEADER CARD */}
      <div className="w-full rounded-[1.5rem] p-8 text-white relative overflow-hidden shrink-0 shadow-2xl shadow-indigo-500/20 bg-indigo-600">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-white opacity-5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-emerald-400 opacity-10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4"></div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full border border-white/20">
              <Trophy size={12} className="text-amber-300" />
              <span className="text-[9px] font-black uppercase tracking-widest text-white shadow-sm">Account Intel</span>
            </div>
          </div>

          <h1 className="text-4xl font-black tracking-tight mb-3">
            {accountName || "Account Analysis"}
          </h1>
          <p className="text-sm font-medium text-white/80 max-w-2xl leading-relaxed">
            Real-time Salesforce analytics mapping account health, lifetime value, and average discount tolerances.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 mt-6 shrink-0">
        <div className="bg-white border border-slate-200/60 rounded-[1.5rem] p-6 shadow-xl shadow-slate-200/40 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 transition-transform duration-500 group-hover:scale-150"></div>
          <div className="flex items-center gap-3 mb-4 relative z-10">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-inner">
              <TrendingUp size={16} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Historical Win Rate</span>
          </div>
          <div className="text-4xl font-black text-slate-800 relative z-10">
            {winRate}%
          </div>
          <div className="text-xs font-bold text-slate-400 mt-2 relative z-10">{wonQuotes.length} Won / {totalResolved} Resolved</div>
        </div>

        <div className="bg-white border border-slate-200/60 rounded-[1.5rem] p-6 shadow-xl shadow-slate-200/40 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 transition-transform duration-500 group-hover:scale-150"></div>
          <div className="flex items-center gap-3 mb-4 relative z-10">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shadow-inner">
              <DollarSign size={16} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Lifetime Won Value</span>
          </div>
          <div className="text-4xl font-black text-slate-800 relative z-10">
            {formatCurrency(totalDealValueWon)}
          </div>
          <div className="text-xs font-bold text-slate-400 mt-2 relative z-10">Total value of closed won quotes</div>
        </div>

        <div className="bg-white border border-slate-200/60 rounded-[1.5rem] p-6 shadow-xl shadow-slate-200/40 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 transition-transform duration-500 group-hover:scale-150"></div>
          <div className="flex items-center gap-3 mb-4 relative z-10">
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shadow-inner">
              <Percent size={16} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Avg Won Discount</span>
          </div>
          <div className="text-4xl font-black text-slate-800 relative z-10">
            {avgDiscountOnWins}%
          </div>
          <div className="text-xs font-bold text-slate-400 mt-2 relative z-10">Average discount on winning quotes</div>
        </div>
      </div>

      {parsedPlaybook.length > 0 && (
        <div className="mt-6 bg-white border border-slate-200/60 rounded-[1.5rem] p-8 shadow-xl shadow-slate-200/40 shrink-0 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
          
          <div className="flex items-center gap-3 mb-8 relative z-10">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <BookOpen size={20} className="drop-shadow-sm" />
            </div>
            <div className="flex flex-col">
              <span className="text-[12px] font-black uppercase tracking-widest text-slate-800">Account Playbook</span>
              <span className="text-[10px] font-bold text-slate-400">Strategic Recommendations based on Account History</span>
            </div>
          </div>

          <div className="flex flex-col gap-4 relative z-10">
            {parsedPlaybook.map((play, idx) => (
              <div key={idx} className="flex gap-4 p-5 rounded-2xl bg-indigo-50/50 border border-indigo-100/50 hover:bg-indigo-50 transition-colors">
                <div className="mt-1">
                  <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-sm border border-indigo-100 text-indigo-600 font-black text-[10px]">
                    {idx + 1}
                  </div>
                </div>
                <div className="flex flex-col">
                  <h4 className="text-sm font-black text-slate-800 mb-1">{play.title}</h4>
                  <p className="text-xs font-medium text-slate-600 leading-relaxed">{play.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* Quote History list */}
      <div className="mt-6 bg-white rounded-[1.5rem] p-8 border border-slate-200/60 shadow-xl shadow-slate-200/40 shrink-0">
        <div className="flex items-center justify-between mb-4 border-b pb-3 border-slate-100">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-800 flex items-center gap-2">
            Quote History mapping
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setHistoryTab('accepted')}
              className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${historyTab === 'accepted'
                  ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-200'
                  : 'bg-slate-50 text-slate-400 hover:bg-slate-100 border border-slate-100'
                }`}
            >
              Accepted ({wonQuotes.length})
            </button>
            <button
              onClick={() => setHistoryTab('rejected')}
              className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${historyTab === 'rejected'
                  ? 'bg-rose-500/10 text-rose-600 border border-rose-200'
                  : 'bg-slate-50 text-slate-400 hover:bg-slate-100 border border-slate-100'
                }`}
            >
              Rejected ({lostQuotes.length})
            </button>
          </div>
        </div>
        <div className="space-y-3">
          {(historyTab === 'accepted' ? wonQuotes : lostQuotes).length > 0 ? (
            (historyTab === 'accepted' ? wonQuotes : lostQuotes).map((q, i) => (
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
                  <span className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${historyTab === 'accepted' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'
                    }`}>
                    {q.status}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-6">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                No {historyTab} quotes found for this account.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AccountBattleCard;
