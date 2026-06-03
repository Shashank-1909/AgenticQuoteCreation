import React, { useMemo, useState } from 'react';
import { Target, Activity, ChevronLeft, CheckCircle2, Building2, Info, ExternalLink, Mail } from 'lucide-react';

const scoreTone = (score) => {
  if (score >= 80) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (score >= 60) return 'text-amber-600 bg-amber-50 border-amber-200';
  return 'text-gray-600 bg-gray-50 border-gray-200';
};

const safeScore = (card) => Math.max(0, Math.min(Number(card?.match_score || 0), 100));

const LookalikeCards = ({ cards = [], summary = '', limitations = [], variant = 'compact', sourceAccount = null }) => {
  const [selectedIdx, setSelectedIdx] = useState(null);
  const isWorkspace = variant === 'workspace';
  
  const rankedCards = useMemo(
    () => [...(cards || [])].sort((a, b) => safeScore(b) - safeScore(a)),
    [cards]
  );

  if (!rankedCards || rankedCards.length === 0) {
    return (
      <div className={`animate-in fade-in ${isWorkspace ? 'slide-in-from-bottom-4' : 'slide-in-from-right-4 mb-4'} w-full`}>
        <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5`}>
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
  if (selectedIdx !== null) {
    const card = rankedCards[selectedIdx];
    const score = safeScore(card);
    const toneClass = scoreTone(score);
    const reasons = card.reasons || [];
    const keyHighlights = card.key_highlights || [];
    const matchProofs = card.matched_against || [];
    const breakdown = card.score_breakdown || [];

    return (
      <div className="animate-in slide-in-from-right-4 fade-in w-full h-full flex flex-col">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col flex-1 max-h-[700px]">
          
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
            <button 
              onClick={() => setSelectedIdx(null)}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              <ChevronLeft size={16} /> Back
            </button>
            <div className="px-3 py-1 rounded-md bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-600 flex items-center gap-1.5">
              <Target size={14} /> Detailed Profile
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
                <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
                  {card.company_name}
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Why it fits */}
              {reasons.length > 0 && (
                <div className="bg-gray-50 p-5 rounded-xl border border-gray-100">
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircle2 size={16} className="text-indigo-600" />
                    <span className="text-sm font-semibold text-gray-900">Why it fits</span>
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
                    <span className="text-sm font-semibold text-gray-900">Company Facts & Highlights</span>
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
              {/* Salesforce Match */}
              {!sourceAccount && matchProofs.length > 0 && matchProofs[0]?.account_name && (
                <div className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-100 h-full flex flex-col">
                  <div className="flex items-center gap-2 mb-2 shrink-0">
                    <Building2 size={16} className="text-indigo-600" />
                    <span className="text-sm font-semibold text-gray-900">Salesforce Anchor Match</span>
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
          </div>
        </div>
      </div>
    );
  }

  // --- GRID VIEW ---
  return (
    <div className={`animate-in fade-in ${isWorkspace ? 'slide-in-from-bottom-4' : 'slide-in-from-right-4 mb-4'} w-full flex flex-col space-y-4`}>
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

      {/* The Cards (Free grid) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rankedCards.map((card, idx) => {
              const score = safeScore(card);
              const toneClass = scoreTone(score);
              const breakdown = card.score_breakdown || [];

              return (
                <button
                  key={`${card.company_name || 'company'}-${idx}`}
                  onClick={() => setSelectedIdx(idx)}
                  className="group relative text-left bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-300 hover:shadow-md transition-all flex flex-col h-full"
                >
                  <div className="flex items-start justify-between mb-3">
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
                                <span className="text-gray-500">{m.metric}</span>
                                <span className="font-semibold text-gray-900">{m.score}/{m.max}</span>
                                
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
                      <h4 className="text-sm font-bold text-gray-900 line-clamp-2 leading-tight flex items-center gap-1.5">
                        {card.company_name || 'Unknown'}
                        {card.contact_email && <Mail size={12} className="text-gray-400" />}
                      </h4>
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
            })}
      </div>

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
