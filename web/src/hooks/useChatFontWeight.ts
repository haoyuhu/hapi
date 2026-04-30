import { useCallback, useEffect, useLayoutEffect, useState } from 'react'

export type ChatFontWeight = 350 | 400 | 500 | 600

export function getChatFontWeightOptions(): ReadonlyArray<{ value: ChatFontWeight; labelKey: string }> {
    return [
        { value: 350, labelKey: 'settings.display.fontWeight.light' },
        { value: 400, labelKey: 'settings.display.fontWeight.regular' },
        { value: 500, labelKey: 'settings.display.fontWeight.medium' },
        { value: 600, labelKey: 'settings.display.fontWeight.semibold' },
    ]
}

function getChatFontWeightStorageKey(): string {
    return 'hapi-chat-font-weight'
}

function isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined'
}

const useIsomorphicLayoutEffect = isBrowser() ? useLayoutEffect : useEffect

function safeGetItem(key: string): string | null {
    if (!isBrowser()) {
        return null
    }
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}

function safeSetItem(key: string, value: string): void {
    if (!isBrowser()) {
        return
    }
    try {
        localStorage.setItem(key, value)
    } catch {
        // Ignore storage errors
    }
}

function safeRemoveItem(key: string): void {
    if (!isBrowser()) {
        return
    }
    try {
        localStorage.removeItem(key)
    } catch {
        // Ignore storage errors
    }
}

function parseChatFontWeight(raw: string | null): ChatFontWeight {
    const value = Number(raw)
    if (value === 350 || value === 400 || value === 500 || value === 600) {
        return value
    }
    return 400
}

function applyChatFontWeight(weight: ChatFontWeight): void {
    if (!isBrowser()) {
        return
    }
    document.documentElement.style.setProperty('--app-chat-font-weight', String(weight))
}

function getInitialChatFontWeight(): ChatFontWeight {
    return parseChatFontWeight(safeGetItem(getChatFontWeightStorageKey()))
}

export function initializeChatFontWeight(): void {
    applyChatFontWeight(getInitialChatFontWeight())
}

export function useChatFontWeight(): { chatFontWeight: ChatFontWeight; setChatFontWeight: (weight: ChatFontWeight) => void } {
    const [chatFontWeight, setChatFontWeightState] = useState<ChatFontWeight>(getInitialChatFontWeight)

    useIsomorphicLayoutEffect(() => {
        applyChatFontWeight(chatFontWeight)
    }, [chatFontWeight])

    useEffect(() => {
        if (!isBrowser()) {
            return
        }

        const onStorage = (event: StorageEvent) => {
            if (event.key !== getChatFontWeightStorageKey()) {
                return
            }
            setChatFontWeightState(parseChatFontWeight(event.newValue))
        }

        window.addEventListener('storage', onStorage)
        return () => window.removeEventListener('storage', onStorage)
    }, [])

    const setChatFontWeight = useCallback((weight: ChatFontWeight) => {
        setChatFontWeightState(weight)

        if (weight === 400) {
            safeRemoveItem(getChatFontWeightStorageKey())
        } else {
            safeSetItem(getChatFontWeightStorageKey(), String(weight))
        }
    }, [])

    return { chatFontWeight, setChatFontWeight }
}
