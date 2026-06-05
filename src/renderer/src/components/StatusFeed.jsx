import React, { useEffect, useRef } from 'react'
import './StatusFeed.css'

export default function StatusFeed({ messages }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="status-feed">
      {messages.map((msg) => (
        <div key={msg.id} className={`status-item ${msg.done ? 'done' : 'active'}`}>
          <span className="status-indicator">
            {msg.done ? <span className="status-check">✓</span> : <span className="status-dot" />}
          </span>
          <span className="status-text">{msg.text}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
