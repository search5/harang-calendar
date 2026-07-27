import { MarkdownPostProcessorContext, TFile } from "obsidian";
import type HarangCalendarPlugin from "../main";
import { FrontmatterScope } from "../types";
import { createEventChip } from "./eventChip";
import { createDateWidget, isValidIsoDate } from "./dateWidget";
import { getFrontmatterScope } from "./frontmatterScope";

const DATE_RE = /\[\[cal:(\d{4}-\d{2}-\d{2})\]\]/g;
const EVENT_RE = /\[\[event:([^\]]+)\]\]/g;
const DATE_TARGET_RE = /^cal:(\d{4}-\d{2}-\d{2})$/;
const EVENT_TARGET_RE = /^event:([\s\S]+)$/;

interface CombinedMatch {
	index: number;
	raw: string;
	kind: "date" | "event";
	value: string;
}

export function combinedMatches(text: string): CombinedMatch[] {
	const matches: CombinedMatch[] = [];

	DATE_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = DATE_RE.exec(text))) {
		if (isValidIsoDate(m[1])) matches.push({ index: m.index, raw: m[0], kind: "date", value: m[1] });
	}

	EVENT_RE.lastIndex = 0;
	while ((m = EVENT_RE.exec(text))) {
		matches.push({ index: m.index, raw: m[0], kind: "event", value: m[1] });
	}

	return matches.sort((a, b) => a.index - b.index);
}

export function createHarangCalendarPostProcessor(plugin: HarangCalendarPlugin) {
	return (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
		const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
		const scope = file instanceof TFile ? getFrontmatterScope(plugin.app, file) : null;

		// In Reading view, Obsidian's own renderer parses "[[...]]" as a
		// wikilink before any MarkdownPostProcessor runs, so by the time we
		// see the DOM, "[[cal:...]]"/"[[event:...]]" is already an
		// `<a class="internal-link">`, not plain text - handle that first.
		replaceWikilinks(el, plugin, scope);

		// Fallback for any literal bracket text that didn't get parsed into
		// a link (e.g. inside constructs where Obsidian doesn't do wikilink
		// parsing). Live Preview never hits this path at all - its
		// CodeMirror ViewPlugin decorates the raw source text directly,
		// before Obsidian's own link rendering ever sees it.
		replaceRawText(el, plugin, scope);
	};
}

function replaceWikilinks(el: HTMLElement, plugin: HarangCalendarPlugin, scope: FrontmatterScope | null): void {
	const links = Array.from(el.querySelectorAll<HTMLAnchorElement>("a.internal-link"));
	for (const link of links) {
		const target = link.getAttribute("data-href") ?? link.getAttribute("href") ?? "";

		const dateMatch = DATE_TARGET_RE.exec(target);
		if (dateMatch) {
			if (isValidIsoDate(dateMatch[1])) link.replaceWith(createDateWidget(plugin, dateMatch[1], scope));
			continue;
		}

		const eventMatch = EVENT_TARGET_RE.exec(target);
		if (eventMatch) {
			link.replaceWith(createEventChip(plugin.calendarStore.getEventByUid(eventMatch[1]), eventMatch[1]));
		}
	}
}

function replaceRawText(el: HTMLElement, plugin: HarangCalendarPlugin, scope: FrontmatterScope | null): void {
	const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
		acceptNode(node) {
			const parent = node.parentElement;
			if (parent && parent.closest("code, pre")) return NodeFilter.FILTER_REJECT;
			return NodeFilter.FILTER_ACCEPT;
		},
	});

	const targets: Text[] = [];
	let node: Node | null;
	while ((node = walker.nextNode())) {
		const text = node.textContent;
		if (!text) continue;
		DATE_RE.lastIndex = 0;
		EVENT_RE.lastIndex = 0;
		if (DATE_RE.test(text) || EVENT_RE.test(text)) targets.push(node as Text);
	}

	for (const textNode of targets) {
		replaceInTextNode(textNode, plugin, scope);
	}
}

function replaceInTextNode(textNode: Text, plugin: HarangCalendarPlugin, scope: FrontmatterScope | null): void {
	const text = textNode.textContent ?? "";
	const parent = textNode.parentNode;
	if (!parent) return;

	const matches = combinedMatches(text);
	if (matches.length === 0) return;

	const fragment = createFragment();
	let lastIndex = 0;
	for (const match of matches) {
		if (match.index > lastIndex) {
			fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
		}
		if (match.kind === "date") {
			fragment.appendChild(createDateWidget(plugin, match.value, scope));
		} else {
			fragment.appendChild(createEventChip(plugin.calendarStore.getEventByUid(match.value), match.value));
		}
		lastIndex = match.index + match.raw.length;
	}
	if (lastIndex < text.length) {
		fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
	}
	parent.replaceChild(fragment, textNode);
}
