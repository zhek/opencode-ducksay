import { describe, expect, test } from "bun:test"
import {
  COW_CHANCE,
  COW_CYCLE_COLUMNS,
  COW_HOLD_STEPS,
  COW_TONGUE_ROW,
  COW_TOP_ROW,
  advanceCow,
  cowEmergence,
  cowFrame,
  crossedMidline,
} from "../src/cow.ts"

describe("crossedMidline", () => {
  test("counts a leftward step through the middle", () => {
    // The middle of a 29-column reach is 14.5, so 15 -> 14 is a crossing.
    expect(crossedMidline(15, 14, 29)).toBe(true)
  })

  test("counts a multi-column step that jumps over the middle", () => {
    expect(crossedMidline(17, 13, 29)).toBe(true)
  })

  test("is half-open at the middle", () => {
    // Landing on the middle counts, starting there does not.
    expect(crossedMidline(2, 1, 2)).toBe(true)
    expect(crossedMidline(1, 0, 2)).toBe(false)
  })

  test("does not count a step that stays on the same side", () => {
    expect(crossedMidline(16, 15, 29)).toBe(false)
    expect(crossedMidline(14, 13, 29)).toBe(false)
    expect(crossedMidline(15, 15, 29)).toBe(false)
  })

  test("does not count a rightward step through the middle", () => {
    // The helper is geometry only; the caller does not call it for a rightward
    // step. This pins down what the same points mean in the other direction.
    expect(crossedMidline(14, 15, 29)).toBe(false)
  })

  test("never counts a lane without a reach", () => {
    expect(crossedMidline(1, 0, 0)).toBe(false)
    expect(crossedMidline(1, 0, -3)).toBe(false)
  })
})

describe("cowChance", () => {
  test("is one leftward crossing in fifty", () => {
    expect(COW_CHANCE).toBe(1 / 50)
  })
})

describe("cowEmergence", () => {
  test("counts out to five and back to zero", () => {
    expect(Array.from({ length: 11 }, (_, columns) => cowEmergence(columns))).toEqual([
      0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0,
    ])
  })

  test("is invisible outside the cycle", () => {
    expect(cowEmergence(-1)).toBe(0)
    expect(cowEmergence(11)).toBe(0)
    expect(cowEmergence(100)).toBe(0)
  })
})

describe("cowFrame", () => {
  const rows = (emergence: number, tongue: boolean) =>
    Object.fromEntries(cowFrame(emergence, tongue).map((line) => [line.row, line.text]))

  test("draws the full cow with the tongue out", () => {
    expect(rows(5, true)).toEqual({
      [COW_TOP_ROW]: "^__^",
      [COW_TOP_ROW + 1]: "(oO)\\",
      [COW_TOP_ROW + 2]: "(__)\\",
      [COW_TONGUE_ROW]: "U",
    })
  })

  test("comes out with its mouth closed", () => {
    for (const emergence of [4, 3, 2]) {
      expect(rows(emergence, false)).toEqual({
        [COW_TOP_ROW]: "^__^",
        [COW_TOP_ROW + 1]: "(oo)\\",
        [COW_TOP_ROW + 2]: "(__)\\",
      })
    }
  })

  test("keeps the tongue on the way back", () => {
    for (const emergence of [4, 3, 2]) {
      expect(rows(emergence, true)).toEqual({
        [COW_TOP_ROW]: "^__^",
        [COW_TOP_ROW + 1]: "(oO)\\",
        [COW_TOP_ROW + 2]: "(__)\\",
        [COW_TONGUE_ROW]: "U",
      })
    }
  })

  test("drops the tongue on the last visible column", () => {
    expect(rows(1, true)).toEqual({
      [COW_TOP_ROW]: "^__^",
      [COW_TOP_ROW + 1]: "(oo)\\",
      [COW_TOP_ROW + 2]: "(__)\\",
    })
    expect(rows(1, true)[COW_TONGUE_ROW]).toBeUndefined()
  })

  test("has nothing at zero emergence", () => {
    expect(cowFrame(0, true)).toEqual([])
  })

  test("keeps the top line one column shorter than the face", () => {
    const lines = cowFrame(5, true)
    expect(lines[0]!.text).toHaveLength(4)
    expect(lines[1]!.text).toHaveLength(5)
    expect(lines[2]!.text).toHaveLength(5)
  })
})

describe("advanceCow", () => {
  test("does nothing without a cow", () => {
    expect(advanceCow(undefined, 300, 10)).toBeUndefined()
  })

  test("uses 3000 / swimSpeed milliseconds per cow column", () => {
    expect(advanceCow({ columns: 0, accumulated: 0 }, 299, 10)).toEqual({
      columns: 0,
      accumulated: 299,
    })
    expect(advanceCow({ columns: 0, accumulated: 0 }, 300, 10)).toEqual({
      columns: 1,
      accumulated: 0,
    })
  })

  test("holds the full-out frame for one time unit", () => {
    const full = advanceCow({ columns: 0, accumulated: 0 }, 1500, 10)
    expect(full).toEqual({ columns: 5, accumulated: 0 })

    const held = advanceCow(full, 300, 10)
    expect(held).toEqual({ columns: 5, accumulated: 0, held: 1 })
    expect(cowEmergence(held!.columns)).toBe(5)

    expect(advanceCow(held, 300, 10)).toEqual({
      columns: 6,
      accumulated: 0,
      held: 1,
    })
  })

  test("reaches the last visible column before disappearing", () => {
    expect(advanceCow({ columns: 0, accumulated: 0 }, 3000, 10)).toEqual({
      columns: 9,
      accumulated: 0,
      held: 1,
    })
    expect(advanceCow({ columns: 9, accumulated: 0 }, 300, 10)).toBeUndefined()
  })

  test("finishes the whole cycle after the hold", () => {
    expect(advanceCow({ columns: 0, accumulated: 0 }, 3300, 10)).toBeUndefined()
    expect(advanceCow({ columns: 0, accumulated: 0 }, 275, 120)).toBeUndefined()
  })

  test("spends more than one column after a short tick at high speed", () => {
    expect(advanceCow({ columns: 0, accumulated: 0 }, 100, 120)).toEqual({
      columns: 4,
      accumulated: 0,
    })
    expect(advanceCow({ columns: 0, accumulated: 0 }, 33, 120)).toEqual({
      columns: 1,
      accumulated: 8,
    })
  })

  test("keeps the cow when speed is off or time does not move", () => {
    const cow = { columns: 3, accumulated: 40 }
    expect(advanceCow(cow, 33, 0)).toBe(cow)
    expect(advanceCow(cow, 0, 10)).toBe(cow)
  })

  test("the cycle stays ten columns long and holds for one step", () => {
    expect(COW_CYCLE_COLUMNS).toBe(10)
    expect(COW_HOLD_STEPS).toBe(1)
  })
})
