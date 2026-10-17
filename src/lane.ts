/** Which way the duck is facing, and therefore which sprite it wears. */
export type Direction = 1 | -1

export interface Move {
  /** Left column of the art inside the lane. */
  readonly column: number
  readonly direction: Direction
  /** True when the step ended at an edge and the duck turned around. */
  readonly turned: boolean
}

/**
 * The furthest left column the duck may occupy: the lane minus the art, so the
 * art never pokes past the right edge. A lane narrower than the art pins the
 * duck to the left edge instead of producing a negative reach.
 */
export function laneLimit(laneWidth: number, artWidth: number): number {
  return Math.max(0, laneWidth - artWidth)
}

/**
 * Milliseconds the duck needs per column at the given speed. A speed of zero
 * means "do not move", which comes out as an interval no amount of waiting can
 * ever reach.
 */
export function msPerColumn(swimSpeed: number): number {
  return swimSpeed === 0 ? Number.POSITIVE_INFINITY : 1000 / swimSpeed
}

/**
 * Moves at most `columns` towards the edge, turning around if it reaches it.
 *
 * The leftover distance of an overshooting step is dropped rather than carried
 * into the next one: a turn is the moment the duck looks like it changed its
 * mind, and rounding the remainder into the other direction would make it jump
 * back immediately after turning.
 */
export function moveTowardsEdge(column: number, direction: Direction, limit: number, columns = 1): Move {
  const next = column + direction * columns
  if (direction === 1) {
    if (next >= limit) return { column: limit, direction: -1, turned: true }
    return { column: next, direction, turned: false }
  }
  if (next <= 0) return { column: 0, direction: 1, turned: true }
  return { column: next, direction, turned: false }
}