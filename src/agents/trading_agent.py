from __future__ import annotations

from dataclasses import dataclass

from src.sim.portfolio import Portfolio


@dataclass
class TradingAgent:
    def allocate(self, research_output: dict[str, dict], prices: dict[str, float], portfolio: Portfolio, risk_config) -> dict[str, float]:
        bullish = []
        for symbol, signal in research_output.items():
            if symbol not in prices:
                continue
            confidence = float(signal.get("confidence", 0.0))
            score = float(signal.get("bullish_score", 0.5))
            action = str(signal.get("suggested_action", "HOLD")).upper()
            if confidence < risk_config.min_confidence:
                continue
            if action == "BUY" and score > 0.5:
                bullish.append((symbol, score, confidence, float(signal.get("risk_score", 0.5))))

        if not bullish:
            # Move to cash if no acceptable long ideas.
            return {symbol: 0.0 for symbol in prices.keys()}

        raw_weights: dict[str, float] = {}
        total_signal = 0.0
        for symbol, score, confidence, risk_score in bullish:
            signal_strength = max(0.0, (score - 0.5) * confidence * (1.0 - 0.5 * risk_score))
            raw_weights[symbol] = signal_strength
            total_signal += signal_strength

        if total_signal <= 0:
            return {symbol: 0.0 for symbol in prices.keys()}

        normalized = {symbol: weight / total_signal for symbol, weight in raw_weights.items()}
        capped = {
            symbol: min(weight * risk_config.max_gross_exposure, risk_config.max_position_weight)
            for symbol, weight in normalized.items()
        }

        # Keep all symbols in the output for deterministic execution behavior.
        target = {symbol: 0.0 for symbol in prices.keys()}
        total_capped = sum(capped.values())
        if total_capped > risk_config.max_gross_exposure:
            scale = risk_config.max_gross_exposure / total_capped
            for symbol, weight in capped.items():
                target[symbol] = weight * scale
        else:
            for symbol, weight in capped.items():
                target[symbol] = weight
        return target
