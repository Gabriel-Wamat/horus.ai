'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface CodeBlockProps {
  children: React.ReactNode
  title?: string
  className?: string
}

export function CodeBlock({ children, title, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const code = document.querySelector('.code-block-content')?.textContent
    if (code) {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className={cn('my-6 overflow-hidden rounded-lg border border-[rgba(148,163,184,0.18)]', className)}>
      {title && (
        <div className="flex items-center justify-between border-b border-[rgba(148,163,184,0.18)] bg-[#20262a] px-4 py-2">
          <span className="text-sm font-medium text-[#c7d0d5]">{title}</span>
          <button
            onClick={handleCopy}
            className="text-xs text-[#a4adb3] transition-colors hover:text-[#f1f4f2]"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}
      <div className="code-block-content overflow-x-auto bg-[#101415]">
        {children}
      </div>
    </div>
  )
}
