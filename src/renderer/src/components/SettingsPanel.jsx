import React, { useState, useEffect, useRef } from 'react'
import './SettingsPanel.css'

export default function SettingsPanel({ onClose }) {
  const [apiKey, setApiKey] = useState('')
  const [horizon, setHorizon] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const overlayRef = useRef(null)

  useEffect(() => {
    window.api.getSettings().then(({ apiKey, knowledgeHorizon }) => {
      setApiKey(apiKey ?? '')
      setHorizon(knowledgeHorizon ?? '')
    })
  }, [])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleSave(e) {
    e.preventDefault()
    await window.api.setSettings({
      apiKey: apiKey.trim(),
      knowledgeHorizon: horizon || null
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose()
  }

  return (
    <div className="settings-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="settings-panel" role="dialog" aria-modal="true">
        <div className="settings-header">
          <h2 className="settings-title">Settings</h2>
          <button className="settings-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form className="settings-form" onSubmit={handleSave}>
          <div className="settings-field">
            <label className="settings-label" htmlFor="api-key">Anthropic API Key</label>
            <div className="api-key-wrap">
              <input
                id="api-key"
                className="settings-input"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                spellCheck={false}
                autoComplete="off"
              />
              <button
                type="button"
                className="show-key-btn"
                onClick={() => setShowKey(v => !v)}
                aria-label={showKey ? 'Hide key' : 'Show key'}
              >
                {showKey ? '🙈' : '👁'}
              </button>
            </div>
            <p className="settings-hint">
              Stored locally — never sent anywhere except api.anthropic.com.
            </p>
          </div>

          <div className="settings-field">
            <label className="settings-label" htmlFor="horizon">
              Knowledge Horizon <span className="optional">(optional)</span>
            </label>
            <input
              id="horizon"
              className="settings-input"
              type="date"
              value={horizon}
              onChange={e => setHorizon(e.target.value)}
            />
            <p className="settings-hint">
              When set, the model reasons as if today is this date. An approximation — model
              weights may still contain later knowledge.
            </p>
          </div>

          <div className="settings-actions">
            <button type="submit" className="settings-save-btn">
              {saved ? '✓ Saved' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
