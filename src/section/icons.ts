import { createSignal, type Accessor } from "solid-js"
import type { Schedule } from "./schedule.ts"

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
