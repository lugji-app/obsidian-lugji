import { describe, expect, it } from "vitest";
import { normalizeFolderPath } from "./watcher";

/**
 * Tests for `watcher.ts::normalizeFolderPath`.
 *
 * The Obsidian package's runtime is browser-shaped and isn't available
 * in a Node test environment. `vitest.config.ts` aliases `obsidian` to
 * `tests/stubs/obsidian.ts`, which provides a minimal `normalizePath`
 * that mirrors Obsidian's documented behaviour (forward-slash conversion,
 * slash-run collapse). That stub is what these tests effectively
 * exercise as the downstream dependency.
 *
 * Coverage targets (from architect's Day 3 priority list):
 *   - Trim + leading / trailing slash handling
 *   - Cross-OS separator conversion (Windows `\` → `/`)
 *   - Multiple-slash collapse
 *   - Defensive handling of non-string callers
 */

describe("normalizeFolderPath — happy path", () => {
	it("returns a simple folder name unchanged", () => {
		expect(normalizeFolderPath("Lugji Meetings")).toBe("Lugji Meetings");
	});

	it("preserves internal slashes for nested folders", () => {
		expect(normalizeFolderPath("Lugji Meetings/Archive/2026")).toBe(
			"Lugji Meetings/Archive/2026",
		);
	});
});

describe("normalizeFolderPath — whitespace handling", () => {
	it("trims surrounding whitespace", () => {
		expect(normalizeFolderPath("  Lugji Meetings  ")).toBe(
			"Lugji Meetings",
		);
	});

	it("returns '' for an empty string", () => {
		expect(normalizeFolderPath("")).toBe("");
	});

	it("returns '' for a whitespace-only string", () => {
		expect(normalizeFolderPath("   \t  ")).toBe("");
	});
});

describe("normalizeFolderPath — slash handling", () => {
	it("strips a single leading slash (vault-relative paths have none)", () => {
		expect(normalizeFolderPath("/Lugji Meetings")).toBe("Lugji Meetings");
	});

	it("strips a single trailing slash", () => {
		expect(normalizeFolderPath("Lugji Meetings/")).toBe("Lugji Meetings");
	});

	it("strips multiple leading and trailing slashes", () => {
		expect(normalizeFolderPath("//Lugji Meetings//")).toBe(
			"Lugji Meetings",
		);
	});
});

describe("normalizeFolderPath — cross-OS", () => {
	it("converts Windows backslashes to forward slashes", () => {
		expect(normalizeFolderPath("Lugji Meetings\\Archive")).toBe(
			"Lugji Meetings/Archive",
		);
	});

	it("collapses internal duplicate slashes", () => {
		expect(normalizeFolderPath("Lugji Meetings//Archive")).toBe(
			"Lugji Meetings/Archive",
		);
	});

	it("handles a mixed-separator path (\\ + /) from a copy-pasted Windows path", () => {
		expect(normalizeFolderPath("Lugji Meetings\\Archive/2026")).toBe(
			"Lugji Meetings/Archive/2026",
		);
	});
});

describe("normalizeFolderPath — type safety", () => {
	it("returns '' on a non-string input (cast at runtime by careless callers)", () => {
		// Cast through `unknown` to bypass the compile-time signature so we
		// can exercise the runtime `typeof` guard inside the function.
		expect(normalizeFolderPath(null as unknown as string)).toBe("");
		expect(normalizeFolderPath(undefined as unknown as string)).toBe("");
		expect(normalizeFolderPath(42 as unknown as string)).toBe("");
	});
});
