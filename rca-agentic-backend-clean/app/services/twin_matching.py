"""
app/services/twin_matching.py
==============================
Pure Python matching, scoring, classification, and card construction for Twin Hunter.

No I/O. No imports from server.py. No Salesforce/Tavily/Gemini dependencies.
All functions are deterministic and independently unit-testable.

Python owns:
  - Candidate-to-account matching (_match_tavily_to_accounts)
  - existing vs net_new classification (_classify_candidate)
  - Industry + product scoring (_score_candidate)
  - Card dict construction (_build_card)

Gemini is only called downstream for optional narrative enhancement
(summary, reasons, key_highlights) in twin_hunter_service.py.
"""

from difflib import SequenceMatcher
from urllib.parse import urlparse
import math
import re

from app.core.config import (
    TWIN_MATCH_FUZZY_URL,
    TWIN_SCORE_MULTIPLIER,
    TWIN_SCORE_MAX_INDUSTRY,
    TWIN_SCORE_MAX_PRODUCT,
    TWIN_SCORE_MAX_REVENUE,
    TWIN_SCORE_NEUTRAL_INDUSTRY,
    TWIN_SCORE_NEUTRAL_PRODUCT,
    TWIN_SCORE_NEUTRAL_REVENUE,
    TWIN_TERM_MIN_LEN,
    TWIN_SHARED_TERMS_LIMIT,
    TWIN_STOPWORDS,
    TWIN_SCORE_MAX_TAVILY,
    TWIN_SCORE_PENALTY_MAX,
    TWIN_PENALTY_WORDS,
)


# ---------------------------------------------------------------------------
# String normalisation
# Defined here (not imported from server.py) to keep this module self-contained.
# server.py's _normalise_name is also Twin Hunter-exclusive and moves with the
# service, but twin_matching.py needs its own copy to avoid any import cycle.
# The implementation is identical — a trivial one-liner.
# ---------------------------------------------------------------------------

def _normalise_name(value: str) -> str:
    cleaned = "".join(c.lower() if c.isalnum() else " " for c in str(value or ""))
    return " ".join(cleaned.split())


def _hostname(url: str) -> str:
    """Extract netloc from a URL string, stripping www."""
    try:
        parsed = urlparse(
            url if str(url).startswith(("http://", "https://")) else f"https://{url}"
        )
        return parsed.netloc.lower().replace("www.", "")
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# Candidate ↔ Salesforce account matching
# ---------------------------------------------------------------------------

def _match_tavily_to_accounts(
    research_results: list[dict],
    sf_accounts: list[dict],
) -> dict[int, dict | None]:
    """
    Attempts to match each Tavily search result to an existing Salesforce account.

    Matching strategy (ordered by confidence):
      1. URL/domain match:    candidate URL domain == account.website domain
      2. Exact name match:    normalised title == normalised account name
      3. Contained name match: one is a substring of the other
      4. Fuzzy name match:    SequenceMatcher ratio >= TWIN_MATCH_FUZZY_URL

    Returns a dict mapping result index → matched SF account dict (or None).
    """
    matches: dict[int, dict | None] = {}

    for idx, result in enumerate(research_results):
        candidate_url = result.get("url", "")
        candidate_title = result.get("title", "")
        candidate_host = _hostname(candidate_url)
        candidate_norm = _normalise_name(candidate_title)

        matched = None
        best_score = 0.0

        for account in sf_accounts:
            acct_norm = _normalise_name(account.get("name", ""))
            acct_host = _hostname(account.get("website", ""))

            # 1. URL domain match (highest confidence)
            if candidate_host and acct_host and candidate_host == acct_host:
                matched = account
                break

            # 2. Exact normalised name match
            if candidate_norm and acct_norm and candidate_norm == acct_norm:
                matched = account
                break

            # 3. Substring containment
            if candidate_norm and acct_norm:
                if candidate_norm in acct_norm or acct_norm in candidate_norm:
                    matched = account
                    break

            # 4. Fuzzy fallback (only if we haven't found a better match yet)
            if candidate_norm and acct_norm:
                ratio = SequenceMatcher(None, candidate_norm, acct_norm).ratio()
                if ratio >= TWIN_MATCH_FUZZY_URL and ratio > best_score:
                    best_score = ratio
                    matched = account

        matches[idx] = matched

    return matches


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

def _classify_candidate(matched_account: dict | None) -> str:
    """
    Returns 'existing' if the candidate maps to a known Salesforce account,
    'net_new' otherwise.
    """
    return "existing" if matched_account is not None else "net_new"


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------



def _extract_terms(text: str) -> set[str]:
    """Extract meaningful non-stopword tokens from text."""
    terms = set()
    cleaned_chars = []
    for c in str(text or "").lower():
        if c.isalnum() or c in ("-", "&"):
            cleaned_chars.append(c)
        else:
            cleaned_chars.append(" ")
    cleaned_text = "".join(cleaned_chars)
    for token in cleaned_text.split():
        token_cleaned = token.strip("-&")
        if (
            len(token_cleaned) >= TWIN_TERM_MIN_LEN 
            and token_cleaned[0].isalpha() 
            and token_cleaned not in TWIN_STOPWORDS
        ):
            terms.add(token_cleaned)
    return terms


def _score_candidate(
    result: dict,
    anchor_accounts: list[dict],
    icp_profile: dict,
) -> tuple[int, list[dict]]:
    """
    Scores a Tavily candidate against anchor accounts and the ICP profile.

    Two rubrics (50 pts each → 100 total):
      1. Industry Match (0–50):  term overlap between candidate text and anchor industries/descriptions
      2. Products & Services Match (0–50): term overlap with ICP opportunity keywords + description keywords

    Returns (total_score, score_breakdown[2]).
    """
    candidate_text = " ".join([
        result.get("title", ""),
        result.get("content", ""),
        (result.get("raw_content", "") or "")[:1000],
    ])
    candidate_terms = _extract_terms(candidate_text)

    # ── Rubric 1: Industry Match ─────────────────────────────────────────
    anchor_industry_terms: set[str] = set()
    for acct in anchor_accounts:
        anchor_industry_terms.update(_extract_terms(acct.get("industry", "")))
        anchor_industry_terms.update(_extract_terms(acct.get("type", "")))
        for term in acct.get("terms", []):
            anchor_industry_terms.update(_extract_terms(term))

    icp_industries = {
        item.get("value", "").lower()
        for item in icp_profile.get("top_industries", [])
        if item.get("value")
    }
    anchor_industry_terms.update(icp_industries)

    if anchor_industry_terms:
        denom_1 = math.sqrt(len(candidate_terms) * len(anchor_industry_terms))
        overlap_1 = len(candidate_terms & anchor_industry_terms)
        industry_score = min(TWIN_SCORE_MAX_INDUSTRY, int((overlap_1 / max(denom_1, 1)) * TWIN_SCORE_MULTIPLIER))
    else:
        industry_score = TWIN_SCORE_NEUTRAL_INDUSTRY  # neutral when no anchor industry data

    industry_reason = (
        f"Shares {len(candidate_terms & anchor_industry_terms)} industry/domain term(s) "
        f"with the anchor account profile."
        if anchor_industry_terms else
        "No anchor industry data available; neutral score applied."
    )

    # ── Rubric 3: Revenue Match ──────────────────────────────────────────
    target_rev = float(icp_profile.get("target_revenue_float") or 0.0)
    candidate_rev = 0.0
    try:
        candidate_rev = float(result.get("annual_revenue") or 0.0)
    except Exception:
        pass
        
    if candidate_rev == 0.0:
        # Regex fallback for Phase 7
        match = re.search(r'\$(\d+(?:\.\d+)?)\s*(million|m|billion|b)\b', candidate_text[:2000], re.IGNORECASE)
        if match:
            val = float(match.group(1))
            mult = match.group(2).lower()
            if mult.startswith('b'):
                candidate_rev = val * 1_000_000_000
            elif mult.startswith('m'):
                candidate_rev = val * 1_000_000
        
    revenue_score = TWIN_SCORE_NEUTRAL_REVENUE
    revenue_reason = "No revenue data available for comparison."
    
    if target_rev > 0 and candidate_rev > 0:
        ratio = min(candidate_rev, target_rev) / max(candidate_rev, target_rev)
        if ratio >= 0.8:
            revenue_score = TWIN_SCORE_MAX_REVENUE
            revenue_reason = "Extremely tight revenue alignment with ICP target."
        elif ratio >= 0.5:
            revenue_score = int(TWIN_SCORE_MAX_REVENUE * 0.7)
            revenue_reason = "Revenue is within scale of ICP target."
        else:
            revenue_score = 0
            revenue_reason = "Revenue scale does not closely match ICP target."
    elif target_rev > 0 and candidate_rev == 0:
        # Give neutral score instead of 0 to avoid burying accounts with missing data (limited CRM data fallback)
        revenue_score = TWIN_SCORE_NEUTRAL_REVENUE
        revenue_reason = "Candidate missing revenue data; neutral score applied."

    # ── Rubric 2: Products & Services Match ──────────────────────────────
    icp_kw_terms: set[str] = set()
    for kw in icp_profile.get("description_keywords", []):
        icp_kw_terms.update(_extract_terms(kw))
    for kw in icp_profile.get("opportunity_keywords", []):
        icp_kw_terms.update(_extract_terms(kw))
    for kw in icp_profile.get("product_keywords", []):
        icp_kw_terms.update(_extract_terms(kw))

    if icp_kw_terms:
        denom_2 = math.sqrt(len(candidate_terms) * len(icp_kw_terms))
        overlap_2 = len(candidate_terms & icp_kw_terms)
        product_score = min(TWIN_SCORE_MAX_PRODUCT, int((overlap_2 / max(denom_2, 1)) * TWIN_SCORE_MULTIPLIER))
    else:
        product_score = TWIN_SCORE_NEUTRAL_PRODUCT  # below neutral when no keyword data

    product_reason = (
        f"Aligns on {len(candidate_terms & icp_kw_terms)} product/service keyword(s) "
        f"from the ICP opportunity profile."
        if icp_kw_terms else
        "Insufficient ICP keyword data; conservative score applied."
    )

    # ── Phase 5: Tavily Confidence ───────────────────────────────────────
    tavily_raw = float(result.get("score") or 0.0)
    tavily_score = min(TWIN_SCORE_MAX_TAVILY, int(tavily_raw * TWIN_SCORE_MAX_TAVILY))
    tavily_reason = f"Tavily relevance confidence: {tavily_raw:.2f}"

    # ── Phase 6: Negative Scoring ────────────────────────────────────────
    penalty_score = 0
    penalty_words_found = []
    for word in TWIN_PENALTY_WORDS:
        if word in candidate_terms:
            penalty_score -= 10
            penalty_words_found.append(word)
    
    penalty_score = max(TWIN_SCORE_PENALTY_MAX, penalty_score)
    penalty_reason = f"Penalized for negative signals: {', '.join(penalty_words_found)}" if penalty_words_found else ""

    total_score = max(0, min(100, industry_score + product_score + revenue_score + tavily_score + penalty_score))

    breakdown = [
        {
            "metric": "Industry Match",
            "score": industry_score,
            "max": TWIN_SCORE_MAX_INDUSTRY,
            "reason": industry_reason,
        },
        {
            "metric": "Products & Services",
            "score": product_score,
            "max": TWIN_SCORE_MAX_PRODUCT,
            "reason": product_reason,
        },
        {
            "metric": "Revenue Alignment",
            "score": revenue_score,
            "max": TWIN_SCORE_MAX_REVENUE,
            "reason": revenue_reason,
        },
        {
            "metric": "Tavily Confidence",
            "score": tavily_score,
            "max": TWIN_SCORE_MAX_TAVILY,
            "reason": tavily_reason,
        }
    ]
    
    if penalty_score < 0:
        breakdown.append({
            "metric": "Negative Penalty",
            "score": penalty_score,
            "max": 0,
            "reason": penalty_reason,
        })

    return total_score, breakdown


# ---------------------------------------------------------------------------
# Card construction
# ---------------------------------------------------------------------------




def _build_card(
    result: dict,
    card_type: str,
    score: int,
    breakdown: list[dict],
    matched_account: dict | None,
    anchor_accounts: list[dict],
) -> dict:
    """
    Constructs a card dict that satisfies the full LookalikeCards.jsx contract.

    Required fields:
      company_name, type, summary, location, revenue, match_score,
      score_breakdown, reasons, key_highlights, matched_against,
      source_urls, contact_email

    Optional (existing cards only — filled downstream):
      deal_history, deal_summary, mostly_purchased_products, upsell_opportunities

    Gemini enhancement downstream fills: summary, reasons, key_highlights.
    This function writes Python-owned fallback values for all three.
    """
    title = result.get("title", "") or "Unknown Company"
    url = result.get("url", "")
    content = result.get("content", "") or ""

    # Use Salesforce account name for existing cards (authoritative)
    if card_type == "existing" and matched_account:
        company_name = matched_account.get("name") or title
    else:
        company_name = title

    location = ""
    revenue = ""

    # ── Python fallback narrative (Gemini may enhance these downstream) ──
    anchor_name = anchor_accounts[0].get("name", "top accounts") if anchor_accounts else "top accounts"
    anchor_industry = anchor_accounts[0].get("industry", "") if anchor_accounts else ""

    industry_clause = f" in the {anchor_industry} sector" if anchor_industry else ""

    fallback_summary = (
        f"{company_name} is a {card_type.replace('_', ' ')} match"
        f"{industry_clause}, identified via public research as a strong "
        f"lookalike to {anchor_name}."
    )

    fallback_reasons = [
        f"Demonstrates {anchor_industry or 'similar'} industry alignment "
        f"consistent with the {anchor_name} account profile.",
        f"Identified via public web signals as operating in a comparable "
        f"market segment and business scale.",
    ]

    fallback_highlights = [
        f"Public web presence found at: {url}",
        f"Identified as a potential lookalike through automated pattern matching.",
    ]

    # ── matched_against block ─────────────────────────────────────────────
    if matched_account:
        matched_against = [{
            "account_name": matched_account.get("name", ""),
            "match_reason": f"URL or name directly matched Salesforce account '{matched_account.get('name', '')}'.",
            "shared_terms": list(_extract_terms(
                f"{matched_account.get('industry', '')} {matched_account.get('description', '')}"
            ))[:TWIN_SHARED_TERMS_LIMIT],
        }]
    elif anchor_accounts:
        best_anchor = anchor_accounts[0]
        matched_against = [{
            "account_name": best_anchor.get("name", ""),
            "match_reason": "Closest ICP anchor account based on industry and keyword alignment.",
            "shared_terms": list(_extract_terms(
                f"{best_anchor.get('industry', '')} {best_anchor.get('description', '')}"
            ))[:TWIN_SHARED_TERMS_LIMIT],
        }]
    else:
        matched_against = []

    card: dict = {
        "company_name": company_name,
        "type": card_type,
        "summary": fallback_summary,           # Gemini may replace this
        "location": location,
        "revenue": revenue,
        "match_score": score,
        "score_breakdown": breakdown,
        "reasons": fallback_reasons,            # Gemini may replace this
        "key_highlights": fallback_highlights,  # Gemini may replace this
        "matched_against": matched_against,
        "source_urls": [url] if url else [],
        "contact_email": "",
        # existing-only fields — filled downstream
        "deal_history": [],
        "deal_summary": {},
        "mostly_purchased_products": [],
        "upsell_opportunities": [],
        "_tavily_snippet": content,            # Pass web text to narrative tool
    }

    return card
