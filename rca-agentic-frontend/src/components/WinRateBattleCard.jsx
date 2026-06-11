import React, { useState } from 'react';
import { TrendingUp, Trophy, Target, DollarSign, Percent, ShieldAlert, Sparkles, Tag, HelpCircle, CheckCircle2, ChevronDown, Info, BookOpen, FlaskConical, Hash, BarChart2 } from 'lucide-react';

function formatCurrency(val) {
  if (!val && val !== 0) return '—';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toLocaleString('en-US')}`;
}

// ── Explainability Accordion ─────────────────────────────────────────────────
function ExplainabilityAccordion({ quotes, wonQuotes, lostQuotes, activeQuotes, totalResolved, winRate, avgDiscountOnWins, primaryProduct, accountName, quoteExplanation, parsedMath, parsedRisks, parsedStrengths, dynamicPlaybook, messages, previewData, selectedProducts }) {
  const [open, setOpen] = useState(false);

  const getContributionFactors = () => {
    const parseVal = (str) => {
      if (!str) return 0;
      const match = str.match(/[-+]?\d+/);
      return match ? parseInt(match[0], 10) : 0;
    };

    const finalProb = (parsedMath ? parseVal(parsedMath["Final Probability"]) : 0);
    const baseChance = parsedMath ? parseVal(parsedMath["Base Chance"]) : 0;
    const discountMod = parsedMath ? parseVal(parsedMath["Discount Modifier"]) : 0;
    const dealSizeMod = parsedMath ? parseVal(parsedMath["Deal Size Modifier"]) : 0;
    const competitorPenalty = parsedMath ? parseVal(parsedMath["Competitor Penalty"]) : 0;
    const competitorCounter = parsedMath ? parseVal(parsedMath["Competitor Counter"]) : 0;

    // Extract successfully purchased products from history
    const wonProductNames = new Set();
    wonQuotes.forEach(q => {
      (q.lineItems || []).forEach(li => {
        if (li.name) wonProductNames.add(li.name.trim().toLowerCase());
      });
    });

    // Extract current products
    let currentProductNames = [];

    // 1. First try: Get products from previewData (the active quote)
    if (previewData && previewData.records && previewData.records[0] && previewData.records[0].QuoteLineItems) {
      previewData.records[0].QuoteLineItems.forEach(li => {
        if (li.Product2 && li.Product2.Name) {
          currentProductNames.push(li.Product2.Name.trim().toLowerCase());
        }
      });
    }

    // 2. Second try: Get products from selectedProducts (currently configured items)
    if (currentProductNames.length === 0 && selectedProducts && selectedProducts.size > 0 && messages) {
      const productMessages = messages.filter(m => m.type === 'card' && m.cardType === 'products');
      const allProds = productMessages.flatMap(m => m.data || []);
      selectedProducts.forEach(id => {
        const prod = allProds.find(p => p.id === id);
        if (prod && prod.name) {
          currentProductNames.push(prod.name.trim().toLowerCase());
        }
      });
    }

    // 3. Fallback: Parse assistant messages
    if (currentProductNames.length === 0 && messages && messages.length > 0) {
      const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant')?.content || '';
      const lines = lastAssistantMsg.split('\n');
      lines.forEach(line => {
        const match = line.match(/^\s*[-•*]\s*([^:-|]+)/);
        if (match) {
          const name = match[1].trim();
          if (name && name.length > 3 && !['deal', 'win', 'confidence', 'starting', 'final', 'why', 'these', 'factor', 'strong', 'healthy', 'products', 'opportunity', 'competitor', 'discount', 'base', 'chance', 'playbook', 'recommend', 'target', 'highlight', 'avoid', 'reduce'].some(word => name.toLowerCase().includes(word))) {
            const lower = name.toLowerCase();
            if (lower.includes('cloud') || lower.includes('support') || lower.includes('license') || lower.includes('infrastructure') || lower.includes('service') || lower.includes('gcp') || lower.includes('labcorp') || lower.includes('direct') || lower.includes('platform')) {
              currentProductNames.push(lower);
            }
          }
        }
      });
    }

    const totalProds = currentProductNames.length;
    const newProdsList = currentProductNames.filter(p => {
      return ![...wonProductNames].some(wonP => p.includes(wonP) || wonP.includes(p));
    });
    const newProdsCount = newProdsList.length;

    let productsNewName = "New Products Modifier";
    let productsNewExplanation = "New products introduce uncertainty";
    let productsNewContrib = competitorPenalty;

    if (totalProds > 0) {
      if (newProdsCount === 0) {
        productsNewName = "Product Familiarity Modifier";
        productsNewExplanation = "All selected products match previous successful orders";
        productsNewContrib = 0;
      } else if (newProdsCount < totalProds) {
        productsNewName = "Product Familiarity Modifier";
        productsNewExplanation = `${newProdsCount} of ${totalProds} products have not been purchased before`;
        const basePenalty = competitorPenalty;
        productsNewContrib = Math.round(basePenalty * (newProdsCount / totalProds));
      } else {
        productsNewName = "New Products Modifier";
        productsNewExplanation = "New products introduce uncertainty";
        productsNewContrib = competitorPenalty;
      }
    }

    const startingScore = baseChance;
    const discountContrib = discountMod;
    const dealSizeContrib = dealSizeMod;
    const proposalStageContrib = competitorCounter;

    const baseSum = discountContrib + dealSizeContrib + productsNewContrib + proposalStageContrib;
    const accountHistoryContrib = finalProb - startingScore - baseSum;

    // Helper math values for display
    const wonValues = wonQuotes.map(q => q.grandTotal || 0).filter(v => v > 0);
    const minWonValue = wonValues.length > 0 ? Math.min(...wonValues) : 10000;
    const maxWonValue = wonValues.length > 0 ? Math.max(...wonValues) : 250000;
    const currentQuoteValue = previewData?.records?.[0]?.GrandTotal || previewData?.records?.[0]?.grandTotal || 85000;
    const currentDiscount = previewData?.records?.[0]?.Discount || previewData?.records?.[0]?.discount || 10;

    // Segment matched and new products
    const matchedProds = [];
    const newProds = [];
    currentProductNames.forEach(p => {
      const isFamiliar = [...wonProductNames].some(wonP => p.includes(wonP) || wonP.includes(p));
      if (isFamiliar) {
        matchedProds.push(p);
      } else {
        newProds.push(p);
      }
    });

    const matchedCounts = matchedProds.map(prod => {
      let count = 0;
      wonQuotes.forEach(q => {
        const hasProd = (q.lineItems || []).some(li => li.name?.toLowerCase().includes(prod) || prod.includes(li.name?.toLowerCase()));
        if (hasProd) count++;
      });
      return { name: prod, count };
    });

    // Dynamic explanation blocks
    const accountHistoryExpl = `Historical sales patterns and past opportunity outcomes for this account indicate a stable baseline of engagement.`;

    let dealSizeExpl = "";
    if (dealSizeContrib > 0) {
      dealSizeExpl = `The total quote value is ${formatCurrency(currentQuoteValue)}, aligning with typical successful deal structures.`;
    } else if (dealSizeContrib < 0) {
      dealSizeExpl = `The total quote value is ${formatCurrency(currentQuoteValue)}, which diverges significantly from standard successful deal ranges.`;
    } else {
      dealSizeExpl = `The total quote value is ${formatCurrency(currentQuoteValue)}, which has a neutral historical impact.`;
    }

    let discountExpl = "";
    if (discountContrib > 0) {
      discountExpl = `The applied discount (${currentDiscount}%) is highly competitive and falls well within successful historical thresholds.`;
    } else if (discountContrib < 0) {
      discountExpl = `The applied discount (${currentDiscount}%) is aggressively outside the typical successful range, introducing risk.`;
    } else {
      discountExpl = `The applied discount (${currentDiscount}%) is standard and has a neutral impact on the overall probability.`;
    }

    let productExpl = "No products specified in the active context.";
    if (totalProds > 0) {
      if (newProdsCount === 0) {
        const details = matchedCounts.map(mc => `"${mc.name}" appeared ${mc.count} out of ${wonQuotes.length} times`).join(', ');
        productExpl = `In this quote, products [${matchedProds.join(', ')}] appeared in previous won quotes (${details}), showing 100% familiar products.`;
      } else if (newProdsCount < totalProds) {
        const details = matchedCounts.map(mc => `"${mc.name}" appeared ${mc.count} out of ${wonQuotes.length} times`).join(', ');
        productExpl = `In this quote, familiar product(s) [${matchedProds.join(', ')}] appeared ${details} in previous won quotes, while new product(s) [${newProds.join(', ')}] are new to the customer (overall score: ${productsNewContrib}%).`;
      } else {
        productExpl = `All products in this quote [${newProds.join(', ')}] are brand new to this customer, introducing some uncertainty.`;
      }
    }

    const stageExpl = "Since the opportunity is currently in the Proposal stage, it indicates active customer engagement and higher probability of closing.";

    const factors = [
      {
        name: "Historical Baseline",
        explanation: accountHistoryExpl,
        contrib: accountHistoryContrib,
      },
      {
        name: "Deal Size Alignment",
        explanation: dealSizeExpl,
        contrib: dealSizeContrib,
      },
      {
        name: "Pricing & Discounting",
        explanation: discountExpl,
        contrib: discountContrib,
      },
      {
        name: "Product Familiarity",
        explanation: productExpl,
        contrib: productsNewContrib,
      },
      {
        name: "Opportunity Stage (Proposal Stage)",
        explanation: stageExpl,
        contrib: proposalStageContrib,
      }
    ];

    return {
      startingScore,
      factors,
      finalProb,
      accountHistoryContrib,
      dealSizeContrib,
      discountContrib,
      productsNewContrib,
      proposalStageContrib,
    };
  };

  const {
    startingScore,
    factors,
    finalProb,
    accountHistoryContrib,
    dealSizeContrib,
    discountContrib,
    productsNewContrib,
    proposalStageContrib
  } = getContributionFactors();

  const confidence =
    totalResolved >= 10 ? { label: 'High Confidence', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' } :
      totalResolved >= 4 ? { label: 'Medium Confidence', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500' } :
        totalResolved >= 1 ? { label: 'Low Confidence', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', dot: 'bg-orange-500' } :
          { label: 'No Data', color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200', dot: 'bg-rose-500' };

  return (
    <div className={`mb-6 rounded-2xl border transition-all duration-300 overflow-hidden ${open ? 'border-indigo-200 shadow-md' : 'border-slate-200'} bg-white`}>
      {/* Accordion Header — always visible */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/80 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl transition-colors ${open ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-500'}`}>
            <FlaskConical size={14} />
          </div>
          <div className="text-left">
            <span className="text-xs font-black text-slate-700 uppercase tracking-wide">
              Why This Quote Received {finalProb}%
            </span>
            <span className="block text-[10px] text-slate-400 font-medium mt-0.5">
              These are the key factors that influenced the win likelihood score.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5 ${confidence.bg} ${confidence.color} border ${confidence.border}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${confidence.dot}`} />
            {confidence.label}
          </span>
          <ChevronDown
            size={16}
            className={`text-slate-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Accordion Body — revealed on click */}
      <div className={`transition-all duration-300 ease-in-out ${open ? 'max-h-[1200px] opacity-100' : 'max-h-0 opacity-0'} overflow-hidden`}>
        <div className="px-5 pb-5 space-y-5 border-t border-slate-100">


            <div className="pt-4 space-y-5">
              {/* AI Coach Summary Card */}
              <div className="bg-gradient-to-br from-indigo-50/40 to-slate-50/40 border border-indigo-100 rounded-2xl p-5 shadow-sm">
                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600 block mb-2">AI Sales Coach Summary</span>
                <p className="text-[12px] text-slate-700 leading-relaxed font-semibold">
                  {quoteExplanation || (() => {
                    const f0 = factors[0];
                    const f1 = factors[1];
                    const f2 = factors[2];
                    const f3 = factors[3];
                    const f4 = factors[4];
                    const f0Sign = f0.contrib >= 0 ? '+' : '';
                    const f1Sign = f1.contrib >= 0 ? '+' : '';
                    const f2Sign = f2.contrib >= 0 ? '+' : '';
                    const f3Sign = f3.contrib >= 0 ? '+' : '';
                    const f4Sign = f4.contrib >= 0 ? '+' : '';
                    return `This quote has a win chance of ${finalProb}%. What helps the deal: ${f0.name.toLowerCase()} (${f0Sign}${f0.contrib}%), ${f1.name.toLowerCase()} (${f1Sign}${f1.contrib}%), and ${f2.name.toLowerCase()} (${f2Sign}${f2.contrib}%). The ${f4.name.toLowerCase()} adds ${f4Sign}${f4.contrib}%. Also, ${f3.name.toLowerCase()} (${f3Sign}${f3.contrib}%) introduces some uncertainty.`;
                  })()}
                </p>
              </div>

              {/* Score Summary Box */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 shadow-inner">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b pb-2 border-slate-200">
                  Score Summary Breakdown
                </h4>
                <div className="space-y-3">
                  {/* Account Baseline Win Rate Card */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 flex justify-between items-start gap-4 shadow-sm hover:border-indigo-100 transition-colors">
                    <div className="space-y-1">
                      <span className="font-bold text-slate-800 text-[11px] flex items-center gap-1.5 uppercase tracking-wide">
                        <span className="w-2 h-2 rounded-full bg-indigo-500" /> Base Deal Win Probability
                      </span>
                      <p className="text-[10px] text-slate-500 leading-normal font-semibold">
                        The starting baseline probability before adjusting for deal-specific parameters.
                      </p>
                    </div>
                    <span className="font-black text-slate-700 text-[11px] bg-slate-100 px-2 py-1 rounded">
                      {startingScore}%
                    </span>
                  </div>

                  {/* Dynamic Factors Cards */}
                  {factors.map((factor, idx) => {
                    const isPositive = factor.contrib > 0;
                    const isNegative = factor.contrib < 0;
                    const dotColor = isPositive ? 'bg-emerald-500' : isNegative ? 'bg-rose-500' : 'bg-slate-400';
                    const badgeClass = isPositive
                      ? 'text-emerald-700 bg-emerald-50'
                      : isNegative
                        ? 'text-rose-700 bg-rose-50'
                        : 'text-slate-700 bg-slate-100';
                    const scoreText = isPositive
                      ? `+${factor.contrib}%`
                      : isNegative
                        ? `${factor.contrib}%`
                        : '0% (neutral)';

                    return (
                      <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4 flex justify-between items-start gap-4 shadow-sm hover:border-indigo-100 transition-colors">
                        <div className="space-y-1">
                          <span className="font-bold text-slate-800 text-[11px] flex items-center gap-1.5 uppercase tracking-wide">
                            <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                            {factor.name}
                          </span>
                          <p className="text-[10px] text-slate-500 leading-normal font-semibold">
                            {factor.explanation}
                          </p>
                        </div>
                        <span className={`font-black text-[11px] px-2 py-1 rounded ${badgeClass}`}>
                          {scoreText}
                        </span>
                      </div>
                    );
                  })}

                  {/* Horizontal Sum Equation Bar */}
                  <div className="bg-indigo-900 text-white rounded-xl p-4 border border-indigo-950/20 shadow-md mt-4 overflow-x-auto">
                    <div className="flex items-center justify-between gap-2 text-[10px] font-black min-w-max">
                      <div className="flex items-center gap-2">
                        <div className="bg-white/10 px-2.5 py-1 rounded flex flex-col items-center">
                          <span className="text-[8px] uppercase text-indigo-200">Baseline</span>
                          <span>{startingScore}%</span>
                        </div>
                        <span className="text-indigo-300 font-bold">+</span>
                        <div className="bg-white/10 px-2.5 py-1 rounded flex flex-col items-center">
                          <span className="text-[8px] uppercase text-indigo-200">History</span>
                          <span>{accountHistoryContrib > 0 ? `+${accountHistoryContrib}%` : accountHistoryContrib < 0 ? `${accountHistoryContrib}%` : '0% (neutral)'}</span>
                        </div>
                        <span className="text-indigo-300 font-bold">+</span>
                        <div className="bg-white/10 px-2.5 py-1 rounded flex flex-col items-center">
                          <span className="text-[8px] uppercase text-indigo-200">Deal Size</span>
                          <span>{dealSizeContrib > 0 ? `+${dealSizeContrib}%` : dealSizeContrib < 0 ? `${dealSizeContrib}%` : '0% (neutral)'}</span>
                        </div>
                        <span className="text-indigo-300 font-bold">+</span>
                        <div className="bg-white/10 px-2.5 py-1 rounded flex flex-col items-center">
                          <span className="text-[8px] uppercase text-indigo-200">Pricing</span>
                          <span>{discountContrib > 0 ? `+${discountContrib}%` : discountContrib < 0 ? `${discountContrib}%` : '0% (neutral)'}</span>
                        </div>
                        <span className="text-indigo-300 font-bold">+</span>
                        <div className="bg-white/10 px-2.5 py-1 rounded flex flex-col items-center">
                          <span className="text-[8px] uppercase text-indigo-200">Products</span>
                          <span>{productsNewContrib > 0 ? `+${productsNewContrib}%` : productsNewContrib < 0 ? `${productsNewContrib}%` : '0% (neutral)'}</span>
                        </div>
                        <span className="text-indigo-300 font-bold">+</span>
                        <div className="bg-white/10 px-2.5 py-1 rounded flex flex-col items-center">
                          <span className="text-[8px] uppercase text-indigo-200">Stage</span>
                          <span>{proposalStageContrib > 0 ? `+${proposalStageContrib}%` : proposalStageContrib < 0 ? `${proposalStageContrib}%` : '0% (neutral)'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-indigo-300 font-bold">=</span>
                        <div className="bg-emerald-500 text-white px-3 py-1.5 rounded flex flex-col items-center shadow-sm">
                          <span className="text-[8px] uppercase text-emerald-100">Final Probability</span>
                          <span>{finalProb}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>


          {/* Confidence explanation */}
          <div className={`flex items-start gap-3 p-3 rounded-xl border ${confidence.bg} ${confidence.border}`}>
            <Info size={14} className={`${confidence.color} flex-shrink-0 mt-0.5`} />
            <div>
              <span className={`text-[10px] font-black uppercase tracking-widest ${confidence.color}`}>Confidence Level: {confidence.label}</span>
              <p className="text-[11px] text-slate-600 mt-1">
                {totalResolved >= 10
                  ? `With ${totalResolved} resolved quotes, this win rate is statistically reliable for this account.`
                  : totalResolved >= 4
                    ? `With only ${totalResolved} resolved quotes, this rate gives a directional signal but more deals would improve accuracy.`
                    : totalResolved >= 1
                      ? `Only ${totalResolved} resolved quote${totalResolved !== 1 ? 's' : ''} found. Treat this estimate with caution — more history is needed for a reliable prediction.`
                      : `No resolved quotes found. The win rate cannot be meaningfully calculated yet for this account.`}
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function WinRateBattleCard({ data, accountName, isLoading, messages, previewData, selectedProducts }) {
  const isQuoteMode = true;
  const [historyTab, setHistoryTab] = useState('accepted');

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
  // Won: Closed Won, Approved, Accepted, Presented (positive outcomes)
  const wonQuotes = quotes.filter(q =>
    ['Closed Won', 'Approved', 'Accepted', 'Presented'].includes(q.status)
  );
  // Lost: Closed Lost, Rejected, Expired (negative outcomes)
  const lostQuotes = quotes.filter(q =>
    ['Closed Lost', 'Rejected', 'Expired'].includes(q.status)
  );
  // Active: everything else (Draft, In Review, etc.)
  const activeQuotes = quotes.filter(q =>
    !['Closed Won', 'Approved', 'Accepted', 'Presented', 'Closed Lost', 'Rejected', 'Expired'].includes(q.status)
  );

  const totalResolved = wonQuotes.length + lostQuotes.length;
  const winRateRaw = totalResolved > 0 ? (wonQuotes.length / totalResolved) * 100 : 0;
  const winRate = Number.isInteger(winRateRaw) ? winRateRaw : Number(winRateRaw.toFixed(1));

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

  // --- QUOTE MODE LOGIC ---
  let parsedQuoteWinRate = null;
  let isQuoteReady = false;
  let parsedQuoteExplanation = null;
  let parsedMath = null;
  let parsedRisks = [];
  let parsedStrengths = [];
  let dynamicPlaybook = [];

  if (messages && messages.length > 0) {
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    if (assistantMessages.length > 0) {
      let lastContent = assistantMessages[assistantMessages.length - 1].content || '';
      if (isQuoteMode) {
        const analysisMsg = [...assistantMessages].reverse().find(m => 
          m.content && (
            m.content.includes('<MATH>') || 
            /(?:Deal Win Likelihood|Quote Win Probability):\s*([\d.]+)%/i.test(m.content)
          )
        );
        if (analysisMsg) {
          lastContent = analysisMsg.content;
        }
      }


      // Always try to parse the Playbook regardless of mode
      const playbookMatch = lastContent.match(/<PLAYBOOK>([\s\S]*?)(?:<\/PLAYBOOK>|(?=<MATH>)|$)/i);
      if (playbookMatch) {
        const lines = playbookMatch[1].trim().split('\n');
        lines.forEach(line => {
          const parts = line.split('|');
          if (parts.length >= 2) {
            dynamicPlaybook.push({ title: parts[0].trim(), description: parts[1].trim() });
          }
        });
      }

      // Quote mode specific parsing
      if (true) {
        const match = lastContent.match(/(?:Deal Win Likelihood|Quote Win Probability):\s*([\d.]+)%/i);
        if (match) {
          parsedQuoteWinRate = parseFloat(match[1]);
          isQuoteReady = true;
        }
        const explainMatch = lastContent.match(/<EXPLAIN>([\s\S]*?)(?:<\/EXPLAIN>|(?=<RISKS>|<STRENGTHS>|<PLAYBOOK>|<MATH>)|$)/i);
        if (explainMatch) {
          parsedQuoteExplanation = explainMatch[1].trim();
        }
        
        const mathMatch = lastContent.match(/<MATH>([\s\S]*?)(?:<\/MATH>|$)/i);
        if (mathMatch) {
          parsedMath = {};
          const mathLines = mathMatch[1].trim().split('\n');
          mathLines.forEach(line => {
            const index = line.indexOf(':');
            if (index !== -1) {
              const key = line.slice(0, index).trim();
              const val = line.slice(index + 1).trim();
              parsedMath[key] = val;
            }
          });
        }

        const risksMatch = lastContent.match(/<RISKS>([\s\S]*?)(?:<\/RISKS>|(?=<STRENGTHS>|<PLAYBOOK>|<MATH>)|$)/i);
        if (risksMatch) {
          parsedRisks = risksMatch[1].trim().split('\n').map(line => line.replace(/^[•\s*-\s*✔️✅⚠️]+/, '').trim()).filter(Boolean);
        }

        const strengthsMatch = lastContent.match(/<STRENGTHS>([\s\S]*?)(?:<\/STRENGTHS>|(?=<PLAYBOOK>|<MATH>)|$)/i);
        if (strengthsMatch) {
          parsedStrengths = strengthsMatch[1].trim().split('\n').map(line => line.replace(/^[•\s*-\s*✔️✅⚠️]+/, '').trim()).filter(Boolean);
        }
      }
    }
  }

  const displayWinRate = parsedQuoteWinRate || 0;
  const isCalculatingQuote = !isQuoteReady;

  // ===========================================================================
  // DYNAMIC COMPETITIVE INTELLIGENCE MAP
  // ===========================================================================
  // Design Pattern: UI Configuration Mapping
  //
  // Rationale:
  //   This structure maps active product categories (e.g. Workspace, Lucidchart,
  //   Thermal) directly to custom dynamic cards. By decoupling user-facing text 
  //   from rendering code, we ensure:
  //     1. Maintainability: Copy edits do not touch React's return/render path.
  //     2. Dynamic Adaptation: Real-time opportunity data dynamically pulls 
  //        curated competitive insights according to the resolved catalog.
  // ===========================================================================
  const competitiveIntelMap = {
    'Workspace': [
      {
        title: 'Market Competition: Microsoft 365',
        description: `${accountName || 'This account'} often considers Microsoft 365 alternatives. Focus on our native integration features and premium 24/7 support instead of competing on price.`,
        color: 'rose'
      }
    ],
    'Lucidchart': [
      {
        title: 'Preferred Category: Visual Collaboration',
        description: `Customers show high engagement with Lucidchart products. These deals also move through the cycle faster.`,
        color: 'indigo'
      }
    ],
    'Thermal': [
      {
        title: 'Market Competition: Zion Thermal',
        description: `Customers in this sector frequently request alternative options. Emphasize how our solutions seamlessly integrate with their existing Salesforce setup.`,
        color: 'rose'
      },
      {
        title: 'High Retention Rate',
        description: `95% of customers renew Thermal Compound products. Emphasize the long-term value and multi-year savings rather than short-term discounting.`,
        color: 'indigo'
      }
    ],
    'default': [
      {
        title: 'Market Competition: Standard',
        description: `Expect standard price comparison inquiries in the market. Highlight our fast deployment timeline and comprehensive customer support to justify the value.`,
        color: 'rose'
      }
    ]
  };

  let currentIntel = competitiveIntelMap['default'];
  if (primaryProduct) {
    const prodLower = primaryProduct.toLowerCase();
    if (prodLower.includes('workspace') || prodLower.includes('google')) currentIntel = competitiveIntelMap['Workspace'];
    else if (prodLower.includes('lucid')) currentIntel = competitiveIntelMap['Lucidchart'];
    else if (prodLower.includes('thermal')) currentIntel = competitiveIntelMap['Thermal'];
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-6 custom-scrollbar bg-slate-50/50">
      {/* Header Banner */}
      <div className="mb-6 bg-gradient-to-r from-indigo-900 to-indigo-800 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-indigo-500/30 text-indigo-200 border border-indigo-400/20 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
              <Trophy size={10} className="text-yellow-400" /> Quote Intel
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
            <Target size={12} className="text-indigo-500" /> Deal Win Likelihood
          </h3>
          <div className="relative w-32 h-32 flex items-center justify-center mb-2">
            {isCalculatingQuote ? (
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-600 rounded-full animate-spin mb-2" />
                <span className="text-[10px] text-slate-400 font-bold uppercase">Analyzing...</span>
              </div>
            ) : (
              <>
                {/* SVG Circle Gauge */}
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="64" cy="64" r="50" stroke="#f1f5f9" strokeWidth="10" fill="transparent" />
                  <circle
                    cx="64" cy="64" r="50"
                    stroke={displayWinRate >= 70 ? '#10b981' : displayWinRate >= 50 ? '#f59e0b' : '#f43f5e'}
                    strokeWidth="10" fill="transparent"
                    strokeDasharray={2 * Math.PI * 50}
                    strokeDashoffset={2 * Math.PI * 50 * (1 - displayWinRate / 100)}
                    strokeLinecap="round"
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute text-center">
                  <span className="text-3xl font-black text-slate-800 leading-none">{displayWinRate}%</span>
                  <span className="block text-[9px] font-bold text-slate-400 uppercase mt-0.5">Win Likelihood</span>
                </div>
              </>
            )}
          </div>

          {!(
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
          )}
        </div>

        {/* Stats List */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm md:col-span-2 grid grid-cols-2 gap-4">
          {!(
            <>
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
            </>
          )}

          <div className={`flex flex-col justify-between p-4 bg-slate-50 rounded-2xl col-span-2 row-span-2 justify-center items-center text-center`}>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
              <Trophy size={10} className="text-indigo-500" /> Primary Win Driver
            </span>
            <span className={`text-xl font-black text-slate-800 truncate`}>{primaryProduct}</span>
            <span className="text-[9px] text-slate-400 mt-1 font-bold uppercase">Most frequently included product category</span>
          </div>
        </div>

      </div>

      {/* ── Explainability Accordion ── */}
      <ExplainabilityAccordion
        quotes={quotes}
        wonQuotes={wonQuotes}
        lostQuotes={lostQuotes}
        activeQuotes={activeQuotes}
        totalResolved={totalResolved}
        winRate={winRate}
        avgDiscountOnWins={avgDiscountOnWins}
        primaryProduct={primaryProduct}
        accountName={accountName}
        
        quoteExplanation={parsedQuoteExplanation}
        parsedMath={parsedMath}
        parsedRisks={parsedRisks}
        parsedStrengths={parsedStrengths}
        dynamicPlaybook={dynamicPlaybook}
        messages={messages}
        previewData={previewData}
        selectedProducts={selectedProducts}
      />



      {/* Strategic Playbook & Competitive Position */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

        {/* Playbook advice */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-800 mb-4 flex items-center gap-2 border-b pb-3 border-slate-100">
            <Sparkles size={14} className="text-indigo-500 animate-pulse" /> Deal Buddy AI
          </h3>
          <div className="space-y-4">
            {dynamicPlaybook.length > 0 ? (
              dynamicPlaybook.map((strategy, idx) => (
                <div key={idx} className="flex gap-3">
                  <div className={`p-2 rounded-xl h-fit ${idx % 2 === 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                    {idx % 2 === 0 ? <CheckCircle2 size={16} /> : <Target size={16} />}
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-800">{strategy.title}</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      {strategy.description}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <>
                <div className="flex gap-3">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl h-fit">
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-800">Add Support Package</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      Add a support package because this customer usually buys them with their orders.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl h-fit">
                    <Percent size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-800">Adjust the Discount</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      Lower the discount to match what this customer usually accepts.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Deal Intelligence */}
        {(
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-800 mb-4 flex items-center gap-2 border-b pb-3 border-slate-100">
              <ShieldAlert size={14} className="text-indigo-500" /> Deal Intelligence
            </h3>
            <div className="space-y-4">
              {/* Risks */}
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-rose-500 block mb-2">Biggest Risks</span>
                <div className="space-y-2">
                  {parsedRisks.length > 0 ? (
                    parsedRisks.map((risk, idx) => {
                      let cleanRisk = risk
                        .replace(/[-+]\d+%/g, '')
                        .replace(/\(?-?\d+\s*(?:points|%)\)?/g, '')
                        .trim();

                      const lowerRisk = cleanRisk.toLowerCase();
                      if (lowerRisk.includes('competitor') || lowerRisk.includes('competition') || lowerRisk.includes('threat')) {
                        if (lowerRisk.includes('microsoft') || lowerRisk.includes('365')) {
                          cleanRisk = "Other vendors like Microsoft are also being considered";
                        } else if (lowerRisk.includes('miro')) {
                          cleanRisk = "Other vendors like Miro are also being considered";
                        } else if (lowerRisk.includes('zion')) {
                          cleanRisk = "Other vendors like Zion Thermal are also being considered";
                        } else if (lowerRisk.includes('discounter') || lowerRisk.includes('aggressive')) {
                          cleanRisk = "Other options are available to the customer in this segment";
                        } else {
                          cleanRisk = "Other vendors are also offering options for this deal";
                        }
                      } else if (lowerRisk.includes('discounter') || (lowerRisk.includes('discount') && lowerRisk.includes('aggressive'))) {
                        cleanRisk = "The applied discount is higher than typical successful deals";
                      }

                      return (
                        <div key={idx} className="flex items-start gap-2 bg-rose-50/50 border border-rose-100 rounded-xl p-3 text-[11px] text-slate-700">
                          <span className="text-rose-500">⚠️</span>
                          <span className="font-bold">{cleanRisk}</span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex items-start gap-2 bg-rose-50/50 border border-rose-100 rounded-xl p-3 text-[11px] text-slate-700">
                      <span className="text-rose-500">⚠️</span>
                      <span className="font-bold">Standard market competition adjustments apply</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Strengths */}
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 block mb-2">Biggest Strengths</span>
                <div className="space-y-2">
                  {parsedStrengths.length > 0 ? (
                    parsedStrengths.map((strength, idx) => (
                      <div key={idx} className="flex items-start gap-2 bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 text-[11px] text-slate-700">
                        <span className="text-emerald-500">✔️</span>
                        <span className="font-bold">{strength}</span>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-start gap-2 bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 text-[11px] text-slate-700">
                      <span className="text-emerald-500">✔️</span>
                      <span className="font-bold">Healthy discount and deal size metrics</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Quote History list */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
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
}

