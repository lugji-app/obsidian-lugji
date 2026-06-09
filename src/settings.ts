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
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- `Lugji Meetings` is the locked default folder name (ADR-O02); brand contract takes precedence over sentence-case.
				'Folder inside this vault where the Lugji iOS app writes meeting notes. Must match the iOS app setting. Default: "Lugji Meetings".',
			)
			.addText((text) =>
				text
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- same as above; this is the literal folder name from ADR-O02.
					.setPlaceholder("Lugji Meetings")
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
