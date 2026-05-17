const universe = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AMD", "INTC", "NFLX"];

const tickerSelect = document.getElementById("tickerSelect");
const runBacktestBtn = document.getElementById("runBacktestBtn");
const getInsightBtn = document.getElementById("getInsightBtn");
const metricsGrid = document.getElementById("metricsGrid");
const headlinesList = document.getElementById("headlinesList");
const insightSummary = document.getElementById("insightSummary");
const traceOutput = document.getElementById("traceOutput");
const backtestStatus = document.getElementById("backtestStatus");
const insightStatus = document.getElementById("insightStatus");

for (const ticker of universe) {
  const option = document.createElement("option");
  option.value = ticker;
  option.textContent = ticker;
  tickerSelect.appendChild(option);
}

function fmtPct(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function fmtNum(value) {
  return Number(value || 0).toFixed(2);
}

function renderMetrics(metrics) {
  metricsGrid.innerHTML = "";
  const rows = [
    ["Total Return", fmtPct(metrics.total_return)],
    ["Sharpe Ratio", fmtNum(metrics.sharpe_ratio)],
    ["Max Drawdown", fmtPct(metrics.max_drawdown)],
    ["Volatility", fmtPct(metrics.volatility)],
    ["Alpha vs SPY", fmtPct(metrics.alpha_vs_spy)]
  ];

  for (const [label, value] of rows) {
    const card = document.createElement("div");
    card.className = "metric";
    card.innerHTML = `<div class="label">${label}</div><div class="value">${value}</div>`;
    metricsGrid.appendChild(card);
  }
}

runBacktestBtn.addEventListener("click", async () => {
  backtestStatus.textContent = "Running backtest...";
  runBacktestBtn.disabled = true;
  try {
    const payload = {
      start: document.getElementById("startDate").value,
      end: document.getElementById("endDate").value,
      initialCash: Number(document.getElementById("initialCash").value)
    };
    const result = await window.desktopApi.runBacktest(payload);
    renderMetrics(result.metrics || {});
    const latestTrace = result.traces && result.traces.length ? result.traces[result.traces.length - 1] : null;
    traceOutput.textContent = latestTrace
      ? JSON.stringify(latestTrace, null, 2)
      : "No trace returned. This can happen if no trades occurred.";
    backtestStatus.textContent = "Backtest complete.";
  } catch (error) {
    backtestStatus.textContent = `Backtest failed: ${error.message}`;
  } finally {
    runBacktestBtn.disabled = false;
  }
});

getInsightBtn.addEventListener("click", async () => {
  insightStatus.textContent = "Gathering headlines and running ensemble analysis...";
  getInsightBtn.disabled = true;
  try {
    const ticker = tickerSelect.value;
    const result = await window.desktopApi.stockInsight({ ticker });
    const analysis = result.ensemble_analysis || {};
    insightSummary.innerHTML = `
      <p><strong>Ticker:</strong> ${analysis.ticker || ticker}</p>
      <p><strong>Outlook:</strong> ${(analysis.outlook || "neutral").toUpperCase()} | <strong>Confidence:</strong> ${fmtPct(analysis.confidence || 0)}</p>
      <p><strong>Provider:</strong> ${analysis.provider || "none"} (${analysis.model || "fallback"})</p>
      <p>${analysis.summary || "No summary."}</p>
    `;

    headlinesList.innerHTML = "";
    for (const headline of result.headlines || []) {
      const item = document.createElement("li");
      const title = headline.title || "Untitled";
      const source = headline.source || "unknown";
      if (headline.url) {
        item.innerHTML = `<a href="${headline.url}" target="_blank">${title}</a> <span>(${source})</span>`;
      } else {
        item.textContent = `${title} (${source})`;
      }
      headlinesList.appendChild(item);
    }
    insightStatus.textContent = `Insight complete. ${result.headline_count || 0} headlines scanned.`;
  } catch (error) {
    insightStatus.textContent = `Insight failed: ${error.message}`;
  } finally {
    getInsightBtn.disabled = false;
  }
});
