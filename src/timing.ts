/**
 * Timing and drawing constants shared by the section, the tests and the demo
 * GIF generator.
 *
 * Keeping them here means a test or the demo cannot drift from the plugin by
 * carrying its own copy of a tick or a feedback delay.
 */

/** Roughly the frame rate the TUI runs at, in milliseconds. */
export const TICK_MS = 33

/**
 * How many columns the duck may cover in one tick. It bounds a clock jump — a
 * machine waking up from suspend — instead of teleporting the duck.
 */
export const MAX_COLUMNS_PER_TICK = 8

/**
 * Columns of water generated per row. Wider than any sidebar, and cut at the
 * lane's edge by `wrapMode="none"`, so the row never has to be measured.
 */
export const WATER_WIDTH = 160

/** The message the duck shows at rest; tests may override it through `bubbleText`. */
export const DEFAULT_BUBBLE_TEXT = "Quack-quack!"

/** How long the confirmation stays before the icon returns to its label. */
export const COPY_FEEDBACK_MS = 1200

/** The screenshot confirmation lives as long as the copy one. */
export const SCREENSHOT_FEEDBACK_MS = 1200
