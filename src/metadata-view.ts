import {
	ItemView,
	type App,
	type TFile,
	type WorkspaceLeaf,
} from "obsidian";
import {
	parseLugjiFrontmatter,
	type LugjiMeeting,
} from "./frontmatter";
import type { LugjiPluginSettings } from "./settings";
import {
	buildSmartLinks,
	extractTranscriptSection,
	extractWikilinksFromBody,
	filterRedundantMentions,
} from "./smart-linking";
import { describeVersionBanner } from "./version-banner";

export const LUGJI_METADATA_VIEW_TYPE = "lugji-metadata-view";

export interface LugjiMetadataViewDeps {
	getSettings: () => LugjiPluginSettings;
}

/**
 * Right-pane view that surfaces parsed Lugji-meeting metadata + the
 * 4-tier smart-linking output for the active note.
 *
 * Design notes:
 *   - This view DOES NOT modify the meeting note. Read-only by contract
 *     (parser is the same — see file-format-spec.md § "Parser contract").
 *   - Tier-4 wikilink scan is async (needs `vault.cachedRead`), so we
 *     render tiers 1-3 + the banner synchronously and append tier-4 in
 *     a second pass. Avoids a blank pane while the file read awaits.
 *   - Re-renders on `active-leaf-change` (different file opened) and on
 *     `metadataCache.changed` (the note was edited and re-parsed).
 *     `registerEvent` handles lifecycle cleanup on view close.
 */
export class LugjiMetadataView extends ItemView {
	private readonly deps: LugjiMetadataViewDeps;
	/** Monotonically-incrementing token to ignore stale async renders. */
	private renderToken = 0;

	constructor(leaf: WorkspaceLeaf, deps: LugjiMetadataViewDeps) {
		super(leaf);
		this.deps = deps;
	}

	override getViewType(): string {
		return LUGJI_METADATA_VIEW_TYPE;
	}

	override getDisplayText(): string {
		return this.t("Lugji meeting", "Lugji 會議");
	}

	override getIcon(): string {
		return "mic";
	}

	override async onOpen(): Promise<void> {
		this.refresh();
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => this.refresh()),
		);
		this.registerEvent(
			this.app.metadataCache.on("changed", () => this.refresh()),
		);
	}

	override async onClose(): Promise<void> {
		// Events auto-unregister via `registerEvent` on the View base class.
	}

	private refresh(): void {
		const token = ++this.renderToken;
		const file = this.app.workspace.getActiveFile();
		const container = this.contentEl;
		container.empty();
		container.addClass("lugji-metadata-view");

		if (!file) {
			this.renderEmpty(
				container,
				this.t("No active note.", "未有開緊嘅筆記。"),
			);
			return;
		}

		const cache = this.app.metadataCache.getFileCache(file);
		const result = parseLugjiFrontmatter(cache?.frontmatter, file.path);
		if (!result.ok) {
			this.renderEmpty(
				container,
				this.t(
					"Not a Lugji meeting note.",
					"唔係 Lugji 會議筆記。",
				),
			);
			return;
		}

		this.renderMeeting(container, result.meeting);
		void this.renderTier4(container, file, result.meeting, token);
	}

	private renderEmpty(parent: HTMLElement, message: string): void {
		parent.createEl("div", { cls: "lugji-empty", text: message });
	}

	private renderMeeting(parent: HTMLElement, meeting: LugjiMeeting): void {
		this.renderVersionBanner(parent, meeting);
		this.renderSummaryRow(parent, meeting);
		this.renderTiers123(parent, meeting);
	}

	private renderVersionBanner(
		parent: HTMLElement,
		meeting: LugjiMeeting,
	): void {
		const spec = describeVersionBanner(
			meeting.versionMismatch,
			this.deps.getSettings().uiLanguage,
		);
		if (!spec.show) return;
		const banner = parent.createEl("div", {
			cls: ["lugji-banner", `lugji-banner-${spec.severity}`],
		});
		banner.setText(spec.message);
	}

	private renderSummaryRow(parent: HTMLElement, meeting: LugjiMeeting): void {
		const meta = parent.createEl("div", { cls: "lugji-metadata-summary" });
		const fm = meeting.frontmatter;
		this.addMetaRow(meta, "📅", fm.date);
		if (fm.duration) {
			this.addMetaRow(meta, "⏱", fm.duration);
		}
		this.addMetaRow(meta, "🌐", this.localiseLanguage(fm.language));
	}

	private renderTiers123(parent: HTMLElement, meeting: LugjiMeeting): void {
		const links = buildSmartLinks(meeting);
		const section = parent.createEl("div", { cls: "lugji-links-section" });
		section.createEl("h4", {
			cls: "lugji-links-heading",
			text: this.t("Linked notes", "連結筆記"),
		});

		// Tier 3 — always.
		this.addLinkRow(section, this.t("Date: ", "日期："), [
			links.dailyNoteTarget,
		]);

		// Tier 1 — topics, if any.
		if (links.topics.length > 0) {
			this.addLinkRow(
				section,
				this.t("Topics: ", "主題："),
				links.topics,
			);
		}

		// Tier 2 — attendees, if any. When empty, surface the Pro upgrade
		// hook (per ADR-O03 — speaker diarization ships at Pro tier).
		if (links.attendees.length > 0) {
			this.addLinkRow(
				section,
				this.t("Attendees: ", "出席者："),
				links.attendees,
			);
		} else {
			section.createEl("div", {
				cls: "lugji-upgrade-hook",
				text: this.t(
					"Speaker detection is part of Lugji Pro (HK$48/mo).",
					"自動分辨說話人係 Lugji Pro (HK$48/月) 嘅功能。",
				),
			});
		}
	}

	private async renderTier4(
		container: HTMLElement,
		file: TFile,
		meeting: LugjiMeeting,
		token: number,
	): Promise<void> {
		let body: string;
		try {
			body = await this.app.vault.cachedRead(file);
		} catch {
			return;
		}
		// Bail if the user moved on to a different note since we kicked
		// off the read — we'd otherwise render stale tier-4 into the
		// wrong note's pane.
		if (token !== this.renderToken) return;

		const transcript = extractTranscriptSection(body);
		// Drop transcript wikilinks already surfaced as topics / attendees
		// / the daily-note date — the "Mentioned" row should only show what
		// tiers 1-3 did not already capture.
		const wikilinks = filterRedundantMentions(
			extractWikilinksFromBody(transcript),
			buildSmartLinks(meeting),
		);
		if (wikilinks.length === 0) return;

		const section = container.querySelector(".lugji-links-section");
		if (!(section instanceof HTMLElement)) return;
		this.addLinkRow(
			section,
			this.t("Mentioned: ", "提及："),
			wikilinks,
		);
	}

	// --- DOM helpers --------------------------------------------------------

	private addMetaRow(parent: HTMLElement, icon: string, text: string): void {
		const row = parent.createEl("div", { cls: "lugji-meta-row" });
		row.createEl("span", { cls: "lugji-meta-icon", text: icon });
		row.appendText(" ");
		row.appendText(text);
	}

	private addLinkRow(
		parent: HTMLElement,
		label: string,
		targets: string[],
	): void {
		const row = parent.createEl("div", { cls: "lugji-link-row" });
		row.createEl("span", { cls: "lugji-link-label", text: label });
		targets.forEach((target, i) => {
			if (i > 0) row.appendText(" · ");
			this.appendWikilink(row, target);
		});
	}

	private appendWikilink(parent: HTMLElement, target: string): void {
		const link = parent.createEl("a", {
			cls: "internal-link",
			text: target,
			href: target,
		});
		link.dataset.href = target;
		link.addEventListener("click", (e) => {
			e.preventDefault();
			void this.app.workspace.openLinkText(target, "", false);
		});
	}

	// --- localisation -------------------------------------------------------

	/** Pick localised string based on user's `uiLanguage` setting. */
	private t(en: string, zh: string): string {
		return this.deps.getSettings().uiLanguage === "zh-Hant" ? zh : en;
	}

	private localiseLanguage(
		lang: LugjiMeeting["frontmatter"]["language"],
	): string {
		if (this.deps.getSettings().uiLanguage === "en") return lang;
		switch (lang) {
			case "cantonese":
				return "粵語";
			case "mandarin":
				return "普通話";
			case "english":
				return "英文";
			case "mixed":
				return "混合";
		}
	}
}

/**
 * Convenience for `main.ts` — opens (or reveals) the metadata view in
 * the right-pane, creating the leaf if necessary.
 */
export async function activateLugjiMetadataView(app: App): Promise<void> {
	const { workspace } = app;
	const existing = workspace.getLeavesOfType(LUGJI_METADATA_VIEW_TYPE);
	if (existing.length > 0) {
		const leaf = existing[0];
		if (leaf) await workspace.revealLeaf(leaf);
		return;
	}
	const leaf = workspace.getRightLeaf(false);
	if (!leaf) return;
	await leaf.setViewState({
		type: LUGJI_METADATA_VIEW_TYPE,
		active: true,
	});
	await workspace.revealLeaf(leaf);
}
