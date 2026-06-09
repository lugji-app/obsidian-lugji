import { describe, expect, it } from "vitest";
import { describeVersionBanner } from "./version-banner";

describe("describeVersionBanner", () => {
	it("does not show a banner when the major matches the plugin's native schema", () => {
		const spec = describeVersionBanner("same", "zh-Hant");
		expect(spec.show).toBe(false);
		expect(spec.message).toBe("");
	});

	it("shows a warning banner with Cantonese copy on a newer major", () => {
		const spec = describeVersionBanner("newer", "zh-Hant");
		expect(spec.show).toBe(true);
		expect(spec.severity).toBe("warning");
		// Sanity-check the message routes through the Cantonese branch — we
		// don't pin the exact copy because we may tighten the wording, but
		// a Cantonese-grammar marker like 個 should be present.
		expect(spec.message).toContain("個 plugin");
	});

	it("shows a warning banner with English copy on a newer major when uiLanguage=en", () => {
		const spec = describeVersionBanner("newer", "en");
		expect(spec.show).toBe(true);
		expect(spec.severity).toBe("warning");
		expect(spec.message.toLowerCase()).toContain("newer version");
	});

	it("shows an info banner with Cantonese copy on an older major", () => {
		const spec = describeVersionBanner("older", "zh-Hant");
		expect(spec.show).toBe(true);
		expect(spec.severity).toBe("info");
		expect(spec.message).toContain("舊版本");
	});

	it("shows an info banner with English copy on an older major when uiLanguage=en", () => {
		const spec = describeVersionBanner("older", "en");
		expect(spec.show).toBe(true);
		expect(spec.severity).toBe("info");
		expect(spec.message.toLowerCase()).toContain("legacy");
	});

	it("treats `missing` the same as `older` (legacy migration UX)", () => {
		const olderZh = describeVersionBanner("older", "zh-Hant");
		const missingZh = describeVersionBanner("missing", "zh-Hant");
		expect(missingZh).toEqual(olderZh);

		const olderEn = describeVersionBanner("older", "en");
		const missingEn = describeVersionBanner("missing", "en");
		expect(missingEn).toEqual(olderEn);
	});
});
