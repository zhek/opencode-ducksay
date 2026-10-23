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

export interface DuckState {
  /** Left column of the art inside the lane. */
  column: number
  direction: Direction
  /** How far the water pattern has travelled, in columns. */
  wavePhase: number
  /** True once the duck has moved at least one column in this session. */
  hasSwum: boolean
  mode: Mode
  /** Whether the rest bubble has something to say (an answer or the fallback). */
  jokeReady: boolean
  jokeText: string
  /** How many words of the joke are on screen. */
  shown: number
  /** Which frame of the waiting dots is on screen. */
  dotsStep: number
  /** A finished turn still owes a joke that was held back or interrupted. */
  owed: boolean
}

/** Snapshots of every session the section has shown, keyed by session id. */
export type DuckStates = Map<string, DuckState>

/** A new, empty store for one plugin lifetime. */
export function createDuckStates(): DuckStates {
  return new Map()
}

/** The state a session starts with before the duck has done anything. */
export function createDuckState(init: { jokeReady: boolean; jokeText: string }): DuckState {
  return {
    column: 0,
    direction: 1,
    wavePhase: 0,
    hasSwum: false,
    mode: "rest",
    jokeReady: init.jokeReady,
    jokeText: init.jokeText,
    shown: 0,
    dotsStep: 0,
    owed: false,
  }
}
