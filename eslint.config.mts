import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						'eslint.config.js',
						'manifest.json',
						'vitest.config.ts'
					]
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json']
			},
		},
	},
	...obsidianmd.configs.recommended,
	globalIgnores([
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"eslint.config.js",
		"version-bump.mjs",
		"versions.json",
		"main.js",
		// `tests/` holds fixtures (.md) + stubs (.ts) consumed by Vitest;
		// neither benefits from lint coverage (stubs intentionally diverge
		// from the real Obsidian types' surface).
		"tests/**",
	]),
	// Test files + vitest config run in Node, not Obsidian — they need
	// `node:fs` / `node:path` / `node:url` for fixture loading + module
	// aliasing. The Obsidian-plugin recommended config bans those imports
	// because Obsidian's runtime is browser-shaped; that ban does not
	// apply to dev-time tooling.
	{
		files: ["**/*.test.ts", "vitest.config.ts"],
		rules: {
			"import/no-nodejs-modules": "off",
		},
	},
);
