import { describe, expect, it } from "vitest";
import type { LugjiMeeting } from "./frontmatter";
import {
	buildSmartLinks,
	extractTranscriptSection,
	extractWikilinksFromBody,
	filterRedundantMentions,
	type SmartLinks,
} from "./smart-linking";

/**
 * Tests for the smart-linking cascade (ADR-O03).
 *
 * Each tier is exercised independently. Tier 3 (daily-note) MUST always
 * fire — that's the architectural guarantee that every meeting has at
 * least one outbound link.
 */

function meetingWith(
	overrides: Partial<LugjiMeeting["frontmatter"]> = {},
): LugjiMeeting {
	return {
		filePath: "Lugji Meetings/test.md",
		versionMismatch: "same",
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

describe("buildSmartLinks — tier 3 (daily note, always)", () => {
	it("always emits the daily-note target from the frontmatter date", () => {
		const links = buildSmartLinks(meetingWith({ date: "2026-05-23" }));
		expect(links.dailyNoteTarget).toBe("2026-05-23");
	});

	it("returns empty topics + attendees when frontmatter has none, tier 3 still fires", () => {
		const links = buildSmartLinks(meetingWith());
		expect(links.topics).toEqual([]);
		expect(links.attendees).toEqual([]);
		expect(links.dailyNoteTarget).toBe("2026-05-23");
	});
});

describe("buildSmartLinks — tier 1 (topics)", () => {
	it("maps topics through normalisation when populated", () => {
		const links = buildSmartLinks(
			meetingWith({ topics: ["MVP", "launch"] }),
		);
		expect(links.topics).toEqual(["MVP", "launch"]);
	});

	it("collapses internal whitespace and trims topic entries", () => {
		const links = buildSmartLinks(
			meetingWith({ topics: ["  go to   market  ", "launch"] }),
		);
		expect(links.topics).toEqual(["go to market", "launch"]);
	});

	it("filters out entries that become empty after trimming", () => {
		const links = buildSmartLinks(
			meetingWith({ topics: ["MVP", "   ", "launch"] }),
		);
		expect(links.topics).toEqual(["MVP", "launch"]);
	});
});

describe("buildSmartLinks — tier 2 (attendees)", () => {
	it("maps attendees through normalisation when populated (Pro tier)", () => {
		const links = buildSmartLinks(
			meetingWith({ attendees: ["Jerry", "Alex"] }),
		);
		expect(links.attendees).toEqual(["Jerry", "Alex"]);
	});

	it("preserves CJK attendee names without lowercasing", () => {
		const links = buildSmartLinks(
			meetingWith({ attendees: ["陳大文", "Alex"] }),
		);
		expect(links.attendees).toEqual(["陳大文", "Alex"]);
	});

	it("returns an empty attendees list on Free tier (no diarization)", () => {
		const links = buildSmartLinks(meetingWith({ attendees: [] }));
		expect(links.attendees).toEqual([]);
	});
});

describe("extractWikilinksFromBody — tier 4", () => {
	it("extracts a single bare wikilink", () => {
		expect(extractWikilinksFromBody("see [[Project Roadmap]] for details")).toEqual([
			"Project Roadmap",
		]);
	});

	it("captures the target portion of an aliased wikilink", () => {
		expect(
			extractWikilinksFromBody("see [[Project Roadmap|the roadmap]]"),
		).toEqual(["Project Roadmap"]);
	});

	it("captures the target portion of a heading-anchored wikilink", () => {
		expect(
			extractWikilinksFromBody("jump to [[Project Roadmap#Q3 goals]]"),
		).toEqual(["Project Roadmap"]);
	});

	it("captures the target portion of an aliased + anchored wikilink", () => {
		expect(
			extractWikilinksFromBody("see [[Project Roadmap#Q3 goals|Q3]]"),
		).toEqual(["Project Roadmap"]);
	});

	it("dedupes identical wikilink targets, preserving first-seen order", () => {
		expect(
			extractWikilinksFromBody(
				"[[A]] and [[B]] and [[A|A again]] and [[C]]",
			),
		).toEqual(["A", "B", "C"]);
	});

	it("ignores `![[...]]` image / audio embeds (those are media, not outbound links)", () => {
		expect(
			extractWikilinksFromBody(
				"![[2026-05-23.m4a]] is the audio; also see [[Notes]]",
			),
		).toEqual(["Notes"]);
	});

	it("returns an empty array when the body has no wikilinks", () => {
		expect(extractWikilinksFromBody("plain prose with no links")).toEqual(
			[],
		);
	});

	it("returns an empty array for an empty body", () => {
		expect(extractWikilinksFromBody("")).toEqual([]);
	});
});

describe("extractTranscriptSection", () => {
	it("extracts the body between `## Transcript` and the next `## ` heading", () => {
		const md =
			"## Summary\n\nshort\n\n## Transcript\n\n[00:00:03] hello\n\n[00:00:12] world\n\n## Audio\n\n![[a.m4a]]";
		expect(extractTranscriptSection(md)).toBe(
			"[00:00:03] hello\n\n[00:00:12] world",
		);
	});

	it("extracts to end of file when no following `## ` heading exists", () => {
		const md = "## Transcript\n\n[00:00:03] hello\n\n[00:00:12] world\n";
		expect(extractTranscriptSection(md)).toBe(
			"[00:00:03] hello\n\n[00:00:12] world",
		);
	});

	it("returns '' when the transcript section is missing entirely", () => {
		const md = "## Summary\n\nshort\n\n## Audio\n\n![[a.m4a]]";
		expect(extractTranscriptSection(md)).toBe("");
	});

	it("returns '' for an empty document", () => {
		expect(extractTranscriptSection("")).toBe("");
	});
});

describe("buildSmartLinks — wikilink-unsafe character sanitisation", () => {
	it("strips `[` and `]` from a topic so the wikilink does not break", () => {
		const links = buildSmartLinks(
			meetingWith({ topics: ["Q3 [planning]"] }),
		);
		expect(links.topics).toEqual(["Q3 planning"]);
	});

	it("strips the `|` alias separator from a topic", () => {
		const links = buildSmartLinks(
			meetingWith({ topics: ["roadmap | 2026"] }),
		);
		expect(links.topics).toEqual(["roadmap 2026"]);
	});

	it("strips the `#` heading anchor from a topic", () => {
		const links = buildSmartLinks(
			meetingWith({ topics: ["launch #1"] }),
		);
		expect(links.topics).toEqual(["launch 1"]);
	});

	it("strips the `^` block-reference anchor from a topic", () => {
		const links = buildSmartLinks(
			meetingWith({ topics: ["note^ref"] }),
		);
		expect(links.topics).toEqual(["note ref"]);
	});

	it("sanitises attendee names too, not just topics", () => {
		const links = buildSmartLinks(
			meetingWith({ attendees: ["VIP [Jerry]", "Alex"] }),
		);
		expect(links.attendees).toEqual(["VIP Jerry", "Alex"]);
	});

	it("drops a topic that becomes empty after stripping unsafe characters", () => {
		const links = buildSmartLinks(
			meetingWith({ topics: ["###", "launch"] }),
		);
		expect(links.topics).toEqual(["launch"]);
	});

	it("leaves a clean topic untouched", () => {
		const links = buildSmartLinks(
			meetingWith({ topics: ["product launch"] }),
		);
		expect(links.topics).toEqual(["product launch"]);
	});

	it("preserves CJK while stripping unsafe characters around it", () => {
		const links = buildSmartLinks(
			meetingWith({ topics: ["產品 [發佈]"] }),
		);
		expect(links.topics).toEqual(["產品 發佈"]);
	});
});

describe("filterRedundantMentions — tier-4 dedup against tiers 1-3", () => {
	const smartLinks: SmartLinks = {
		topics: ["Roadmap", "Launch"],
		attendees: ["Jerry", "Alex"],
		dailyNoteTarget: "2026-05-23",
	};

	it("drops a transcript wikilink that matches a topic", () => {
		expect(
			filterRedundantMentions(["Roadmap", "Backlog"], smartLinks),
		).toEqual(["Backlog"]);
	});

	it("drops a transcript wikilink that matches an attendee", () => {
		expect(
			filterRedundantMentions(["Jerry", "Vendor"], smartLinks),
		).toEqual(["Vendor"]);
	});

	it("drops a transcript wikilink that matches the daily-note date", () => {
		expect(
			filterRedundantMentions(["2026-05-23", "Vendor"], smartLinks),
		).toEqual(["Vendor"]);
	});

	it("matches case-insensitively (`[[roadmap]]` == topic `Roadmap`)", () => {
		expect(
			filterRedundantMentions(["roadmap", "ROADMAP"], smartLinks),
		).toEqual([]);
	});

	it("keeps every wikilink when none are redundant", () => {
		expect(
			filterRedundantMentions(["Q3 OKRs", "Hiring"], smartLinks),
		).toEqual(["Q3 OKRs", "Hiring"]);
	});

	it("returns an empty array for an empty tier-4 list", () => {
		expect(filterRedundantMentions([], smartLinks)).toEqual([]);
	});
});
