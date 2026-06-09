import { describe, expect, it } from "vitest";
import type { LugjiMeeting } from "./frontmatter";
import {
	buildDashboardRows,
	DEFAULT_DASHBOARD_CONFIG,
	parseDashboardConfig,
	pickFirstH1,
	type DashboardMeetingInput,
} from "./dashboard";

/**
 * Tests for the `lugji-meetings` dashboard pure functions.
 *
 * The codeblock processor + DOM renderer (`registerLugjiDashboard`) are
 * Obsidian-coupled and integration-tested in a real vault — only the
 * config parser and the row builder are unit-tested here.
 */

function meetingWith(
	overrides: Partial<LugjiMeeting["frontmatter"]> = {},
	extras: Partial<Pick<LugjiMeeting, "versionMismatch" | "filePath">> = {},
): LugjiMeeting {
	return {
		filePath: extras.filePath ?? "Lugji Meetings/test.md",
		versionMismatch: extras.versionMismatch ?? "same",
		warnings: [],
		frontmatter: {
			date: "2026-05-23",
			type: "meeting",
			duration: undefined,
			language: "cantonese",
			attendees: [],
			topics: [],
			tags: ["meeting", "lugji"],
			lugji_meeting_id: "D43E0B40-1F0C-4F8E-B6A2-3A4C8E7F1234",
			lugji_version: "1.0.0",
			...overrides,
		},
	};
}

function input(
	overrides: Partial<LugjiMeeting["frontmatter"]> = {},
	title = "Test Meeting",
	extras: Partial<Pick<LugjiMeeting, "versionMismatch" | "filePath">> = {},
): DashboardMeetingInput {
	return { meeting: meetingWith(overrides, extras), title };
}

describe("parseDashboardConfig", () => {
	it("returns defaults for an empty codeblock", () => {
		expect(parseDashboardConfig("")).toEqual(DEFAULT_DASHBOARD_CONFIG);
	});

	it("returns defaults for a whitespace-only codeblock", () => {
		expect(parseDashboardConfig("   \n  \n")).toEqual(
			DEFAULT_DASHBOARD_CONFIG,
		);
	});

	it("parses a positive integer `limit`", () => {
		expect(parseDashboardConfig("limit: 10").limit).toBe(10);
	});

	it("ignores a non-numeric `limit` and keeps the default (no limit)", () => {
		expect(parseDashboardConfig("limit: lots").limit).toBeNull();
	});

	it("ignores a zero / negative `limit`", () => {
		expect(parseDashboardConfig("limit: 0").limit).toBeNull();
		expect(parseDashboardConfig("limit: -5").limit).toBeNull();
	});

	it("parses `sort: date-asc`", () => {
		expect(parseDashboardConfig("sort: date-asc").sort).toBe("date-asc");
	});

	it("ignores an unknown `sort` value and keeps the default", () => {
		expect(parseDashboardConfig("sort: random").sort).toBe("date-desc");
	});

	it("is case-insensitive on keys and tolerant of surrounding whitespace", () => {
		const config = parseDashboardConfig("  LIMIT :  3 \n  Sort :date-asc");
		expect(config.limit).toBe(3);
		expect(config.sort).toBe("date-asc");
	});

	it("skips comment lines and blank lines", () => {
		const config = parseDashboardConfig(
			"# this is a comment\n\nlimit: 5\n",
		);
		expect(config.limit).toBe(5);
	});

	it("ignores malformed lines without a colon", () => {
		expect(parseDashboardConfig("limit 5\ngarbage")).toEqual(
			DEFAULT_DASHBOARD_CONFIG,
		);
	});
});

describe("buildDashboardRows — sorting", () => {
	it("sorts by date descending by default", () => {
		const rows = buildDashboardRows(
			[
				input({ date: "2026-05-10" }, "Older"),
				input({ date: "2026-05-23" }, "Newer"),
				input({ date: "2026-05-15" }, "Middle"),
			],
			{ limit: null, sort: "date-desc" },
		);
		expect(rows.map((r) => r.title)).toEqual([
			"Newer",
			"Middle",
			"Older",
		]);
	});

	it("sorts by date ascending when configured", () => {
		const rows = buildDashboardRows(
			[
				input({ date: "2026-05-23" }, "Newer"),
				input({ date: "2026-05-10" }, "Older"),
			],
			{ limit: null, sort: "date-asc" },
		);
		expect(rows.map((r) => r.title)).toEqual(["Older", "Newer"]);
	});
});

describe("buildDashboardRows — limit", () => {
	it("returns every row when limit is null", () => {
		const rows = buildDashboardRows(
			[input({ date: "2026-05-10" }), input({ date: "2026-05-11" })],
			{ limit: null, sort: "date-desc" },
		);
		expect(rows).toHaveLength(2);
	});

	it("truncates to the configured limit, keeping the top of the sort", () => {
		const rows = buildDashboardRows(
			[
				input({ date: "2026-05-10" }, "A"),
				input({ date: "2026-05-23" }, "C"),
				input({ date: "2026-05-15" }, "B"),
			],
			{ limit: 2, sort: "date-desc" },
		);
		expect(rows.map((r) => r.title)).toEqual(["C", "B"]);
	});
});

describe("buildDashboardRows — row model", () => {
	it("derives every column from the meeting + title", () => {
		const rows = buildDashboardRows(
			[
				input(
					{
						date: "2026-05-23",
						language: "mixed",
						duration: "32min",
						attendees: ["Jerry", "Alex"],
						topics: ["MVP", "launch"],
					},
					"Week 2 Standup",
					{ filePath: "Lugji Meetings/w2.md" },
				),
			],
			DEFAULT_DASHBOARD_CONFIG,
		);
		expect(rows[0]).toEqual({
			filePath: "Lugji Meetings/w2.md",
			title: "Week 2 Standup",
			date: "2026-05-23",
			language: "mixed",
			duration: "32min",
			attendeeCount: 2,
			topics: ["MVP", "launch"],
			versionMismatch: "same",
		});
	});

	it("renders a missing duration as an empty string (renderer shows '—')", () => {
		const rows = buildDashboardRows(
			[input({ duration: undefined })],
			DEFAULT_DASHBOARD_CONFIG,
		);
		expect(rows[0]?.duration).toBe("");
	});

	it("carries the version mismatch class through to the row", () => {
		const rows = buildDashboardRows(
			[input({}, "Legacy", { versionMismatch: "older" })],
			DEFAULT_DASHBOARD_CONFIG,
		);
		expect(rows[0]?.versionMismatch).toBe("older");
	});

	it("returns an empty array for no inputs", () => {
		expect(buildDashboardRows([], DEFAULT_DASHBOARD_CONFIG)).toEqual([]);
	});
});

describe("pickFirstH1", () => {
	it("returns null when there are no headings", () => {
		expect(pickFirstH1(undefined)).toBeNull();
		expect(pickFirstH1([])).toBeNull();
	});

	it("returns the text of the first level-1 heading", () => {
		expect(
			pickFirstH1([{ level: 1, heading: "Week 2 Standup" }]),
		).toBe("Week 2 Standup");
	});

	it("skips a leading level-2 heading and finds the H1", () => {
		expect(
			pickFirstH1([
				{ level: 2, heading: "Summary" },
				{ level: 1, heading: "The Title" },
			]),
		).toBe("The Title");
	});

	it("returns the FIRST H1 when several exist", () => {
		expect(
			pickFirstH1([
				{ level: 1, heading: "First" },
				{ level: 1, heading: "Second" },
			]),
		).toBe("First");
	});

	it("returns null for an empty first H1 (real build-21 divergence — see handoff 2026-05-22-h1-title-divergence)", () => {
		// The real-device fixture 2026-05-22-6-e87c1252.md has an empty `#`
		// line. The dashboard must fall back to the filename, not show a
		// blank title cell — so an empty H1 is treated as "no title".
		expect(pickFirstH1([{ level: 1, heading: "" }])).toBeNull();
	});

	it("returns null for a whitespace-only first H1", () => {
		expect(pickFirstH1([{ level: 1, heading: "   " }])).toBeNull();
	});

	it("does NOT scan past an empty first H1 to a later H1", () => {
		// The first H1 is the title slot; a later H1 is a body section.
		expect(
			pickFirstH1([
				{ level: 1, heading: "" },
				{ level: 1, heading: "Not The Title" },
			]),
		).toBeNull();
	});
});
