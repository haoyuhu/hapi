import type { ToolViewComponent, ToolViewProps } from '@/components/ToolCard/views/_all'
import type { ReactNode } from 'react'
import { isObject, safeStringify } from '@hapi/protocol'
import { CodeBlock } from '@/components/CodeBlock'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { ChecklistList, extractTodoChecklist } from '@/components/ToolCard/checklist'
import { basename, resolveDisplayPath } from '@/utils/path'
import { getInputStringAny } from '@/lib/toolInputUtils'

function parseToolUseError(message: string): { isToolUseError: boolean; errorMessage: string | null } {
    const regex = /<tool_use_error>(.*?)<\/tool_use_error>/s
    const match = message.match(regex)

    if (match) {
        return {
            isToolUseError: true,
            errorMessage: typeof match[1] === 'string' ? match[1].trim() : ''
        }
    }

    return { isToolUseError: false, errorMessage: null }
}

function extractTextFromContentBlock(block: unknown): string | null {
    if (typeof block === 'string') return block
    if (!isObject(block)) return null
    if (block.type === 'text' && typeof block.text === 'string') return block.text
    if (typeof block.text === 'string') return block.text
    return null
}

export function extractTextFromResult(result: unknown, depth: number = 0): string | null {
    if (depth > 2) return null
    if (result === null || result === undefined) return null
    if (typeof result === 'string') {
        const toolUseError = parseToolUseError(result)
        return toolUseError.isToolUseError ? (toolUseError.errorMessage ?? '') : result
    }

    if (Array.isArray(result)) {
        const parts = result
            .map(extractTextFromContentBlock)
            .filter((part): part is string => typeof part === 'string' && part.length > 0)
        return parts.length > 0 ? parts.join('\n') : null
    }

    if (!isObject(result)) return null

    if (typeof result.content === 'string') return result.content
    if (typeof result.text === 'string') return result.text
    if (typeof result.output === 'string') return result.output
    if (typeof result.error === 'string') return result.error
    if (typeof result.message === 'string') return result.message

    const contentArray = Array.isArray(result.content) ? result.content : null
    if (contentArray) {
        const parts = contentArray
            .map(extractTextFromContentBlock)
            .filter((part): part is string => typeof part === 'string' && part.length > 0)
        return parts.length > 0 ? parts.join('\n') : null
    }

    const nestedOutput = isObject(result.output) ? result.output : null
    if (nestedOutput) {
        if (typeof nestedOutput.content === 'string') return nestedOutput.content
        if (typeof nestedOutput.text === 'string') return nestedOutput.text
    }

    const nestedError = isObject(result.error) ? result.error : null
    if (nestedError) {
        if (typeof nestedError.message === 'string') return nestedError.message
        if (typeof nestedError.error === 'string') return nestedError.error
    }

    const nestedResult = isObject(result.result) ? result.result : null
    if (nestedResult) {
        const nestedText = extractTextFromResult(nestedResult, depth + 1)
        if (nestedText) return nestedText
    }

    const nestedData = isObject(result.data) ? result.data : null
    if (nestedData) {
        const nestedText = extractTextFromResult(nestedData, depth + 1)
        if (nestedText) return nestedText
    }

    return null
}

interface CodexBashOutput {
    exitCode: number | null
    wallTime: string | null
    output: string
}

export function extractCodexBashDisplay(result: unknown): { stdout: string | null; stderr: string | null; exitCode: number | null; status: string | null } | null {
    if (!isObject(result)) return null
    const stdout = typeof result.stdout === 'string'
        ? result.stdout
        : typeof result.output === 'string'
            ? result.output
            : null
    const stderr = typeof result.stderr === 'string' ? result.stderr : null
    const exitCode = typeof result.exit_code === 'number'
        ? result.exit_code
        : typeof result.exitCode === 'number'
            ? result.exitCode
            : null
    const status = typeof result.status === 'string' ? result.status : null
    if (stdout === null && stderr === null && exitCode === null && status === null) return null
    return { stdout, stderr, exitCode, status }
}

function parseCodexBashOutput(text: string): CodexBashOutput | null {
    const exitMatch = text.match(/^Exit code:\s*(\d+)/m)
    const wallMatch = text.match(/^Wall time:\s*(.+)$/m)
    const outputMatch = text.match(/^Output:\n([\s\S]*)$/m)

    if (!exitMatch && !wallMatch && !outputMatch) return null

    return {
        exitCode: exitMatch ? parseInt(exitMatch[1], 10) : null,
        wallTime: wallMatch ? wallMatch[1].trim() : null,
        output: outputMatch ? outputMatch[1] : text
    }
}

export function getMutationResultRenderMode(text: string, state: string): { mode: 'code' | 'auto'; language?: string } {
    const isMultiline = text.split('\n').length > 3
    const mode = state === 'error' || isMultiline ? 'code' as const : 'auto' as const
    return { mode, language: mode === 'code' ? 'text' : undefined }
}

function looksLikeHtml(text: string): boolean {
    const trimmed = text.trimStart()
    return trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<div') || trimmed.startsWith('<span')
}

function looksLikeJson(text: string): boolean {
    const trimmed = text.trim()
    return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))
}

function looksLikeStandaloneMarkdownCodeBlock(text: string): boolean {
    const trimmed = text.trim()
    const fence = trimmed.startsWith('```') ? '```' : trimmed.startsWith('~~~') ? '~~~' : null
    if (!fence) return false

    const lines = trimmed.split('\n')
    if (lines.length < 2) return false

    const lastLine = lines[lines.length - 1]?.trim()
    return lastLine === fence
}

function resultCodeBlockProps(surface: ToolViewProps['surface'], collapseLongContent?: boolean) {
    return surface === 'dialog'
        ? { collapseLongContent: false, size: 'comfortable' as const, scrollY: true }
        : { collapseLongContent }
}

function renderResultBody(
    content: ReactNode,
    surface: ToolViewProps['surface'],
    opts: { forceQuote?: boolean } = {}
) {
    if (surface !== 'dialog' && !opts.forceQuote) return content

    return (
        <div className="tool-result-quote rounded-r-2xl border-l-[3px] border-[var(--app-md-quote-border)] bg-[var(--app-md-quote-bg)] px-4 py-3 text-sm leading-6 text-[var(--app-md-quote-fg)]">
            {content}
        </div>
    )
}

function renderPlainTextQuote(text: string, surface: ToolViewProps['surface']) {
    return renderResultBody(
        <div className="whitespace-pre-wrap break-words">
            {text}
        </div>,
        surface,
        { forceQuote: true }
    )
}

function renderMarkdown(text: string, surface: ToolViewProps['surface']) {
    return (
        <MarkdownRenderer
            content={text}
            className={surface === 'dialog' ? 'text-[var(--app-md-quote-fg)]' : undefined}
        />
    )
}

function renderText(text: string, opts: { mode: 'markdown' | 'code' | 'auto'; language?: string; collapseLongContent?: boolean; surface?: ToolViewProps['surface'] } = { mode: 'auto' }) {
    if (opts.mode === 'code') {
        return <CodeBlock code={text} language={opts.language ?? 'text'} {...resultCodeBlockProps(opts.surface, opts.collapseLongContent)} />
    }

    if (opts.mode === 'markdown') {
        const markdown = renderMarkdown(text, opts.surface)
        return looksLikeStandaloneMarkdownCodeBlock(text)
            ? markdown
            : renderResultBody(markdown, opts.surface)
    }

    if (looksLikeHtml(text) || looksLikeJson(text)) {
        return <CodeBlock code={text} language={looksLikeJson(text) ? 'json' : 'html'} {...resultCodeBlockProps(opts.surface, opts.collapseLongContent)} />
    }

    if (looksLikeStandaloneMarkdownCodeBlock(text)) {
        return renderMarkdown(text, opts.surface)
    }

    return renderResultBody(renderMarkdown(text, opts.surface), opts.surface)
}

function placeholderForState(state: ToolViewProps['block']['tool']['state']): string {
    if (state === 'pending') return 'Waiting for permission…'
    if (state === 'running') return 'Running…'
    return '(no output)'
}

function RawJsonDevOnly(props: { value: unknown; surface?: ToolViewProps['surface'] }) {
    if (!import.meta.env.DEV) return null
    if (props.value === null || props.value === undefined) return null

    return (
        <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium text-[var(--app-hint)]">
                Raw JSON
            </summary>
            <div className="mt-2">
                <CodeBlock code={safeStringify(props.value)} language="json" title="Raw JSON" {...resultCodeBlockProps(props.surface, false)} />
            </div>
        </details>
    )
}

function extractStdoutStderr(result: unknown): { stdout: string | null; stderr: string | null } | null {
    if (!isObject(result)) return null

    const stdout = typeof result.stdout === 'string' ? result.stdout : null
    const stderr = typeof result.stderr === 'string' ? result.stderr : null
    if (stdout !== null || stderr !== null) {
        return { stdout, stderr }
    }

    const nested = isObject(result.output) ? result.output : null
    if (nested) {
        const nestedStdout = typeof nested.stdout === 'string' ? nested.stdout : null
        const nestedStderr = typeof nested.stderr === 'string' ? nested.stderr : null
        if (nestedStdout !== null || nestedStderr !== null) {
            return { stdout: nestedStdout, stderr: nestedStderr }
        }
    }

    return null
}

function extractReadFileContent(result: unknown): { filePath: string | null; content: string } | null {
    if (!isObject(result)) return null
    const file = isObject(result.file) ? result.file : null
    if (!file) return null

    const content = typeof file.content === 'string' ? file.content : null
    if (content === null) return null

    const filePath = typeof file.filePath === 'string'
        ? file.filePath
        : typeof file.file_path === 'string'
            ? file.file_path
            : null

    return { filePath, content }
}

function isReadFileToolCall(toolName: string, input: unknown): boolean {
    if (toolName === 'Read' || toolName === 'NotebookRead') return true

    const normalizedName = toolName.toLowerCase()
    if (normalizedName.includes('read_file') || normalizedName.includes('readfile')) return true

    if (!isObject(input)) return false
    if (Array.isArray(input.parsed_cmd)) {
        return input.parsed_cmd.some((cmd) => isObject(cmd) && cmd.type === 'read')
    }

    return false
}

function extractLineList(text: string): string[] {
    return text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
}

function isProbablyMarkdownList(text: string): boolean {
    const trimmed = text.trimStart()
    return trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('1. ')
}

const AskUserQuestionResultView: ToolViewComponent = (props: ToolViewProps) => {
    const answers = props.block.tool.permission?.answers ?? null

    // If answers exist, AskUserQuestionView already shows them with highlighting
    // Return null to avoid duplicate display
    if (answers && Object.keys(answers).length > 0) {
        return null
    }

    // Fallback for tools without structured answers
    return <MarkdownResultView {...props} />
}

const BashResultView: ToolViewComponent = (props: ToolViewProps) => {
    const result = props.block.tool.result

    if (result === undefined || result === null) {
        return <div className="text-sm text-[var(--app-hint)]">{placeholderForState(props.block.tool.state)}</div>
    }

    if (typeof result === 'string') {
        const toolUseError = parseToolUseError(result)
        const display = toolUseError.isToolUseError ? (toolUseError.errorMessage ?? '') : result
        return (
            <>
                <CodeBlock code={display} language="text" {...resultCodeBlockProps(props.surface, props.surface === 'inline')} />
                <RawJsonDevOnly value={result} surface={props.surface} />
            </>
        )
    }

    const stdio = extractStdoutStderr(result)
    if (stdio) {
        return (
            <>
                <div className="flex flex-col gap-2">
                    {stdio.stdout ? <CodeBlock code={stdio.stdout} language="text" title="stdout" {...resultCodeBlockProps(props.surface, props.surface === 'inline')} /> : null}
                    {stdio.stderr ? <CodeBlock code={stdio.stderr} language="text" title="stderr" {...resultCodeBlockProps(props.surface, props.surface === 'inline')} /> : null}
                </div>
                <RawJsonDevOnly value={result} surface={props.surface} />
            </>
        )
    }

    const text = extractTextFromResult(result)
    if (text) {
        return (
            <>
                {renderText(text, { mode: 'code', language: 'text', collapseLongContent: props.surface === 'inline', surface: props.surface })}
                <RawJsonDevOnly value={result} surface={props.surface} />
            </>
        )
    }

    return (
        <>
            <div className="text-sm text-[var(--app-hint)]">(no output)</div>
            <RawJsonDevOnly value={result} surface={props.surface} />
        </>
    )
}

const CodexBashResultView: ToolViewComponent = (props: ToolViewProps) => {
    const result = props.block.tool.result

    if (result === undefined || result === null) {
        return <div className="text-sm text-[var(--app-hint)]">{placeholderForState(props.block.tool.state)}</div>
    }

    const display = extractCodexBashDisplay(result)
    if (display) {
        const stdout = display.stdout?.trimEnd() ?? ''
        const stderr = display.stderr?.trimEnd() ?? ''
        return (
            <>
                <div className="flex flex-col gap-2">
                    <div className="text-xs text-[var(--app-hint)]">
                        {display.exitCode !== null ? `exit ${display.exitCode}` : display.status ?? 'completed'}
                    </div>
                    {stdout ? <CodeBlock code={stdout} language="text" /> : null}
                    {stderr ? <CodeBlock code={stderr} language="text" /> : null}
                    {!stdout && !stderr ? (
                        <div className="text-sm text-[var(--app-hint)]">
                            {display.exitCode === 0 || display.status === 'completed' ? 'Done' : '(no output)'}
                        </div>
                    ) : null}
                </div>
                <RawJsonDevOnly value={result} />
            </>
        )
    }

    return <GenericResultView {...props} />
}

const MarkdownResultView: ToolViewComponent = (props: ToolViewProps) => {
    const result = props.block.tool.result

    if (result === undefined || result === null) {
        return <div className="text-sm text-[var(--app-hint)]">{placeholderForState(props.block.tool.state)}</div>
    }

    const text = extractTextFromResult(result)
    if (text) {
        return (
            <>
                {renderText(text, { mode: 'auto', collapseLongContent: props.surface === 'inline', surface: props.surface })}
                <RawJsonDevOnly value={result} surface={props.surface} />
            </>
        )
    }

    return (
        <>
            <div className="text-sm text-[var(--app-hint)]">(no output)</div>
            <RawJsonDevOnly value={result} surface={props.surface} />
        </>
    )
}

const LineListResultView: ToolViewComponent = (props: ToolViewProps) => {
    const result = props.block.tool.result

    if (result === undefined || result === null) {
        return <div className="text-sm text-[var(--app-hint)]">{placeholderForState(props.block.tool.state)}</div>
    }

    const text = extractTextFromResult(result)
    if (!text) {
        return (
            <>
                <div className="text-sm text-[var(--app-hint)]">(no output)</div>
                <RawJsonDevOnly value={result} surface={props.surface} />
            </>
        )
    }

    if (isProbablyMarkdownList(text)) {
        return (
            <>
                {renderResultBody(renderMarkdown(text, props.surface), props.surface)}
                <RawJsonDevOnly value={result} surface={props.surface} />
            </>
        )
    }

    const lines = extractLineList(text)
    if (lines.length === 0) {
        return (
            <>
                <div className="text-sm text-[var(--app-hint)]">(no output)</div>
                <RawJsonDevOnly value={result} surface={props.surface} />
            </>
        )
    }

    return (
        <>
            {renderResultBody(
                <div className="flex flex-col gap-1">
                    {lines.map((line) => (
                        <div key={line} className={props.surface === 'dialog' ? 'text-sm font-mono text-[var(--app-md-quote-fg)] break-all' : 'text-sm font-mono text-[var(--app-fg)] break-all'}>
                            {line}
                        </div>
                    ))}
                </div>,
                props.surface
            )}
            <RawJsonDevOnly value={result} surface={props.surface} />
        </>
    )
}

const ReadResultView: ToolViewComponent = (props: ToolViewProps) => {
    const result = props.block.tool.result

    if (result === undefined || result === null) {
        return <div className="text-sm text-[var(--app-hint)]">{placeholderForState(props.block.tool.state)}</div>
    }

    const file = extractReadFileContent(result)
    if (file) {
        const path = file.filePath ? resolveDisplayPath(file.filePath, props.metadata) : null
        return (
            <>
                {path ? (
                    <div className="mb-2 text-xs text-[var(--app-hint)] font-mono break-all">
                        {basename(path)}
                    </div>
                ) : null}
                {renderPlainTextQuote(file.content, props.surface)}
                <RawJsonDevOnly value={result} surface={props.surface} />
            </>
        )
    }

    const text = extractTextFromResult(result)
    if (text) {
        return (
            <>
                {renderPlainTextQuote(text, props.surface)}
                <RawJsonDevOnly value={result} surface={props.surface} />
            </>
        )
    }

    return (
        <>
            <div className="text-sm text-[var(--app-hint)]">(no output)</div>
            <RawJsonDevOnly value={result} surface={props.surface} />
        </>
    )
}

const MutationResultView: ToolViewComponent = (props: ToolViewProps) => {
    const { state, result } = props.block.tool

    if (result === undefined || result === null) {
        if (state === 'completed') {
            return <div className="text-sm text-[var(--app-hint)]">Done</div>
        }
        return <div className="text-sm text-[var(--app-hint)]">{placeholderForState(state)}</div>
    }

    const text = extractTextFromResult(result)
    if (typeof text === 'string' && text.trim().length > 0) {
        const className = state === 'error' ? 'text-red-600' : 'text-[var(--app-fg)]'
        const { mode, language } = getMutationResultRenderMode(text, state)
        return (
            <>
                <div className={`text-sm ${className}`}>
                    {renderText(text, { mode, language, collapseLongContent: props.surface === 'inline', surface: props.surface })}
                </div>
                <RawJsonDevOnly value={result} surface={props.surface} />
            </>
        )
    }

    return (
        <>
            <div className="text-sm text-[var(--app-hint)]">
                {state === 'completed' ? 'Done' : '(no output)'}
            </div>
            <RawJsonDevOnly value={result} surface={props.surface} />
        </>
    )
}

const CodexPatchResultView: ToolViewComponent = (props: ToolViewProps) => {
    const result = props.block.tool.result
    const text = extractTextFromResult(result)
    if (text) {
        return (
            <>
                {renderText(text, { mode: 'auto', collapseLongContent: props.surface === 'inline', surface: props.surface })}
                <RawJsonDevOnly value={result} surface={props.surface} />
            </>
        )
    }

    if (result === undefined || result === null) {
        return props.block.tool.state === 'completed'
            ? <div className="text-sm text-[var(--app-hint)]">Done</div>
            : <div className="text-sm text-[var(--app-hint)]">{placeholderForState(props.block.tool.state)}</div>
    }

    return (
        <>
            <div className="text-sm text-[var(--app-hint)]">(no output)</div>
            <RawJsonDevOnly value={result} surface={props.surface} />
        </>
    )
}

const CodexReasoningResultView: ToolViewComponent = (props: ToolViewProps) => {
    const result = props.block.tool.result
    if (result === undefined || result === null) {
        return <div className="text-sm text-[var(--app-hint)]">{placeholderForState(props.block.tool.state)}</div>
    }

    const text = extractTextFromResult(result)
    if (text) {
        return (
            <>
                {renderText(text, { mode: 'auto', collapseLongContent: props.surface === 'inline', surface: props.surface })}
                <RawJsonDevOnly value={result} surface={props.surface} />
            </>
        )
    }

    return (
        <>
            <div className="text-sm text-[var(--app-hint)]">(no output)</div>
            <RawJsonDevOnly value={result} surface={props.surface} />
        </>
    )
}

const CodexDiffResultView: ToolViewComponent = (props: ToolViewProps) => {
    const result = props.block.tool.result
    if (result === undefined || result === null) {
        return props.block.tool.state === 'completed'
            ? <div className="text-sm text-[var(--app-hint)]">Done</div>
            : <div className="text-sm text-[var(--app-hint)]">{placeholderForState(props.block.tool.state)}</div>
    }

    const text = extractTextFromResult(result)
    if (text) {
        return (
            <>
                {renderText(text, { mode: 'code', language: 'diff', collapseLongContent: props.surface === 'inline', surface: props.surface })}
                <RawJsonDevOnly value={result} surface={props.surface} />
            </>
        )
    }

    return (
        <>
            <div className="text-sm text-[var(--app-hint)]">Done</div>
            <RawJsonDevOnly value={result} surface={props.surface} />
        </>
    )
}

const TodoWriteResultView: ToolViewComponent = (props: ToolViewProps) => {
    const todos = extractTodoChecklist(props.block.tool.input, props.block.tool.result)
    if (todos.length === 0) {
        return <div className="text-sm text-[var(--app-hint)]">{placeholderForState(props.block.tool.state)}</div>
    }

    return <ChecklistList items={todos} />
}

const AgentResultView: ToolViewComponent = (props: ToolViewProps) => {
    const { state, result } = props.block.tool

    if (result === undefined || result === null) {
        return <div className="text-sm text-[var(--app-hint)]">{placeholderForState(state)}</div>
    }

    // For errors, show the error text
    if (state === 'error') {
        const text = extractTextFromResult(result)
        return (
            <div className="text-sm text-red-600">
                {text?.trim() ? text : 'Agent failed'}
            </div>
        )
    }

    const text = extractTextFromResult(result)
    if (!text) {
        return <div className="text-sm text-[var(--app-hint)]">{state === 'completed' ? 'Done' : placeholderForState(state)}</div>
    }

    // Detect internal launch metadata. Check structurally first (result object
    // may carry agentId/output_file keys), then fall back to a strict text
    // pattern that is unlikely to appear in normal agent prose.
    const isInternalMeta = isObject(result) && ('agentId' in result || 'output_file' in result)
        || (text.startsWith('Async agent launched successfully.') && text.includes('agentId:'))

    if (isInternalMeta) {
        return <div className="text-sm text-[var(--app-hint)]">Agent launched</div>
    }

    return (
        <>
            {renderResultBody(renderMarkdown(text, props.surface), props.surface)}
            <RawJsonDevOnly value={result} surface={props.surface} />
        </>
    )
}

const SkillResultView: ToolViewComponent = (props: ToolViewProps) => {
    const { state, result, input } = props.block.tool

    if (result === undefined || result === null) {
        if (state === 'completed') {
            return <div className="text-sm text-[var(--app-hint)]">Skill loaded</div>
        }
        return <div className="text-sm text-[var(--app-hint)]">{placeholderForState(state)}</div>
    }

    // For errors, show the error text
    if (state === 'error') {
        const text = extractTextFromResult(result)
        return (
            <div className="text-sm text-red-600">
                {text?.trim() ? text : 'Failed to load skill'}
            </div>
        )
    }

    // For successful loads, show just the skill name
    const skillName = getInputStringAny(input, ['skill'])
    return (
        <div className="text-sm text-[var(--app-hint)]">
            {skillName ? `Skill "${skillName}" loaded` : 'Skill loaded'}
        </div>
    )
}

const GenericResultView: ToolViewComponent = (props: ToolViewProps) => {
    const result = props.block.tool.result

    if (result === undefined || result === null) {
        return <div className="text-sm text-[var(--app-hint)]">{placeholderForState(props.block.tool.state)}</div>
    }

    // Detect codex bash output format and render accordingly
    if (typeof result === 'string') {
        const parsed = parseCodexBashOutput(result)
        if (parsed) {
            return (
                <>
                    <div className="text-xs text-[var(--app-hint)] mb-2">
                        {parsed.exitCode !== null && `Exit code: ${parsed.exitCode}`}
                        {parsed.exitCode !== null && parsed.wallTime && ' · '}
                        {parsed.wallTime && `Wall time: ${parsed.wallTime}`}
                    </div>
                    {isReadFileToolCall(props.block.tool.name, props.block.tool.input)
                        ? renderPlainTextQuote(parsed.output.trim(), props.surface)
                        : renderText(parsed.output.trim(), { mode: 'code', surface: props.surface })}
                    <RawJsonDevOnly value={result} surface={props.surface} />
                </>
            )
        }
    }

    const text = extractTextFromResult(result)
    if (text) {
        return (
            <>
                {isReadFileToolCall(props.block.tool.name, props.block.tool.input)
                    ? renderPlainTextQuote(text, props.surface)
                    : renderText(text, { mode: 'auto', collapseLongContent: props.surface === 'inline', surface: props.surface })}
                {typeof result === 'object' ? <RawJsonDevOnly value={result} surface={props.surface} /> : null}
            </>
        )
    }

    if (typeof result === 'string') {
        return renderText(result, { mode: 'auto', collapseLongContent: props.surface === 'inline', surface: props.surface })
    }

    return <CodeBlock code={safeStringify(result)} language="json" title="JSON" {...resultCodeBlockProps(props.surface, props.surface === 'inline')} />
}

export const toolResultViewRegistry: Record<string, ToolViewComponent> = {
    Task: MarkdownResultView,
    Bash: BashResultView,
    Glob: LineListResultView,
    Grep: LineListResultView,
    LS: LineListResultView,
    Read: ReadResultView,
    Edit: MutationResultView,
    MultiEdit: MutationResultView,
    Write: MutationResultView,
    WebFetch: MarkdownResultView,
    WebSearch: MarkdownResultView,
    NotebookRead: ReadResultView,
    NotebookEdit: MutationResultView,
    TodoWrite: TodoWriteResultView,
    CodexBash: CodexBashResultView,
    CodexReasoning: CodexReasoningResultView,
    CodexPatch: CodexPatchResultView,
    CodexDiff: CodexDiffResultView,
    Skill: SkillResultView,
    Agent: AgentResultView,
    AskUserQuestion: AskUserQuestionResultView,
    ExitPlanMode: MarkdownResultView,
    ask_user_question: AskUserQuestionResultView,
    exit_plan_mode: MarkdownResultView
}

export function getToolResultViewComponent(toolName: string): ToolViewComponent {
    if (toolName.startsWith('mcp__')) {
        return GenericResultView
    }
    return toolResultViewRegistry[toolName] ?? GenericResultView
}
