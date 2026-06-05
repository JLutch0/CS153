# What Lens does:

Lens creates structured scenario analyses for any NASDAQ-listed ticker. For a given stock, it identifies three independent scenarios that could materially affect the company, then deeply analyses each one. Each scenario is evlauted with respect to its causal chain, financial impact, competitive impact, likely stock reaction, and predicted chronological event timeline. Each scenario is run three times and scored for consistency, so you can see how confident the model is in its conclusions. Lens does **not** give financial advice, and is meant to be used exclusively as an educational tool.

## AI use disclaimer

Claude code was used for generating app prototyes and getting initial user feedback. It was also used for the final app, where it created the front end, stood up the dev version of the electron app, and help set up the ensemble model. Gemini was used for generating the app icon.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- An [Anthropic API key](https://console.anthropic.com/)

### Install & run

```powershell
npm install
npm run dev
```

On first launch, click the ⚙ icon in the bottom-left and enter your Anthropic API key. It is stored locally and never leaves your machine except in calls to `api.anthropic.com`.

## Usage

1. **Search** for a ticker in the main panel (e.g. `AAPL`, `NVDA`)
2. **Add sources** using the + button in the left sidebar — paste a URL (news article, SEC filing, earnings transcript) or upload a PDF/text file. Analysis without sources relies solely on the model's training data and is more likely to hallucinate.
3. Click **Analyze**. A token estimate is shown before any API calls are made; confirm to proceed.
4. Results show three scenario cards. Click any card to read the full analysis.
5. **Competitor chips** appear below the ticker name — click one to run a fresh analysis on that company.

## Settings

| Setting | Description |
|---|---|
| **API Key** | Your Anthropic key (`sk-ant-...`). Stored in `%APPDATA%\lens\`. |
| **Knowledge Horizon** | Optional date. When set, the model reasons as if today is that date — useful for backtesting. An approximation; model weights may still contain later knowledge. |

## Development

```powershell
npm run dev
```
