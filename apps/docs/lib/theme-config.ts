/**
 * Unmint Theme Configuration
 *
 * Horus.AI documentation theme configuration.
 */

export const siteConfig = {
  // Site metadata
  name: 'Horus.AI Docs',
  description: 'Technical documentation for the Horus.AI autonomous multi-agent software generation system.',
  url: 'https://docs-three-coral.vercel.app',

  // Navigation links
  links: {
    github: '',
    discord: '',
    twitter: '',
    support: '',
  },

  // Footer configuration
  footer: {
    copyright: '© 2026 Horus.AI. Technical documentation for maintainers and operators.',
    links: [
      { label: 'Runbook', href: '/docs/runbook' },
      { label: 'Configuration', href: '/docs/configuration' },
    ],
  },
}

export const themeConfig = {
  // Primary accent color - used for active states, links, highlights
  colors: {
    // Light mode
    light: {
      accent: '#14c77b',
      accentForeground: '#06110d',
      accentMuted: 'rgba(20, 199, 123, 0.11)',
    },
    // Dark mode
    dark: {
      accent: '#28e98f',
      accentForeground: '#06110d',
      accentMuted: 'rgba(40, 233, 143, 0.13)',
    },
  },

  codeBlock: {
    light: {
      background: '#101415',
      titleBar: '#20262a',
    },
    dark: {
      background: '#101415',
      titleBar: '#20262a',
    },
  },

  // OG Image generation settings
  ogImage: {
    // Gradient background (CSS gradient string)
    gradient: 'linear-gradient(135deg, #0b0e0c 0%, #14181a 58%, #0e2a1e 100%)',
    // Text colors
    titleColor: '#eef6ff',
    sectionColor: '#28e98f',
  },
}

// Export CSS variable values for use in Tailwind
export function getCSSVariables(mode: 'light' | 'dark') {
  const colors = themeConfig.colors[mode]
  return {
    '--accent': colors.accent,
    '--accent-foreground': colors.accentForeground,
    '--accent-muted': colors.accentMuted,
  }
}

/**
 * Get the site URL dynamically
 * Priority: NEXT_PUBLIC_SITE_URL > VERCEL_PROJECT_PRODUCTION_URL > VERCEL_URL > siteConfig.url
 * This allows OG images to work automatically on Vercel without configuration
 */
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL
  }
  // Use production URL if available (custom domain)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  // Fallback to deployment URL for preview deployments
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return siteConfig.url
}
