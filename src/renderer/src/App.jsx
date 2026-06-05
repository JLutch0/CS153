import React, { useState, useEffect } from 'react'
import TickerSearch from './components/TickerSearch'
import AddSourceModal from './components/AddSourceModal'
import TokenEstimateModal from './components/TokenEstimateModal'
import StatusFeed from './components/StatusFeed'
import SettingsPanel from './components/SettingsPanel'
import ResultsView from './components/ResultsView'
import Spinner from './components/Spinner'
import './App.css'

// ── Source list helpers ────────────────────────────────────────────────────

function sourceLabel(src) {
  if (src.type === 'url') {
    try { return new URL(src.value).hostname } catch { return src.value }
  }
  return src.name
}

function SourceItem({ src, onRemove }) {
  return (
    <li className="source-item">
      <span className="source-icon">{src.type === 'url' ? '🌐' : '📄'}</span>
      <span className="source-label" title={src.type === 'url' ? src.value : src.name}>
        {sourceLabel(src)}
      </span>
      {src.type === 'file' && <span className="session-badge">session</span>}
      <button
        className="source-remove"
        onClick={() => onRemove(src.id)}
        aria-label={`Remove ${sourceLabel(src)}`}
      >
        ✕
      </button>
    </li>
  )
}

// ── App ────────────────────────────────────────────────────────────────────

export default function App() {
  // Core data
  const [tickers, setTickers] = useState([])
  const [selectedTicker, setSelectedTicker] = useState(null)
  const [sources, setSources] = useState({ urls: [], files: [] })

  // Settings
  const [apiKey, setApiKey] = useState('')
  const [knowledgeHorizon, setKnowledgeHorizon] = useState(null)
  const [showSettings, setShowSettings] = useState(false)

  // Modal controls
  const [showAddModal, setShowAddModal] = useState(false)
  const [showNoSourcesWarning, setShowNoSourcesWarning] = useState(false)

  // Analysis state: 'idle' | 'confirming' | 'running' | 'complete' | 'error'
  const [phase, setPhase] = useState('idle')
  const [messages, setMessages] = useState([])
  const [tokenEstimate, setTokenEstimate] = useState(null)
  const [result, setResult] = useState(null)
  const [errorMessage, setErrorMessage] = useState(null)

  // ── Boot ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    window.api.getTickers().then(setTickers)
    window.api.getSources().then(setSources)
    window.api.getSettings().then(({ apiKey, knowledgeHorizon }) => {
      setApiKey(apiKey ?? '')
      setKnowledgeHorizon(knowledgeHorizon ?? null)
    })
  }, [])

  // Refresh settings after panel closes
  function handleSettingsClose() {
    setShowSettings(false)
    window.api.getSettings().then(({ apiKey, knowledgeHorizon }) => {
      setApiKey(apiKey ?? '')
      setKnowledgeHorizon(knowledgeHorizon ?? null)
    })
  }

  // ── Analysis IPC listeners ────────────────────────────────────────────────
  useEffect(() => {
    window.api.onAnalysisTokenEstimate((data) => {
      setTokenEstimate(data)
      setPhase('confirming')
    })
    window.api.onAnalysisStatus(({ message }) => {
      setMessages(prev => {
        const stamped = prev.map(m => ({ ...m, done: true }))
        return [...stamped, { id: `${Date.now()}-${Math.random()}`, text: message, done: false }]
      })
    })
    window.api.onAnalysisResult((data) => {
      setMessages(prev => prev.map(m => ({ ...m, done: true })))
      setResult(data)
      setPhase('complete')
    })
    window.api.onAnalysisError(({ message }) => {
      setErrorMessage(message)
      setPhase('error')
    })
    return () => window.api.offAnalysis()
  }, [])

  // ── Analysis flow ─────────────────────────────────────────────────────────
  function handleAnalyzeClick() {
    const noSources = sources.urls.length === 0 && sources.files.length === 0
    if (noSources) {
      setShowNoSourcesWarning(true)
    } else {
      startAnalysis()
    }
  }

  function startAnalysis(symbol) {
    // symbol may be a string override (competitor click) or a click event / undefined — guard both
    const tickerSymbol = typeof symbol === 'string' ? symbol : selectedTicker?.symbol
    setShowNoSourcesWarning(false)
    setMessages([])
    setTokenEstimate(null)
    setErrorMessage(null)
    setResult(null)
    setPhase('running')
    window.api.startAnalysis(tickerSymbol)
  }

  function handleAnalyzeTicker(symbol) {
    const ticker = tickers.find(t => t.symbol === symbol)
    if (!ticker) return
    setSelectedTicker(ticker)
    const noSources = sources.urls.length === 0 && sources.files.length === 0
    if (noSources) {
      setShowNoSourcesWarning(true)
      // selectedTicker will be updated by the time user dismisses the modal
    } else {
      startAnalysis(symbol)
    }
  }

  function handleConfirm() {
    setPhase('running')
    window.api.confirmAnalysis()
  }

  function handleCancel() {
    setPhase('idle')
    setMessages([])
    window.api.cancelAnalysis()
  }

  function handleNewAnalysis() {
    setPhase('idle')
    setMessages([])
    setSelectedTicker(null)
    setTokenEstimate(null)
    setErrorMessage(null)
    setResult(null)
  }

  // ── Source handlers ───────────────────────────────────────────────────────
  async function handleAddSource(data) {
    const entry = await window.api.addSource(data)
    if (!entry) return
    setSources(prev =>
      data.type === 'url'
        ? { ...prev, urls: [...prev.urls, entry] }
        : { ...prev, files: [...prev.files, entry] }
    )
  }

  async function handleRemoveSource(id) {
    await window.api.removeSource(id)
    setSources(prev => ({
      urls: prev.urls.filter(s => s.id !== id),
      files: prev.files.filter(s => s.id !== id)
    }))
  }

  const allSources = [...sources.urls, ...sources.files]
  const canAnalyze = !!selectedTicker && !!apiKey && phase === 'idle'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app">

      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2 className="sidebar-heading">Sources</h2>
          <button className="sidebar-add-btn" onClick={() => setShowAddModal(true)} aria-label="Add source">
            +
          </button>
        </div>

        {allSources.length === 0 ? (
          <p className="sidebar-empty">No sources added yet.</p>
        ) : (
          <ul className="source-list">
            {allSources.map(src => (
              <SourceItem key={src.id} src={src} onRemove={handleRemoveSource} />
            ))}
          </ul>
        )}

        <div className="sidebar-footer">
          <button
            className={`settings-btn ${!apiKey ? 'settings-btn-warn' : ''}`}
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            title={apiKey ? 'Settings' : 'API key required'}
          >
            ⚙{!apiKey && <span className="settings-dot" />}
          </button>
        </div>
      </aside>

      {/* ── Main panel ── */}
      <main className={`main-panel ${phase === 'complete' ? 'main-panel--results' : ''} ${(phase === 'running' || phase === 'confirming') ? 'main-panel--running' : ''}`}>

        {/* Knowledge horizon banner */}
        {knowledgeHorizon && (
          <div className="horizon-banner">
            Horizon: {new Date(knowledgeHorizon).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            {' '}— model will reason as of this date
          </div>
        )}

        {/* Idle */}
        {phase === 'idle' && (
          <div className="ticker-section">
            <TickerSearch tickers={tickers} onSelect={setSelectedTicker} />
            {!apiKey && (
              <p className="no-key-hint">
                Add your Anthropic API key in{' '}
                <button className="link-btn" onClick={() => setShowSettings(true)}>Settings</button>
                {' '}to get started.
              </p>
            )}
            <button
              className="analyze-btn"
              disabled={!canAnalyze}
              onClick={handleAnalyzeClick}
            >
              Analyze
            </button>
          </div>
        )}

        {/* Running / awaiting confirmation */}
        {(phase === 'running' || phase === 'confirming') && (
          <div className="analysis-running">
            <div className="analysis-running-header">
              <Spinner size={16} />
              <p className="analysis-ticker-label">
                {selectedTicker?.symbol} &mdash; {selectedTicker?.name}
              </p>
            </div>
            {messages.length > 0
              ? <StatusFeed messages={messages} />
              : <p className="analysis-waiting">Estimating token usage&hellip;</p>
            }
          </div>
        )}

        {/* Complete */}
        {phase === 'complete' && result && (
          <ResultsView
            result={result}
            tickerName={selectedTicker?.name}
            onNewAnalysis={handleNewAnalysis}
            onAnalyzeTicker={handleAnalyzeTicker}
          />
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="analysis-outcome">
            <p className="outcome-label outcome-error">{errorMessage}</p>
            <button className="analyze-btn" onClick={handleNewAnalysis}>Try Again</button>
          </div>
        )}

      </main>

      {/* ── Overlays ── */}
      {phase === 'confirming' && tokenEstimate && (
        <TokenEstimateModal
          ticker={selectedTicker?.symbol}
          estimate={tokenEstimate}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}

      {showNoSourcesWarning && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowNoSourcesWarning(false)}>
          <div className="modal" role="alertdialog">
            <div className="modal-header" style={{ borderBottom: '1px solid #2a2a2a', padding: '16px 20px' }}>
              <h3 style={{ margin: 0, fontSize: 14, color: '#e8e8e8' }}>No sources configured</h3>
              <button className="modal-close" onClick={() => setShowNoSourcesWarning(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 13, color: '#aaa', margin: 0, lineHeight: 1.6 }}>
                The analysis will rely solely on the model's training data, which may increase
                hallucination risk. For best results, add URL or document sources first.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="te-btn-cancel" onClick={() => { setShowNoSourcesWarning(false); setShowAddModal(true) }}>
                  Add Sources
                </button>
                <button className="te-btn-run" onClick={startAnalysis}>
                  Continue Anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <AddSourceModal onAdd={handleAddSource} onClose={() => setShowAddModal(false)} />
      )}

      {showSettings && <SettingsPanel onClose={handleSettingsClose} />}
    </div>
  )
}
