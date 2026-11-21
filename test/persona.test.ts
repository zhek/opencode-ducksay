import { describe, expect, test } from "bun:test"
import { PERSONA_SPRITES } from "../src/duck.ts"
import {
  DEFAULT_PERSONA,
  PERSONA_ORDER,
  copyGlyph,
  greeting,
  isPersonaName,
  nextPersona,
  toastHead,
  type PersonaName,
  voice,
} from "../src/persona.ts"

describe("persona cycle", () => {
  test("walks classic, angry and robot in that order", () => {
    expect(nextPersona("classic")).toBe("angry")
    expect(nextPersona("angry")).toBe("robot")
    expect(nextPersona("robot")).toBe("classic")
  })

  test("returns to the first persona after a full lap", () => {
    let name: PersonaName = DEFAULT_PERSONA
    for (let step = 0; step < PERSONA_ORDER.length; step += 1) name = nextPersona(name)

    expect(name).toBe(DEFAULT_PERSONA)
  })

  test("the default is the first persona of the cycle", () => {
    expect(DEFAULT_PERSONA).toBe("classic")
    expect(PERSONA_ORDER[0]).toBe(DEFAULT_PERSONA)
  })
})

describe("isPersonaName", () => {
  test("accepts exactly the three names", () => {
    for (const name of PERSONA_ORDER) expect(isPersonaName(name)).toBe(true)
  })

  test("rejects unknown names and values of other types", () => {
    expect(isPersonaName("pirate")).toBe(false)
    expect(isPersonaName("Classic")).toBe(false)
    expect(isPersonaName(null)).toBe(false)
    expect(isPersonaName(undefined)).toBe(false)
    expect(isPersonaName(3)).toBe(false)
    expect(isPersonaName({ persona: "angry" })).toBe(false)
  })
})

describe("toast heads", () => {
  test("the closed head starts the closed head line of the left sprite", () => {
    for (const name of PERSONA_ORDER) {
      expect(PERSONA_SPRITES[name].left[1]?.startsWith(toastHead(name, "closed"))).toBe(true)
    }
  })

  test("the open head starts the open head line of the left sprite", () => {
    for (const name of PERSONA_ORDER) {
      expect(PERSONA_SPRITES[name].leftOpen[1]?.startsWith(toastHead(name, "open"))).toBe(true)
    }
  })

  test("the open head differs from the closed one only in the beak", () => {
    for (const name of PERSONA_ORDER) {
      expect(toastHead(name, "open").slice(1)).toBe(toastHead(name, "closed").slice(1))
    }
  })
})

describe("copy glyph", () => {
  test("is the right open head without its leading underscores", () => {
    for (const name of PERSONA_ORDER) {
      expect(PERSONA_SPRITES[name].rightOpen[1]?.replace(/^_+/, "")).toBe(copyGlyph(name))
    }
  })

  test("the three personas put different heads in the clipboard", () => {
    expect(copyGlyph("classic")).toBe("( o)<")
    expect(copyGlyph("angry")).toBe("( ò)<")
    expect(copyGlyph("robot")).toBe("[ 0]<")
  })
})

describe("greetings", () => {
  test("every greeting starts with the open head of its persona", () => {
    for (const name of PERSONA_ORDER) {
      expect(greeting(name).startsWith(toastHead(name, "open"))).toBe(true)
    }
  })

  test("the greetings are the strings the spec pins", () => {
    expect(greeting("classic")).toBe(">(o ) Quack! There you are.")
    expect(greeting("angry")).toBe(">(ó ) Great. Well, look who's back.")
    expect(greeting("robot")).toBe(">[0 ] PERSONA LOADED. UPTIME 100%.")
  })

  test("no greeting names its persona", () => {
    for (const name of PERSONA_ORDER) expect(greeting(name).toLowerCase()).not.toContain(name)
  })
})

describe("prompt voices", () => {
  test("the voices are the strings the spec pins", () => {
    expect(voice("classic")).toBe(
      "Write one short, kind joke in the duck's voice, with warm irony. Reply with the joke text only, on one line:",
    )
    expect(voice("angry")).toBe(
      "Write one short joke in the duck's voice, with sarcasm about workarounds, crutches and duct tape. Reply with the joke text only, on one line:",
    )
    expect(voice("robot")).toBe(
      "Write one short joke in the duck's voice, as a telegraphic machine report about CI, builds and metrics: short factual fragments, no filler. Use normal sentence case, never all caps. Reply with the joke text only, on one line:",
    )
  })

  test("no voice names its persona", () => {
    for (const name of PERSONA_ORDER) expect(voice(name).toLowerCase()).not.toContain(name)
  })

  test("every voice keeps the one-line instruction", () => {
    for (const name of PERSONA_ORDER) {
      expect(voice(name)).toEndWith("Reply with the joke text only, on one line:")
    }
  })
})
