import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useShikiHighlighter } from '@/lib/shiki'
import { CopyIcon, CheckIcon } from '@/components/icons'
import { useTranslation } from '@/lib/use-translation'

const DEFAULT_COLLAPSE_LINE_THRESHOLD = 18
const DEFAULT_COLLAPSE_CHAR_THRESHOLD = 1800
const DEFAULT_COLLAPSED_HEIGHT = 260

function shouldCollapseCode(code: string, lineThreshold: number, charThreshold: number): boolean {
    if (code.length > charThreshold) return true
    return code.split('\n').length > lineThreshold
}

function formatCodeLabel(language?: string, title?: string): string {
    if (title && title.trim().length > 0) return title
    if (!language || language === 'unknown') return 'Code'
    return language
}

export function CodeBlock(props: {
    code: string
    language?: string
    title?: string
    showCopyButton?: boolean
    collapseLongContent?: boolean
    collapsedHeight?: number
    collapseLineThreshold?: number
    collapseCharThreshold?: number
}) {
    const { t } = useTranslation()
    const showCopyButton = props.showCopyButton ?? true
    const { copied, copy } = useCopyToClipboard()
    const highlighted = useShikiHighlighter(props.code, props.language)
    const isCollapsed = Boolean(props.collapseLongContent) && shouldCollapseCode(
        props.code,
        props.collapseLineThreshold ?? DEFAULT_COLLAPSE_LINE_THRESHOLD,
        props.collapseCharThreshold ?? DEFAULT_COLLAPSE_CHAR_THRESHOLD
    )
    const collapsedHeight = props.collapsedHeight ?? DEFAULT_COLLAPSED_HEIGHT
    const label = formatCodeLabel(props.language, props.title)

    return (
        <div className="aui-code-surface relative min-w-0 max-w-full overflow-hidden rounded-xl bg-[var(--app-code-bg)] shadow-none">
            <div className="aui-code-surface-header flex items-center justify-between gap-3 bg-[var(--app-code-header-bg)] px-3 py-2">
                <div className="min-w-0 flex-1 truncate font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--app-code-header-fg)]">
                    {label}
                </div>
                {showCopyButton ? (
                    <button
                        type="button"
                        onClick={() => copy(props.code)}
                        className="shrink-0 rounded-md p-1 text-[var(--app-code-header-fg)] transition-colors hover:bg-[var(--app-code-copy-hover-bg)] hover:text-[var(--app-fg)]"
                        title={t('code.copy')}
                    >
                        {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                    </button>
                ) : null}
            </div>

            <div
                className="min-w-0 w-full max-w-full overflow-x-auto"
                style={isCollapsed ? { maxHeight: collapsedHeight, overflowY: 'hidden' } : { overflowY: 'hidden' }}
            >
                <pre className="shiki m-0 w-max min-w-full px-4 py-3 pr-8 text-xs font-mono">
                    <code className="block">{highlighted ?? props.code}</code>
                </pre>
            </div>
            {isCollapsed ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-[var(--app-code-bg)] via-[var(--app-code-bg)]/94 to-transparent px-2 pb-2 pt-10">
                    <span className="rounded-full bg-[var(--app-chat-user-chip-bg)] px-2 py-0.5 text-[10px] text-[var(--app-hint)] shadow-none">
                        {t('code.truncated')}
                    </span>
                </div>
            ) : null}
        </div>
    )
}
