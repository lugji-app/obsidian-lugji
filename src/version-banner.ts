import type { LugjiVersionMismatch } from "./frontmatter";

/**
 * Maps a parsed `lugji_version` mismatch class (from `frontmatter.ts`)
 * to a renderable banner spec.
 *
 * Per ADR-O05:
 *   - same   → no banner
 *   - newer  → warning banner ("plugin too old")
 *   - older  → info banner ("legacy note; migrate in iOS app")
 *   - missing→ info banner (treated like legacy per spec)
 *
 * Pure function — no DOM, no Obsidian API. The metadata view consumes
 * this spec and renders the banner element.
 */

export type BannerSeverity = "warning" | "info";

export interface VersionBannerSpec {
	/** False when no banner should render (same-major case). */
	show: boolean;
	severity: BannerSeverity;
	/** Localised user-facing message. Empty string when `show: false`. */
	message: string;
}

export type SupportedUILanguage = "zh-Hant" | "en";

const COPY = {
	newer: {
		"zh-Hant":
			"呢個會議用緊新版本嘅 Lugji 寫，部分內容可能未顯示得到。更新個 plugin 試吓。",
		en: "This meeting was created with a newer version of Lugji. Some details may not display correctly — update the plugin.",
	},
	legacy: {
		"zh-Hant":
			"呢份係舊版本嘅 Lugji 會議筆記。喺 iOS app 入面開可以遷移到最新格式。",
		en: "This is a legacy meeting note. Open it in the Lugji iOS app to migrate to the latest format.",
	},
} as const;

export function describeVersionBanner(
	mismatch: LugjiVersionMismatch,
	uiLanguage: SupportedUILanguage,
): VersionBannerSpec {
	switch (mismatch) {
		case "same":
			return { show: false, severity: "info", message: "" };
		case "newer":
			return {
				show: true,
				severity: "warning",
				message: COPY.newer[uiLanguage],
			};
		case "older":
		case "missing":
			// `missing` is treated as a legacy note per ADR-O05 — no
			// distinct banner copy, since the user-facing fix is the same
			// ("re-open in iOS to migrate").
			return {
				show: true,
				severity: "info",
				message: COPY.legacy[uiLanguage],
			};
	}
}
