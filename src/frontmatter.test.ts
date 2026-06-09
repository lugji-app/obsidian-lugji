import { describe, expect, it } from "vitest";
import {
	classifyVersion,
	parseLugjiFrontmatter,
	PLUGIN_SCHEMA_MAJOR_VERSION,
} from "./frontmatter";

/**
 * Tests for the Lugji frontmatter parser.
 *
 * Coverage targets, from the file-format-spec § "Parser contract":
 *   1. Never throws on malformed input.
 *   2. Discriminates the three outcomes: not-a-lugji-meeting / valid /
 *      valid-with-warnings.
 *   3. Coerces gracefully: language, array fields, missing version.
 *   4. classifyVersion: same / newer / older / missing.
 *
 * Tests are intentionally heavy on the defensive paths because that's
 * what protects the plugin from any future iOS-side schema drift.
 */

const VALID_MEETING_ID = "D43E0B40-1F0C-4F8E-B6A2-3A4C8E7F1234";
const TEST_FILE_PATH = "Lugji Meetings/2026-05-16-test.md";

/** Minimal-valid frontmatter to clone in happy-path tests. */
function makeValidFrontmatter() {
	return {
		date: "2026-05-16",
		type: "meeting",
		duration: "32min",
		language: "cantonese",
		attendees: ["Jerry", "Alex"],
		topics: ["product", "launch"],
		tags: ["meeting", "lugji"],
		lugji_meeting_id: VALID_MEETING_ID,
		lugji_version: "1.0.0",
	};
}

describe("PLUGIN_SCHEMA_MAJOR_VERSION", () => {
	it("is 1 — bumping this is a coordinated cross-surface change", () => {
		expect(PLUGIN_SCHEMA_MAJOR_VERSION).toBe(1);
	});
});

describe("classifyVersion", () => {
	it("returns 'same' for exact match to plugin major", () => {
		expect(classifyVersion("1.0.0")).toBe("same");
	});

	it("returns 'same' for any minor / patch with the same major", () => {
		expect(classifyVersion("1.5.7")).toBe("same");
		expect(classifyVersion("1.99.0")).toBe("same");
	});

	it("returns 'newer' when the note carries a higher major than the plugin parses", () => {
		expect(classifyVersion("2.0.0")).toBe("newer");
		expect(classifyVersion("99.0.0")).toBe("newer");
	});

	it("returns 'older' when the note carries a lower major than the plugin parses", () => {
		expect(classifyVersion("0.0.1")).toBe("older");
		expect(classifyVersion("0.99.0")).toBe("older");
	});

	it("returns 'missing' for the empty string", () => {
		expect(classifyVersion("")).toBe("missing");
	});

	it("returns 'missing' for an unparseable version", () => {
		expect(classifyVersion("abc")).toBe("missing");
		expect(classifyVersion("v1.0.0")).toBe("missing");
	});

	it("returns 'missing' for a negative major (defensive against weird YAML)", () => {
		expect(classifyVersion("-1.0.0")).toBe("missing");
	});
});

describe("parseLugjiFrontmatter — not-a-lugji-meeting", () => {
	it("rejects null", () => {
		const r = parseLugjiFrontmatter(null, TEST_FILE_PATH);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.reason).toBe("not-a-lugji-meeting");
	});

	it("rejects undefined", () => {
		const r = parseLugjiFrontmatter(undefined, TEST_FILE_PATH);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.reason).toBe("not-a-lugji-meeting");
	});

	it("rejects a non-object (string)", () => {
		const r = parseLugjiFrontmatter("not an object", TEST_FILE_PATH);
		expect(r.ok).toBe(false);
	});

	it("rejects an empty frontmatter object (no lugji_meeting_id)", () => {
		const r = parseLugjiFrontmatter({}, TEST_FILE_PATH);
		expect(r.ok).toBe(false);
	});

	it("rejects frontmatter with empty-string lugji_meeting_id", () => {
		const r = parseLugjiFrontmatter(
			{ lugji_meeting_id: "" },
			TEST_FILE_PATH,
		);
		expect(r.ok).toBe(false);
	});

	it("rejects frontmatter with a non-string lugji_meeting_id", () => {
		const r = parseLugjiFrontmatter(
			{ lugji_meeting_id: 12345 },
			TEST_FILE_PATH,
		);
		expect(r.ok).toBe(false);
	});
});

describe("parseLugjiFrontmatter — happy path", () => {
	it("parses a fully-populated valid meeting with no warnings", () => {
		const r = parseLugjiFrontmatter(makeValidFrontmatter(), TEST_FILE_PATH);
		expect(r.ok).toBe(true);
		if (!r.ok) return;

		expect(r.meeting.filePath).toBe(TEST_FILE_PATH);
		expect(r.meeting.versionMismatch).toBe("same");
		expect(r.meeting.warnings).toEqual([]);
		expect(r.meeting.frontmatter.date).toBe("2026-05-16");
		expect(r.meeting.frontmatter.type).toBe("meeting");
		expect(r.meeting.frontmatter.duration).toBe("32min");
		expect(r.meeting.frontmatter.language).toBe("cantonese");
		expect(r.meeting.frontmatter.attendees).toEqual(["Jerry", "Alex"]);
		expect(r.meeting.frontmatter.topics).toEqual(["product", "launch"]);
		expect(r.meeting.frontmatter.tags).toEqual(["meeting", "lugji"]);
		expect(r.meeting.frontmatter.lugji_meeting_id).toBe(VALID_MEETING_ID);
		expect(r.meeting.frontmatter.lugji_version).toBe("1.0.0");
	});

	it("preserves an empty attendees array (Free tier — no diarization)", () => {
		const fm = makeValidFrontmatter();
		fm.attendees = [];
		const r = parseLugjiFrontmatter(fm, TEST_FILE_PATH);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.meeting.frontmatter.attendees).toEqual([]);
		expect(r.meeting.warnings).toEqual([]);
	});

	it("treats a missing `duration` as undefined (it is optional)", () => {
		const fm = makeValidFrontmatter() as Record<string, unknown>;
		delete fm.duration;
		const r = parseLugjiFrontmatter(fm, TEST_FILE_PATH);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.meeting.frontmatter.duration).toBeUndefined();
		expect(r.meeting.warnings).toEqual([]);
	});
});

describe("parseLugjiFrontmatter — defensive coercion (ADR-O05)", () => {
	it("warns + falls back to 'mixed' when language is missing", () => {
		const fm = makeValidFrontmatter() as Record<string, unknown>;
		delete fm.language;
		const r = parseLugjiFrontmatter(fm, TEST_FILE_PATH);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.meeting.frontmatter.language).toBe("mixed");
		expect(r.meeting.warnings.some((w) => w.includes("language"))).toBe(
			true,
		);
	});

	it("warns + falls back to 'mixed' on an unknown language value", () => {
		const fm = { ...makeValidFrontmatter(), language: "klingon" };
		const r = parseLugjiFrontmatter(fm, TEST_FILE_PATH);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.meeting.frontmatter.language).toBe("mixed");
		expect(r.meeting.warnings.some((w) => w.includes("language"))).toBe(
			true,
		);
	});

	it("warns + falls back to [] when attendees is not an array", () => {
		const fm = { ...makeValidFrontmatter(), attendees: "Jerry" };
		const r = parseLugjiFrontmatter(fm, TEST_FILE_PATH);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.meeting.frontmatter.attendees).toEqual([]);
		expect(r.meeting.warnings.some((w) => w.includes("attendees"))).toBe(
			true,
		);
	});

	it("filters non-string entries out of attendees with a warning", () => {
		const fm = {
			...makeValidFrontmatter(),
			attendees: ["Jerry", 42, null, "Alex"],
		};
		const r = parseLugjiFrontmatter(fm, TEST_FILE_PATH);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.meeting.frontmatter.attendees).toEqual(["Jerry", "Alex"]);
		expect(
			r.meeting.warnings.some((w) =>
				w.includes("Dropped 2 non-string entries from `attendees`"),
			),
		).toBe(true);
	});

	it("warns when date is missing and falls back to empty string", () => {
		const fm = makeValidFrontmatter() as Record<string, unknown>;
		delete fm.date;
		const r = parseLugjiFrontmatter(fm, TEST_FILE_PATH);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.meeting.frontmatter.date).toBe("");
		expect(r.meeting.warnings.some((w) => w.includes("date"))).toBe(true);
	});

	it("warns when type is an unexpected value but still parses the file", () => {
		const fm = { ...makeValidFrontmatter(), type: "voice-memo" };
		const r = parseLugjiFrontmatter(fm, TEST_FILE_PATH);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.meeting.frontmatter.type).toBe("meeting");
		expect(r.meeting.warnings.some((w) => w.includes("type"))).toBe(true);
	});

	it("warns + treats missing lugji_version as 0.0.0 (mismatch=missing)", () => {
		const fm = makeValidFrontmatter() as Record<string, unknown>;
		delete fm.lugji_version;
		const r = parseLugjiFrontmatter(fm, TEST_FILE_PATH);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.meeting.frontmatter.lugji_version).toBe("0.0.0");
		expect(r.meeting.versionMismatch).toBe("missing");
		expect(
			r.meeting.warnings.some((w) => w.includes("lugji_version")),
		).toBe(true);
	});

	it("falls back to [] when tags is not an array, with a warning", () => {
		const fm = { ...makeValidFrontmatter(), tags: "meeting" };
		const r = parseLugjiFrontmatter(fm, TEST_FILE_PATH);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.meeting.frontmatter.tags).toEqual([]);
		expect(r.meeting.warnings.some((w) => w.includes("tags"))).toBe(true);
	});
});

describe("parseLugjiFrontmatter — version mismatch detection", () => {
	it("flags a newer-major note for the warning banner", () => {
		const fm = { ...makeValidFrontmatter(), lugji_version: "2.0.0" };
		const r = parseLugjiFrontmatter(fm, TEST_FILE_PATH);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.meeting.versionMismatch).toBe("newer");
	});

	it("flags an older-major note for the legacy banner", () => {
		const fm = { ...makeValidFrontmatter(), lugji_version: "0.5.0" };
		const r = parseLugjiFrontmatter(fm, TEST_FILE_PATH);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.meeting.versionMismatch).toBe("older");
	});

	it("does not warn when same-major even if minor/patch differ", () => {
		const fm = { ...makeValidFrontmatter(), lugji_version: "1.7.3" };
		const r = parseLugjiFrontmatter(fm, TEST_FILE_PATH);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.meeting.versionMismatch).toBe("same");
		// No `lugji_version` warning on same-major.
		expect(
			r.meeting.warnings.every((w) => !w.includes("lugji_version")),
		).toBe(true);
	});
});

describe("parseLugjiFrontmatter — robustness", () => {
	it("never throws on a deeply broken object", () => {
		const broken = {
			lugji_meeting_id: VALID_MEETING_ID,
			date: { not: "a string" },
			language: 99,
			attendees: { not: "an array" },
			topics: null,
			tags: undefined,
			lugji_version: 1.0,
			type: ["not", "a", "string"],
		};
		expect(() => parseLugjiFrontmatter(broken, TEST_FILE_PATH)).not.toThrow();
		const r = parseLugjiFrontmatter(broken, TEST_FILE_PATH);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		// Every recoverable field hit a coercion → warnings should be populated.
		expect(r.meeting.warnings.length).toBeGreaterThan(0);
	});
});
