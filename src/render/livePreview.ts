import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { editorLivePreviewField, TFile } from "obsidian";
import type HarangCalendarPlugin from "../main";
import { FrontmatterScope } from "../types";
import { createEventChip } from "./eventChip";
import { createDateWidget, isValidIsoDate } from "./dateWidget";
import { getFrontmatterScope } from "./frontmatterScope";

const DATE_RE = /\[\[cal:(\d{4}-\d{2}-\d{2})\]\]/g;
const EVENT_RE = /\[\[event:([^\]]+)\]\]/g;

class DateRefWidget extends WidgetType {
	constructor(private plugin: HarangCalendarPlugin, private dateIso: string, private scope: FrontmatterScope | null) {
		super();
	}

	eq(other: DateRefWidget): boolean {
		return (
			other.dateIso === this.dateIso &&
			other.scope?.accountName === this.scope?.accountName &&
			other.scope?.calendarName === this.scope?.calendarName
		);
	}

	toDOM(): HTMLElement {
		return createDateWidget(this.plugin, this.dateIso, this.scope);
	}
}

class EventRefWidget extends WidgetType {
	constructor(private plugin: HarangCalendarPlugin, private uid: string) {
		super();
	}

	eq(other: EventRefWidget): boolean {
		return other.uid === this.uid;
	}

	toDOM(): HTMLElement {
		return createEventChip(this.plugin.calendarStore.getEventByUid(this.uid), this.uid);
	}
}

function getActiveFileScope(plugin: HarangCalendarPlugin): FrontmatterScope | null {
	const file = plugin.app.workspace.getActiveFile();
	return file instanceof TFile ? getFrontmatterScope(plugin.app, file) : null;
}

interface PendingDecoration {
	from: number;
	to: number;
	decoration: Decoration;
}

export function buildHarangCalendarLivePreviewPlugin(plugin: HarangCalendarPlugin) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = this.build(view);
			}

			update(update: ViewUpdate): void {
				if (update.docChanged || update.viewportChanged || update.selectionSet) {
					this.decorations = this.build(update.view);
				}
			}

			build(view: EditorView): DecorationSet {
				const builder = new RangeSetBuilder<Decoration>();
				if (!view.state.field(editorLivePreviewField, false)) {
					return builder.finish();
				}

				const selection = view.state.selection;
				const tree = syntaxTree(view.state);
				const scope = getActiveFileScope(plugin);
				const pending: PendingDecoration[] = [];

				for (const { from, to } of view.visibleRanges) {
					const text = view.state.doc.sliceString(from, to);

					DATE_RE.lastIndex = 0;
					let m: RegExpExecArray | null;
					while ((m = DATE_RE.exec(text))) {
						if (!isValidIsoDate(m[1])) continue;
						const start = from + m.index;
						pending.push({
							from: start,
							to: start + m[0].length,
							decoration: Decoration.replace({ widget: new DateRefWidget(plugin, m[1], scope) }),
						});
					}

					EVENT_RE.lastIndex = 0;
					while ((m = EVENT_RE.exec(text))) {
						const start = from + m.index;
						pending.push({
							from: start,
							to: start + m[0].length,
							decoration: Decoration.replace({ widget: new EventRefWidget(plugin, m[1]) }),
						});
					}
				}

				// RangeSetBuilder requires strictly increasing positions, but the
				// two regex passes above interleave dates/events out of order.
				pending.sort((a, b) => a.from - b.from);

				for (const { from, to, decoration } of pending) {
					const nodeType = tree.resolveInner(from, 1).name;
					if (/comment|code/i.test(nodeType)) continue;

					const overlapsSelection = selection.ranges.some((r) => r.from <= to && r.to >= from);
					if (overlapsSelection) continue;

					builder.add(from, to, decoration);
				}

				return builder.finish();
			}
		},
		{
			decorations: (v) => v.decorations,
		}
	);
}
