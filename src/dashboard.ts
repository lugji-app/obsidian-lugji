import { type App, type Plugin, TFile } from "obsidian";
import {
	parseLugjiFrontmatter,
	type LugjiMeeting,
	type LugjiVersionMismatch,
} from "./frontmatter";
import type { LugjiPluginSettings } from "./settings";
import { normalizeFolderPath } from "./watcher";

/**
 * `lugji-meetings` dashboard codeblock.
 *
 * A self-contained meeting dashboard: the user drops a fenced codeblock
 *
 *     ```lugji-meetings
 *     limit: 10
 *     sort: date-desc
 *     ```
 *
 * into any note and the plugin renders a table of every Lugji meeting in
 * the configured meetings folder.
 *
 * Design choice — NOT a hard dependency on the Dataview plugin. Depending
 * on another community plugin is fragile (breaks if the user hasn't
 * installed it). This processor stands alone. For users who DO run
 * Dataview, the plugin README documents equivalent `dataview` queries —
 * the meeting frontmatter is already Dataview-friendly.
 *
 * Pure functions (`parseDashboardConfig`, `buildDashboardRows`) are
 * Obsidian-free and unit-tested. `registerLugjiDashboard` + the renderer
 * are Obsidian-coupled and integration-tested in a real vault.
 */

export type DashboardSort = "date-desc" | "date-asc";

export interface DashboardConfig {
	/** Max rows to render. `null` = no limit. */
	limit: number | null;
	sort: DashboardSort;
}

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
	limit: null,
	sort: "date-desc",
};

/**
 * Parse the body of a `lugji-meetings` codeblock into a config.
 *
 * Format: simple `key: value` lines. Unknown keys + malformed lines are
 * ignored (defensive — the codeblock is user-authored free text).
 * Blank lines and `#`-prefixed comment lines are skipped.
 */
export function parseDashboardConfig(source: string): DashboardConfig {
	const config: DashboardConfig = { ...DEFAULT_DASHBOARD_CONFIG };
	for (const rawLine of source.split("\n")) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const colon = line.indexOf(":");
		if (colon === -1) continue;
		const key = line.slice(0, colon).trim().toLowerCase();
		const value = line.slice(colon + 1).trim();
		if (key === "limit") {
			const n = Number.parseInt(value, 10);
			config.limit = Number.isFinite(n) && n > 0 ? n : null;
		} else if (key === "sort") {
			if (value === "date-asc" || value === "date-desc") {
				config.sort = value;
			}
		}
	}
	return config;
}

export interface DashboardMeetingInput {
	meeting: LugjiMeeting;
	/** The meeting's display title (first H1, or filename fallback). */
	title: string;
}

export interface DashboardRow {
	filePath: string;
	title: string;
	date: string;
	language: LugjiMeeting["frontmatter"]["language"];
	duration: string;
	attendeeCount: number;
	topics: string[];
	versionMismatch: LugjiVersionMismatch;
}

/**
 * Build the sorted + limited row model for the dashboard table.
 * Pure — no Obsidian, no DOM.
 */
export function buildDashboardRows(
	inputs: DashboardMeetingInput[],
	config: DashboardConfig,
): DashboardRow[] {
	const rows: DashboardRow[] = inputs.map(({ meeting, title }) => ({
		filePath: meeting.filePath,
		title,
		date: meeting.frontmatter.date,
		language: meeting.frontmatter.language,
		duration: meeting.frontmatter.duration ?? "",
		attendeeCount: meeting.frontmatter.attendees.length,
		topics: meeting.frontmatter.topics,
		versionMismatch: meeting.versionMismatch,
	}));

	rows.sort((a, b) => {
		// `date` is ISO `YYYY-MM-DD`, so lexical compare == chronological.
		const cmp = a.date.localeCompare(b.date);
		return config.sort === "date-asc" ? cmp : -cmp;
	});

	return config.limit !== null ? rows.slice(0, config.limit) : rows;
}

// --- Obsidian-coupled processor + renderer ----------------------------------

export interface LugjiDashboardDeps {
	getSettings: () => LugjiPluginSettings;
}

/**
 * Register the `lugji-meetings` codeblock processor on the plugin.
 */
export function registerLugjiDashboard(
	plugin: Plugin,
	deps: LugjiDashboardDeps,
): void {
	plugin.registerMarkdownCodeBlockProcessor("lugji-meetings", (source, el) => {
		const settings = deps.getSettings();
		const config = parseDashboardConfig(source);
		const folder = normalizeFolderPath(settings.meetingsFolderPath);
		const inputs = collectMeetings(plugin.app, folder);
		const rows = buildDashboardRows(inputs, config);
		renderDashboard(el, rows, folder, settings.uiLanguage);
	});
}

/** Scan the vault for Lugji meetings inside `folder`. */
function collectMeetings(
	app: App,
	folder: string,
): DashboardMeetingInput[] {
	const inputs: DashboardMeetingInput[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		if (!isInsideFolder(file.path, folder)) continue;
		const cache = app.metadataCache.getFileCache(file);
		const parsed = parseLugjiFrontmatter(cache?.frontmatter, file.path);
		if (!parsed.ok) continue;
		inputs.push({
			meeting: parsed.meeting,
			title: firstH1(app, file) ?? file.basename,
		});
	}
	return inputs;
}

function isInsideFolder(path: string, folder: string): boolean {
	if (!folder) return false;
	return path === folder || path.startsWith(folder + "/");
}

/** Read the first usable level-1 heading from the metadata cache, if any. */
function firstH1(app: App, file: TFile): string | null {
	return pickFirstH1(app.metadataCache.getFileCache(file)?.headings);
}

/**
 * Pick the meeting title from a list of parsed headings: the text of the
 * first level-1 heading, or `null` if there isn't one.
 *
 * An **empty / whitespace-only** first H1 also yields `null` — that is
 * NOT a usable title, so the caller falls back to the filename. This
 * matters: real iOS build-21 files have been seen with an empty `#`
 * line even when the meeting has a title (the title reached the filename
 * slug but not the H1). See divergence handoff
 * `docs/handoff/obsidian-to-ios/2026-05-22-h1-title-divergence.md`.
 * Returning `null` here keeps the dashboard usable until iOS fixes the
 * serializer.
 *
 * Pure — exported for unit testing.
 */
export function pickFirstH1(
	headings: ReadonlyArray<{ level: number; heading: string }> | undefined,
): string | null {
	if (!headings) return null;
	for (const h of headings) {
		if (h.level === 1) {
			// The first H1 is the title slot, per file-format-spec § Body.
			// If it is empty, the title is effectively absent — do NOT
			// scan deeper (a later H1 would be a body section heading).
			const text = h.heading.trim();
			return text.length > 0 ? text : null;
		}
	}
	return null;
}

function renderDashboard(
	el: HTMLElement,
	rows: DashboardRow[],
	folder: string,
	uiLanguage: LugjiPluginSettings["uiLanguage"],
): void {
	const zh = uiLanguage === "zh-Hant";
	el.empty();
	el.addClass("lugji-dashboard");

	if (rows.length === 0) {
		el.createEl("div", {
			cls: "lugji-empty",
			text: zh
				? `喺 "${folder}" 搵唔到 Lugji 會議筆記。`
				: `No Lugji meetings found in "${folder}".`,
		});
		return;
	}

	const table = el.createEl("table", { cls: "lugji-dashboard-table" });
	const headRow = table.createEl("thead").createEl("tr");
	const headers = zh
		? ["日期", "標題", "語言", "時長", "出席", "主題"]
		: ["Date", "Title", "Language", "Duration", "Attendees", "Topics"];
	for (const h of headers) {
		headRow.createEl("th", { text: h });
	}

	const body = table.createEl("tbody");
	for (const row of rows) {
		const tr = body.createEl("tr");
		if (row.versionMismatch === "newer" || row.versionMismatch === "older") {
			tr.addClass("lugji-dashboard-row-mismatch");
		}
		tr.createEl("td", { text: row.date });

		const titleCell = tr.createEl("td");
		const link = titleCell.createEl("a", {
			cls: "internal-link",
			text: row.title,
			href: row.filePath,
		});
		link.dataset.href = row.filePath;

		tr.createEl("td", {
			text: localiseLanguage(row.language, uiLanguage),
		});
		tr.createEl("td", { text: row.duration || "—" });
		tr.createEl("td", { text: String(row.attendeeCount) });
		tr.createEl("td", {
			text: row.topics.length > 0 ? row.topics.join(", ") : "—",
		});
	}
}

function localiseLanguage(
	lang: LugjiMeeting["frontmatter"]["language"],
	uiLanguage: LugjiPluginSettings["uiLanguage"],
): string {
	if (uiLanguage === "en") return lang;
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
