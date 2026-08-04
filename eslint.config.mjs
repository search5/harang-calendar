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
	}
);
