import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { editorLivePreviewField } from "obsidian";
import type HarangCalendarPlugin from "../main";
import { createEventChip } from "./eventChip";
import { createDateWidget, isValidIsoDate } from "./dateWidget";

const HRCAL_RE = /\{\{hrcal:([^:}]+):([^:}]+):(date|event):([^}]+)\}\}/g;

class DateRefWidget extends WidgetType {
	constructor(
		private plugin: HarangCalendarPlugin,
		private accountName: string,
		private calendarName: string,
		private dateIso: string
	) {
		super();
	}

	eq(other: DateRefWidget): boolean {
		return other.accountName === this.accountName && other.calendarName === this.calendarName && other.dateIso === this.dateIso;
	}

	toDOM(): HTMLElement {
		const scope = { accountName: this.accountName, calendarName: this.calendarName };
		return createDateWidget(this.plugin, this.dateIso, scope);
	}
}

class EventRefWidget extends WidgetType {
	constructor(
		private plugin: HarangCalendarPlugin,
		private accountName: string,
		private calendarName: string,
		private uid: string
	) {
		super();
	}

	eq(other: EventRefWidget): boolean {
		return other.accountName === this.accountName && other.calendarName === this.calendarName && other.uid === this.uid;
	}

	toDOM(): HTMLElement {
		const scope = { accountName: this.accountName, calendarName: this.calendarName };
		return createEventChip(this.plugin.calendarStore.getEventByUid(this.uid, scope), this.uid);
	}
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
				const livePreviewChanged =
					update.startState.field(editorLivePreviewField, false) !==
					update.state.field(editorLivePreviewField, false);
				if (update.docChanged || update.viewportChanged || update.selectionSet || livePreviewChanged) {
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
				const pending: PendingDecoration[] = [];

				for (const { from, to } of view.visibleRanges) {
					const text = view.state.doc.sliceString(from, to);

					HRCAL_RE.lastIndex = 0;
					let m: RegExpExecArray | null;
					while ((m = HRCAL_RE.exec(text))) {
						const [raw, accountName, calendarName, kind, value] = m;
						if (kind === "date" && !isValidIsoDate(value)) continue;
						const start = from + m.index;
						const widget =
							kind === "date"
								? new DateRefWidget(plugin, accountName, calendarName, value)
								: new EventRefWidget(plugin, accountName, calendarName, value);
						pending.push({
							from: start,
							to: start + raw.length,
							decoration: Decoration.replace({ widget }),
						});
					}
				}

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
