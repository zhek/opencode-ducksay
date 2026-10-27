import type { Direction } from "./lane.ts"

/**
 * State that belongs to one session rather than to one mount of the section.
 *
 * OpenCode rebuilds the sidebar when the displayed session changes, which
 * disposes the `Ducksay` component. Keeping this snapshot outside the
 * component lets the duck come back to the column, heading, water phase and
 * bubble it had instead of starting from the left edge.
 *
 * Nothing here is persisted to disk: it lives as long as the plugin, and a
 * fresh snapshot is made for a session that has never been shown.
 */

/** What the duck is doing. `rest` is the only state without a travel timer. */
export type Mode = "rest" | "swim" | "dock"

/**
 * Where the speech of the current turn is.
 *
 * `idle` is either the start-up rest — no turn has finished yet — or a turn in
 * progress. `waiting` means the turn ended and a joke is owed, even if the
 * request is held back by a form or has to be repeated after a remount.
 * `ready` means an answer or the fallback is in the bubble.
 */
export type Speech = "idle" | "waiting" | "ready"

/**
 * A cow that is currently coming out of the right wall.
 *
 * `columns` counts the visible step of the cameo: five out and five back.
 * `accumulated` keeps the milliseconds that have not yet made a whole column,
 * because the swim tick is shorter than a cow column. `held` records how many
 * full-out intervals have already elapsed, so the cow pauses once and only then
 * starts its return.
 */
export interface CowCameo {
  columns: number
  accumulated: number
  held?: number
}

/** One exchange of the duck's dialogue with the user. */
export interface DuckExchange {
  /**
   * What the user said. `<silent>` marks a `/duck` without text; absent for the
   * automatic joke that follows a turn, which nobody asked for.
   */
  readonly user?: string
  readonly duck: string
}

/** How many exchanges the dialogue keeps. */
export const DIALOGUE_LIMIT = 5

/** Adds an exchange, dropping the oldest one together with its reply. */
export function appendExchange(
  dialogue: readonly DuckExchange[],
  exchange: DuckExchange,
): DuckExchange[] {
  const next = [...dialogue, exchange]
  return next.length > DIALOGUE_LIMIT ? next.slice(next.length - DIALOGUE_LIMIT) : next
}

export interface DuckState {
  /** Left column of the art inside the lane. */
  column: number
  direction: Direction
  /** How far the water pattern has travelled, in columns. */
  wavePhase: number
  mode: Mode
  /** Whether the bubble of the last finished turn is waiting, ready or absent. */
  speech: Speech
  jokeText: string
  /** The rare cow cameo, when one is on its way out or back into the wall. */
  cow?: CowCameo
  /** How many words of the joke are on screen. */
  shown: number
  /** Which frame of the waiting dots is on screen. */
  dotsStep: number
  /** Exchanges with the user, oldest first; at most `DIALOGUE_LIMIT`. */
  dialogue: DuckExchange[]
  /**
   * The user side of the request in flight: the `/duck` reply or `<silent>`.
   * Absent for the automatic joke that follows a turn.
   */
  pendingReply?: string
}

/** Snapshots of every session the section has shown, keyed by session id. */
export type DuckStates = Map<string, DuckState>

/** A new, empty store for one plugin lifetime. */
export function createDuckStates(): DuckStates {
  return new Map()
}

/** The state a session starts with before the duck has done anything. */
export function createDuckState(init: { jokeText: string }): DuckState {
  return {
    column: 0,
    direction: 1,
    wavePhase: 0,
    mode: "rest",
    speech: "idle",
    jokeText: init.jokeText,
    shown: 0,
    dotsStep: 0,
    dialogue: [],
  }
}
