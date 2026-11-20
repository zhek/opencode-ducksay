import type { CliRenderer } from "@opentui/core"
import type { Data } from "@opencode/plugin/tui/context"
import { createEffect, onCleanup, type Accessor, type Setter } from "solid-js"
import { QUESTION_FRAMES, QUESTION_FRAME_MS } from "../question.ts"
import type { Schedule } from "./schedule.ts"

export interface FormTrackingInput {
  readonly data: Accessor<Data | undefined>
  readonly sessionID: Accessor<string | undefined>
  /** The session the section is displaying right now. */
  readonly currentSessionID: () => string | undefined
  readonly setAskedForms: Setter<ReadonlySet<string>>
}

/**
 * Tracks the forms of the displayed session.
 *
 * Only the displayed session counts: `global` and another session's forms must
 * not freeze the duck. Forms already open when the section mounts are read from
 * the host, with a `sync` retry when the cache has not been filled yet.
 */
export function trackForms(input: FormTrackingInput): void {
  createEffect(() => {
    const data = input.data()
    const sessionID = input.sessionID()
    input.setAskedForms(new Set<string>())
    if (data === undefined || sessionID === undefined) return

    /**
     * Adds or removes one form in the pending set without disturbing the
     * others. A new set is returned only on an actual change, so repeated
     * events do not wake every effect that reads the set.
     */
    const addAsked = (id: string) => {
      input.setAskedForms((current) => {
        if (current.has(id)) return current
        const next = new Set(current)
        next.add(id)
        return next
      })
    }
    /**
     * Forms that closed while the list was being synced. They must not come
     * back when the synced list arrives, or the duck would stay frozen over a
     * form nobody is waiting for any more.
     */
    const closed = new Set<string>()
    const removeAsked = (id: string) => {
      closed.add(id)
      input.setAskedForms((current) => {
        if (!current.has(id)) return current
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }

    const mine = (eventSessionID: string | undefined) => eventSessionID === sessionID
    const stops = [
      data.on("form.created", (event) => {
        const form = event.data.form
        if (!mine(form.sessionID)) return
        closed.delete(form.id)
        addAsked(form.id)
      }),
      data.on("form.replied", (event) => {
        if (!mine(event.data.sessionID)) return
        removeAsked(event.data.id)
      }),
      data.on("form.cancelled", (event) => {
        if (!mine(event.data.sessionID)) return
        removeAsked(event.data.id)
      }),
    ]

    const forms = data.session?.form
    if (forms !== undefined) {
      const apply = (listed: readonly { id: string; sessionID?: string }[] | undefined) => {
        if (input.currentSessionID() !== sessionID || listed === undefined) return
        input.setAskedForms((current) => {
          const next = new Set<string>()
          // The list is asked for one session, but the filter keeps the rule in
          // one place: only a form of the displayed session is a question.
          for (const form of listed) {
            if (form.sessionID !== undefined && !mine(form.sessionID)) continue
            if (!closed.has(form.id)) next.add(form.id)
          }
          for (const id of current) if (!closed.has(id)) next.add(id)
          return next
        })
      }
      const listed = forms.list(sessionID)
      if (listed !== undefined) {
        apply(listed)
      } else {
        void forms
          .sync(sessionID)
          .then(() => apply(forms.list(sessionID)))
          .catch(() => {})
      }
    }

    onCleanup(() => {
      for (const stop of stops) stop()
    })
  })
}

export interface QuestionMarkerInput {
  readonly frozen: Accessor<boolean>
  readonly renderer: Accessor<CliRenderer | undefined>
  readonly schedule: Schedule
  readonly setQuestionFrame: Setter<number>
}

/**
 * Advances the marker while at least one form waits.
 *
 * `frozen` is a memo, so a second form does not restart the cycle: the marker
 * keeps its phase until the last form closes.
 */
export function startQuestionMarker(input: QuestionMarkerInput): void {
  createEffect(() => {
    if (!input.frozen() || input.renderer() === undefined) return
    input.setQuestionFrame(0)
    const tick = () => input.setQuestionFrame((frame) => (frame + 1) % QUESTION_FRAMES.length)
    const stop = input.schedule(tick, QUESTION_FRAME_MS)
    onCleanup(stop)
  })
}
