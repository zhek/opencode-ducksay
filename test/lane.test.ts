import { describe, expect, test } from "bun:test"
import { laneLimit, msPerColumn, moveTowardsEdge } from "../src/lane.ts"

/**
 * The width of the duck's art, spelled out here so the geometry is tested on
 * its own rather than through whatever the art happens to be today.
 */
const ART = 8

describe("laneLimit", () => {
  test("leaves room for the art", () => {
    // 37 columns is what the sidebar's text gets; 42 is the panel itself.
    expect(laneLimit(37, ART)).toBe(29)
    expect(laneLimit(42, ART)).toBe(34)
  })

  test("pins the duck to the left edge when the lane is narrower than the art", () => {
    // Without the lower bound the reach would be negative and the duck would
    // start outside the lane.
    expect(laneLimit(ART, ART)).toBe(0)
    expect(laneLimit(3, ART)).toBe(0)
  })

  test("is zero when there is no lane at all", () => {
    expect(laneLimit(0, ART)).toBe(0)
  })
})

describe("msPerColumn", () => {
  test("turns columns per second into time per column", () => {
    expect(msPerColumn(12)).toBeCloseTo(1000 / 12, 5)
    expect(msPerColumn(120)).toBeCloseTo(1000 / 120, 5)
  })

  test("a speed of zero is an interval no amount of waiting reaches", () => {
    expect(msPerColumn(0)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe("moveTowardsEdge", () => {
  test("moves one column in the given direction", () => {
    expect(moveTowardsEdge(3, 1, 29)).toEqual({ column: 4, direction: 1, turned: false })
    expect(moveTowardsEdge(3, -1, 29)).toEqual({ column: 2, direction: -1, turned: false })
  })

  test("can move several columns at once", () => {
    expect(moveTowardsEdge(3, 1, 29, 4)).toEqual({ column: 7, direction: 1, turned: false })
  })

  test("turns at the right edge and stops exactly on the limit", () => {
    expect(moveTowardsEdge(28, 1, 29)).toEqual({ column: 29, direction: -1, turned: true })
    expect(moveTowardsEdge(27, 1, 29, 5)).toEqual({ column: 29, direction: -1, turned: true })
  })

  test("turns at the left edge and stops exactly at zero", () => {
    expect(moveTowardsEdge(1, -1, 29)).toEqual({ column: 0, direction: 1, turned: true })
    expect(moveTowardsEdge(2, -1, 29, 5)).toEqual({ column: 0, direction: 1, turned: true })
  })

  test("never leaves the lane", () => {
    for (const column of [0, 1, 14, 28, 29]) {
      for (const direction of [1, -1] as const) {
        for (const columns of [1, 3, 100]) {
          const move = moveTowardsEdge(column, direction, 29, columns)
          expect(move.column).toBeGreaterThanOrEqual(0)
          expect(move.column).toBeLessThanOrEqual(29)
        }
      }
    }
  })

  test("stays put in a lane with no room to swim", () => {
    // A limit of zero means the art fills the lane; the duck turns at once
    // rather than walking off the edge.
    expect(moveTowardsEdge(0, 1, 0)).toEqual({ column: 0, direction: -1, turned: true })
  })
})