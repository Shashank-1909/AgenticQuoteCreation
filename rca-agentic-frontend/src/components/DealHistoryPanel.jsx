import React, { useState } from 'react';
import { TrendingUp, TrendingDown, Clock, ChevronDown, ChevronUp, Tag, Sparkles, ArrowRight } from 'lucide-react';

const statusConfig = {
  'Closed Won':  { label: 'CLOSED WON',  bg: '#dcfce7', color: '#16a34a', dot: '#22c55e' },
  'Closed Lost': { label: 'CLOSED LOST', bg: '#fee2e2', color: '#dc2626', dot: '#ef4444' },
  'Draft':       { label: 'DRAFT',       bg: '#f1f5f9', color: '#64748b', dot: '#94a3b8' },
  'In Review':   { label: 'IN REVIEW',   bg: '#fef3c7', color: '#d97706', dot: '#f59e0b' },
  'Approved':    { label: 'APPROVED',    bg: '#ede9fe', color: '#7c3aed', dot: '#8b5cf6' },
  'Presented':   { label: 'PRESENTED',  bg: '#dbeafe', color: '#1d4ed8', dot: '#3b82f6' },
};

function StatusBadge({ status }) {
  const cfg = statusConfig[status] || { label: status?.toUpperCase() || 'UNKNOWN', bg: '#f1f5f9', color: '#64748b', dot: '#94a3b8' };
  return (
    <span style={{ background: cfg.bg, color: cfg.color }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">
      <span style={{ background: cfg.dot }} className="w-1.5 h-1.5 rounded-full" />
      {cfg.label}
    </span>
  );
}

function formatCurrency(val) {
  if (!val && val !== 0) return '—';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(2)}`;
}

function QuoteCard({ quote, accountName }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm mb-5 overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4">
        <div className="flex items-start justify-between mb-1">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
            {accountName} {quote.opportunityName ? `• ${quote.opportunityName}` : ''}
          </span>
          <StatusBadge status={quote.status} />
        </div>
        <h3 className="text-[17px] font-black text-slate-800 leading-tight mb-1.5">{quote.name}</h3>
        <div className="flex items-center gap-3 text-[10px] text-slate-400 font-semibold">
          <span>{quote.quoteNumber || quote.id?.slice(0, 10)}</span>
          {quote.createdDate && (
            <>
              <span className="w-1 h-1 rounded-full bg-slate-300" />
              <span>{new Date(quote.createdDate).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })}</span>
            </>
          )}
        </div>
      </div>

      {/* Amount bar */}
      <div className="mx-6 mb-4 flex items-center justify-between bg-slate-50 rounded-xl px-4 py-2.5">
        <span className="text-[22px] font-black text-slate-800">{formatCurrency(quote.grandTotal)}</span>
        {quote.discount > 0 && (
          <span className="text-[10px] font-bold text-slate-500">{quote.discount}% disc.</span>
        )}
      </div>

      {/* Line items */}
      {quote.lineItems?.length > 0 && (
        <div className="mx-6 mb-4">
          <button
            onClick={() => setExpanded(x => !x)}
            className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 hover:text-slate-600 transition-colors"
          >
            LINE ITEMS {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
          {expanded && (
            <div className="space-y-1">
              {quote.lineItems.map((li, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                  <span className="text-[11px] text-slate-600 font-medium leading-tight max-w-[70%]">
                    {li.name} {li.quantity > 1 ? `— ${li.quantity}×` : ''}
                  </span>
                  <span className="text-[11px] font-bold text-slate-700 ml-2 flex-shrink-0">
                    {formatCurrency(li.totalPrice || li.unitPrice)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Deal Analysis */}
      {quote.analysis && (
        <div className="mx-6 mb-4">
          <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">DEAL ANALYSIS</div>
          <p className="text-[11px] text-slate-600 leading-relaxed">{quote.analysis}</p>
        </div>
      )}

      {/* Tags */}
      {quote.tags?.length > 0 && (
        <div className="mx-6 mb-5 flex flex-wrap gap-1.5">
          {quote.tags.map((tag, i) => (
            <span key={i}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[9px] font-bold border border-indigo-100">
              <Tag size={8} />
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DealHistoryPanel({ data, accountName, onQuickReply, isLoading }) {
  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-400 animate-pulse">
        <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold">Fetching deal history…</span>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-400">
        <Sparkles size={32} className="text-slate-300" />
        <span className="text-xs font-semibold">No quote history found for {accountName}.</span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-6" style={{ scrollbarWidth: 'thin' }}>
      <div className="mb-5 animate-in fade-in slide-in-from-top-2">
        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Deal History</div>
        <h2 className="text-lg font-black text-slate-700">{accountName}</h2>
        <p className="text-[11px] text-slate-400 mt-0.5">{data.length} quote{data.length !== 1 ? 's' : ''} found across all opportunities</p>
      </div>

      {data.map((quote, i) => (
        <QuoteCard key={quote.id || i} quote={quote} accountName={accountName} />
      ))}
    </div>
  );
}
