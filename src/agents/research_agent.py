from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from typing import Any

import pandas as pd

try:
    from anthropic import Anthropic
except ModuleNotFoundError:  # pragma: no cover - optional dependency safeguard
    Anthropic = None

try:
    from openai import OpenAI
except ModuleNotFoundError:  # pragma: no cover - optional dependency safeguard
    OpenAI = None

from src.config import MODEL
from src.data.pit import PointInTimeSnapshot


@dataclass
class ResearchAgent:
    provider: str = MODEL.llm_provider
    model: str | None = None
    api_key: str | None = None

    def __post_init__(self) -> None:
        self.provider = (self.provider or "none").lower()
        self.client = None

        if self.provider == "anthropic":
            self.model = self.model or MODEL.anthropic_model
            self.api_key = self.api_key or MODEL.anthropic_api_key
            if self.api_key and Anthropic:
                self.client = Anthropic(api_key=self.api_key)
        elif self.provider == "openai":
            self.model = self.model or MODEL.openai_model
            self.api_key = self.api_key or MODEL.openai_api_key
            if self.api_key and OpenAI:
                self.client = OpenAI(api_key=self.api_key)
        else:
            self.provider = "none"

    def analyze(self, snapshot: PointInTimeSnapshot) -> dict[str, dict]:
        outputs: dict[str, dict] = {}
        for symbol, price in snapshot.prices.items():
            symbol_news = snapshot.news.get(symbol, pd.DataFrame())
            headlines = self._top_headlines(symbol_news, limit=5)
            if self.client:
                outputs[symbol] = self._analyze_with_provider(
                    as_of=snapshot.as_of,
                    symbol=symbol,
                    price=price,
                    headlines=headlines,
                )
            else:
                outputs[symbol] = self._fallback_signal(symbol=symbol, price=price, headlines=headlines)
        return outputs

    def _top_headlines(self, news_df: pd.DataFrame, limit: int = 5) -> list[str]:
        if news_df.empty:
            return []
        sample = news_df.sort_values("published_at", ascending=False).head(limit)
        return sample["headline"].fillna("").tolist()

    def _analyze_with_provider(self, as_of: date, symbol: str, price: float, headlines: list[str]) -> dict:
        if self.provider == "anthropic":
            return self._analyze_with_anthropic(as_of=as_of, symbol=symbol, price=price, headlines=headlines)
        if self.provider == "openai":
            return self._analyze_with_openai(as_of=as_of, symbol=symbol, price=price, headlines=headlines)
        return self._fallback_signal(symbol=symbol, price=price, headlines=headlines)

    def _build_prompt(self, as_of: date, symbol: str, price: float, headlines: list[str]) -> dict[str, Any]:
        prompt = {
            "as_of": as_of.isoformat(),
            "ticker": symbol,
            "price": price,
            "headlines": headlines,
            "task": (
                "Return ONLY valid JSON with fields: ticker, bullish_score, confidence, "
                "risk_score, suggested_action, rationale. suggested_action must be BUY, HOLD, or SELL. "
                "Scores must be in [0,1]. Keep rationale under 50 words."
            ),
        }
        return prompt

    def _analyze_with_openai(self, as_of: date, symbol: str, price: float, headlines: list[str]) -> dict:
        prompt = self._build_prompt(as_of=as_of, symbol=symbol, price=price, headlines=headlines)
        response = self.client.responses.create(
            model=self.model,
            input=[{"role": "user", "content": json.dumps(prompt)}],
            temperature=0.1,
        )
        text = response.output_text or ""
        data = self._safe_parse_json(text)
        if data is None:
            data = self._fallback_signal(symbol=symbol, price=price, headlines=headlines)
        return self._normalize_output(data, symbol=symbol)

    def _analyze_with_anthropic(self, as_of: date, symbol: str, price: float, headlines: list[str]) -> dict:
        prompt = self._build_prompt(as_of=as_of, symbol=symbol, price=price, headlines=headlines)
        response = self.client.messages.create(
            model=self.model,
            max_tokens=300,
            temperature=0.1,
            messages=[{"role": "user", "content": json.dumps(prompt)}],
        )
        text_parts: list[str] = []
        for block in response.content:
            if hasattr(block, "text"):
                text_parts.append(block.text)
        text = "\n".join(text_parts)
        data = self._safe_parse_json(text)
        if data is None:
            data = self._fallback_signal(symbol=symbol, price=price, headlines=headlines)
        return self._normalize_output(data, symbol=symbol)

    def _fallback_signal(self, symbol: str, price: float, headlines: list[str]) -> dict:
        sentiment_hint = sum(1 for h in headlines if "beat" in h.lower() or "upgrade" in h.lower())
        bearish_hint = sum(1 for h in headlines if "miss" in h.lower() or "downgrade" in h.lower())
        base = 0.5 + 0.05 * (sentiment_hint - bearish_hint)
        bullish_score = max(0.05, min(0.95, base))
        action = "BUY" if bullish_score > 0.6 else "SELL" if bullish_score < 0.4 else "HOLD"
        return {
            "ticker": symbol,
            "bullish_score": bullish_score,
            "confidence": 0.55 if headlines else 0.35,
            "risk_score": 0.50,
            "suggested_action": action,
            "rationale": f"Rule-based signal from {len(headlines)} recent headlines at price {price:.2f}.",
        }

    def _safe_parse_json(self, text: str) -> dict[str, Any] | None:
        try:
            parsed = json.loads(text)
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            start = text.find("{")
            end = text.rfind("}")
            if start == -1 or end == -1 or end <= start:
                return None
            snippet = text[start : end + 1]
            try:
                parsed = json.loads(snippet)
                return parsed if isinstance(parsed, dict) else None
            except json.JSONDecodeError:
                return None

    def _normalize_output(self, data: dict, symbol: str) -> dict:
        def clamp(value: float) -> float:
            return max(0.0, min(1.0, float(value)))

        action = str(data.get("suggested_action", "HOLD")).upper()
        if action not in {"BUY", "HOLD", "SELL"}:
            action = "HOLD"
        return {
            "ticker": data.get("ticker", symbol),
            "bullish_score": clamp(data.get("bullish_score", 0.5)),
            "confidence": clamp(data.get("confidence", 0.5)),
            "risk_score": clamp(data.get("risk_score", 0.5)),
            "suggested_action": action,
            "rationale": str(data.get("rationale", "No rationale provided.")),
        }
