/**
 * lugji:// deep-link URL builder.
 *
 * Pure functions only — no Obsidian API surface, no DOM. This is deliberate
 * so we can unit-test the builder in isolation (Jest/Vitest later) and so a
 * TypeScript mirror of the iOS parser can drop in next to it without
 * circular import pain.
 *
 * Cross-surface contract: `shared/product/architecture.md` § URL Scheme.
 * Handoff history:
 *   - obsidian → ios: `docs/handoff/obsidian-to-ios/2026-05-16-url-scheme-spec.md`
 *   - ios → obsidian: `docs/handoff/ios-to-obsidian/2026-05-16-url-scheme-implemented.md`
 */

export const LUGJI_URL_SCHEME = "lugji";

/**
 * Title length cap requested by iOS dev in handoff
 * `2026-05-16-url-scheme-implemented.md` § "iOS-side feedback #2".
 *
 * The iOS Meeting model accepts longer strings, but a URL carrying a 2 KB
 * title is a smell and the iOS UI would truncate anyway. We cap on the
 * plugin side so the URL stays readable in logs / share sheets.
 */
export const LUGJI_TITLE_MAX_LENGTH = 200;

export interface LugjiUrlParams {
	/** Pre-filled meeting title. Capped to LUGJI_TITLE_MAX_LENGTH code points. */
	title?: string;
	/** Origin attribution. Defaults to "obsidian" when omitted. */
	from?: string;
}

/**
 * Build a `lugji://{path}?{query}` URL with the title cap + percent-encoding
 * guarantees we've promised the iOS side.
 *
 * @param path  The path component after `lugji://`. Examples: `"meeting/new"`,
 *              `"meeting/{uuid}"`, `"settings"`. Caller must percent-encode
 *              any UUID or path segment that could contain reserved chars;
 *              the helper does NOT touch the path.
 * @param params Optional query params. `title` is length-capped at
 *               LUGJI_TITLE_MAX_LENGTH code points (surrogate-pair-safe).
 *               Every value is percent-encoded via `encodeURIComponent`.
 *               `from` defaults to `"obsidian"` if not provided.
 */
export function buildLugjiUrl(
	path: string,
	params: LugjiUrlParams = {},
): string {
	const cleaned: Record<string, string> = {};

	// Iterate known keys instead of `Object.entries` — preserves the precise
	// `string | undefined` typing from `LugjiUrlParams` so eslint's
	// `no-unsafe-*` rules don't trip on an `any`-typed loop variable.
	const knownKeys: (keyof LugjiUrlParams)[] = ["title", "from"];
	for (const key of knownKeys) {
		const rawValue = params[key];
		if (rawValue == null) continue;
		const trimmed = rawValue.trim();
		if (!trimmed) continue;
		cleaned[key] = key === "title" ? capTitleLength(trimmed) : trimmed;
	}

	// Plugin-originated calls always carry `from=obsidian` per iOS handoff
	// `2026-05-16-url-scheme-implemented.md` § "iOS-side feedback #3".
	if (cleaned.from === undefined) {
		cleaned.from = "obsidian";
	}

	const query = Object.entries(cleaned)
		.map(
			([k, v]) =>
				`${encodeURIComponent(k)}=${encodeURIComponent(v)}`,
		)
		.join("&");

	return query
		? `${LUGJI_URL_SCHEME}://${path}?${query}`
		: `${LUGJI_URL_SCHEME}://${path}`;
}

/**
 * Cap a title to LUGJI_TITLE_MAX_LENGTH code points (NOT UTF-16 units).
 *
 * `String.prototype.slice` cuts on UTF-16 code units, which corrupts
 * surrogate pairs (e.g. emoji, supplementary-plane CJK). We use
 * `Array.from` to iterate code points safely, which is essential for
 * Cantonese / Mandarin / emoji-using users.
 */
function capTitleLength(title: string): string {
	const codePoints = Array.from(title);
	if (codePoints.length <= LUGJI_TITLE_MAX_LENGTH) return title;
	return codePoints.slice(0, LUGJI_TITLE_MAX_LENGTH).join("");
}
