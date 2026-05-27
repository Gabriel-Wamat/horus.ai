'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { SearchTrigger } from './search-dialog'
import { ThemeToggle } from './theme-toggle'
import { MobileSidebar } from './mobile-sidebar'
import type { Root } from 'fumadocs-core/page-tree'

interface DocsHeaderProps {
  tree: Root
}

export function DocsHeader({ tree }: DocsHeaderProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const openMobileMenu = useCallback(() => setIsMobileMenuOpen(true), [])
  const closeMobileMenu = useCallback(() => setIsMobileMenuOpen(false), [])

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-[rgba(148,163,184,0.14)] bg-[linear-gradient(180deg,#151a1c_0%,#101415_100%)] backdrop-blur">
        <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            {/* Left: Hamburger + Logo */}
            <div className="flex items-center gap-2">
              {/* Mobile menu button */}
              <button
                onClick={openMobileMenu}
                className="lg:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Open menu"
                aria-expanded={isMobileMenuOpen}
              >
                <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {/* Logo */}
              <Link href="/" className="flex items-center gap-2.5">
                <span className="font-semibold text-xl tracking-normal text-[#f1f4f2] hidden sm:inline">
                  Horus<span className="text-[var(--accent)]">.AI</span> Docs
                </span>
              </Link>
            </div>

            {/* Center: Search */}
            <div className="flex-1 flex justify-center px-2 sm:px-8">
              <SearchTrigger />
            </div>

            {/* Right: Links */}
            <div className="flex items-center gap-1 sm:gap-2">
              <ThemeToggle />
            </div>
          </div>

          <nav className="hidden md:flex h-12 items-end gap-8 text-sm text-[#a4adb3]">
            {[
              ['Overview', '/docs'],
              ['Architecture', '/docs/architecture'],
              ['Workflow', '/docs/workflow'],
              ['Persistence', '/docs/persistence'],
              ['Runbook', '/docs/runbook'],
              ['Contribute', '/docs/contributing'],
            ].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="border-b-2 border-transparent pb-3 transition-colors hover:border-[rgba(20,199,123,0.58)] hover:text-[#f1f4f2]"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Mobile sidebar */}
      <MobileSidebar
        tree={tree}
        isOpen={isMobileMenuOpen}
        onClose={closeMobileMenu}
      />
    </>
  )
}
