from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from src.config import MODEL

try:
    from anthropic import Anthropic
except ModuleNotFoundError:  # pragma: no cover
    Anthropic = None

try:
    from openai import OpenAI
except ModuleNotFoundError:  # pragma: no cover
    OpenAI = None


@dataclass
class ModelEnsemble:
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

    def stock_world_impact(
        self,
        ticker: str,
        headlines: list[dict[str, str]],
        source_domains: list[str],
    ) -> dict[str, Any]:
        if not headlines:
            return {
                "ticker": ticker,
                "ensemble_size": 1,
                "provider": self.provider,
                "model": self.model,
                "outlook": "neutral",
                "confidence": 0.35,
                "summary": "No source headlines were available. Impact assessment is uncertain.",
                "drivers": [],
                "risks": ["Insufficient current-event context from configured sources."],
            }

        if not self.client:
            return self._fallback_analysis(ticker=ticker, headlines=headlines, source_domains=source_domains)

        prompt = {
            "task": "Assess how current world events may affect this stock in the near term.",
            "ticker": ticker,
            "sources": source_domains,
            "headlines": headlines[:15],
            "output_schema": {
                "ticker": "string",
                "outlook": "bullish|neutral|bearish",
                "confidence": "0-1 float",
                "summary": "string, max 90 words",
                "drivers": ["short bullet strings"],
                "risks": ["short bullet strings"],
            },
            "strict_output": "Return ONLY valid JSON with these fields.",
        }

        if self.provider == "anthropic":
            response = self.client.messages.create(
                model=self.model,
                max_tokens=450,
                temperature=0.1,
                messages=[{"role": "user", "content": json.dumps(prompt)}],
            )
            text_parts: list[str] = []
            for block in response.content:
                if hasattr(block, "text"):
                    text_parts.append(block.text)
            text = "\n".join(text_parts)
        elif self.provider == "openai":
            response = self.client.responses.create(
                model=self.model,
                input=[{"role": "user", "content": json.dumps(prompt)}],
                temperature=0.1,
            )
            text = response.output_text or ""
        else:
            return self._fallback_analysis(ticker=ticker, headlines=headlines, source_domains=source_domains)

        parsed = self._safe_parse_json(text)
        if parsed is None:
            return self._fallback_analysis(ticker=ticker, headlines=headlines, source_domains=source_domains)

        return {
            "ticker": parsed.get("ticker", ticker),
            "ensemble_size": 1,
            "provider": self.provider,
            "model": self.model,
            "outlook": self._normalize_outlook(parsed.get("outlook", "neutral")),
            "confidence": self._clamp(parsed.get("confidence", 0.5)),
            "summary": str(parsed.get("summary", ""))[:600],
            "drivers": self._safe_list(parsed.get("drivers")),
            "risks": self._safe_list(parsed.get("risks")),
        }

    def _fallback_analysis(
        self, ticker: str, headlines: list[dict[str, str]], source_domains: list[str]
    ) -> dict[str, Any]:
        joined = " ".join(item.get("title", "").lower() for item in headlines[:15])
        risk_terms = ["war", "tariff", "lawsuit", "inflation", "rate hike", "recession", "sanction"]
        growth_terms = ["growth", "beat", "upgrade", "ai", "expansion", "record revenue", "demand"]
        risk_hits = sum(1 for term in risk_terms if term in joined)
        growth_hits = sum(1 for term in growth_terms if term in joined)

        if growth_hits > risk_hits + 1:
            outlook = "bullish"
        elif risk_hits > growth_hits + 1:
            outlook = "bearish"
        else:
            outlook = "neutral"

        confidence = 0.45 if len(headlines) >= 5 else 0.30
        return {
            "ticker": ticker,
            "ensemble_size": 1,
            "provider": self.provider,
            "model": self.model,
            "outlook": outlook,
            "confidence": confidence,
            "summary": (
                f"Rule-based ensemble fallback using {len(headlines)} headlines from "
                f"{', '.join(source_domains)}."
            ),
            "drivers": [item.get("title", "") for item in headlines[:3] if item.get("title")],
            "risks": [item.get("title", "") for item in headlines[3:6] if item.get("title")],
        }

    @staticmethod
    def _safe_parse_json(text: str) -> dict[str, Any] | None:
        try:
            parsed = json.loads(text)
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            start = text.find("{")
            end = text.rfind("}")
            if start == -1 or end == -1 or end <= start:
                return None
            try:
                parsed = json.loads(text[start : end + 1])
                return parsed if isinstance(parsed, dict) else None
            except json.JSONDecodeError:
                return None

    @staticmethod
    def _clamp(value: Any) -> float:
        try:
            return max(0.0, min(1.0, float(value)))
        except (TypeError, ValueError):
            return 0.5

    @staticmethod
    def _normalize_outlook(value: Any) -> str:
        text = str(value).lower()
        if text in {"bullish", "neutral", "bearish"}:
            return text
        return "neutral"

    @staticmethod
    def _safe_list(value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item)[:200] for item in value[:8]]
