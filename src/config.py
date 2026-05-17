from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

def _default_provider() -> str:
    if os.getenv("LLM_PROVIDER"):
        return os.getenv("LLM_PROVIDER", "none")
    if os.getenv("ANTHROPIC_API_KEY"):
        return "anthropic"
    if os.getenv("OPENAI_API_KEY"):
        return "openai"
    return "none"


@dataclass(frozen=True)
class CostConfig:
    commission_bps: float = 1.0
    slippage_bps: float = 2.0
    spread_bps: float = 2.0


@dataclass(frozen=True)
class RiskConfig:
    max_position_weight: float = 0.10
    max_gross_exposure: float = 1.00
    stop_loss_pct: float = 0.08
    min_confidence: float = 0.50


@dataclass(frozen=True)
class SimulationConfig:
    start_date: date = date(2021, 1, 1)
    end_date: date = date(2024, 12, 31)
    initial_cash: float = 100_000.0
    rebalance_frequency: str = "daily"


@dataclass(frozen=True)
class ModelConfig:
    llm_provider: str = _default_provider()
    anthropic_model: str = os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-latest")
    anthropic_api_key: str | None = os.getenv("ANTHROPIC_API_KEY")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    openai_api_key: str | None = os.getenv("OPENAI_API_KEY")


@dataclass(frozen=True)
class DataConfig:
    cache_dir: Path = Path("data/cache")
    news_dir: Path = Path("data/news")
    prices_dir: Path = Path("data/prices")
    finnhub_api_key: str | None = os.getenv("FINNHUB_API_KEY")


UNIVERSE = [
    "AAPL",
    "MSFT",
    "NVDA",
    "AMZN",
    "GOOGL",
    "META",
    "TSLA",
    "AMD",
    "INTC",
    "NFLX",
]

COSTS = CostConfig()
RISK = RiskConfig()
SIM = SimulationConfig()
MODEL = ModelConfig()
DATA = DataConfig()


def ensure_directories() -> None:
    for path in [DATA.cache_dir, DATA.news_dir, DATA.prices_dir]:
        path.mkdir(parents=True, exist_ok=True)
