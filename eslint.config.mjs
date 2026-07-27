import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
	...obsidianmd.configs.recommended,
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				project: "./tsconfig.json",
			},
		},
	},
	{
		// .vue SFCs aren't linted yet - that requires eslint-plugin-vue +
		// vue-eslint-parser wired up alongside typescript-eslint, which is
		// out of scope for the initial scaffold. `docs/` is Sphinx's own
		// project (its generated `_build` output and vendored theme JS
		// under `_static`/`_templates` aren't this project's code).
		ignores: ["main.js", "esbuild.config.mjs", "version-bump.mjs", "eslint.config.mjs", "node_modules/**", "**/*.vue", "docs/**"],
	},
	{
		// settingsTab.ts only implements the classic imperative display() API,
		// since minAppVersion (1.12.7) is below 1.13.0 where the declarative
		// getSettingDefinitions() API becomes available. display() and
		// ButtonComponent.setWarning() are both marked @deprecated in
		// obsidian.d.ts regardless of minAppVersion (in favor of the 1.13.0+
		// declarative API and setDestructive() respectively), but they're the
		// only APIs that actually work below 1.13.0, so this file is exempted
		// from that rule.
		files: ["src/settingsTab.ts"],
		rules: {
			"@typescript-eslint/no-deprecated": "off",
		},
	}
);
