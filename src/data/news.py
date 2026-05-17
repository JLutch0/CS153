from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path

import pandas as pd
import requests

from src.config import DATA, ensure_directories


@dataclass
class NewsDataStore:
    news_dir: Path = DATA.news_dir
    finnhub_api_key: str | None = DATA.finnhub_api_key
    timeout_seconds: int = 15

    def __post_init__(self) -> None:
        ensure_directories()

    def _path_for_symbol(self, symbol: str, start_date: date, end_date: date) -> Path:
        return self.news_dir / f"{symbol}_{start_date.isoformat()}_{end_date.isoformat()}.csv"

    def load_symbol_news(
        self,
        symbol: str,
        start_date: date,
        end_date: date,
        force_refresh: bool = False,
    ) -> pd.DataFrame:
        path = self._path_for_symbol(symbol, start_date, end_date)
        if path.exists() and not force_refresh:
            df = pd.read_csv(path, parse_dates=["published_at"])
        else:
            df = self._fetch_finnhub_news(symbol, start_date, end_date)
            df.to_csv(path, index=False)

        df = self._ensure_published_at_datetime(df)
        if df.empty:
            return df
        mask = (df["published_at"].dt.date >= start_date) & (df["published_at"].dt.date <= end_date)
        return df.loc[mask].sort_values("published_at").reset_index(drop=True)

    def _fetch_finnhub_news(self, symbol: str, start_date: date, end_date: date) -> pd.DataFrame:
        if not self.finnhub_api_key:
            return self._empty_news_frame()

        url = "https://finnhub.io/api/v1/company-news"
        params = {
            "symbol": symbol,
            "from": start_date.isoformat(),
            "to": end_date.isoformat(),
            "token": self.finnhub_api_key,
        }
        response = requests.get(url, params=params, timeout=self.timeout_seconds)
        response.raise_for_status()
        payload = response.json()
        if not payload:
            return self._empty_news_frame()

        rows = []
        for item in payload:
            rows.append(
                {
                    "symbol": symbol,
                    "headline": item.get("headline", ""),
                    "summary": item.get("summary", ""),
                    "source": item.get("source", ""),
                    "url": item.get("url", ""),
                    "published_at": pd.to_datetime(item.get("datetime", 0), unit="s", utc=True),
                }
            )
        df = pd.DataFrame(rows)
        return df

    @staticmethod
    def _empty_news_frame() -> pd.DataFrame:
        return pd.DataFrame(
            columns=["symbol", "headline", "summary", "source", "url", "published_at"]
        )

    @staticmethod
    def filter_as_of(news_df: pd.DataFrame, as_of: date) -> pd.DataFrame:
        if news_df.empty:
            return news_df
        news_df = NewsDataStore._ensure_published_at_datetime(news_df)
        if news_df.empty:
            return news_df
        return news_df[news_df["published_at"].dt.date <= as_of].copy()

    @staticmethod
    def _ensure_published_at_datetime(df: pd.DataFrame) -> pd.DataFrame:
        if "published_at" not in df.columns:
            return NewsDataStore._empty_news_frame()
        out = df.copy()
        out["published_at"] = pd.to_datetime(out["published_at"], errors="coerce", utc=True)
        out = out.dropna(subset=["published_at"]).reset_index(drop=True)
        return out

    def load_universe_news(
        self,
        symbols: list[str],
        start_date: date,
        end_date: date,
        force_refresh: bool = False,
    ) -> dict[str, pd.DataFrame]:
        return {
            symbol: self.load_symbol_news(symbol, start_date, end_date, force_refresh=force_refresh)
            for symbol in symbols
        }
