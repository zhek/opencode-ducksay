import type { JokeFailure } from "./joke.ts"
import type { Logger } from "./log.ts"
import type { ConfigDiagnostic } from "./options.ts"

/**
 * Turns one joke failure into the exact log line the spec names.
 *
 * The mapping lives here rather than in `joke.ts` so the generator stays free
 * of file and logger types, and rather than in `tui.tsx` so it can be tested
 * without a renderer.
 */
export function logJokeFailure(logger: Logger, failure: JokeFailure, session?: string): void {
  switch (failure.kind) {
    case "client_missing":
      logger.error("joke.client_missing", "The host client cannot create a joke request.", { session })
      break
    case "source_missing":
      logger.warn("joke.source_missing", "The session needed for a joke is gone.", { session })
      break
    case "prompt_failed":
      logger.error("joke.prompt_failed", "The joke prompt could not be built.", {
        session,
        error: failure.error,
      })
      break
    case "model_unusable":
      logger.info("joke.model_unusable", "The configured joke model is not usable.", {
        session,
        data: { model: failure.model },
      })
      break
    case "session_create_failed":
      logger.error("joke.session_create_failed", "The temporary joke session could not be created.", {
        session,
        error: failure.error,
        data: { model: failure.model },
      })
      break
    case "session_create_empty":
      logger.error("joke.session_create_empty", "The temporary joke session has no id.", {
        session,
        data: { model: failure.model },
      })
      break
    case "request_failed":
      logger.error("joke.request_failed", "The joke request failed.", {
        session,
        error: failure.error,
        data: { model: failure.model, durationMs: failure.durationMs },
      })
      break
    case "timeout":
      logger.error("joke.timeout", "The joke request timed out.", {
        session,
        data: {
          model: failure.model,
          timeoutMs: failure.timeoutMs,
          durationMs: failure.durationMs,
        },
      })
      break
    case "empty_answer":
      logger.warn("joke.empty_answer", "The model returned no usable joke.", {
        session,
        data: { durationMs: failure.durationMs, rawLength: failure.rawLength },
      })
      break
    case "cleanup_failed":
      logger.warn("joke.cleanup_failed", "The temporary joke session could not be removed.", {
        session,
        error: failure.error,
        data: { temporaryID: failure.temporaryID },
      })
      break
    case "aborted":
      logger.info("joke.aborted", "The joke request was cancelled.", {
        session,
        data: { reason: failure.reason },
      })
      break
  }
}

/** Writes one `config.invalid` line with the resolver's exact message. */
export function logConfigDiagnostic(logger: Logger, diagnostic: ConfigDiagnostic): void {
  logger.warn("config.invalid", diagnostic.message, {
    data: {
      option: diagnostic.option,
      value: diagnostic.value,
      effective: diagnostic.effective,
      reason: diagnostic.reason,
    },
  })
}
