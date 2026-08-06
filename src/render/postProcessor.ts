import { MarkdownPostProcessorContext } from "obsidian";
import type HarangCalendarPlugin from "../main";
import { createEventChip } from "./eventChip";
import { createDateWidget, isValidIsoDate } from "./dateWidget";

const HRCAL_RE = /\{\{hrcal:([^:}]+):([^:}]+):(date|event):([^}]+)\}\}/g;

interface CombinedMatch {
	index: number;
	raw: string;
	kind: "date" | "event";
	accountId: string;
	calendarName: string;
	/** ISO date for "date"; the event uid for "event". */
	value: string;
}

export function combinedMatches(text: string): CombinedMatch[] {
	const matches: CombinedMatch[] = [];

	HRCAL_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = HRCAL_RE.exec(text))) {
		const [raw, accountId, calendarName, kind, value] = m;
		if (kind === "date" && !isValidIsoDate(value)) continue;
		matches.push({ index: m.index, raw, kind: kind as "date" | "event", accountId, calendarName, value });
	}

	return matches.sort((a, b) => a.index - b.index);
}

export function createHarangCalendarPostProcessor(plugin: HarangCalendarPlugin) {
	return (el: HTMLElement, _ctx: MarkdownPostProcessorContext) => {
		// In Reading view, Obsidian's own renderer parses "[[...]]" as a
		// wikilink before any MarkdownPostProcessor runs, but "{{hrcal:...}}"
		// isn't wikilink syntax, so it's only ever matched via the raw-text
		// scan below - which is also the only path Live Preview ever takes,
		// since its CodeMirror ViewPlugin decorates the raw source text
		// directly, before Obsidian's own link rendering ever sees it.
		replaceRawText(el, plugin);
	};
}

function replaceRawText(el: HTMLElement, plugin: HarangCalendarPlugin): void {
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
		HRCAL_RE.lastIndex = 0;
		if (HRCAL_RE.test(text)) targets.push(node as Text);
	}

	for (const textNode of targets) {
		replaceInTextNode(textNode, plugin);
	}
}

function replaceInTextNode(textNode: Text, plugin: HarangCalendarPlugin): void {
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
		const scope = { accountId: match.accountId, calendarName: match.calendarName };
		if (match.kind === "date") {
			fragment.appendChild(createDateWidget(plugin, match.value, scope));
		} else {
			fragment.appendChild(
				createEventChip(
					plugin.calendarStore.getEventByUid(match.value, { accountId: scope.accountId, accountName: null, calendarName: scope.calendarName }),
					match.value
				)
			);
		}
		lastIndex = match.index + match.raw.length;
	}
	if (lastIndex < text.length) {
		fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
	}
	parent.replaceChild(fragment, textNode);
}
