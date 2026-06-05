import React, { useState, useRef, useEffect, useCallback } from 'react'
import './TickerSearch.css'

const MAX_RESULTS = 50

function filterTickers(tickers, query) {
  if (!query) return []
  const q = query.toUpperCase()
  const exact = []
  const startsWith = []
  const nameMatch = []

  for (const t of tickers) {
    if (t.symbol === q) {
      exact.push(t)
    } else if (t.symbol.startsWith(q)) {
      startsWith.push(t)
    } else if (t.name.toUpperCase().includes(q)) {
      nameMatch.push(t)
    }
    if (exact.length + startsWith.length + nameMatch.length >= MAX_RESULTS) break
  }

  return [...exact, ...startsWith, ...nameMatch].slice(0, MAX_RESULTS)
}

export default function TickerSearch({ tickers, onSelect }) {
  const [inputValue, setInputValue] = useState('')
  const [results, setResults] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState(false)

  const inputRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    if (!selected) {
      const filtered = filterTickers(tickers, inputValue)
      setResults(filtered)
      setActiveIndex(-1)
    }
  }, [inputValue, tickers, selected])

  const commit = useCallback((ticker) => {
    setSelected(ticker)
    setInputValue(`${ticker.symbol} — ${ticker.name}`)
    setIsOpen(false)
    setError(false)
    setActiveIndex(-1)
    onSelect(ticker)
  }, [onSelect])

  const handleInputChange = (e) => {
    setSelected(null)
    setError(false)
    setInputValue(e.target.value)
    setIsOpen(true)
    onSelect(null)
  }

  const handleBlur = () => {
    // Delay so click on list item fires first
    setTimeout(() => {
      setIsOpen(false)
      if (!selected && inputValue.trim()) {
        setError(true)
      }
    }, 150)
  }

  const handleFocus = () => {
    if (!selected && inputValue) setIsOpen(true)
  }

  const handleKeyDown = (e) => {
    if (!isOpen) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && results[activeIndex]) {
        commit(results[activeIndex])
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex]
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex])

  return (
    <div className="ticker-search">
      <div className={`ticker-input-wrap ${error ? 'error' : ''}`}>
        <input
          ref={inputRef}
          className="ticker-input"
          type="text"
          placeholder="Search ticker or company name…"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {error && (
        <p className="ticker-error">Ticker not recognized. Please select from the list.</p>
      )}

      {isOpen && results.length > 0 && (
        <ul className="ticker-dropdown" ref={listRef} role="listbox">
          {results.map((t, i) => (
            <li
              key={t.symbol}
              className={`ticker-option ${i === activeIndex ? 'active' : ''}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={() => commit(t)}
            >
              <span className="ticker-symbol">{t.symbol}</span>
              <span className="ticker-name">{t.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
