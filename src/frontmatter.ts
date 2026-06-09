/**
 * Lugji meeting-note frontmatter parser + version classifier.
 *
 * Pure functions only — no Obsidian API surface. This file is the
 * implementation of `shared/product/file-format-spec.md` § "Parser
 * contract" and the consumer-side counterpart to the iOS writer.
 *
 * Design rules (all enforced here):
 *   - Never throw. Coerce on bad input.
 *   - Never mutate the file or its frontmatter dictionary.
 *   - Discriminate three outcomes: not-a-lugji-meeting, valid, valid-with-warnings.
 *   - O(1) per file — do not touch other resources.
 *
 * Linked: ADR-O05 (version compatibility), file-format-spec.md.
 */

/** The schema major version this plugin parses natively. */
export const PLUGIN_SCHEMA_MAJOR_VERSION = 1;

export type LugjiLanguage = "cantonese" | "mandarin" | "mixed" | "english";

export type LugjiVersionMismatch =
	| "same"
	| "newer"
	| "older"
	| "missing";

export interface LugjiMeetingFrontmatter {
	date: string;
	type: "meeting";
	duration?: string;
	language: LugjiLanguage;
	attendees: string[];
	topics: string[];
	tags: string[];
	lugji_meeting_id: string;
	lugji_version: string;
}

export interface LugjiMeeting {
	filePath: string;
	frontmatter: LugjiMeetingFrontmatter;
	versionMismatch: LugjiVersionMismatch;
	/** Non-fatal parser observations — present even on `ok: true`. */
	warnings: string[];
}

export type LugjiParseResult =
	| { ok: true; meeting: LugjiMeeting }
	| {
			ok: false;
			reason: "not-a-lugji-meeting";
			detail: string;
	  };

/**
 * Parse the frontmatter blob from Obsidian's metadata cache (or any
 * equivalent unknown-shaped dictionary) into a typed Lugji meeting.
 *
 * Returns `ok: false, reason: "not-a-lugji-meeting"` when the file
 * isn't one of ours — callers should silently skip such files.
 * Returns `ok: true` with `warnings[]` for malformed-but-recoverable
 * cases, per the "best-effort + warn" rule in ADR-O05.
 */
export function parseLugjiFrontmatter(
	raw: unknown,
	filePath: string,
): LugjiParseResult {
	if (raw == null || typeof raw !== "object") {
		return {
			ok: false,
			reason: "not-a-lugji-meeting",
			detail: "No frontmatter object",
		};
	}

	const fm = raw as Record<string, unknown>;

	// Gate: a file is "one of ours" iff it carries a lugji_meeting_id.
	// Vault may contain non-Lugji notes in the same folder; silently skip.
	if (typeof fm.lugji_meeting_id !== "string" || !fm.lugji_meeting_id) {
		return {
			ok: false,
			reason: "not-a-lugji-meeting",
			detail: "Missing or empty lugji_meeting_id",
		};
	}

	const warnings: string[] = [];

	const date = stringOr(fm.date, "");
	if (!date) warnings.push("Missing or non-string `date`");

	const type = fm.type === "meeting" ? "meeting" : null;
	if (type === null) {
		warnings.push(`Unexpected \`type\` value: ${formatUnknown(fm.type)}`);
	}

	const language = coerceLanguage(fm.language, warnings);
	const attendees = stringArrayOr(fm.attendees, [], "attendees", warnings);
	const topics = stringArrayOr(fm.topics, [], "topics", warnings);
	const tags = stringArrayOr(fm.tags, [], "tags", warnings);

	const duration =
		typeof fm.duration === "string" && fm.duration ? fm.duration : undefined;

	const lugjiVersionRaw = stringOr(fm.lugji_version, "");
	const versionMismatch = classifyVersion(lugjiVersionRaw);
	if (versionMismatch === "missing") {
		warnings.push("Missing or unparseable `lugji_version`");
	}

	return {
		ok: true,
		meeting: {
			filePath,
			versionMismatch,
			warnings,
			frontmatter: {
				date,
				type: "meeting",
				duration,
				language,
				attendees,
				topics,
				tags,
				lugji_meeting_id: fm.lugji_meeting_id,
				lugji_version: lugjiVersionRaw || "0.0.0",
			},
		},
	};
}

/**
 * Classify a `lugji_version` string against the plugin's native major.
 *
 * Public so a future banner-UI component can format messages per case.
 */
export function classifyVersion(versionStr: string): LugjiVersionMismatch {
	if (!versionStr) return "missing";
	// `noUncheckedIndexedAccess` is on — `.split` always returns at least one
	// element for a non-empty string, but TS can't prove it. Coalesce.
	const head = versionStr.split(".")[0] ?? "";
	const major = Number.parseInt(head, 10);
	if (!Number.isFinite(major) || major < 0) return "missing";
	if (major === PLUGIN_SCHEMA_MAJOR_VERSION) return "same";
	if (major > PLUGIN_SCHEMA_MAJOR_VERSION) return "newer";
	return "older";
}

// --- private coercion helpers ------------------------------------------------

function stringOr(v: unknown, fallback: string): string {
	return typeof v === "string" ? v : fallback;
}

function stringArrayOr(
	v: unknown,
	fallback: string[],
	fieldName: string,
	warnings: string[],
): string[] {
	if (Array.isArray(v)) {
		const strings: string[] = [];
		let droppedNonStrings = 0;
		for (const item of v) {
			if (typeof item === "string" && item) {
				strings.push(item);
			} else {
				droppedNonStrings += 1;
			}
		}
		if (droppedNonStrings > 0) {
			warnings.push(
				`Dropped ${droppedNonStrings} non-string entries from \`${fieldName}\``,
			);
		}
		return strings;
	}
	if (v !== undefined && v !== null) {
		warnings.push(`\`${fieldName}\` is not an array (${formatUnknown(v)})`);
	}
	return fallback;
}

function coerceLanguage(v: unknown, warnings: string[]): LugjiLanguage {
	if (
		v === "cantonese" ||
		v === "mandarin" ||
		v === "mixed" ||
		v === "english"
	) {
		return v;
	}
	if (v !== undefined && v !== null) {
		warnings.push(
			`Unknown \`language\` value (${formatUnknown(v)}); falling back to "mixed"`,
		);
	} else {
		warnings.push("Missing `language`; falling back to \"mixed\"");
	}
	return "mixed";
}

function formatUnknown(v: unknown): string {
	if (typeof v === "string") return `"${v}"`;
	if (v === null) return "null";
	if (v === undefined) return "undefined";
	if (typeof v === "object") {
		// Avoid the `[object Object]` footgun (the @typescript-eslint
		// no-base-to-string rule explicitly forbids it). JSON-stringify
		// gives us something human-debuggable.
		try {
			return JSON.stringify(v);
		} catch {
			return "[unstringifiable object]";
		}
	}
	if (
		typeof v === "number" ||
		typeof v === "boolean" ||
		typeof v === "bigint"
	) {
		return String(v);
	}
	// Remaining: symbol, function. Show the kind rather than risk
	// surfacing a stringified body in a debug log.
	return `[${typeof v}]`;
}
