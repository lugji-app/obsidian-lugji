import { normalizePath, Plugin, TAbstractFile, TFile } from "obsidian";

/**
 * Folder watcher for the Lugji meetings folder.
 *
 * Responsibility:
 *   - Detect files inside the configured meetings folder
 *   - Emit "changed" events when metadata is parsed by Obsidian
 *   - Emit "deleted" events when files leave the folder (delete or rename out)
 *
 * Not in scope:
 *   - YAML parsing — leverage Obsidian's `metadataCache`, then hand the cached
 *     frontmatter to `frontmatter.ts::parseLugjiFrontmatter`
 *   - UI — callers decide what to render
 *
 * Why `metadataCache.on("changed")` and not `vault.on("create")`?
 *   `vault.on("create")` fires before Obsidian parses the YAML, so the
 *   frontmatter cache is empty at that point. `metadataCache.on("changed")`
 *   fires once the cache is populated — exactly when we have something to
 *   render. It also fires on subsequent edits, covering both create and
 *   modify with a single hook.
 *
 * Linked: ADR-O02 (folder path), file-format-spec.md.
 */

export interface MeetingsFolderWatcherOptions {
	/** Returns the current configured folder path (vault-relative). */
	getFolderPath: () => string;
	/** Called when a meeting file in the watched folder is created or modified. */
	onMeetingChanged: (file: TFile) => void;
	/** Called when a meeting file in the watched folder is removed (delete or rename-out). */
	onMeetingRemoved: (oldPath: string) => void;
}

/**
 * Register all vault / metadata-cache events the plugin cares about.
 *
 * Uses `plugin.registerEvent`, so cleanup is automatic on plugin unload —
 * the caller does not need to keep a handle to anything returned here.
 */
export function registerMeetingsFolderWatcher(
	plugin: Plugin,
	options: MeetingsFolderWatcherOptions,
): void {
	const isInWatchedFolder = (path: string): boolean => {
		const folder = normalizeFolderPath(options.getFolderPath());
		if (!folder) return false;
		// Match the folder itself or any descendant — startsWith with a "/"
		// separator avoids the "Lugji Meetings" / "Lugji Meetings Archive"
		// false positive.
		return path === folder || path.startsWith(folder + "/");
	};

	// Create + modify: a single hook.
	plugin.registerEvent(
		plugin.app.metadataCache.on("changed", (file) => {
			if (!isInWatchedFolder(file.path)) return;
			options.onMeetingChanged(file);
		}),
	);

	// Delete: filter to files (folder deletes are noise).
	plugin.registerEvent(
		plugin.app.vault.on("delete", (item: TAbstractFile) => {
			if (!(item instanceof TFile)) return;
			if (!isInWatchedFolder(item.path)) return;
			options.onMeetingRemoved(item.path);
		}),
	);

	// Rename: covers "moved out of folder", "moved into folder", and
	// "renamed inside folder".
	plugin.registerEvent(
		plugin.app.vault.on("rename", (item: TAbstractFile, oldPath: string) => {
			if (!(item instanceof TFile)) return;
			const wasInFolder = isInWatchedFolder(oldPath);
			const isNowInFolder = isInWatchedFolder(item.path);
			if (wasInFolder && !isNowInFolder) {
				options.onMeetingRemoved(oldPath);
			} else if (isNowInFolder) {
				// Either newly in-folder or renamed within — refresh.
				options.onMeetingChanged(item);
			}
		}),
	);
}

/**
 * Normalise a user-supplied folder path:
 *   - Trim whitespace
 *   - Strip leading and trailing slashes (vault-relative paths have none)
 *   - Defer remaining encoding / separator normalisation to Obsidian
 *
 * Exported for unit testing.
 */
export function normalizeFolderPath(raw: string): string {
	if (typeof raw !== "string") return "";
	const trimmed = raw.trim().replace(/^\/+|\/+$/g, "");
	if (!trimmed) return "";
	return normalizePath(trimmed);
}
