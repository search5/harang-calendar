import { App, TFile } from "obsidian";
import { CalendarScope } from "../types";

/**
 * Reads a single-value frontmatter field, tolerating a one-item YAML list
 * (`key:\n  - value`) as well as a plain string. Obsidian remembers a
 * property's last-used widget type per key across the whole vault, not
 * per-note - `harang-account`/`harang-calendar` were both used as List-type
 * (array) properties earlier in this project's life, so the Properties
 * panel can still default a freshly-typed value into a one-item array
 * instead of a plain string even though the current design expects a
 * single value. Only the first item is used if there's more than one -
 * this field isn't meant to hold multiple values.
 */
function readTextFrontmatter(frontmatter: Record<string, unknown> | undefined, key: string): string | null {
	const raw = frontmatter?.[key];
	const value = typeof raw === "string" ? raw : Array.isArray(raw) && typeof raw[0] === "string" ? raw[0] : null;
	if (value === null) return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

/**
 * Reads the `harang-account`/`harang-calendar` frontmatter for a file.
 * Returns null if both are absent/empty, meaning "no scope restriction".
 * Not currently called anywhere - `{{hrcal:...}}` references carry their
 * own account/calendar instead - kept for a planned future sync feature.
 */
export function getFrontmatterScope(app: App, file: TFile): CalendarScope | null {
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
	const accountName = readTextFrontmatter(frontmatter, "harang-account");
	const calendarName = readTextFrontmatter(frontmatter, "harang-calendar");
	if (!accountName && !calendarName) return null;
	return { accountName, calendarName };
}
