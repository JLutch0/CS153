import React, { useState, useRef, useEffect } from 'react'
import './AddSourceModal.css'

const ACCEPTED = '.pdf,.txt,.md'

export default function AddSourceModal({ onAdd, onClose }) {
  const [tab, setTab] = useState('url')
  const [urlValue, setUrlValue] = useState('')
  const [urlError, setUrlError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)
  const overlayRef = useRef(null)

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose()
  }

  function isValidUrl(str) {
    try {
      const u = new URL(str)
      return u.protocol === 'http:' || u.protocol === 'https:'
    } catch {
      return false
    }
  }

  function handleAddUrl(e) {
    e.preventDefault()
    const trimmed = urlValue.trim()
    if (!isValidUrl(trimmed)) {
      setUrlError('Please enter a valid http/https URL.')
      return
    }
    setUrlError('')
    onAdd({ type: 'url', value: trimmed })
    setUrlValue('')
  }

  async function processFiles(fileList) {
    for (const file of fileList) {
      const ext = file.name.split('.').pop().toLowerCase()
      if (!['pdf', 'txt', 'md'].includes(ext)) continue
      const buffer = await file.arrayBuffer()
      onAdd({ type: 'file', name: file.name, buffer })
    }
  }

  function handleFileInput(e) {
    processFiles(e.target.files)
    e.target.value = ''
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    processFiles(e.dataTransfer.files)
  }

  return (
    <div className="modal-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className="modal-tabs">
            <button
              className={`modal-tab ${tab === 'url' ? 'active' : ''}`}
              onClick={() => setTab('url')}
            >
              URL
            </button>
            <button
              className={`modal-tab ${tab === 'upload' ? 'active' : ''}`}
              onClick={() => setTab('upload')}
            >
              Upload
            </button>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body">
          {tab === 'url' && (
            <form className="url-form" onSubmit={handleAddUrl}>
              <input
                className={`url-input ${urlError ? 'error' : ''}`}
                type="text"
                placeholder="https://example.com"
                value={urlValue}
                onChange={e => { setUrlValue(e.target.value); setUrlError('') }}
                autoFocus
                spellCheck={false}
              />
              {urlError && <p className="url-error">{urlError}</p>}
              <button className="modal-add-btn" type="submit">Add URL</button>
            </form>
          )}

          {tab === 'upload' && (
            <div
              className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED}
                multiple
                style={{ display: 'none' }}
                onChange={handleFileInput}
              />
              <span className="drop-icon">⬆</span>
              <p className="drop-label">Drop files here or click to browse</p>
              <p className="drop-hint">Accepts .pdf, .txt, .md — session only</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
