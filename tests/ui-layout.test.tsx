// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KpiStrip, PageHeader } from '@/caliper/ui-layout'

describe('PageHeader', () => {
  it('renders eyebrow and title', () => {
    render(<PageHeader eyebrow="Jobs" title="Open roles" subtitle="All positions" actions={null} />)
    expect(screen.getByText('Jobs')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Open roles' })).toBeInTheDocument()
    expect(screen.getByText('All positions')).toBeInTheDocument()
  })
})

describe('KpiStrip', () => {
  it('renders KPI cells', () => {
    render(
      <KpiStrip
        columns={2}
        items={[
          { key: 'a', label: 'Runs', value: '12' },
          { key: 'b', label: 'Completed', value: '10', sub: '83%' },
        ]}
      />,
    )
    expect(screen.getByText('Runs')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('83%')).toBeInTheDocument()
  })

  it('supports clickable cells with aria-pressed', () => {
    render(
      <KpiStrip
        columns={1}
        items={[{ key: 's', label: 'Strong', value: '5', clickable: true, active: true, onClick: () => {} }]}
      />,
    )
    expect(screen.getByRole('button', { pressed: true })).toBeInTheDocument()
  })
})
