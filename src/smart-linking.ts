import type { LugjiMeeting } from "./frontmatter";

/**
 * 4-tier smart-linking cascade per ADR-O03.
 *
 * Design constraints:
 *   - Tier 3 (date → daily note) ALWAYS fires — every valid meeting has
 *     a `date` frontmatter field, so there is always at least one link.
 *   - Tiers 1 and 2 are gated on `topics` / `attendees` having content,
 *     not on tier itself succeeding (per ADR-O03 "independent and
 *     additive").
 *   - Tier 4 (transcript wikilink scan) requires the raw markdown body,
 *     not just the frontmatter, so it's surfaced as a separate helper —
 *     the metadata view fires `vault.cachedRead` and feeds the result in.
 *
 * Everything in this file is pure and Obsidian-API-free so it can be
 * unit-tested in a Node test environment without a stub of any kind.
 */

export interface SmartLinks {
	/** Tier 1: topics frontmatter → wikilink targets. May be empty. */
	topics: string[];
	/** Tier 2: attendees frontmatter → wikilink targets. May be empty. */
	attendees: string[];
	/**
	 * Tier 3: daily-note target — always present.
	 *
	 * MVP: emit the ISO date verbatim and let Obsidian resolve `[[YYYY-MM-DD]]`
	 * against the user's daily-note format. Phase 2: read the daily-notes
	 * plugin settings if present and format accordingly.
	 */
	dailyNoteTarget: string;
}

/**
 * Build tier 1-3 of the linking cascade from a parsed meeting.
 * Tier 4 is a separate helper (`extractWikilinksFromBody`) because it
 * needs the raw markdown.
 */
export function buildSmartLinks(meeting: LugjiMeeting): SmartLinks {
	return {
		topics: meeting.frontmatter.topics
			.map(normaliseLinkTarget)
			.filter(nonEmpty),
		attendees: meeting.frontmatter.attendees
			.map(normaliseLinkTarget)
			.filter(nonEmpty),
		dailyNoteTarget: meeting.frontmatter.date,
	};
}

/**
 * Tier 4: extract distinct `[[wikilink]]` targets from a markdown body,
 * in source order.
 *
 * Recognises:
 *   - `[[Target]]`
 *   - `[[Target|Alias]]`        → captures `Target`
 *   - `[[Target#Heading]]`      → captures `Target`
 *   - `[[Target#Heading|Alias]]`→ captures `Target`
 *
 * Excludes embeds (`![[file.png]]`) — those are media references, not
 * outbound links to other notes.
 */
export function extractWikilinksFromBody(body: string): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	// Lookbehind `(?<![!])` excludes `![[...]]` image / audio embeds. The
	// inner capture group stops at `]`, `|`, or `#` so the captured target
	// is just the note name regardless of alias / heading suffix.
	const regex = /(?<!!)\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
	let m: RegExpExecArray | null;
	while ((m = regex.exec(body)) !== null) {
		const raw = m[1] ?? "";
		const target = normaliseLinkTarget(raw);
		if (!target) continue;
		if (seen.has(target)) continue;
		seen.add(target);
		result.push(target);
	}
	return result;
}

/**
 * Tier-4 refinement: drop transcript wikilinks that are already surfaced
 * by tiers 1-3 (topics, attendees, daily-note date).
 *
 * The metadata view's "Mentioned" row exists to surface links the user
 * added in the transcript that the frontmatter did NOT already capture.
 * Without this filter, a `[[Roadmap]]` typed into the transcript that is
 * also a frontmatter topic would render twice in the panel.
 *
 * Comparison is case-insensitive: `[[Roadmap]]` and `[[roadmap]]` resolve
 * to the same note in Obsidian, so they count as the same mention.
 */
export function filterRedundantMentions(
	tier4Links: string[],
	smartLinks: SmartLinks,
): string[] {
	const alreadyShown = new Set<string>();
	for (const topic of smartLinks.topics) {
		alreadyShown.add(topic.toLowerCase());
	}
	for (const attendee of smartLinks.attendees) {
		alreadyShown.add(attendee.toLowerCase());
	}
	alreadyShown.add(smartLinks.dailyNoteTarget.toLowerCase());
	return tier4Links.filter(
		(link) => !alreadyShown.has(link.toLowerCase()),
	);
}

/**
 * Extract the `## Transcript` section body (text between the heading and
 * the next `## ` heading, or end of file).
 *
 * Returns an empty string when the section is missing — caller renders
 * gracefully per ADR-O05 / parser contract.
 */
export function extractTranscriptSection(markdown: string): string {
	const lines = markdown.split("\n");
	let startIdx = -1;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i] === "## Transcript") {
			startIdx = i + 1;
			break;
		}
	}
	if (startIdx === -1) return "";

	let endIdx = lines.length;
	for (let i = startIdx; i < lines.length; i++) {
		const line = lines[i] ?? "";
		if (line.startsWith("## ")) {
			endIdx = i;
			break;
		}
	}
	return lines.slice(startIdx, endIdx).join("\n").trim();
}

// --- internals --------------------------------------------------------------

/**
 * Normalise a raw frontmatter value into a safe Obsidian wikilink target.
 *
 * Strips the five characters that would break a `[[wikilink]]`:
 *   `]` `[`  — bracket delimiters
 *   `|`      — alias separator
 *   `#`      — heading anchor
 *   `^`      — block-reference anchor
 *
 * These are also illegal in note filenames on common filesystems, so a
 * topic / attendee literally containing them could never resolve to a
 * real note anyway. Each is replaced with a space, then whitespace is
 * collapsed + trimmed. A value that becomes empty after stripping is
 * dropped by the `nonEmpty` filter in `buildSmartLinks`.
 *
 * Example: a topic `Q3 [planning]` → `Q3 planning` → `[[Q3 planning]]`.
 */
function normaliseLinkTarget(raw: string): string {
	return raw
		.replace(/[\][|#^]/g, " ")
		.trim()
		.replace(/\s+/g, " ");
}

function nonEmpty(s: string): boolean {
	return s.length > 0;
}
