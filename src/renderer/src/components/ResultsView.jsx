import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import './ResultsView.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTokens(n) {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function confidenceClass(score) {
  if (score == null) return ''
  if (score >= 7) return 'green'
  if (score >= 4) return 'yellow'
  return 'red'
}

// ── ConfidenceBadge ───────────────────────────────────────────────────────────

function ConfidenceBadge({ score, rationale }) {
  if (score == null) return null
  return (
    <span className={`conf-badge conf-${confidenceClass(score)}`} title={rationale ?? ''}>
      {score}/10
    </span>
  )
}

// ── Timeline ──────────────────────────────────────────────────────────────────

const TL_COLORS = [
  { dot: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  text: '#60a5fa' },  // blue
  { dot: '#8b5cf6', bg: 'rgba(139,92,246,0.12)',  text: '#a78bfa' },  // violet
  { dot: '#06b6d4', bg: 'rgba(6,182,212,0.12)',   text: '#22d3ee' },  // cyan
  { dot: '#10b981', bg: 'rgba(16,185,129,0.12)',  text: '#34d399' },  // emerald
  { dot: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  text: '#fbbf24' },  // amber
  { dot: '#f43f5e', bg: 'rgba(244,63,94,0.12)',   text: '#fb7185' },  // rose
]

function Timeline({ items }) {
  if (!items?.length) return null
  return (
    <div className="timeline">
      {items.map((item, i) => {
        const color = TL_COLORS[i % TL_COLORS.length]
        return (
          <div key={i} className="tl-item">
            <div className="tl-spine">
              <div className="tl-dot" style={{ background: color.dot, borderColor: color.dot + '55' }} />
              {i < items.length - 1 && <div className="tl-line" style={{ background: `linear-gradient(to bottom, ${color.dot}44, ${TL_COLORS[(i + 1) % TL_COLORS.length].dot}44)` }} />}
            </div>
            <div className="tl-content">
              <span className="tl-timeframe" style={{ color: color.text, background: color.bg }}>
                {item.timeframe}
              </span>
              <p className="tl-event">{item.event}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── CompetitorsList ───────────────────────────────────────────────────────────

function CompetitorsList({ competitors, onAnalyzeTicker }) {
  if (!competitors?.length) return null
  return (
    <div className="competitors-row">
      <span className="competitors-label">vs</span>
      {competitors.map((c, i) => (
        <button
          key={i}
          className="competitor-chip"
          title={c.name}
          onClick={() => c.ticker && onAnalyzeTicker?.(c.ticker)}
          disabled={!c.ticker}
        >
          {c.ticker || c.name}
        </button>
      ))}
    </div>
  )
}

// ── ScenarioCard (grid view) ──────────────────────────────────────────────────

function ScenarioCard({ scenario, index, onClick }) {
  return (
    <div
      className="scenario-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClick()}
    >
      <div className="card-num">{index + 1}</div>
      <p className="card-title">{scenario.title}</p>
      <p className="card-desc">{scenario.description}</p>
      <div className="card-footer">
        <div className="card-badges">
          <ConfidenceBadge score={scenario.uncertaintyScore} rationale={scenario.uncertaintyRationale} />
        </div>
        <span className="card-read-label">View Analysis →</span>
      </div>
    </div>
  )
}

// ── ScenarioDetail (full-page view) ──────────────────────────────────────────

const TEXT_SECTIONS = [
  { key: 'causal_chain',       label: 'Causal Chain' },
  { key: 'financial_impact',   label: 'Financial Impact' },
  { key: 'competitive_impact', label: 'Competitive Impact' },
  { key: 'stock_reaction',     label: 'Stock Reaction' }
]

function ScenarioDetail({ scenario, onBack }) {
  const { analysis, uncertaintyScore, uncertaintyRationale } = scenario
  const isStructured = analysis && typeof analysis === 'object'

  return (
    <div className="scenario-detail">

      {/* Back button */}
      <button className="detail-back-btn" onClick={onBack}>
        ← Back to Scenarios
      </button>

      {/* Header */}
      <div className="detail-header">
        <div className="detail-header-text">
          <h2 className="detail-title">{scenario.title}</h2>
          <p className="detail-desc">{scenario.description}</p>
        </div>
        <div className="detail-badges">
          <ConfidenceBadge score={uncertaintyScore} rationale={uncertaintyRationale} />
        </div>
      </div>

      {isStructured ? (
        <>
          {/* 1. Timeline — shown first for quick chronological overview */}
          {analysis.timeline?.length > 0 && (
            <div className="detail-card">
              <h3 className="detail-card-label">Event Timeline</h3>
              <Timeline items={analysis.timeline} />
            </div>
          )}

          {/* 2. Four analysis section cards */}
          {TEXT_SECTIONS.map(({ key, label }) =>
            analysis[key] ? (
              <div key={key} className="detail-card">
                <h3 className="detail-card-label">{label}</h3>
                <div className="analysis-section-body">
                  <ReactMarkdown>{analysis[key]}</ReactMarkdown>
                </div>
              </div>
            ) : null
          )}
        </>
      ) : (
        <div className="detail-card">
          <div className="analysis-text">{String(analysis ?? '')}</div>
        </div>
      )}
    </div>
  )
}

// ── ResultsView ───────────────────────────────────────────────────────────────

export default function ResultsView({ result, tickerName, onNewAnalysis, onAnalyzeTicker }) {
  const [selectedIdx, setSelectedIdx] = useState(null)
  const [showSources, setShowSources] = useState(false)

  const allSources = [...new Set(result.scenarios.flatMap(s => s.sourcesUsed ?? []))]

  return (
    <div className="results-view">

      {/* ── Persistent header ── */}
      <div className="results-header">
        <div className="results-title-block">
          <h1 className="results-ticker">{result.ticker}</h1>
          {tickerName && <p className="results-company">{tickerName}</p>}
          <CompetitorsList competitors={result.competitors} onAnalyzeTicker={onAnalyzeTicker} />
        </div>
        <button className="analyze-btn results-new-btn" onClick={onNewAnalysis}>
          New Analysis
        </button>
      </div>

      {selectedIdx === null ? (
        /* ── Grid view ── */
        <>
          <div className="scenario-cards">
            {result.scenarios.map((s, i) => (
              <ScenarioCard
                key={i}
                scenario={s}
                index={i}
                onClick={() => setSelectedIdx(i)}
              />
            ))}
          </div>

          {allSources.length > 0 && (
            <div className="sources-used">
              <button
                className={`sources-toggle ${showSources ? 'open' : ''}`}
                onClick={() => setShowSources(v => !v)}
              >
                <span className="sources-chevron">{showSources ? '▾' : '▸'}</span>
                Sources Used ({allSources.length})
              </button>
              {showSources && (
                <ul className="sources-list">
                  {allSources.map((s, i) => <li key={i} className="source-entry">{s}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="results-footer">
            <span className="token-info">
              ~{fmtTokens(result.tokenUsage?.estimated)} estimated
              {result.tokenUsage?.actual > 0 && <> &middot; {fmtTokens(result.tokenUsage.actual)} actual</>}
              {result.actualCostUSD != null && <> &middot; <strong>${result.actualCostUSD.toFixed(2)}</strong></>}
            </span>
            <span className="results-timestamp">
              {new Date(result.generatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </>
      ) : (
        /* ── Detail view ── */
        <ScenarioDetail
          scenario={result.scenarios[selectedIdx]}
          onBack={() => setSelectedIdx(null)}
        />
      )}

    </div>
  )
}
