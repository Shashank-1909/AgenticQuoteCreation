"""
app/services/win_rate_calculator.py
===================================
State-of-the-art service to compute account-level win rate analytics and 
quote-specific win probability. Encapsulates all competitive intelligence 
registries and logic in a clean object-oriented design pattern.
"""
import re

class WinRateCalculator:
    # Centralized competitive intelligence registry
    COMPETITOR_REGISTRY = {
        "workspace": ("Microsoft 365", -10),
        "lucidchart": ("Miro", -10),
        "kyocera": ("Zion Thermal", -10),
        "sun thermal": ("Zion Thermal", -10),
        "antivirus": ("Symantec Direct", -10),
        "quickbooks": ("Xero Online", -10)
    }

    @classmethod
    def detect_competitor(cls, products: list[str], account_name: str) -> tuple[str, int]:
        """Detects competitors and returns the name and associated penalty."""
        combined_text = (account_name + " " + " ".join(products)).lower()
        for keyword, (competitor_name, penalty) in cls.COMPETITOR_REGISTRY.items():
            if keyword in combined_text:
                return competitor_name, penalty
        return "Standard Competitor", -10

    @staticmethod
    def calculate_competitor_counter(products: list[str], discount: float, avg_discount: float) -> int:
        """Applies positive modifier if support is bundled or discount is healthy."""
        has_support = any("support" in str(p).lower() for p in products)
        if has_support or discount <= avg_discount:
            return 10
        return 0

    @staticmethod
    def calculate_discount_modifier(discount: float, avg_discount: float) -> int:
        """Determines the pricing modifier relative to historical winning discounts."""
        if discount <= avg_discount:
            return 15
        if discount <= avg_discount + 5.0:
            return 5
        if discount > avg_discount + 10.0:
            return -15
        return 0

    @staticmethod
    def calculate_deal_size_modifier(total: float, min_won: float, max_won: float) -> int:
        """Determines the size modifier relative to historical winning deal ranges."""
        if min_won <= total <= max_won:
            return 10
        if total > 2.0 * max_won:
            return -10
        return 0

    @staticmethod
    def normalize_product_name(name: str) -> str:
        """Standardizes product names for string comparison."""
        return re.sub(r"[^a-z0-9]+", "", str(name).lower())

    @classmethod
    def compute(
        cls,
        quotes: list[dict],
        display_name: str,
        account_id: str,
        current_quote_products: list[str] | None = None,
        current_quote_total: float | None = None,
        current_quote_discount: float | None = None
    ) -> dict:
        """
        Executes core win rate analysis logic and returns a structured dictionary.
        """
        won_quotes = []
        lost_quotes = []
        active_quotes = []

        for q in quotes:
            status = q.get("Status", "Draft")
            if status in ('Closed Won', 'Accepted'):
                won_quotes.append(q)
            elif status in ('Closed Lost', 'Rejected'):
                lost_quotes.append(q)
            else:
                active_quotes.append(q)

        total_resolved = len(won_quotes) + len(lost_quotes)
        account_baseline_win_rate = (len(won_quotes) / total_resolved * 100) if total_resolved > 0 else 0.0
        account_baseline_win_rate = round(account_baseline_win_rate, 1)

        total_won_value = sum(q.get("GrandTotal") or 0 for q in won_quotes)
        
        avg_discount_on_wins = 0.0
        if len(won_quotes) > 0:
            avg_discount_on_wins = sum(q.get("Discount") or 0 for q in won_quotes) / len(won_quotes)
        avg_discount_on_wins = round(avg_discount_on_wins, 1)

        product_count = {}
        for q in won_quotes:
            q_li_list = q.get("QuoteLineItems", {}).get("records", []) if q.get("QuoteLineItems") else []
            for li in q_li_list:
                p_name = li.get("Product2", {}).get("Name")
                if p_name:
                    product_count[p_name] = product_count.get(p_name, 0) + 1
        sorted_products = sorted(product_count.items(), key=lambda x: x[1], reverse=True)
        primary_product = sorted_products[0][0] if sorted_products else "GCP Cloud Infrastructure"

        result = {
            "status": "success",
            "accountName": display_name,
            "accountId": account_id,
            "totalQuotes": len(quotes),
            "wonQuotesCount": len(won_quotes),
            "lostQuotesCount": len(lost_quotes),
            "activeQuotesCount": len(active_quotes),
            "totalResolved": total_resolved,
            "accountBaselineWinRate": account_baseline_win_rate,
            "totalWonValue": total_won_value,
            "avgDiscountOnWins": avg_discount_on_wins,
            "primaryProduct": primary_product,
        }

        # Quote-specific win probability calculation
        if current_quote_products is not None or current_quote_total is not None or current_quote_discount is not None:
            products = current_quote_products or []
            discount = current_quote_discount or 0.0
            total = current_quote_total or 0.0

            competitor_name, competitor_penalty = cls.detect_competitor(products, display_name)
            competitor_counter = cls.calculate_competitor_counter(products, discount, avg_discount_on_wins)

            if total_resolved == 0:
                # Cold Start flow
                base_chance = 25
                discount_modifier = -15 if discount > 30.0 else 0
                bundling_modifier = 10 if len(products) > 1 else 0
                
                final_probability = base_chance + discount_modifier + bundling_modifier + competitor_penalty + competitor_counter
                final_probability = max(5.0, min(95.0, final_probability))

                result.update({
                    "isColdStart": True,
                    "confidence": "Low Confidence — Estimated (no account history)",
                    "calculatedMetrics": {
                        "Base Chance": base_chance,
                        "Discount Modifier": discount_modifier,
                        "Deal Size Modifier": 0,
                        "Competitor Penalty": competitor_penalty,
                        "Competitor Counter": competitor_counter,
                        "Final Probability": int(round(final_probability)),
                        "Competitor Name": competitor_name,
                        "Bundling Modifier": bundling_modifier
                    }
                })
            else:
                # Normal Historical Calculation flow
                product_win_rates = []
                for cp in products:
                    cp_norm = cls.normalize_product_name(cp)
                    won_count = 0
                    lost_count = 0
                    for q in won_quotes:
                        q_li_list = q.get("QuoteLineItems", {}).get("records", []) if q.get("QuoteLineItems") else []
                        if any(cls.normalize_product_name(li.get("Product2", {}).get("Name")) == cp_norm for li in q_li_list):
                            won_count += 1
                    for q in lost_quotes:
                        q_li_list = q.get("QuoteLineItems", {}).get("records", []) if q.get("QuoteLineItems") else []
                        if any(cls.normalize_product_name(li.get("Product2", {}).get("Name")) == cp_norm for li in q_li_list):
                            lost_count += 1

                    if won_count + lost_count > 0:
                        p_win_rate = (won_count / (won_count + lost_count)) * 100
                    else:
                        p_win_rate = account_baseline_win_rate
                    product_win_rates.append(p_win_rate)

                product_score = sum(product_win_rates) / len(product_win_rates) if product_win_rates else account_baseline_win_rate
                
                discount_modifier = cls.calculate_discount_modifier(discount, avg_discount_on_wins)

                won_totals = [q.get("GrandTotal") or 0 for q in won_quotes]
                won_totals = [v for v in won_totals if v > 0]
                min_won_val = min(won_totals) if won_totals else 10000
                max_won_val = max(won_totals) if won_totals else 250000

                deal_size_modifier = cls.calculate_deal_size_modifier(total, min_won_val, max_won_val)

                historical_baseline = (product_score * 0.40) + (account_baseline_win_rate * 0.30)
                base_chance = 25
                
                final_probability = base_chance + historical_baseline + discount_modifier + deal_size_modifier + competitor_penalty + competitor_counter
                final_probability = max(5.0, min(95.0, final_probability))

                if total_resolved >= 10:
                    confidence = "High Confidence"
                elif total_resolved >= 4:
                    confidence = "Medium Confidence"
                else:
                    confidence = "Low Confidence"

                result.update({
                    "isColdStart": False,
                    "confidence": confidence,
                    "calculatedMetrics": {
                        "Base Chance": base_chance,
                        "Discount Modifier": discount_modifier,
                        "Deal Size Modifier": deal_size_modifier,
                        "Competitor Penalty": competitor_penalty,
                        "Competitor Counter": competitor_counter,
                        "Final Probability": int(round(final_probability)),
                        "Competitor Name": competitor_name,
                        "Product Score": round(product_score, 1),
                        "Historical Baseline": round(historical_baseline, 1),
                        "Min Won Value": min_won_val,
                        "Max Won Value": max_won_val
                    }
                })

        return result
