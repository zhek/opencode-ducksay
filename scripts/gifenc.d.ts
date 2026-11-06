/**
 * `gifenc` ships no type declarations and has no `@types` package.
 *
 * The generator is the only consumer, and it uses three functions; typing them
 * as `any` keeps the encoder's API in one place instead of spreading untyped
 * imports through the renderer.
 *
 * The reference in `make-demo-gif.ts` pulls this file into the program, since
 * `tsconfig.json` does not include `scripts/`.
 */
declare module "gifenc" {
  export const GIFEncoder: any
  export const quantize: any
  export const applyPalette: any
}
