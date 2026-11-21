/**
 * The duck's personas: the three characters a session can wear.
 *
 * Everything a persona owns that is not a sprite lives here — its name in the
 * cycle, the head glyph it shows in toasts, the wrapper it puts around a copied
 * joke, the greeting the `/duck.persona` command says and the line that gives
 * it its voice in the joke prompt. The sprites stay in `duck.ts` with the rest
 * of the art, and the option that picks the starting persona lives in
 * `options.ts`; this module is pure data and pure functions.
 */

/** The personas in cycle order: the order `/duck.persona` walks them in. */
export const PERSONA_ORDER = ["classic", "angry", "robot"] as const

/** One of the persona names, exactly as the `persona` option spells it. */
export type PersonaName = (typeof PERSONA_ORDER)[number]

/** The persona used when the option is absent, blank or invalid. */
export const DEFAULT_PERSONA = "classic" as const

/** True only for the three names the plugin knows. */
export function isPersonaName(value: unknown): value is PersonaName {
  return typeof value === "string" && (PERSONA_ORDER as readonly string[]).includes(value)
}

/**
 * The persona after this one, wrapping from `robot` back to `classic`.
 *
 * The order is the table the user chose: the classic duck first, the angry one
 * second, the robot third.
 */
export function nextPersona(name: PersonaName): PersonaName {
  const index = PERSONA_ORDER.indexOf(name)
  if (index < 0) return DEFAULT_PERSONA
  return PERSONA_ORDER[(index + 1) % PERSONA_ORDER.length] ?? DEFAULT_PERSONA
}

/** Which beak a toast shows: closed for quiet messages, open for spoken ones. */
export type BeakState = "closed" | "open"

/**
 * The head a toast starts with. This is the head line of the left sprite
 * without its trailing underscores, so a toast and the art always agree.
 */
const HEADS: Record<PersonaName, Record<BeakState, string>> = {
  classic: { closed: "<(o )", open: ">(o )" },
  angry: { closed: "<(ó )", open: ">(ó )" },
  robot: { closed: "<[0 ]", open: ">[0 ]" },
}

export function toastHead(persona: PersonaName, beak: BeakState): string {
  return HEADS[persona][beak]
}

/**
 * The head put in front of a copied joke. It is the right-facing open head
 * without its leading underscores, so the duck in the clipboard looks the same
 * way as the one on screen, only mirrored.
 */
const COPY_GLYPHS: Record<PersonaName, string> = {
  classic: "( o)<",
  angry: "( ò)<",
  robot: "[ 0]<",
}

export function copyGlyph(persona: PersonaName): string {
  return COPY_GLYPHS[persona]
}

/**
 * What `/duck.persona` says after switching to a persona: the open head and a
 * greeting in that persona's voice. The persona never names itself — the glyph
 * and the tone are the only clue, which is what the user asked for.
 */
const GREETINGS: Record<PersonaName, string> = {
  classic: ">(o ) Quack! There you are.",
  angry: ">(ó ) Great. Well, look who's back.",
  robot: ">[0 ] PERSONA LOADED. UPTIME 100%.",
}

export function greeting(persona: PersonaName): string {
  return GREETINGS[persona]
}

/**
 * The instruction line that gives the joke its persona.
 *
 * It replaces the single fixed line the prompt used before, so the rest of the
 * prompt — the language rule, the length limit and the ban on joking about the
 * user — stays word for word. The persona name itself is never part of it: the
 * model is told how to speak, not who it is, or it would start announcing
 * itself.
 */
const VOICES: Record<PersonaName, string> = {
  classic:
    "Write one short, kind joke in the duck's voice, with warm irony. Reply with the joke text only, on one line:",
  angry:
    "Write one short joke in the duck's voice, with sarcasm about workarounds, crutches and duct tape. Reply with the joke text only, on one line:",
  robot:
    "Write one short joke in the duck's voice, as a telegraphic machine report about CI, builds and metrics: short factual fragments, no filler. Use normal sentence case, never all caps. Reply with the joke text only, on one line:",
}

export function voice(persona: PersonaName): string {
  return VOICES[persona]
}
