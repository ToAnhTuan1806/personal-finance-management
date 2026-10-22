/* Lucian UX/UI Prompt #039 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#039 */

import { useRef } from 'react'
import './LucianUI.css'

export default function PillTabs({
  options,
  value,
  onChange,
  label = 'Bộ lọc',
}) {
  const buttons = useRef([])
  const selectedIndex = Math.max(
    0,
    options.findIndex((item) => item.value === value)
  )

  const handleKeyDown = (event, index) => {
    let next

    if (event.key === 'ArrowRight') {
      next = (index + 1) % options.length
    } else if (event.key === 'ArrowLeft') {
      next = (index - 1 + options.length) % options.length
    } else if (event.key === 'Home') {
      next = 0
    } else if (event.key === 'End') {
      next = options.length - 1
    } else {
      return
    }

    event.preventDefault()
    onChange(options[next].value)
    buttons.current[next]?.focus()
  }

  if (!options?.length) return null

  return (
    <div
      className="se039"
      role="group"
      aria-label={label}
      style={{
        '--se039-count': options.length,
        '--se039-index': selectedIndex,
      }}
    >
      <span className="se039-pill" aria-hidden="true" />

      {options.map((item, index) => {
        const active = item.value === value

        return (
          <button
            key={item.value}
            ref={(node) => { buttons.current[index] = node }}
            type="button"
            className={`se039-tab ${active ? 'is-active' : ''}`}
            aria-pressed={active}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
