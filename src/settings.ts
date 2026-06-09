import { App, PluginSettingTab, Setting } from "obsidian";
import type LugjiPlugin from "./main";

export interface LugjiPluginSettings {
	/**
	 * Folder inside the vault that the iOS app writes meeting notes into.
	 * Default: "Lugji Meetings" (ADR-O02). Phase 2 will auto-sync this value
	 * from a `.lugji-config.json` written by the iOS app at the vault root.
	 */
	meetingsFolderPath: string;

	/**
	 * Master switch for the 4-tier smart linking pipeline (ADR-O03).
	 * When false, the plugin still renders meeting notes but skips
	 * wikilink injection / suggestions.
	 */
	enableSmartLinking: boolean;

	/**
	 * UI language. Default 繁中 (matches brand voice).
	 */
	uiLanguage: "zh-Hant" | "en";
}

export const DEFAULT_SETTINGS: LugjiPluginSettings = {
	meetingsFolderPath: "Lugji Meetings",
	enableSmartLinking: true,
	uiLanguage: "zh-Hant",
};

export class LugjiSettingTab extends PluginSettingTab {
	plugin: LugjiPlugin;

	constructor(app: App, plugin: LugjiPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Meetings folder")
			.setDesc(
				"Lugji writes meeting notes to this folder. Must match the folder set in the iOS app.",
			)
			.addText((text) =>
				text
					// The placeholder shows the locked default folder name
					// (ADR-O02 · "Lugji Meetings") by reference to the
					// DEFAULT_SETTINGS constant — single source of truth, and
					// it keeps the Title-case brand literal out of inline UI
					// prose (so `obsidianmd/ui/sentence-case` has no string
					// literal to flag).
					.setPlaceholder(DEFAULT_SETTINGS.meetingsFolderPath)
					.setValue(this.plugin.settings.meetingsFolderPath)
					.onChange(async (value) => {
						this.plugin.settings.meetingsFolderPath =
							value.trim() || "Lugji Meetings";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Smart linking")
			.setDesc(
				"Auto-link people, topics, and dates in meeting notes. Falls back gracefully when frontmatter fields are empty.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableSmartLinking)
					.onChange(async (value) => {
						this.plugin.settings.enableSmartLinking = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("UI language")
			.setDesc("Interface language for plugin-rendered views.")
			.addDropdown((drop) =>
				drop
					.addOption("zh-Hant", "繁體中文")
					.addOption("en", "English")
					.setValue(this.plugin.settings.uiLanguage)
					.onChange(async (value: "zh-Hant" | "en") => {
						this.plugin.settings.uiLanguage = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
