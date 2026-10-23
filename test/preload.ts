import { plugin } from "bun"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

/**
 * `bun test` resolves the bare `solid-js` package through the `node` condition,
 * which points at the server build: signals exist, but effects never run. The
 * OpenCode host rewrites the bare specifier in plugin sources to its own client
 * runtime, so a plugin can import `solid-js` and share the renderer's owner
 * tree. Tests need the same rewrite, or the component would run on a second
 * Solid instance whose effects the renderer cannot dispose.
 *
 * The target is `solid-js/dist/solid.js`, the same file `@opentui/solid` uses,
 * so both end up on one module instance. Only project sources are rewritten;
 * node_modules keeps its own resolution.
 */
const root = resolve(import.meta.dir, "..")
const clientRuntime = resolve(root, "node_modules/solid-js/dist/solid.js")
const storeRuntime = resolve(root, "node_modules/solid-js/store/dist/store.js")
const projectSource = /^(?!.*[/\\]node_modules[/\\]).*\.[cm]?[jt]sx?$/

const loaderFor = (path: string) => {
  if (path.endsWith(".tsx")) return "tsx"
  if (path.endsWith(".jsx")) return "jsx"
  if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")) return "js"
  return "ts"
}

plugin({
  name: "ducksay-solid-client-runtime",
  setup(build) {
    build.onLoad({ filter: projectSource }, async (args) => ({
      contents: (await readFile(args.path, "utf8"))
        .replace(/(from\s+["'])solid-js(["'])/g, `$1${clientRuntime}$2`)
        .replace(/(from\s+["'])solid-js\/store(["'])/g, `$1${storeRuntime}$2`),
      loader: loaderFor(args.path),
    }))
  },
})
