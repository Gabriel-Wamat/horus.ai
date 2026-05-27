'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface AccordionGroupProps {
  children: React.ReactNode
}

export function AccordionGroup({ children }: AccordionGroupProps) {
  return (
    <div className="my-6 divide-y divide-[rgba(148,163,184,0.14)] rounded-lg border border-[rgba(148,163,184,0.14)] bg-[#14181a]">
      {children}
    </div>
  )
}

interface AccordionProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}

export function Accordion({ title, children, defaultOpen = false }: AccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between px-4 py-4 text-left font-medium text-[#f1f4f2] transition-colors hover:bg-[#181d1f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-inset"
      >
        <span>{title}</span>
        <svg
          aria-hidden="true"
          className={cn(
            'w-5 h-5 text-muted-foreground transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 text-[#a4adb3] [&>p]:m-0">
          {children}
        </div>
      )}
    </div>
  )
}
