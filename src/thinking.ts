/**
 * The duck's thinking and typing, as data and pure functions.
 *
 * While the joke request is in flight the bubble shows `Quack` with a growing
 * ellipsis; once the answer arrives its words appear one at a time and the beak
 * flaps in time with them. Nothing here knows about the renderer or Solid: the
 * section owns the clock and asks these functions what a frame looks like.
 */

/** The word the waiting bubble starts from. */
export const THINKING_BASE = "Quack"

/**
 * Dots shown at each step of the waiting animation.
 *
 * The triple repeats on purpose: `Quack...` is held for two steps, so the jump
 * back to one dot reads as the start of a cycle rather than a glitch. The step
 * lives in the data so the timer only has to advance an index.
 */
export const THINKING_STEPS = [1, 2, 3, 3] as const

/** How long one waiting frame stays on screen, in milliseconds. */
export const THINK_FRAME_MS = 300

/** How long one word stays alone before the next one arrives, in milliseconds. */
export const WORD_FRAME_MS = 180

/** How many words one beak position lasts. */
export const BEAK_TOGGLE_WORDS = 2

/** The waiting message with `dots` full stops after it. */
export function thinkingText(dots: number): string {
  return THINKING_BASE + ".".repeat(Math.max(0, dots))
}

/**
 * Splits a message into the words the bubble reveals.
 *
 * The split matches `wrapBubbleText`: any run of whitespace separates words, so
 * a revealed prefix wraps exactly the way the full text does up to that word.
 */
export function bubbleWords(text: string): string[] {
  return text.split(/\s+/).filter((word) => word !== "")
}

/**
 * The first `count` words of `text`, joined by one space.
 *
 * The count is clamped, so a timer that fires once more than needed shows the
 * whole message instead of running off the end or leaving a gap.
 */
export function revealText(text: string, count: number): string {
  return bubbleWords(text)
    .slice(0, Math.max(0, count))
    .join(" ")
}

/**
 * Whether the beak is open after `count` of `total` words.
 *
 * The first two words are said with the beak open, the next two closed, and so
 * on; the last word always leaves it open, so the duck stops with an open beak
 * however the cadence happens to land. A message with no words counts as done.
 */
export function beakOpen(count: number, total: number): boolean {
  if (count >= total) return true
  return Math.floor((count - 1) / BEAK_TOGGLE_WORDS) % 2 === 0
}

/** Whether a word should be followed by a longer pause. */
export function holdsAfter(word: string): boolean {
  return /[.,!?;:…]$/.test(word)
}
