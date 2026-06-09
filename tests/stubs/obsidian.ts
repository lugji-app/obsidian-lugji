/**
 * Minimal Obsidian API stub for Vitest.
 *
 * The real Obsidian runtime is injected by the host application when the
 * plugin loads. Vitest runs in Node, so we redirect every `import ...
 * from "obsidian"` to this file via `vitest.config.ts` aliasing.
 *
 * Only the symbols actually imported by `src/` need stubs here. Keep this
 * file minimal — if a test starts depending on a real Obsidian behaviour
 * the right move is usually a smarter test design, not a richer stub.
 *
 * Stubs intentionally mirror the documented behaviour of the real API
 * where it matters for unit tests:
 *   - `normalizePath` does forward-slash conversion + slash collapse,
 *     matching the Obsidian implementation as documented in the API
 *     reference.
 *   - `Plugin` / `TAbstractFile` / `TFile` are empty placeholder classes
 *     so `import` statements + `instanceof` checks compile and resolve.
 *     We don't try to fake their behaviour — anything that genuinely
 *     needs them is integration-tested inside a real vault.
 */

export function normalizePath(p: string): string {
	return p.replace(/\\/g, "/").replace(/\/+/g, "/");
}

export class Plugin {}
export class TAbstractFile {}
export class TFile extends TAbstractFile {}
