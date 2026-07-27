import { App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from "obsidian";
import type HarangCalendarPlugin from "../main";
import { CalDavEvent } from "../types";
import { formatEventTime } from "../view/agenda";
import { t } from "../i18n";

const TRIGGER = "@event[";
const MAX_SUGGESTIONS = 10;

/** Types "@event[" followed by a title search and inserts a `[[event:<uid>]]` reference. */
export class EventEditorSuggest extends EditorSuggest<CalDavEvent> {
	constructor(app: App, private plugin: HarangCalendarPlugin) {
		super(app);
	}

	onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
		const line = editor.getLine(cursor.line).slice(0, cursor.ch);
		const triggerIndex = line.lastIndexOf(TRIGGER);
		if (triggerIndex === -1) return null;

		const query = line.slice(triggerIndex + TRIGGER.length);
		// A "]" here means the cursor has moved past an already-closed
		// reference earlier on the line - don't reopen it.
		if (query.includes("]")) return null;

		return {
			start: { line: cursor.line, ch: triggerIndex },
			end: cursor,
			query,
		};
	}

	getSuggestions(context: EditorSuggestContext): CalDavEvent[] {
		void this.plugin.calendarStore.refreshIfStale();
		return this.plugin.calendarStore.searchEvents(context.query, MAX_SUGGESTIONS);
	}

	renderSuggestion(event: CalDavEvent, el: HTMLElement): void {
		el.addClass("harang-calendar-event-suggestion");
		el.createDiv({ cls: "harang-calendar-event-suggestion-title", text: event.summary });
		el.createDiv({
			cls: "harang-calendar-event-suggestion-meta",
			text: `${formatEventTime(event, t("agendaAllDay"))} · ${event.calendarName}`,
		});
	}

	selectSuggestion(event: CalDavEvent, _evt: MouseEvent | KeyboardEvent): void {
		if (!this.context) return;
		const { editor, start, end } = this.context;
		const text = `[[event:${event.uid}]]`;
		editor.replaceRange(text, start, end);

		// Obsidian's editor likely auto-closed the "[" from the trigger with
		// a "]" right after the original `end` position. Our final syntax
		// doesn't use that bracket at all, so consume it instead of leaving
		// a stray "]" behind.
		const afterText = { line: start.line, ch: start.ch + text.length };
		const nextChar = editor.getRange(afterText, { line: afterText.line, ch: afterText.ch + 1 });
		if (nextChar === "]") {
			editor.replaceRange("", afterText, { line: afterText.line, ch: afterText.ch + 1 });
		}
		editor.setCursor(afterText);
	}
}
