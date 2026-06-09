import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
	parseLugjiFrontmatter,
	PLUGIN_SCHEMA_MAJOR_VERSION,
} from "./frontmatter";
import { buildSmartLinks, extractTranscriptSection } from "./smart-linking";
import { pickFirstH1 } from "./dashboard";

/**
 * Cross-surface fixture tests.
 *
 * The `.md` files in `tests/fixtures/` are the **verbatim bytes** the iOS
 * app produces via `MeetingMarkdownSerializer`. iOS commits the same
 * bytes on their side; if either party's serializer / parser drifts
 * from `shared/product/file-format-spec.md`, one of the two suites
 * fails and the cross-surface diff is visible at PR-review time.
 *
 * What we assert here:
 *   1. The frontmatter is parseable as YAML.
 *   2. `parseLugjiFrontmatter` returns `ok: true, warnings: []` on the
 *      canonical bytes — i.e. the spec, the iOS writer, and the plugin
 *      reader agree end-to-end.
 *   3. Every required field round-trips losslessly into the typed
 *      domain model.
 *   4. Optional fields round-trip when present.
 *   5. Body sections are byte-identical to the source (we don't transform
 *      them in the parser, but exercise the extraction so we'd notice if
 *      that ever changed).
 *
 * What we do NOT assert:
 *   - Defensive coercion behaviour — that's `frontmatter.test.ts`'s job.
 *   - Body section parsing (Action Items / Transcript regex) — separate
 *     test once those parsers exist (currently the plugin just renders
 *     these sections verbatim per the parser contract).
 */

// `import.meta.dirname` exists at runtime in Node 20.11+, but our tsconfig
// targets ES6 so we use the explicit ESM-safe pattern instead.
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "..", "tests", "fixtures");

interface ExtractedSections {
	frontmatterYaml: string;
	body: string;
}

/**
 * Split a raw .md fixture into its YAML frontmatter and body.
 * Mirrors what Obsidian's metadata cache does at runtime; we don't
 * reimplement Obsidian's parsing here — we just use the standard `yaml`
 * package, which is what the spec expects.
 */
function extractFrontmatter(raw: string): ExtractedSections {
	// Tolerate both LF and CRLF — real-device files from iOS use CRLF
	// (Swift's default text I/O); synthetic fixtures use LF. The plugin's
	// production path goes through Obsidian's metadata cache which
	// normalises this, but this test helper reads raw bytes directly.
	const lines = raw.split(/\r?\n/);
	if (lines[0] !== "---") {
		throw new Error(
			"Fixture does not start with '---' — not a frontmatter file",
		);
	}
	let endLineIndex = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i] === "---") {
			endLineIndex = i;
			break;
		}
	}
	if (endLineIndex === -1) {
		throw new Error("Fixture has no closing '---' for frontmatter");
	}
	return {
		frontmatterYaml: lines.slice(1, endLineIndex).join("\n"),
		body: lines.slice(endLineIndex + 1).join("\n"),
	};
}

describe("fixture: 2026-05-23-week-2-standup-d43e0b40.md (iOS canonical sample)", () => {
	const fixturePath = join(
		FIXTURES_DIR,
		"2026-05-23-week-2-standup-d43e0b40.md",
	);
	const raw = readFileSync(fixturePath, "utf-8");
	const { frontmatterYaml, body } = extractFrontmatter(raw);
	const frontmatter: unknown = parseYaml(frontmatterYaml);

	it("YAML frontmatter parses to an object", () => {
		expect(typeof frontmatter).toBe("object");
		expect(frontmatter).not.toBeNull();
	});

	it("plugin parser accepts the canonical fixture with zero warnings", () => {
		const result = parseLugjiFrontmatter(frontmatter, fixturePath);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.meeting.warnings).toEqual([]);
		expect(result.meeting.versionMismatch).toBe("same");
	});

	it("required fields round-trip losslessly", () => {
		const result = parseLugjiFrontmatter(frontmatter, fixturePath);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const fm = result.meeting.frontmatter;
		expect(fm.date).toBe("2026-05-23");
		expect(fm.type).toBe("meeting");
		expect(fm.language).toBe("cantonese");
		expect(fm.lugji_meeting_id).toBe(
			"D43E0B40-1F0C-4F8E-B6A2-3A4C8E7F1234",
		);
		expect(fm.lugji_version).toBe("1.0.0");
		expect(fm.tags).toEqual(["meeting", "lugji"]);
	});

	it("optional fields round-trip when present", () => {
		const result = parseLugjiFrontmatter(frontmatter, fixturePath);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const fm = result.meeting.frontmatter;
		expect(fm.duration).toBe("32min");
		expect(fm.attendees).toEqual(["Jerry", "Alex"]);
		expect(fm.topics).toEqual(["MVP", "launch"]);
	});

	it("lugji_version major matches the plugin's native schema major", () => {
		const result = parseLugjiFrontmatter(frontmatter, fixturePath);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// If this fails, either the spec bumped majors or the plugin
		// PLUGIN_SCHEMA_MAJOR_VERSION constant drifted — both require an ADR.
		expect(result.meeting.frontmatter.lugji_version.split(".")[0]).toBe(
			String(PLUGIN_SCHEMA_MAJOR_VERSION),
		);
	});

	it("body preserves the expected six sections in order", () => {
		// Quick structural assertion — full body parsing is out of scope
		// for the frontmatter parser, but if iOS ever reorders or drops
		// these headings this test will be the first place to catch it.
		const headings = body
			.split("\n")
			.filter((line) => /^#{1,2} /.test(line));
		expect(headings).toEqual([
			"# Week 2 Standup",
			"## Summary",
			"## Action Items",
			"## Key Decisions",
			"## Transcript",
			"## Audio",
		]);
	});

	it("body contains the canonical Cantonese transcript timestamps", () => {
		// Defends against iOS accidentally dropping transcript segments or
		// re-formatting timestamps.
		expect(body).toContain("[00:00:03] Jerry:");
		expect(body).toContain("[00:00:12] Alex:");
		expect(body).toContain("[00:00:23] Jerry:");
	});

	it("audio embed uses the basename-shared `.m4a` filename rule", () => {
		// Filename rule in file-format-spec.md § File location: audio
		// companion shares basename. If iOS regresses on this, the embed
		// would point to a different file and Obsidian's preview breaks.
		expect(body).toContain(
			"![[2026-05-23-week-2-standup-d43e0b40.m4a]]",
		);
	});
});

describe("fixture: 2026-05-21-backend-sync-7a2f9c01.md (build-9 readiness)", () => {
	// This fixture reconstructs what a REAL TestFlight build-9 file looks
	// like, per iOS handoff `2026-05-21-testflight-build-9-transcription-
	// live.md`. iOS flagged two spec-conformant differences vs the
	// canonical sample:
	//   1. Transcript is written Chinese (書面語), not spoken Cantonese —
	//      the ADR-005 post-processing layer is not wired yet.
	//   2. `language` lands on `mixed` more often (noisy short-clip
	//      detection).
	// This is a parser-readiness check, NOT real end-to-end validation —
	// real validation still needs Jerry to record on build 9 and let
	// iCloud sync settle. It proves the parser is ready for build-9's
	// shape so that confirmation against real files is fast.
	const fixturePath = join(
		FIXTURES_DIR,
		"2026-05-21-backend-sync-7a2f9c01.md",
	);
	const raw = readFileSync(fixturePath, "utf-8");
	const { frontmatterYaml, body } = extractFrontmatter(raw);
	const frontmatter: unknown = parseYaml(frontmatterYaml);

	it("parser accepts a `language: mixed` meeting with zero warnings", () => {
		const result = parseLugjiFrontmatter(frontmatter, fixturePath);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// `mixed` is a valid enum value — it must NOT trigger a warning.
		expect(result.meeting.frontmatter.language).toBe("mixed");
		expect(result.meeting.warnings).toEqual([]);
	});

	it("required + optional fields round-trip on a build-9-shaped file", () => {
		const result = parseLugjiFrontmatter(frontmatter, fixturePath);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const fm = result.meeting.frontmatter;
		expect(fm.date).toBe("2026-05-21");
		expect(fm.type).toBe("meeting");
		expect(fm.lugji_meeting_id).toBe(
			"7A2F9C01-3D5E-4A8B-9C1F-2E6D4B8A0C53",
		);
		expect(fm.lugji_version).toBe("1.0.0");
		expect(fm.duration).toBe("18min");
		expect(fm.attendees).toEqual(["Jerry"]);
		expect(fm.topics).toEqual(["backend", "API"]);
		expect(result.meeting.versionMismatch).toBe("same");
	});

	it("omits the empty Action Items / Key Decisions sections (iOS omit-when-empty convention)", () => {
		// This meeting has no action items / key decisions — iOS omits the
		// sections entirely (confirmed in handoff #3). The parser must not
		// require them.
		const headings = body
			.split("\n")
			.filter((line) => /^#{1,2} /.test(line));
		expect(headings).toEqual([
			"# Backend Sync",
			"## Summary",
			"## Transcript",
			"## Audio",
		]);
	});

	it("carries a written-Chinese transcript without the parser caring", () => {
		// The transcript prose style (書面語 vs spoken Cantonese) is body
		// content — the frontmatter parser is indifferent to it. Confirm
		// the build-9 written-Chinese style is present + parses fine.
		expect(body).toContain("我們現在看看後端的進度");
		const result = parseLugjiFrontmatter(frontmatter, fixturePath);
		expect(result.ok).toBe(true);
	});
});

describe("fixture: 2026-05-22-build-21-qa-sync-b21f0e55.md (build-21 readiness)", () => {
	// Build 21 replaced WhisperKit with Apple SpeechTranscriber (ADR-020).
	// Per the architect handoff `2026-05-21-real-file-end-to-end.md`, the
	// file-format contract is UNCHANGED — the one real difference is that
	// transcripts are now grouped into ~1-minute blocks (one timestamp per
	// ~minute, not per sentence). This fixture reproduces that shape.
	//
	// The plugin does not parse individual `[HH:MM:SS]` lines anywhere —
	// `extractTranscriptSection` slices the section by heading boundaries
	// and `extractWikilinksFromBody` regex-scans it. So 1-minute blocks
	// should be a no-op for the plugin; these tests prove it.
	const fixturePath = join(
		FIXTURES_DIR,
		"2026-05-22-build-21-qa-sync-b21f0e55.md",
	);
	const raw = readFileSync(fixturePath, "utf-8");
	const { frontmatterYaml, body } = extractFrontmatter(raw);
	const frontmatter: unknown = parseYaml(frontmatterYaml);

	it("parses a build-21 file clean — zero warnings, same schema major", () => {
		const result = parseLugjiFrontmatter(frontmatter, fixturePath);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.meeting.warnings).toEqual([]);
		expect(result.meeting.versionMismatch).toBe("same");
		expect(result.meeting.frontmatter.lugji_version.split(".")[0]).toBe(
			String(PLUGIN_SCHEMA_MAJOR_VERSION),
		);
	});

	it("has a 1-minute-block transcript — one timestamp per ~minute", () => {
		const transcript = extractTranscriptSection(body);
		const timestamps = transcript.match(/\[\d{2}:\d{2}:\d{2}\]/g) ?? [];
		// Three minute-blocks at :00, :01, :02 — far fewer lines than a
		// per-sentence transcript of the same length would have.
		expect(timestamps).toEqual(["[00:00:00]", "[00:01:00]", "[00:02:00]"]);
	});

	it("flows through smart-linking — topics survive (incl. a space in `build 21`)", () => {
		const result = parseLugjiFrontmatter(frontmatter, fixturePath);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const links = buildSmartLinks(result.meeting);
		// "build 21" has an internal space — that is NOT a wikilink-unsafe
		// character, so it must survive intact as a link target.
		expect(links.topics).toEqual(["build 21", "QA"]);
		expect(links.attendees).toEqual(["Jerry"]);
		expect(links.dailyNoteTarget).toBe("2026-05-22");
	});

	it("audio embed shares the meeting basename", () => {
		expect(body).toContain(
			"![[2026-05-22-build-21-qa-sync-b21f0e55.m4a]]",
		);
	});
});

describe("fixture: 2026-05-25-6-244e9227.md (real-device, build 28, H1 fix PASS)", () => {
	// Real iOS build-28 recording. Replaces the previous build-21-era
	// fixture `2026-05-22-6-e87c1252.md` whose H1 was an empty `#`
	// (divergence handoff `obsidian-to-ios/2026-05-22-h1-title-divergence.md`).
	// iOS build 28 fixed it via `MeetingMarkdownSerializer.sanitiseHeading()`
	// — empty titles fall back to "新會議"; non-empty titles emit as-is.
	// Confirmed by the architect on real-device test
	// (`auditor-to-obsidian/2026-05-24-fixture-refresh-build28.md`).
	const fixturePath = join(FIXTURES_DIR, "2026-05-25-6-244e9227.md");
	const raw = readFileSync(fixturePath, "utf-8");
	const { frontmatterYaml, body } = extractFrontmatter(raw);
	const frontmatter: unknown = parseYaml(frontmatterYaml);

	it("frontmatter round-trips CLEAN — ok, zero warnings, same major", () => {
		const result = parseLugjiFrontmatter(frontmatter, fixturePath);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.meeting.warnings).toEqual([]);
		expect(result.meeting.versionMismatch).toBe("same");
	});

	it("required + optional fields round-trip; absent optionals coerce cleanly", () => {
		const result = parseLugjiFrontmatter(frontmatter, fixturePath);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const fm = result.meeting.frontmatter;
		expect(fm.date).toBe("2026-05-25");
		expect(fm.type).toBe("meeting");
		expect(fm.language).toBe("mixed");
		expect(fm.lugji_meeting_id).toBe(
			"244E9227-DCE1-44A0-97D5-C98F564DBB69",
		);
		expect(fm.lugji_version).toBe("1.0.0");
		// `<1min` is the spec edge-case formatting for sub-30s recordings.
		expect(fm.duration).toBe("<1min");
		// `attendees` / `topics` absent in the file (omit-when-empty) —
		// parser must coerce to [] with NO warning.
		expect(fm.attendees).toEqual([]);
		expect(fm.topics).toEqual([]);
	});

	it("body sections are in spec order with `# 6` as the H1 (closes build-21-era divergence)", () => {
		// Replaces the prior assertion that the H1 was a bare `#`. iOS
		// build 28's `sanitiseHeading()` now writes non-empty titles to
		// the H1 as-is, so the title "6" reaches the body — not just the
		// filename slug.
		const headings = body
			.split("\n")
			.filter((line) => /^#{1,2}( |$)/.test(line));
		expect(headings).toEqual([
			"# 6",
			"## Summary",
			"## Transcript",
			"## Audio",
		]);
	});

	it("H1 carries the meeting title (closes build-21-era divergence)", () => {
		// Positive assertion that the build-21-era bug is fixed: the H1
		// is no longer bare, and the title "6" reached the body. If iOS
		// regresses on `sanitiseHeading()`, this fires loudly.
		expect(body.split("\n")).toContain("# 6");
		expect(body.split("\n")).not.toContain("#");
	});

	it("Summary is the placeholder (post-processor removed, ADR-005 superseded)", () => {
		expect(body).toContain("*(等 AI 寫摘要)*");
	});

	it("has 1-minute-block transcript timestamps", () => {
		const transcript = extractTranscriptSection(body);
		const timestamps = transcript.match(/\[\d{2}:\d{2}:\d{2}\]/g) ?? [];
		// Real recording was sub-minute, so just one block — but the
		// shape (`[HH:MM:SS]` prefix) is what matters for the contract.
		expect(timestamps).toEqual(["[00:00:02]"]);
	});

	it("audio embed shares the meeting basename", () => {
		expect(body).toContain("![[2026-05-25-6-244e9227.m4a]]");
	});
});

describe("fixture: 2026-05-25-新會議-417d7c83.md (real-device, build 28, empty-title fallback PASS)", () => {
	// Real iOS build-28 recording with an empty user-provided title. iOS's
	// `MeetingMarkdownSerializer.sanitiseHeading()` substitutes the
	// fallback string `"新會議"` (matching `RecordingViewModel.defaultTitle`)
	// — the slug, the H1 and the filename all converge on it.
	//
	// This is the first artefact in the repo proving the fallback path
	// against future regression. The fallback string is a contract
	// between iOS and the plugin: if iOS ever changes
	// `MeetingMarkdownSerializer.fallbackHeading`, the
	// "`pickFirstH1` returns the fallback string verbatim" assertion
	// below will fire and prompt a coordinated update.
	const fixturePath = join(
		FIXTURES_DIR,
		"2026-05-25-新會議-417d7c83.md",
	);
	const raw = readFileSync(fixturePath, "utf-8");
	const { frontmatterYaml, body } = extractFrontmatter(raw);
	const frontmatter: unknown = parseYaml(frontmatterYaml);

	it("frontmatter round-trips CLEAN — ok, zero warnings, same major", () => {
		const result = parseLugjiFrontmatter(frontmatter, fixturePath);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.meeting.warnings).toEqual([]);
		expect(result.meeting.versionMismatch).toBe("same");
	});

	it("fields round-trip — duration `<1min`, language `mixed`, optionals omitted", () => {
		const result = parseLugjiFrontmatter(frontmatter, fixturePath);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const fm = result.meeting.frontmatter;
		expect(fm.date).toBe("2026-05-25");
		expect(fm.language).toBe("mixed");
		expect(fm.duration).toBe("<1min");
		expect(fm.lugji_meeting_id).toBe(
			"417D7C83-DCEB-4DF2-9995-F29ADD6B84C9",
		);
		expect(fm.attendees).toEqual([]);
		expect(fm.topics).toEqual([]);
	});

	it("H1 is `# 新會議` — the fallback string reached the body", () => {
		// The HEADLINE assertion for this fixture: the empty-title
		// fallback emits a non-empty H1, so the dashboard's title path
		// gets the real fallback string ("新會議") instead of dropping to
		// the filename basename via `pickFirstH1`'s null path.
		expect(body.split("\n")).toContain("# 新會議");
		expect(body.split("\n")).not.toContain("#");
	});

	it("body sections are in spec order (Action Items / Key Decisions omitted)", () => {
		const headings = body
			.split("\n")
			.filter((line) => /^#{1,2}( |$)/.test(line));
		expect(headings).toEqual([
			"# 新會議",
			"## Summary",
			"## Transcript",
			"## Audio",
		]);
	});

	it("audio embed shares the meeting basename (incl. the CJK slug)", () => {
		// The filename pattern preserves CJK in the slug per file-format-
		// spec § File location; the audio embed must use the same basename.
		expect(body).toContain("![[2026-05-25-新會議-417d7c83.m4a]]");
	});

	it("`pickFirstH1` returns the iOS fallback string verbatim (cross-surface tracker)", () => {
		// If iOS ever changes its `MeetingMarkdownSerializer.fallbackHeading`
		// to something other than "新會議", real-device files will start
		// carrying the new string and this assertion will fire — prompting
		// a coordinated plugin update so the dashboard / metadata surface
		// stays aligned.
		expect(pickFirstH1([{ level: 1, heading: "新會議" }])).toBe(
			"新會議",
		);
	});
});
