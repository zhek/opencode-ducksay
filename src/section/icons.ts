import { createSignal, type Accessor } from "solid-js"
import type { Schedule } from "./schedule.ts"

/** The longest text the clipboard may receive from a joke. */
export const COPY_LIMIT = 4096

/**
 * Makes a joke safe for OSC 52: no control characters, one line, bounded.
 *
 * The wrapper and the joke travel together, so the limit applies to the whole
 * string the terminal is asked to copy.
 */
export function sanitizeClipboardText(text: string): string {
  const cleaned = text
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return cleaned.length <= COPY_LIMIT ? cleaned : cleaned.slice(0, COPY_LIMIT)
}

/** One confirmation timer behind a heading icon. */
export interface Feedback {
  readonly active: Accessor<boolean>
  start(): void
  clear(): void
}

/**
 * Starts a confirmation that lives for `ms` and then clears itself.
 *
 * The timer clears on its first tick, so the icon does not depend on a second
 * repaint to return to its label. A second `start()` restarts the countdown.
 */
export function createFeedback(ms: number, schedule: Schedule, requestRender: () => void): Feedback {
  const [active, setActive] = createSignal(false)
  let stop: (() => void) | undefined

  const clear = () => {
    stop?.()
    stop = undefined
    setActive(false)
  }

  const start = () => {
    clear()
    setActive(true)
    let handle: (() => void) | undefined
    handle = schedule(() => {
      handle?.()
      handle = undefined
      stop = undefined
      setActive(false)
      requestRender()
    }, ms)
    stop = handle
  }

  return { active, start, clear }
}
