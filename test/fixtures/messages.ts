import type { ModelRef, SessionMessageInfo } from "@opencode/client"

export const MODEL: ModelRef = { providerID: "openai", id: "gpt-5" }

export function userMessage(text: string, created: number): SessionMessageInfo {
  return { id: `user-${created}`, type: "user", time: { created }, text } as unknown as SessionMessageInfo
}

export function assistantMessage(text: string, created: number): SessionMessageInfo {
  return {
    id: `assistant-${created}`,
    type: "assistant",
    time: { created },
    agent: "build",
    model: MODEL,
    content: [{ type: "text", text }],
  } as unknown as SessionMessageInfo
}
