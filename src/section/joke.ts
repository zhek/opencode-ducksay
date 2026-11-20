import type { CliRenderer } from "@opentui/core"
import { createEffect, onCleanup, untrack, type Accessor, type Setter } from "solid-js"
import { appendExchange, type DuckState, type Speech } from "../duck-state.ts"
import {
  createJokeRequest,
  type JokeAbortReason,
  type JokeGenerator,
  type JokeInput,
  type JokeRequest,
} from "../joke.ts"
import { THINKING_STEPS, THINK_FRAME_MS, WORD_FRAME_MS, bubbleWords, holdsAfter } from "../thinking.ts"
import { DEFAULT_BUBBLE_TEXT } from "../timing.ts"
import type { Schedule } from "./schedule.ts"

/** The user side recorded for a `/duck` without text. */
export const SILENT_REPLY = "<silent>"

export interface JokeRunnerInput {
  readonly state: () => DuckState
  readonly joke: JokeGenerator | undefined
  readonly silent: boolean
  readonly limit: () => number
  readonly setSpeech: Setter<Speech>
  readonly setJokeText: Setter<string>
  readonly setShown: Setter<number>
}

/** Starts and cancels the one joke request a section may have in flight. */
export interface JokeRunner {
  start(): boolean
  cancel(reason?: JokeAbortReason): void
  hasRequest(): boolean
}

/**
 * Builds the request for the turn that just ended, or for a direct `/duck` call
 * when `pendingReply` says so.
 *
 * Returns false when speech is not possible at all, so the command can report
 * `busy` instead of leaving a reply stuck in the snapshot.
 */
export function createJokeRunner(input: JokeRunnerInput): JokeRunner {
  let request: JokeRequest | undefined

  const cancel = (reason: JokeAbortReason = "turn") => {
    request?.cancel(reason)
    request = undefined
  }

  const start = (): boolean => {
    const joke = input.joke
    if (joke === undefined || input.silent || input.limit() <= 0) return false
    cancel()
    const state = input.state()
    const reply = state.pendingReply
    const jokeInput: JokeInput | undefined = reply === undefined
      ? undefined
      : { text: reply === SILENT_REPLY ? undefined : reply, dialogue: state.dialogue }
    // The request is stored before the speech signal flips: `waiting` with no
    // request is what starts a joke on a later mount, and the effect that
    // watches it would otherwise start a second one from this very call.
    const current = createJokeRequest(joke, jokeInput)
    request = current
    input.setSpeech("waiting")
    input.setJokeText(DEFAULT_BUBBLE_TEXT)
    // The dots keep their frame: a request that is repeated after the sidebar
    // was rebuilt resumes the waiting bubble instead of going back to one dot.
    input.setShown(0)
    void current.result.then((text) => {
      // A late answer from a cancelled request must not replace the bubble of
      // the turn that replaced it.
      if (request !== current) return
      request = undefined
      const answer = text !== undefined && text.trim() !== "" ? text : undefined
      input.setJokeText(answer ?? DEFAULT_BUBBLE_TEXT)
      // The first word is on screen in the same paint as the answer; the typing
      // timer only has to fetch the words after it.
      input.setShown(1)
      input.setSpeech("ready")
      // The fallback is not a joke the duck said, so only a real answer joins
      // the dialogue. A missing reply marks the automatic joke after a turn.
      if (answer !== undefined) {
        const live = input.state()
        live.dialogue = appendExchange(
          live.dialogue,
          reply === undefined ? { duck: answer } : { user: reply, duck: answer },
        )
      }
      input.state().pendingReply = undefined
    })
    return true
  }

  return {
    start,
    cancel,
    hasRequest: () => request !== undefined,
  }
}

export interface SpeechTimerInput {
  readonly renderer: Accessor<CliRenderer | undefined>
  readonly joke: JokeGenerator | undefined
  readonly bubbleVisible: Accessor<boolean>
  readonly speech: Accessor<Speech>
  readonly jokeText: Accessor<string>
  readonly shown: Accessor<number>
  readonly setDotsStep: Setter<number>
  readonly setShown: Setter<number>
  readonly schedule: Schedule
}

/**
 * Runs the waiting dots and the word-by-word reveal.
 *
 * Both timers only move signals; the repaint effect in the section watches
 * those signals and asks for a frame.
 */
export function startSpeechTimers(input: SpeechTimerInput): void {
  // The waiting dots run only while the duck rests with an answer still on the
  // way. `mode` and `speech` start and stop the effect; `dotsStep` is
  // deliberately not read here: advancing it must not tear down and recreate
  // the interval on every frame.
  createEffect(() => {
    if (input.renderer() === undefined || input.joke === undefined) return
    if (!input.bubbleVisible() || input.speech() !== "waiting") return

    const tick = () => input.setDotsStep((step) => (step + 1) % THINKING_STEPS.length)
    const stop = input.schedule(tick, THINK_FRAME_MS)
    onCleanup(stop)
  })

  // The joke is revealed one word per tick while the duck rests. The effect
  // starts on the answer and stops itself on the last word, so a rest with the
  // whole joke on screen holds no timer. `shown` is read through `untrack`:
  // tracking it would tear down the interval on every word and lose the pause
  // flag for punctuation.
  createEffect(() => {
    if (input.renderer() === undefined || input.joke === undefined) return
    if (!input.bubbleVisible() || input.speech() !== "ready") return

    const words = bubbleWords(input.jokeText())
    const total = words.length
    let typed = untrack(input.shown)
    if (typed < 1 && total > 0) {
      // Defensive: an answer always sets the first word, but a bubble with no
      // word at all is the one frame the user must never see.
      typed = 1
      input.setShown(1)
    }
    if (typed >= total) return

    // The word already on screen may itself end a phrase: a restart must not
    // lose the pause that follows it.
    let hold = holdsAfter(words[typed - 1] ?? "")
    let stop: (() => void) | undefined
    const tick = () => {
      if (hold) {
        hold = false
        return
      }
      typed += 1
      input.setShown(typed)
      if (typed >= total) {
        // The interval must not keep ticking over a finished joke.
        stop?.()
        stop = undefined
        return
      }
      // A punctuated word stays on screen for two steps, so the pause reads as
      // speech rather than a uniform metronome.
      hold = holdsAfter(words[typed - 1] ?? "")
    }
    stop = input.schedule(tick, WORD_FRAME_MS)
    onCleanup(() => stop?.())
  })
}
