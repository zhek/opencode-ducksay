import { describe, expect, test } from "bun:test"
import {
  WAVE_GAP,
  WAVE_PERIOD,
  WAVE_ROW_OFFSET,
  WAVE_RUN,
  hasTilde,
  waveSpeed,
} from "../src/wave.ts"

/**
 * The lane the sidebar gives the section, and the row of water that shares a
 * row with the duck's bottom art line.
 */
const LANE = 37
const SHARED_ROW = 0
const UNDER_ROW = 1

/** One water row rendered as text, the way the section draws it. */
function row(phase: number, index: number, width = LANE): string {
  return Array.from({ length: width }, (_, column) =>
    hasTilde(column, phase, index) ? "~" : " ",
  ).join("")
}

/** The tilde columns of one water row, as a list of cluster lengths. */
function clusters(phase: number, index: number): number[] {
  const line = row(phase, index)
  const found: number[] = []
  let run = 0
  for (const cell of line) {
    if (cell === "~") run += 1
    else if (run > 0) found.push(run)
    run = 0
  }
  if (run > 0) found.push(run)
  return found
}

describe("hasTilde", () => {
  test("draws clusters of exactly four tildes", () => {
    expect(row(0, SHARED_ROW)).toBe("~~~~     ~~~~     ~~~~     ~~~~     ~")
    for (const run of clusters(0, SHARED_ROW)) expect(run).toBe(WAVE_RUN)
  })

  test("leaves the gap empty", () => {
    expect(row(0, SHARED_ROW)).toContain("     ")
    expect(WAVE_GAP).toBe(5)
    // Five empty columns between clusters, not four or six.
    const between = row(0, SHARED_ROW).indexOf("~~~~     ")
    expect(between).toBeGreaterThanOrEqual(0)
  })

  test("repeats itself after one period", () => {
    for (const phase of [0, 0.5, 1, 3.25, 8.75]) {
      for (const index of [SHARED_ROW, UNDER_ROW]) {
        expect(row(phase + WAVE_PERIOD, index)).toBe(row(phase, index))
      }
    }
  })

  test("stays inside one period no matter how far it has travelled", () => {
    for (const phase of [-WAVE_PERIOD * 3, -0.5, 0, 0.5, WAVE_PERIOD * 7]) {
      expect(row(phase, SHARED_ROW)).toBe(row(((phase % WAVE_PERIOD) + WAVE_PERIOD) % WAVE_PERIOD, SHARED_ROW))
    }
  })

  test("travels in one direction as the phase grows", () => {
    // One unit of phase translates the whole pattern by one column, always the
    // same way. Rendering a column past the lane is what lets the pattern be
    // seen continuing over the right edge instead of stopping at it.
    for (const phase of [0, 1, 2, 7, 8]) {
      const before = row(phase, SHARED_ROW, LANE + 1)
      const after = row(phase + 1, SHARED_ROW, LANE + 1)
      expect(after.slice(0, LANE)).toBe(before.slice(1))
    }
  })

  test("cannot move by less than a whole column", () => {
    // The thresholds sit on column boundaries, so a fraction of a column of
    // travel is not a drawing the grid can show.
    expect(row(0.5, SHARED_ROW)).toBe(row(0, SHARED_ROW))
    expect(row(0.99, SHARED_ROW)).toBe(row(0, SHARED_ROW))
    expect(row(1, SHARED_ROW)).not.toBe(row(0, SHARED_ROW))
  })
})

describe("water rows", () => {
  test("do not line up vertically", () => {
    // Aligned rows stack their clusters into blocks and read as a fence.
    for (const phase of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(row(phase, UNDER_ROW)).not.toBe(row(phase, SHARED_ROW))
    }
  })

  test("never carry a tilde in the same column as the row above", () => {
    for (let phase = 0; phase < WAVE_PERIOD; phase += 0.25) {
      for (let column = 0; column < LANE; column++) {
        const shared = hasTilde(column, phase, SHARED_ROW)
        const under = hasTilde(column, phase, UNDER_ROW)
        expect(shared && under).toBe(false)
      }
    }
  })

  test("are staggered by the documented offset", () => {
    // With the offset of four in a period of nine, the clusters of the two rows
    // interleave: the row below starts where the row above has already ended.
    expect(WAVE_ROW_OFFSET).toBe(4)
    for (let column = 0; column < WAVE_PERIOD; column++) {
      expect(hasTilde(column, 0, UNDER_ROW)).toBe(hasTilde(column + WAVE_ROW_OFFSET, 0, SHARED_ROW))
    }
  })
})

describe("waveSpeed", () => {
  /** The lane the sidebar gives the section, and what is left of it for swimming. */
  const LIMIT = 29

  test("completes one period while the duck crosses the lane once", () => {
    // The whole point of deriving the tempo: at the default speed the water
    // breathes exactly as often as the duck crosses, whatever the lane width.
    const speed = waveSpeed(12, LIMIT)
    const crossing = LIMIT / 12
    expect(speed * crossing).toBeCloseTo(WAVE_PERIOD, 10)
    expect(WAVE_PERIOD / speed).toBeCloseTo(crossing, 10)
  })

  test("keeps the same relation at other speeds", () => {
    for (const swimSpeed of [1, 4, 12, 48, 120]) {
      expect(waveSpeed(swimSpeed, LIMIT) * (LIMIT / swimSpeed)).toBeCloseTo(WAVE_PERIOD, 10)
    }
  })

  test("holds in a wider lane as well", () => {
    expect(waveSpeed(12, 34) * (34 / 12)).toBeCloseTo(WAVE_PERIOD, 10)
  })

  test("stands still at zero speed", () => {
    // `swimSpeed: 0` is the switch for this animation, so the water has to stop
    // with it rather than run on.
    expect(waveSpeed(0, LIMIT)).toBe(0)
  })

  test("stands still when the lane is narrower than the art", () => {
    // The duck is pinned to the left edge and a crossing takes no time, so the
    // derived period would divide by zero. Without this the plugin would report
    // an infinite speed and the water would never render.
    expect(waveSpeed(12, 0)).toBe(0)
    expect(waveSpeed(0, 0)).toBe(0)
  })

  test("is never negative or infinite for any speed the plugin accepts", () => {
    for (const swimSpeed of [0, 0.5, 12, 120]) {
      for (const limit of [0, 1, LIMIT]) {
        const speed = waveSpeed(swimSpeed, limit)
        expect(speed).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(speed)).toBe(true)
      }
    }
  })
})