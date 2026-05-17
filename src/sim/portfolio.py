from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date


@dataclass
class Trade:
    trade_date: date
    symbol: str
    side: str
    quantity: int
    fill_price: float
    gross_value: float
    costs: float


@dataclass
class Position:
    symbol: str
    quantity: int = 0
    average_cost: float = 0.0


@dataclass
class Portfolio:
    cash: float
    commission_bps: float
    slippage_bps: float
    spread_bps: float
    positions: dict[str, Position] = field(default_factory=dict)
    trades: list[Trade] = field(default_factory=list)
    equity_curve: list[dict[str, float | date]] = field(default_factory=list)

    def _total_cost_rate(self) -> float:
        return (self.commission_bps + self.slippage_bps + self.spread_bps) / 10_000.0

    def _estimate_costs(self, gross_value: float) -> float:
        return abs(gross_value) * self._total_cost_rate()

    def apply_trade(self, trade_date: date, symbol: str, target_shares: int, price: float) -> Trade | None:
        current_qty = self.positions.get(symbol, Position(symbol=symbol)).quantity
        delta = target_shares - current_qty
        if delta == 0:
            return None

        side = "BUY" if delta > 0 else "SELL"
        gross_value = delta * price
        costs = self._estimate_costs(gross_value)
        cash_delta = -gross_value - costs
        if side == "BUY" and self.cash + cash_delta < 0:
            return None

        self.cash += cash_delta
        new_qty = current_qty + delta
        position = self.positions.get(symbol, Position(symbol=symbol))
        if new_qty == 0:
            position.quantity = 0
            position.average_cost = 0.0
        elif delta > 0:
            total_cost = position.average_cost * current_qty + price * delta
            position.quantity = new_qty
            position.average_cost = total_cost / max(new_qty, 1)
        else:
            position.quantity = new_qty
        self.positions[symbol] = position

        trade = Trade(
            trade_date=trade_date,
            symbol=symbol,
            side=side,
            quantity=abs(delta),
            fill_price=price,
            gross_value=float(gross_value),
            costs=float(costs),
        )
        self.trades.append(trade)
        return trade

    def mark_to_market(self, mark_date: date, prices: dict[str, float]) -> float:
        holdings_value = 0.0
        for symbol, position in self.positions.items():
            if position.quantity == 0:
                continue
            price = prices.get(symbol)
            if price is None:
                continue
            holdings_value += position.quantity * price

        total_equity = self.cash + holdings_value
        self.equity_curve.append(
            {
                "date": mark_date,
                "cash": self.cash,
                "holdings_value": holdings_value,
                "total_equity": total_equity,
            }
        )
        return total_equity
