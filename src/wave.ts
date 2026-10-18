/**
 * The water the duck swims in.
 *
 * The water is two rows of dashes under the duck, drawn as clusters of four
 * tildes separated by five empty columns. The clusters are wider than one cell
 * on purpose: a single tilde every other column has only two states, so the
 * only way to move it is to flip the whole grid at once, and a 37-column lane
 * flickers instead of flowing. A cluster moves a column at a time and reads as
 * travel.
 *
 * The two rows are offset from each other so their clusters do not line up.
 * Aligned, the clusters stack into blocks and read as a fence; staggered, they
 * read as ripples.
 *
 * Everything here stays data and pure functions, the way `lane.ts` does: the
 * section asks what a row looks like, and nothing here knows about the duck,
 * the renderer or Solid.
 */

/** Tildes in one cluster. */
export const WAVE_RUN = 4

/** Empty columns between clusters. */
export const WAVE_GAP = 5

/** The pattern's period in columns: one cluster plus one gap. */
export const WAVE_PERIOD = WAVE_RUN + WAVE_GAP

/** Columns the second water row is shifted by, chosen to stagger the clusters. */
export const WAVE_ROW_OFFSET = 4

/**
 * True when a water row carries a tilde in this column.
 *
 * `phase` is how far the pattern has travelled, in columns. It is a number and
 * not an integer count because the caller accumulates it as a float, but a
 * character grid cannot move by less than a whole cell: every threshold in the
 * pattern sits on a column boundary, so a fractional phase renders exactly as
 * its floor and the clusters shift one column at a time.
 *
 * `row` is the water row: 0 is the one that shares a row with the duck's
 * bottom art line, 1 is the one under it.
 */
export function hasTilde(column: number, phase: number, row: number): boolean {
  const offset = row === 0 ? 0 : WAVE_ROW_OFFSET
  return wrap(column + phase + offset, WAVE_PERIOD) < WAVE_RUN
}

/** Modulo that stays in range for negative positions, where `%` does not. */
function wrap(value: number, period: number): number {
  return ((value % period) + period) % period
}

/** The water rows of the section, in drawing order: the shared row, then the one under it. */
export const WATER_ROWS = [0, 1] as const

/** How many rows of water the section draws. */
export const WATER_ROW_COUNT = WATER_ROWS.length

/**
 * How fast the pattern travels, in columns per second, so that it completes
 * exactly one period while the duck crosses the lane once.
 *
 * A crossing takes `limit / swimSpeed` seconds, so the pattern moves at
 * `WAVE_PERIOD / (limit / swimSpeed)` columns per second. The water therefore
 * keeps the tempo the user asked for instead of having an option of its own,
 * which is also why `swimSpeed: 0` is the switch for this animation: there is
 * no second setting to reach for.
 *
 * Zero means the water stands still, and both ways of asking for that are
 * handled here rather than at the call site: a speed of zero switches the
 * animation off entirely, and a limit of zero means the lane is narrower than
 * the art, so the duck is pinned to the left edge and a crossing takes no time
 * at all — a period of zero would divide by zero and produce `Infinity`.
 */
export function waveSpeed(swimSpeed: number, limit: number): number {
  if (swimSpeed <= 0 || limit <= 0) return 0
  return (WAVE_PERIOD * swimSpeed) / limit
}