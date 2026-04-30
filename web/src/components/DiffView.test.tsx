import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n-context'
import { DiffView } from '@/components/DiffView'

describe('DiffView', () => {
    it('counts blank-line additions and removals in diff stats', () => {
        render(
            <I18nProvider>
                <DiffView
                    oldString={'line 1\n\nline 3\n'}
                    newString={'line 1\nline 3\n\n'}
                    filePath="example.ts"
                    variant="inline"
                />
            </I18nProvider>
        )

        expect(screen.getByText('+1')).toBeInTheDocument()
        expect(screen.getByText('-1')).toBeInTheDocument()
        expect(screen.getByText('example.ts')).toBeInTheDocument()
    })

    it('renders a single visible header in preview mode', () => {
        render(
            <I18nProvider>
                <DiffView
                    oldString={'before\n'}
                    newString={'after\n'}
                    filePath="single-header.ts"
                />
            </I18nProvider>
        )

        expect(screen.getAllByText('single-header.ts')).toHaveLength(1)
    })

    it('reports zero lines for an empty side of the diff', () => {
        render(
            <I18nProvider>
                <DiffView oldString="" newString={'created\n'} />
            </I18nProvider>
        )

        expect(screen.getByText('0 → 1 lines')).toBeInTheDocument()
        expect(screen.getAllByText('+1').length).toBeGreaterThan(0)
    })
})
