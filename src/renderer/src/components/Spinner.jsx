import React from 'react'
import './Spinner.css'

export default function Spinner({ size = 20 }) {
  return (
    <span
      className="spinner"
      style={{ width: size, height: size }}
      aria-label="Loading"
    />
  )
}
