import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Vitest configuration for the Lugji Obsidian plugin.
 *
 * Tests target the **pure** modules under `src/` — anything that doesn't
 * touch the Obsidian API surface (parser, URL builder, path normaliser).
 *
 * Modules that DO depend on Obsidian (watcher event wiring, plugin entry)
 * are integration-tested manually inside a real vault. For unit-test
 * purposes we alias the `obsidian` package to a minimal stub so the
 * import resolves cleanly in a Node environment.
 *
 * Discovery: every `*.test.ts` next to its module-under-test.
 */
export default defineConfig({
	test: {
		globals: false,
		environment: "node",
		include: ["src/**/*.test.ts"],
		reporters: ["default"],
		alias: {
			obsidian: resolve(__dirname, "tests/stubs/obsidian.ts"),
		},
	},
});
