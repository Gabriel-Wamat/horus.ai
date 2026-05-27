import type { MDXComponents } from 'mdx/types'
import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'

// Component imports
import { Card, CardGroup } from './card'
import { Info, Tip, Warning, Note, Check } from './callout'
import { Steps, Step } from './steps'
import { Tabs, Tab } from './tabs'
import { Accordion, AccordionGroup } from './accordion'
import { CodeBlock } from './code-block'
import { Frame } from './frame'
import { YouTube } from './youtube'
import { Pre } from './pre'
import {
  AgentWorkflowDiagram,
  DeploymentTopologyDiagram,
  PrimaryFlowDiagram,
  PreviewRuntimeDiagram,
  RepositoryOwnershipDiagram,
  PersistenceTopologyDiagram,
  SystemArchitectureDiagram,
  WorkflowSequenceDiagram,
} from './architecture-diagrams'

// Re-export for direct imports
export { Card, CardGroup } from './card'
export { Info, Tip, Warning, Note, Check } from './callout'
export { Steps, Step } from './steps'
export { Tabs, Tab } from './tabs'
export { Accordion, AccordionGroup } from './accordion'
export { CodeBlock } from './code-block'
export { Frame } from './frame'
export { YouTube } from './youtube'
export { Pre } from './pre'
export {
  AgentWorkflowDiagram,
  DeploymentTopologyDiagram,
  PrimaryFlowDiagram,
  PreviewRuntimeDiagram,
  RepositoryOwnershipDiagram,
  PersistenceTopologyDiagram,
  SystemArchitectureDiagram,
  WorkflowSequenceDiagram,
} from './architecture-diagrams'

export function getMDXComponents(): MDXComponents {
  return {
    // Custom components
    Card,
    CardGroup,
    Info,
    Tip,
    Warning,
    Note,
    Check,
    Steps,
    Step,
    Tabs,
    Tab,
    Accordion,
    AccordionGroup,
    CodeBlock,
    Frame,
    YouTube,
    AgentWorkflowDiagram,
    DeploymentTopologyDiagram,
    PrimaryFlowDiagram,
    PreviewRuntimeDiagram,
    RepositoryOwnershipDiagram,
    PersistenceTopologyDiagram,
    SystemArchitectureDiagram,
    WorkflowSequenceDiagram,

    // HTML element overrides
    h1: ({ children, id }) => (
      <h1 id={id} className="scroll-m-20 text-4xl font-bold tracking-tight mt-8 mb-4 first:mt-0">
        {children}
      </h1>
    ),
    h2: ({ children, id }) => (
      <h2 id={id} className="scroll-m-20 text-2xl font-semibold tracking-tight mt-10 mb-4 pb-2 border-b border-border">
        <a href={`#${id}`} className="hover:underline">
          {children}
        </a>
      </h2>
    ),
    h3: ({ children, id }) => (
      <h3 id={id} className="scroll-m-20 text-xl font-semibold tracking-tight mt-8 mb-4">
        <a href={`#${id}`} className="hover:underline">
          {children}
        </a>
      </h3>
    ),
    h4: ({ children, id }) => (
      <h4 id={id} className="scroll-m-20 text-lg font-semibold tracking-tight mt-6 mb-4">
        {children}
      </h4>
    ),
    p: ({ children }) => (
      <p className="leading-7 text-muted-foreground [&:not(:first-child)]:mt-4">
        {children}
      </p>
    ),
    a: ({ href, children }) => {
      const isExternal = href?.startsWith('http')
      if (isExternal) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline"
          >
            {children}
          </a>
        )
      }
      return (
        <Link href={href || ''} className="text-[var(--accent)] hover:underline">
          {children}
        </Link>
      )
    },
    ul: ({ children }) => (
      <ul className="my-4 ml-6 list-disc text-muted-foreground [&>li]:mt-2">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="my-4 ml-6 list-decimal text-muted-foreground [&>li]:mt-2">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="leading-7">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="mt-6 border-l-4 border-border pl-4 italic text-muted-foreground">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="my-8 border-border" />,
    table: ({ children }) => (
      <div className="my-7 w-full overflow-x-auto rounded-lg border border-[rgba(148,163,184,0.22)] bg-[#101415] shadow-[0_18px_48px_rgba(0,0,0,0.18)]">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-[#20262a] text-[#f1f4f2]">{children}</thead>
    ),
    tbody: ({ children }) => (
      <tbody className="divide-y divide-[rgba(148,163,184,0.18)]">{children}</tbody>
    ),
    tr: ({ children }) => (
      <tr className="odd:bg-[#14181a] even:bg-[#181d1f] hover:bg-[#20262a]">
        {children}
      </tr>
    ),
    th: ({ children }) => (
      <th className="border-b border-[rgba(148,163,184,0.26)] px-5 py-4 text-left text-sm font-semibold text-[#f1f4f2]">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="px-5 py-4 align-top leading-7 text-[#c7d0d5] [&_code]:whitespace-nowrap">{children}</td>
    ),
    pre: Pre,
    code: ({ children, className }) => {
      // Inline code (no className from syntax highlighter)
      if (!className) {
        return (
          <code className="mx-0.5 rounded-md border border-[rgba(148,163,184,0.22)] bg-[#0f1314] px-1.5 py-0.5 font-mono text-sm text-[#f1f4f2]">
            {children}
          </code>
        )
      }
      // Code block (has className from syntax highlighter)
      return <code className={className}>{children}</code>
    },
    img: ({ src, alt, ...props }) => (
      <span className="block my-6">
        <Image
          src={src || ''}
          alt={alt || ''}
          width={800}
          height={400}
          className="rounded-lg max-w-full h-auto"
          {...props}
        />
      </span>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold text-foreground">{children}</strong>
    ),
    em: ({ children }) => <em className="italic">{children}</em>,
  }
}
