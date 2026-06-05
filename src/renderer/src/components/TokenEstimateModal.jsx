import React from 'react'
import './TokenEstimateModal.css'

function fmt(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

export default function TokenEstimateModal({ ticker, estimate, onConfirm, onCancel }) {
  const { estimatedTokens, estimatedCostUSD } = estimate

  return (
    <div className="te-overlay">
      <div className="te-modal" role="dialog" aria-modal="true">
        <h2 className="te-title">Ready to analyze {ticker}</h2>

        <div className="te-stats">
          <div className="te-stat">
            <span className="te-stat-value">~{fmt(estimatedTokens)}</span>
            <span className="te-stat-label">estimated tokens</span>
          </div>
          <div className="te-divider" />
          <div className="te-stat">
            <span className="te-stat-value">~${estimatedCostUSD.toFixed(2)}</span>
            <span className="te-stat-label">estimated cost</span>
          </div>
        </div>

        <p className="te-note">
          Includes 3 ensemble runs per scenario. Actual usage may vary.
        </p>

        <div className="te-actions">
          <button className="te-btn-cancel" onClick={onCancel}>Cancel</button>
          <button className="te-btn-run" onClick={onConfirm} autoFocus>
            Run Analysis
          </button>
        </div>
      </div>
    </div>
  )
}
