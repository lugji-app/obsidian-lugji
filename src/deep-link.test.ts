import { describe, expect, it } from "vitest";
import { buildLugjiUrl, LUGJI_TITLE_MAX_LENGTH } from "./deep-link";

/**
 * Tests for the lugji:// URL builder.
 *
 * Coverage targets, from the iOS handoff
 * `docs/handoff/ios-to-obsidian/2026-05-16-url-scheme-implemented.md`
 * § "iOS-side feedback":
 *   1. `title` is percent-encoded — `&`, `?`, spaces, CJK all survive
 *      a trip through iOS's `URLComponents`.
 *   2. `title` is capped at 200 characters (code points, not UTF-16
 *      units — surrogate-pair-safe for emoji + supplementary-plane CJK).
 *   3. `from=obsidian` is always set when the caller doesn't override.
 *
 * Plus general builder hygiene:
 *   - Path component is untouched (callers are responsible for any
 *     URL-unsafe chars in `{uuid}` segments).
 *   - Empty / whitespace-only values are dropped, not encoded as empty.
 *   - Output ordering is deterministic (`title` before `from`) so logs
 *     and golden tests stay stable.
 */

describe("buildLugjiUrl — paths", () => {
	it("renders the canonical 'start recording' URL with the default origin", () => {
		expect(buildLugjiUrl("meeting/new")).toBe(
			"lugji://meeting/new?from=obsidian",
		);
	});

	it("renders `settings` with the default origin", () => {
		expect(buildLugjiUrl("settings")).toBe("lugji://settings?from=obsidian");
	});

	it("preserves arbitrary path segments verbatim (Phase 2 verb-in-path routes)", () => {
		expect(
			buildLugjiUrl(
				"meeting/D43E0B40-1F0C-4F8E-B6A2-3A4C8E7F1234/share/audio",
			),
		).toBe(
			"lugji://meeting/D43E0B40-1F0C-4F8E-B6A2-3A4C8E7F1234/share/audio?from=obsidian",
		);
	});
});

describe("buildLugjiUrl — title encoding", () => {
	it("encodes a simple ASCII title", () => {
		expect(buildLugjiUrl("meeting/new", { title: "Hello" })).toBe(
			"lugji://meeting/new?title=Hello&from=obsidian",
		);
	});

	it("percent-encodes spaces as %20 (NOT '+', which iOS URLComponents reads literally)", () => {
		expect(
			buildLugjiUrl("meeting/new", { title: "Week 2 standup" }),
		).toBe("lugji://meeting/new?title=Week%202%20standup&from=obsidian");
	});

	it("percent-encodes '&' inside the title (would otherwise terminate the query value)", () => {
		expect(
			buildLugjiUrl("meeting/new", { title: "Jerry & Alex" }),
		).toBe("lugji://meeting/new?title=Jerry%20%26%20Alex&from=obsidian");
	});

	it("percent-encodes '?' inside the title", () => {
		expect(
			buildLugjiUrl("meeting/new", { title: "Where to launch?" }),
		).toBe(
			"lugji://meeting/new?title=Where%20to%20launch%3F&from=obsidian",
		);
	});

	it("percent-encodes Cantonese / Mandarin CJK characters", () => {
		// `encodeURIComponent` emits UTF-8 percent-encoding; verify a known
		// codepoint round-trips so the iOS side decodes correctly.
		// 週 = U+9031 → UTF-8 bytes E9 80 B1
		expect(buildLugjiUrl("meeting/new", { title: "週會 1" })).toBe(
			"lugji://meeting/new?title=%E9%80%B1%E6%9C%83%201&from=obsidian",
		);
	});
});

describe("buildLugjiUrl — title length cap", () => {
	it("preserves a title at exactly the cap (200 ASCII code points)", () => {
		const title = "a".repeat(LUGJI_TITLE_MAX_LENGTH);
		const url = buildLugjiUrl("meeting/new", { title });
		// The encoded title should be the same length as the source for ASCII.
		expect(url).toBe(
			`lugji://meeting/new?title=${title}&from=obsidian`,
		);
	});

	it("truncates a title past the cap to exactly the cap (code points)", () => {
		const title = "a".repeat(LUGJI_TITLE_MAX_LENGTH + 50);
		const url = buildLugjiUrl("meeting/new", { title });
		const expectedTitle = "a".repeat(LUGJI_TITLE_MAX_LENGTH);
		expect(url).toBe(
			`lugji://meeting/new?title=${expectedTitle}&from=obsidian`,
		);
	});

	it("counts CJK as one code point per glyph (NOT three UTF-8 bytes)", () => {
		// 200 CJK chars should pass through untouched (each glyph = 1 code
		// point, well under the cap by count).
		const title = "週".repeat(LUGJI_TITLE_MAX_LENGTH);
		const url = buildLugjiUrl("meeting/new", { title });
		// Decode the title back from the URL and confirm count is preserved.
		const titleParam =
			url.match(/title=([^&]+)/)?.[1] ?? "";
		const decoded = decodeURIComponent(titleParam);
		expect(Array.from(decoded).length).toBe(LUGJI_TITLE_MAX_LENGTH);
	});

	it("does NOT split a surrogate pair when truncating at the boundary", () => {
		// 🎉 = U+1F389, one code point but two UTF-16 units.
		// Build a string that's 199 ASCII + 1 emoji + 1 ASCII = 201 code
		// points → must cap to 200 with the emoji intact.
		const title = "a".repeat(199) + "🎉" + "b";
		expect(Array.from(title).length).toBe(201);
		const url = buildLugjiUrl("meeting/new", { title });
		const titleParam = url.match(/title=([^&]+)/)?.[1] ?? "";
		const decoded = decodeURIComponent(titleParam);
		const codePoints = Array.from(decoded);
		expect(codePoints.length).toBe(LUGJI_TITLE_MAX_LENGTH);
		// The emoji should be the last code point — intact, not half a
		// surrogate pair (which would have a U+FFFD replacement char).
		expect(codePoints[codePoints.length - 1]).toBe("🎉");
		expect(decoded.includes("�")).toBe(false);
	});
});

describe("buildLugjiUrl — value handling", () => {
	it("drops an empty-string title from the query (no `title=&...`)", () => {
		const url = buildLugjiUrl("meeting/new", { title: "" });
		expect(url).toBe("lugji://meeting/new?from=obsidian");
		expect(url.includes("title=")).toBe(false);
	});

	it("drops a whitespace-only title (trimmed away)", () => {
		const url = buildLugjiUrl("meeting/new", { title: "   \t  " });
		expect(url).toBe("lugji://meeting/new?from=obsidian");
		expect(url.includes("title=")).toBe(false);
	});

	it("trims leading and trailing whitespace off a non-empty title", () => {
		expect(
			buildLugjiUrl("meeting/new", { title: "  hello  " }),
		).toBe("lugji://meeting/new?title=hello&from=obsidian");
	});
});

describe("buildLugjiUrl — `from` origin attribution", () => {
	it("defaults `from` to 'obsidian' when caller omits it", () => {
		const url = buildLugjiUrl("meeting/new");
		expect(url.endsWith("from=obsidian")).toBe(true);
	});

	it("respects a custom `from` value (e.g. for debug commands)", () => {
		expect(buildLugjiUrl("meeting/new", { from: "obsidian-debug" })).toBe(
			"lugji://meeting/new?from=obsidian-debug",
		);
	});

	it("falls back to 'obsidian' when `from` is an empty string", () => {
		expect(buildLugjiUrl("meeting/new", { from: "" })).toBe(
			"lugji://meeting/new?from=obsidian",
		);
	});

	it("emits `title` before `from` so URL output is deterministic", () => {
		// Predictable ordering matters for golden-file tests and logs that
		// might do string-equality across plugin versions.
		const url = buildLugjiUrl("meeting/new", { title: "X", from: "siri" });
		expect(url).toBe("lugji://meeting/new?title=X&from=siri");
	});
});
