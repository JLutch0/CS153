from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import pandas as pd


@dataclass
class PointInTimeSnapshot:
    as_of: date
    prices: dict[str, float]
    news: dict[str, pd.DataFrame]


def build_daily_snapshot(
    as_of: date,
    price_frames: dict[str, pd.DataFrame],
    news_frames: dict[str, pd.DataFrame],
) -> PointInTimeSnapshot:
    prices: dict[str, float] = {}
    gated_news: dict[str, pd.DataFrame] = {}

    for symbol, frame in price_frames.items():
        eligible = frame[frame["Date"].dt.date <= as_of]
        if not eligible.empty:
            prices[symbol] = float(eligible.iloc[-1]["Close"])

    for symbol, frame in news_frames.items():
        if frame.empty:
            gated_news[symbol] = frame
            continue
        gated_news[symbol] = frame[frame["published_at"].dt.date <= as_of].copy()

    return PointInTimeSnapshot(as_of=as_of, prices=prices, news=gated_news)
