from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import pandas as pd

from src.config import COSTS, RISK, SIM, UNIVERSE
from src.data.news import NewsDataStore
from src.data.pit import build_daily_snapshot
from src.data.prices import PriceDataStore
from src.sim.portfolio import Portfolio, Trade


@dataclass
class DayTrace:
    trade_date: date
    research_output: dict[str, dict]
    target_weights: dict[str, float]
    trades: list[Trade]
    equity: float


class HistoricalMarketSimulator:
    def __init__(
        self,
        symbols: list[str] | None = None,
        start_date: date = SIM.start_date,
        end_date: date = SIM.end_date,
        initial_cash: float = SIM.initial_cash,
    ) -> None:
        self.symbols = symbols or UNIVERSE
        self.start_date = start_date
        self.end_date = end_date
        self.price_store = PriceDataStore()
        self.news_store = NewsDataStore()
        self.portfolio = Portfolio(
            cash=initial_cash,
            commission_bps=COSTS.commission_bps,
            slippage_bps=COSTS.slippage_bps,
            spread_bps=COSTS.spread_bps,
        )

    def _market_dates(self, price_frames: dict[str, pd.DataFrame]) -> list[date]:
        calendar = set()
        for frame in price_frames.values():
            calendar.update(frame["Date"].dt.date.tolist())
        return sorted(d for d in calendar if self.start_date <= d <= self.end_date)

    def run(self, research_agent, trading_agent, force_refresh_data: bool = False) -> dict:
        price_frames = self.price_store.load_universe(
            self.symbols, self.start_date, self.end_date, force_refresh=force_refresh_data
        )
        news_frames = self.news_store.load_universe_news(
            self.symbols, self.start_date, self.end_date, force_refresh=force_refresh_data
        )
        dates = self._market_dates(price_frames)

        traces: list[DayTrace] = []
        for current_date in dates:
            snapshot = build_daily_snapshot(current_date, price_frames, news_frames)
            if not snapshot.prices:
                continue

            research_output = research_agent.analyze(snapshot)
            target_weights = trading_agent.allocate(
                research_output=research_output,
                prices=snapshot.prices,
                portfolio=self.portfolio,
                risk_config=RISK,
            )
            executed_trades = self._execute_target_weights(current_date, target_weights, snapshot.prices)
            equity = self.portfolio.mark_to_market(current_date, snapshot.prices)
            traces.append(
                DayTrace(
                    trade_date=current_date,
                    research_output=research_output,
                    target_weights=target_weights,
                    trades=executed_trades,
                    equity=equity,
                )
            )

        equity_df = pd.DataFrame(self.portfolio.equity_curve)
        trades_df = pd.DataFrame([t.__dict__ for t in self.portfolio.trades])
        return {
            "equity_curve": equity_df,
            "trades": trades_df,
            "traces": traces,
            "final_cash": self.portfolio.cash,
        }

    def _execute_target_weights(
        self, current_date: date, target_weights: dict[str, float], prices: dict[str, float]
    ) -> list[Trade]:
        latest_equity = (
            self.portfolio.equity_curve[-1]["total_equity"]
            if self.portfolio.equity_curve
            else self.portfolio.cash
        )
        trades: list[Trade] = []
        for symbol, weight in target_weights.items():
            price = prices.get(symbol)
            if price is None or price <= 0:
                continue
            target_value = latest_equity * weight
            target_shares = int(target_value // price)
            trade = self.portfolio.apply_trade(current_date, symbol, target_shares, price)
            if trade:
                trades.append(trade)
        return trades
