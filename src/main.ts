import { Notice, Plugin, TFile } from "obsidian";
import { registerLugjiDashboard } from "./dashboard";
import { buildLugjiUrl } from "./deep-link";
import { parseLugjiFrontmatter } from "./frontmatter";
import {
	activateLugjiMetadataView,
	LUGJI_METADATA_VIEW_TYPE,
	LugjiMetadataView,
} from "./metadata-view";
import {
	DEFAULT_SETTINGS,
	LugjiPluginSettings,
	LugjiSettingTab,
} from "./settings";
import { registerMeetingsFolderWatcher } from "./watcher";

const LOG_PREFIX = "[Lugji]";

/**
 * Lugji Obsidian Plugin — entry point.
 *
 * Wired:
 *   - Plugin lifecycle + settings
 *   - "Start Lugji recording" command + ribbon icon (deep link → iOS app)
 *   - Two debug commands for URL-handling QA on macOS (TestFlight gated)
 *   - Meetings-folder watcher: detects new + modified + deleted meeting notes
 *   - Frontmatter parser: validates the file-format-spec contract, classifies
 *     `lugji_version` mismatch per ADR-O05
 *   - Right-pane metadata view (ADR-O03 4-tier smart linking + ADR-O05
 *     version banner); auto-reveals when a Lugji meeting becomes active
 *
 * NOT yet implemented (deferred):
 *   - Dataview integration helpers
 *   - Smart-link injection INTO the meeting note body (current scope:
 *     surface links in the side pane; ADR-O03 does not require body
 *     mutation)
 */
export default class LugjiPlugin extends Plugin {
	settings!: LugjiPluginSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Right-pane metadata view registration. Done early so the view
		// type is known to Obsidian before any auto-open hook fires.
		this.registerView(
			LUGJI_METADATA_VIEW_TYPE,
			(leaf) =>
				new LugjiMetadataView(leaf, {
					getSettings: () => this.settings,
				}),
		);

		// Ribbon icon — opens iOS app via deep link (ADR-O04).
		// Ribbon tooltip keeps the brand name; unlike commands, ribbon
		// tooltips do NOT have the plugin name auto-prefixed.
		this.addRibbonIcon("mic", "Start recording", () =>
			this.startLugjiRecording(),
		);

		// Command palette: primary entry.
		this.addCommand({
			id: "start-recording",
			name: "Start recording",
			callback: () => this.startLugjiRecording(),
		});

		// Command palette: jump to iOS settings (handy for QA).
		this.addCommand({
			id: "open-ios-settings",
			name: "Open iOS settings",
			callback: () => this.openUrl(buildLugjiUrl("settings")),
		});

		// Command palette: reveal the metadata side-pane.
		this.addCommand({
			id: "show-meeting-metadata",
			name: "Show meeting metadata",
			callback: () => {
				void activateLugjiMetadataView(this.app);
			},
		});

		// Command palette: insert a meetings-dashboard codeblock at cursor.
		this.addCommand({
			id: "insert-meetings-dashboard",
			name: "Insert meetings dashboard",
			editorCallback: (editor) => {
				editor.replaceSelection(
					"```lugji-meetings\nsort: date-desc\nlimit: 20\n```\n",
				);
			},
		});

		// --- Debug commands ---
		// These exist so we can validate URL construction on macOS before
		// the iOS TestFlight build is available. Apple Developer Program
		// enrollment is pending; see iOS handoff
		// `docs/handoff/ios-to-obsidian/2026-05-16-testflight-eta-update.md`.

		this.addCommand({
			id: "debug-copy-start-recording-url",
			name: "Debug: copy start-recording URL",
			callback: async () => {
				await this.copyToClipboard(buildLugjiUrl("meeting/new"));
			},
		});

		this.addCommand({
			id: "debug-copy-start-recording-url-with-active-title",
			name: "Debug: copy start-recording URL with active note title",
			callback: async () => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					new Notice("No active note — open a note first.");
					return;
				}
				const url = buildLugjiUrl("meeting/new", {
					title: file.basename,
				});
				await this.copyToClipboard(url);
			},
		});

		this.addSettingTab(new LugjiSettingTab(this.app, this));

		// Meetings-folder watcher — see `watcher.ts` for the event hooks
		// rationale (uses metadataCache.on("changed") so the frontmatter is
		// already parsed by Obsidian when we get the callback).
		registerMeetingsFolderWatcher(this, {
			getFolderPath: () => this.settings.meetingsFolderPath,
			onMeetingChanged: (file) => this.handleMeetingChanged(file),
			onMeetingRemoved: (oldPath) =>
				console.debug(`${LOG_PREFIX} meeting removed: ${oldPath}`),
		});

		// `lugji-meetings` dashboard codeblock processor — self-contained
		// meeting dashboard, no hard dependency on the Dataview plugin.
		registerLugjiDashboard(this, {
			getSettings: () => this.settings,
		});

		// Auto-reveal the side-pane the first time a Lugji meeting is
		// opened. We only fire on `file-open` (user navigated), not on
		// `active-leaf-change` (which fires for side-pane focus changes
		// and would create a feedback loop).
		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				if (!(file instanceof TFile)) return;
				const cache = this.app.metadataCache.getFileCache(file);
				const fm = cache?.frontmatter;
				if (
					fm &&
					typeof (fm as Record<string, unknown>).lugji_meeting_id ===
						"string"
				) {
					void activateLugjiMetadataView(this.app);
				}
			}),
		);
	}

	onunload(): void {
		// Most teardown is automatic (registerEvent / registerView /
		// registerDomEvent). We deliberately do NOT detach leaves of our
		// custom view here — `obsidianmd/detach-leaves` lint rule + the
		// Obsidian convention is to preserve the user's pane layout
		// across plugin reload cycles.
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<LugjiPluginSettings>,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Handle a "meeting changed" event from the watcher.
	 *
	 * Reads the cached frontmatter (already parsed by Obsidian) and runs it
	 * through the spec-conformant parser. The metadata view subscribes to
	 * the same `metadataCache.on("changed")` event and re-renders itself,
	 * so this handler's responsibility is limited to structured logging +
	 * warning surfacing.
	 */
	private handleMeetingChanged(file: TFile): void {
		const cache = this.app.metadataCache.getFileCache(file);
		const result = parseLugjiFrontmatter(cache?.frontmatter, file.path);

		if (!result.ok) {
			// `not-a-lugji-meeting` is silent by design — the meetings folder
			// may contain user-authored notes the plugin should ignore.
			return;
		}

		const { meeting } = result;
		console.debug(
			`${LOG_PREFIX} meeting detected: ${meeting.frontmatter.lugji_meeting_id} ` +
				`(date=${meeting.frontmatter.date}, ` +
				`lang=${meeting.frontmatter.language}, ` +
				`version=${meeting.frontmatter.lugji_version} [${meeting.versionMismatch}], ` +
				`attendees=${meeting.frontmatter.attendees.length}, ` +
				`topics=${meeting.frontmatter.topics.length})`,
		);
		if (meeting.warnings.length > 0) {
			console.warn(
				`${LOG_PREFIX} parser warnings for ${file.path}:`,
				meeting.warnings,
			);
		}
	}

	/**
	 * Open the iOS app at "new meeting" via the lugji:// URL scheme.
	 *
	 * Until the iOS TestFlight build is live, this is a silent no-op on
	 * devices that don't have a `lugji://` handler registered. The two
	 * debug commands above let us exercise URL construction locally.
	 *
	 * Spec: docs/handoff/obsidian-to-ios/2026-05-16-url-scheme-spec.md
	 */
	private startLugjiRecording(): void {
		this.openUrl(buildLugjiUrl("meeting/new"));
	}

	private openUrl(url: string): void {
		// `window.open` honours the OS URL handler on macOS / iPadOS.
		const opened = window.open(url, "_self");
		if (!opened) {
			new Notice(
				"Lugji could not open. Make sure the iOS app is installed on this device.",
			);
		}
	}

	private async copyToClipboard(text: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
			new Notice(`Copied: ${text}`);
		} catch (err) {
			new Notice(`Could not copy URL: ${String(err)}`);
		}
	}
}
