from __future__ import annotations

from src.pipeline import run_full_backtest


def main() -> None:
    result = run_full_backtest()
    print("Backtest complete.")
    print("Metrics:")
    for key, value in result.metrics.items():
        if isinstance(value, float):
            print(f"  {key}: {value:.4f}")
        else:
            print(f"  {key}: {value}")

    if not result.equity_curve.empty:
        print("\nFinal equity:", f"{result.equity_curve['total_equity'].iloc[-1]:.2f}")
    print("Trades:", len(result.trades))


if __name__ == "__main__":
    main()
