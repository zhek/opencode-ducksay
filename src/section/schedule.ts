/**
 * The heartbeat seam shared by every animation in the section.
 *
 * The default is a plain interval; a test hands in the renderer's manual clock
 * so the swim, the marker and the typing can be stepped without real time.
 */
export type Schedule = (tick: () => void, ms: number) => () => void

export const defaultSchedule: Schedule = (tick, ms) => {
  const handle = setInterval(tick, ms)
  return () => clearInterval(handle)
}
