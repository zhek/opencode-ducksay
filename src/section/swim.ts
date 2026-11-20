import { createEffect, onCleanup, type Accessor, type Setter } from "solid-js"
import { COW_CHANCE, advanceCow, crossedMidline } from "../cow.ts"
import type { DuckState, Mode } from "../duck-state.ts"
import { msPerColumn, moveTowardsEdge } from "../lane.ts"
import { MAX_COLUMNS_PER_TICK, TICK_MS } from "../timing.ts"
import { WAVE_PERIOD, waveSpeed } from "../wave.ts"
import type { Schedule } from "./schedule.ts"

/** What the swim needs from the section it belongs to. */
export interface SwimInput {
  readonly state: DuckState
  readonly mode: Accessor<Mode>
  readonly setMode: Setter<Mode>
  readonly frozen: Accessor<boolean>
  readonly limit: Accessor<number>
  readonly swimSpeed: Accessor<number>
  readonly random: () => number
  readonly park: () => void
  readonly paint: () => void
  readonly requestRender: () => void
  readonly schedule: Schedule
}

/**
 * Drives the duck across the lane while the section is not at rest.
 *
 * The effect owns the heartbeat; every mutation lands in the shared `state`
 * snapshot, so a remount resumes from the same column and water phase.
 */
export function startSwim(input: SwimInput): void {
  createEffect(() => {
    const swimSpeed = input.swimSpeed()
    // Reading `mode` here is what re-runs this effect when the duck starts or
    // stops, so the timer is started and cleared with the animation. `frozen`
    // is read for the same reason: a pending form stops the heartbeat
    // altogether, so the section keeps only the marker's timer while the
    // question waits, and the swim resumes from the same column afterwards.
    if (swimSpeed <= 0 || input.mode() === "rest" || input.frozen()) return

    let accumulated = 0

    const tick = () => {
      // A tick that arrives after the duck came to rest moves nothing: the
      // timer is cleared as soon as the mode changes, but a tick already in
      // flight still runs, and nothing should happen to a resting duck. A
      // pending form freezes the same way: the current column and heading stay
      // put until the form closes.
      if (input.mode() === "rest" || input.frozen()) return
      const state = input.state

      // The water rides the duck's tick, one phase step per tick, at the tempo
      // derived from the swim speed. The phase is kept inside one period,
      // because the pattern repeats there and a float that grows all session
      // loses precision for nothing.
      state.wavePhase = (state.wavePhase + waveSpeed(swimSpeed, input.limit()) * (TICK_MS / 1000)) % WAVE_PERIOD

      const reach = input.limit()
      if (reach === 0) {
        // A lane narrower than the art has no room to swim in. Sitting at the
        // left edge, nose inwards, is the closest thing to a correct pose.
        state.column = 0
        if (input.mode() === "dock") input.setMode("rest")
        input.park()
        input.paint()
        input.requestRender()
        return
      }

      // An existing cow moves before the duck. A cow started by this tick's
      // crossing is therefore still invisible until the next tick, which gives
      // it the same short first delay as the five-out, hold, five-back cycle.
      if (state.cow !== undefined) state.cow = advanceCow(state.cow, TICK_MS, swimSpeed)

      accumulated += TICK_MS
      const interval = msPerColumn(swimSpeed)
      let budget = MAX_COLUMNS_PER_TICK
      while (accumulated >= interval && budget > 0) {
        accumulated -= interval
        budget -= 1
        const from = state.column
        const heading = state.direction
        const move = moveTowardsEdge(state.column, state.direction, reach)
        state.column = move.column
        state.direction = move.direction

        // The cow is a rare event of a leftward crossing, not of a timer of its
        // own. Every crossing consumes one roll even while a cow is already out;
        // the hit is then ignored so only one cow can be on screen.
        if (input.mode() === "swim" && heading === -1 && crossedMidline(from, move.column, reach)) {
          const hit = input.random() < COW_CHANCE
          if (hit && state.cow === undefined) {
            state.cow = { columns: 0, accumulated: 0 }
          }
        }

        if (move.turned) {
          // The turn spends the rest of the tick. Without this the leftover time
          // carries straight into the next column of the new direction and the
          // duck leaves the wall in the same tick it reached it, so the turn is
          // never actually drawn.
          accumulated = 0
          // A dock ends on the turn, which leaves the duck at a wall. The mode
          // changes before the paint, so the paint already draws the rest pose,
          // open beak and bubble included.
          if (input.mode() === "dock") {
            input.park()
            input.setMode("rest")
            input.paint()
            input.requestRender()
            return
          }
        }
      }
      input.paint()
      // One frame per tick, asked for rather than held: the renderer keeps its
      // own idle behaviour, and the plugin never keeps it alive between ticks.
      input.requestRender()
    }

    const stop = input.schedule(tick, TICK_MS)
    onCleanup(stop)
  })
}
