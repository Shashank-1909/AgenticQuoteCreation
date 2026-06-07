import React, { useMemo, useState } from 'react';
import {
  Target,
  Activity,
  ChevronLeft,
  CheckCircle2,
  Building2,
  Info,
  ExternalLink,
  Mail,
  History,
  ShoppingBag,
  TrendingUp,
  Sparkles
} from 'lucide-react';

const scoreTone = (score) => {
  if (score >= 80) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (score >= 60) return 'text-amber-600 bg-amber-50 border-amber-200';
  return 'text-gray-600 bg-gray-50 border-gray-200';
};

const safeScore = (card) => Math.max(0, Math.min(Number(card?.match_score || 0), 100));

const parseDealString = (dealStr) => {
  try {
    if (!dealStr) return { quote: 'No records found.', opportunity: '', status: '', amount: '' };
    const parts = dealStr.split(' — ');
    if (parts.length < 2) {
      return { quote: dealStr, opportunity: '', status: '', amount: '' };
    }
    const leftSide = parts[0];
    const rightSide = parts[1];

    let quote = leftSide;
    let opportunity = '';
    const openParen = leftSide.indexOf(' (');
    if (openParen !== -1) {
      quote = leftSide.substring(0, openParen);
      const closeParen = leftSide.indexOf(')', openParen);
      if (closeParen !== -1) {
        opportunity = leftSide.substring(openParen + 2, closeParen);
      } else {
        opportunity = leftSide.substring(openParen + 2);
      }
    }

    let status = rightSide;
    let amount = '';
    const openBrack = rightSide.indexOf(' [');
    if (openBrack !== -1) {
      status = rightSide.substring(0, openBrack);
      const closeBrack = rightSide.indexOf(']', openBrack);
      if (closeBrack !== -1) {
        amount = rightSide.substring(openBrack + 2, closeBrack);
      } else {
        amount = rightSide.substring(openBrack + 2);
      }
    }

    return { quote, opportunity, status, amount };
  } catch (e) {
    return { quote: dealStr, opportunity: '', status: '', amount: '' };
  }
};

const LookalikeCards = ({ cards = [], summary = '', limitations = [], variant = 'compact', sourceAccount = null }) => {
  const [selectedCard, setSelectedCard] = useState(null);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const isWorkspace = variant === 'workspace';

  const handleSelectCard = (card) => {
    setSelectedCard(card);
    setIsHistoryExpanded(false);
  };

  const rankedCards = useMemo(
    () => [...(cards || [])].sort((a, b) => safeScore(b) - safeScore(a)),
    [cards]
  );

  const existingCards = useMemo(
    () => rankedCards.filter(c => c.type === 'existing'),
    [rankedCards]
  );

  const netNewCards = useMemo(
    () => rankedCards.filter(c => c.type !== 'existing'),
    [rankedCards]
  );

  if (!rankedCards || rankedCards.length === 0) {
    return (
      <div className={`animate-in fade-in ${isWorkspace ? 'slide-in-from-bottom-4' : 'slide-in-from-right-4 mb-4'} w-full`}>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2">
            <Target size={16} className="text-gray-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-700">
              ICP Match Results
            </h3>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            {summary || 'No reliable lookalike cards were returned.'}
          </p>
        </div>
      </div>
    );
  }

  // --- DETAIL VIEW ---
  if (selectedCard !== null) {
    const card = selectedCard;
    const score = safeScore(card);
    const toneClass = scoreTone(score);
    const reasons = card.reasons || [];
    const keyHighlights = card.key_highlights || [];
    const matchProofs = card.matched_against || [];
    const breakdown = card.score_breakdown || [];

    // Calculate quote summaries
    const wonCount = ((card.deal_summary?.status_counts?.['Accepted'] || 0) +
      (card.deal_summary?.status_counts?.['Approved'] || 0) +
      (card.deal_summary?.status_counts?.['Closed Won'] || 0));

    const lostCount = ((card.deal_summary?.status_counts?.['Rejected'] || 0) +
      (card.deal_summary?.status_counts?.['Denied'] || 0) +
      (card.deal_summary?.status_counts?.['Closed Lost'] || 0));

    return (
      <div className="animate-in slide-in-from-right-4 fade-in w-full h-full flex flex-col">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col flex-1 max-h-[700px]">

          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
            <button
              onClick={() => setSelectedCard(null)}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              <ChevronLeft size={16} /> Back
            </button>
            <div className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 border ${card.type === 'existing'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-indigo-50 border-indigo-200 text-indigo-700'
              }`}>
              <Building2 size={14} />
              {card.type === 'existing' ? 'Existing Customer Profile' : 'Net New Prospect Profile'}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
            {/* Title Block */}
            <div className="flex items-start gap-4">
              <div className={`shrink-0 w-16 h-16 rounded-full border flex flex-col items-center justify-center ${toneClass}`}>
                <span className="text-xl font-bold leading-none">{score}</span>
                <span className="text-[9px] font-semibold uppercase tracking-wider mt-0.5 opacity-70">Match</span>
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2 flex-wrap">
                  {card.company_name}
                  {card.type === 'existing' ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-[10px] font-bold text-emerald-700 border border-emerald-200 uppercase tracking-wider">
                      Existing Customer
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-[10px] font-bold text-indigo-700 border border-indigo-200 uppercase tracking-wider">
                      Net New Prospect
                    </span>
                  )}
                  {card.source_urls && card.source_urls[0] && (
                    <a href={card.source_urls[0]} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-indigo-600 transition-colors">
                      <ExternalLink size={16} />
                    </a>
                  )}
                  {card.contact_email && (
                    <a href={`mailto:${card.contact_email}`} className="text-gray-400 hover:text-indigo-600 transition-colors">
                      <Mail size={16} />
                    </a>
                  )}
                </h2>
                <p className="text-sm text-gray-600 leading-relaxed max-w-2xl">
                  {card.summary}
                </p>

                {(card.location || card.revenue) && (
                  <div className="flex items-center gap-4 mt-2.5 text-xs font-semibold text-gray-500">
                    {card.location && (
                      <span className="flex items-center gap-1.5">
                        <Building2 size={14} className="text-gray-400" /> {card.location}
                      </span>
                    )}
                    {card.revenue && (
                      <span className="flex items-center gap-1.5">
                        <Activity size={14} className="text-gray-400" /> {card.revenue}
                      </span>
                    )}
                  </div>
                )}

                {card.contact_email && (
                  <p className="text-xs text-indigo-600 mt-2 font-medium">Contact: {card.contact_email}</p>
                )}

                {/* Score Breakdown Inline */}
                {breakdown.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Score Breakdown</h4>
                    <div className="flex flex-wrap gap-2">
                      {breakdown.map((m, i) => (
                        <div key={i} className="group/metric relative cursor-help">
                          <span className="px-2.5 py-1 rounded-md bg-gray-50 border border-gray-200 text-xs font-medium text-gray-700 block transition-colors hover:bg-gray-100">
                            {m.metric}: {m.score}/{m.max}
                          </span>
                          {/* Nested Tooltip */}
                          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 bg-gray-900 text-white text-[10px] leading-relaxed p-2.5 rounded-lg opacity-0 pointer-events-none group-hover/metric:opacity-100 transition-opacity z-50 text-center shadow-xl">
                            {m.reason}
                            <div className="absolute left-1/2 -translate-x-1/2 top-full border-[5px] border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {card.type === 'existing' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Past Deal History Summary */}
                <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm col-span-1 md:col-span-2">
                  <div className="flex items-center gap-2 pb-2 border-b border-gray-100 text-left">
                    <History size={16} className="text-emerald-600" />
                    <span className="text-sm font-bold text-gray-900">Past Deal History Summary</span>
                    <span className="ml-auto text-[9px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-100 uppercase tracking-wider">CRM Analytics</span>
                  </div>

                  {/* KPI Summary Dashboard */}
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    {/* Total Quotes Card */}
                    <div className="p-3 bg-gray-50 border border-gray-100 rounded-lg text-center shadow-sm">
                      <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Total Quotes</div>
                      <div className="text-xl font-bold text-gray-900 mt-1">{card.deal_summary?.total_quotes || 0}</div>
                    </div>

                    {/* Status Breakdown Card */}
                    <div className="p-3 bg-gray-50 border border-gray-100 rounded-lg text-center flex flex-col justify-center shadow-sm">
                      <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Status Breakdown</div>
                      <div className="flex items-center justify-center gap-2 mt-1.5 text-[10px] font-bold">
                        <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100" title="Accepted/Approved/Won">
                          {wonCount} Won
                        </span>
                        <span className="text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100" title="Rejected/Denied/Lost">
                          {lostCount} Lost
                        </span>
                      </div>
                    </div>

                    {/* Average Discount Card */}
                    <div className="p-3 bg-gray-50 border border-gray-100 rounded-lg text-center shadow-sm">
                      <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Avg Discount</div>
                      <div className="text-xl font-bold text-indigo-600 mt-1">{card.deal_summary?.avg_discount || '0%'}</div>
                    </div>
                  </div>

                  {/* Expandable Quote List Details */}
                  <div className="mt-4">
                    <button
                      onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 border border-gray-100 rounded-lg text-xs font-semibold text-gray-500 hover:bg-gray-50 hover:text-indigo-600 transition-all focus:outline-none"
                    >
                      <span>{isHistoryExpanded ? 'Hide Recent Quotes list ▲' : 'View Recent Quotes list ▼'}</span>
                    </button>
                    {isHistoryExpanded && (
                      <div className="overflow-x-auto mt-3 border border-gray-100 rounded-lg animate-in fade-in slide-in-from-top-2 duration-200">
                        {card.deal_history && card.deal_history.length > 0 ? (
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-gray-100 bg-gray-50/50 text-gray-400 font-bold uppercase tracking-wider text-[9px]">
                                <th className="py-2 px-3">Quote Number</th>
                                <th className="py-2 px-3">Opportunity</th>
                                <th className="py-2 px-3">Status</th>
                                <th className="py-2 px-3 text-right">Grand Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {card.deal_history.map((dealStr, idx) => {
                                const parsed = parseDealString(dealStr);
                                const statusColors = (status) => {
                                  const s = (status || '').toLowerCase();
                                  if (s.includes('approved') || s.includes('won') || s.includes('closed won') || s.includes('accepted')) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
                                  if (s.includes('review') || s.includes('presented')) return 'bg-amber-50 text-amber-700 border-amber-100';
                                  if (s.includes('draft')) return 'bg-gray-50 text-gray-700 border-gray-100';
                                  return 'bg-blue-50 text-blue-700 border-blue-100';
                                };
                                return (
                                  <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="py-2.5 px-3 font-semibold text-gray-900">{parsed.quote}</td>
                                    <td className="py-2.5 px-3 text-gray-600 font-medium">{parsed.opportunity || 'Direct Opportunity'}</td>
                                    <td className="py-2.5 px-3">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusColors(parsed.status)}`}>
                                        {parsed.status || 'Draft'}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-bold text-gray-900">{parsed.amount || '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        ) : (
                          <p className="text-xs text-gray-400 italic p-3 text-center">No recent quote details found.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Top Products Purchased */}
                <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between min-h-[140px]">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <ShoppingBag size={16} className="text-indigo-600" />
                      <span className="text-sm font-bold text-gray-900">Top Products Purchased</span>
                    </div>
                    {card.mostly_purchased_products && card.mostly_purchased_products.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {card.mostly_purchased_products.map((prod, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100 text-xs font-semibold text-indigo-700">
                            <ShoppingBag size={12} className="text-indigo-500" />
                            <span>{prod}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 italic py-2">No purchase history found for product line items.</p>
                    )}
                  </div>
                </div>

                {/* AI Upsell Opportunities */}
                <div className="bg-emerald-50/40 p-5 rounded-xl border border-emerald-100 shadow-sm flex flex-col justify-between min-h-[140px]">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles size={16} className="text-emerald-600 animate-pulse" />
                      <span className="text-sm font-bold text-gray-900">Upsell & Cross-Sell Opportunities</span>
                    </div>
                    {card.upsell_opportunities && card.upsell_opportunities.length > 0 ? (
                      <ul className="space-y-2">
                        {card.upsell_opportunities.map((opp, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-xs text-gray-700 font-semibold">
                            <TrendingUp size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                            <span>{opp}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-gray-400 italic py-2">No upsell recommendations generated.</p>
                    )}
                  </div>
                </div>

                {/* Why it fits */}
                {reasons.length > 0 && (
                  <div className="bg-gray-50 p-5 rounded-xl border border-gray-100 col-span-1 md:col-span-2">
                    <div className="flex items-center gap-2 mb-4">
                      <CheckCircle2 size={16} className="text-indigo-600" />
                      <span className="text-sm font-bold text-gray-900">Why it fits</span>
                    </div>
                    <ul className="space-y-2.5">
                      {reasons.map((item, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-gray-600">
                          <span className="text-indigo-400 mt-1">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Why it fits */}
                {reasons.length > 0 && (
                  <div className="bg-gray-50 p-5 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2 mb-4">
                      <CheckCircle2 size={16} className="text-indigo-600" />
                      <span className="text-sm font-bold text-gray-900">Why it fits</span>
                    </div>
                    <ul className="space-y-2.5">
                      {reasons.map((item, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-gray-600">
                          <span className="text-indigo-400 mt-1">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Highlights */}
                {keyHighlights.length > 0 && (
                  <div className="bg-gray-50 p-5 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2 mb-4">
                      <Activity size={16} className="text-indigo-600" />
                      <span className="text-sm font-bold text-gray-900 font-semibold">Company Facts & Highlights</span>
                    </div>
                    <ul className="space-y-2.5">
                      {keyHighlights.map((item, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-gray-600">
                          <span className="text-indigo-400 mt-1">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {/* Peer Customer Match */}
                {!sourceAccount && matchProofs.length > 0 && matchProofs[0]?.account_name && (
                  <div className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-100 h-full flex flex-col col-span-1 md:col-span-2">
                    <div className="flex items-center gap-2 mb-2 shrink-0">
                      <Building2 size={16} className="text-indigo-600" />
                      <span className="text-sm font-bold text-gray-900">Existing Customer Match</span>
                    </div>
                    <p className="text-sm text-gray-600 mb-4 shrink-0">Compared against your closest existing account.</p>
                    <div className="bg-white p-4 rounded-lg border border-indigo-100 shadow-sm flex-1">
                      <div className="text-base font-bold text-gray-900 mb-1">{matchProofs[0].account_name}</div>
                      <p className="text-sm text-gray-600 mb-3">{matchProofs[0].match_reason}</p>
                      {(matchProofs[0].shared_terms || []).length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {matchProofs[0].shared_terms.map((term) => (
                            <span key={term} className="px-2 py-1 rounded bg-indigo-50 text-xs font-medium text-indigo-700">
                              {term}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const renderCard = (card, key) => {
    const score = safeScore(card);
    const toneClass = scoreTone(score);
    const breakdown = card.score_breakdown || [];

    return (
      <button
        key={key}
        onClick={() => handleSelectCard(card)}
        className="group relative text-left bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-300 hover:shadow-md transition-all flex flex-col h-full"
      >
        <div className="flex items-start justify-between mb-3 w-full">
          {/* Tooltip Container */}
          <div className="relative inline-block z-10 shrink-0">
            <div className={`shrink-0 w-12 h-12 rounded-full border flex flex-col items-center justify-center ${toneClass} group/score cursor-help`}>
              <span className="text-sm font-bold leading-none">{score}</span>
              <span className="text-[8px] font-semibold uppercase tracking-wider mt-0.5 opacity-70">Fit</span>
            </div>

            {/* Hover Tooltip */}
            <div className="absolute left-14 top-1/2 -translate-y-1/2 ml-2 w-56 bg-white border border-gray-200 rounded-lg shadow-xl p-3 opacity-0 pointer-events-none group-hover/score:opacity-100 group-hover/score:pointer-events-auto transition-opacity z-50">
              <div className="text-xs font-bold text-gray-900 mb-2 pb-2 border-b border-gray-100">Score Breakdown</div>

              {breakdown.length > 0 ? (
                <div className="space-y-1">
                  {breakdown.map((m, i) => (
                    <div key={i} className="group/metric relative flex justify-between items-center text-xs p-1 hover:bg-gray-50 rounded cursor-help transition-colors">
                      <span className="text-gray-500 text-[11px]">{m.metric}</span>
                      <span className="font-semibold text-gray-900 text-[11px]">{m.score}/{m.max}</span>

                      {/* Nested Specific Reason Tooltip */}
                      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 w-48 bg-gray-900 text-white text-[10px] leading-relaxed p-2.5 rounded-lg opacity-0 pointer-events-none group-hover/metric:opacity-100 transition-opacity z-[60] shadow-xl">
                        {m.reason}
                        <div className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-gray-900"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-500 italic text-center py-2">No detailed breakdown provided.</div>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0 pl-3">
            <div className="flex items-start justify-between gap-1 flex-wrap">
              <h4 className="text-sm font-bold text-gray-900 line-clamp-1 leading-tight flex items-center gap-1.5">
                {card.company_name || 'Unknown'}
                {card.contact_email && <Mail size={12} className="text-gray-400 shrink-0" />}
              </h4>
              {card.type === 'existing' ? (
                <span className="shrink-0 px-1.5 py-0.5 rounded bg-emerald-50 text-[9px] font-bold text-emerald-700 border border-emerald-100 uppercase tracking-wide">
                  Existing
                </span>
              ) : (
                <span className="shrink-0 px-1.5 py-0.5 rounded bg-indigo-50 text-[9px] font-bold text-indigo-700 border border-indigo-100 uppercase tracking-wide">
                  Net New
                </span>
              )}
            </div>
            {(card.location || card.revenue) && (
              <div className="flex items-center gap-2 mt-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                {card.location && <span>{card.location}</span>}
                {card.location && card.revenue && <span>•</span>}
                {card.revenue && <span>{card.revenue}</span>}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1">
          <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">
            {card.summary || 'No summary returned.'}
          </p>
        </div>

        <div className="mt-4 pt-3 border-t border-gray-100 text-xs font-semibold text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
          View Details →
        </div>
      </button>
    );
  };

  // --- GRID VIEW ---
  return (
    <div className={`animate-in fade-in ${isWorkspace ? 'slide-in-from-bottom-4' : 'slide-in-from-right-4 mb-4'} w-full flex flex-col space-y-6`}>
      {/* Free-floating Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-4 bg-indigo-500 rounded-full" />
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900">Lookalike Matches</h3>
            {summary && <p className="text-xs text-gray-500 mt-0.5">{summary}</p>}
          </div>
        </div>
        <div className="px-3 py-1 rounded-full bg-white border border-gray-200 shadow-sm text-xs font-semibold text-gray-600 flex items-center gap-1.5">
          <Target size={12} /> {rankedCards.length} Matches
        </div>
      </div>

      {/* Existing Customers Section */}
      {existingCards.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Matched Existing Customers
            </span>
            <span className="text-[11px] text-gray-500 font-medium">Cross-sell / Upsell opportunities for active customers</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {existingCards.map((card, idx) => renderCard(card, `existing-${idx}`))}
          </div>
        </div>
      )}

      {/* Net New Prospects Section */}
      {netNewCards.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              Net New Prospects
            </span>
            <span className="text-[11px] text-gray-500 font-medium">New accounts discovered via public search</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {netNewCards.map((card, idx) => renderCard(card, `net_new-${idx}`))}
          </div>
        </div>
      )}

      {limitations?.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-xs text-amber-800">
          <Info size={14} className="shrink-0 mt-0.5" />
          <span>{limitations[0]}</span>
        </div>
      )}
    </div>
  );
};

export default LookalikeCards;
