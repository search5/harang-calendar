import { App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from "obsidian";
import { suggestDateCandidates } from "./dateCandidates";
import { formatDateWithYear, todayKey, tomorrowKey } from "../view/agenda";
import { t } from "../i18n";

const TRIGGER = "@date[";
const MAX_SUGGESTIONS = 10;
const QUERY_PATTERN = /^[\d-]*$/;

/** Types "@date[" followed by a progressively narrowed "YYYY-MM-DD" and inserts a `[[cal:...]]` date reference. */
export class DateEditorSuggest extends EditorSuggest<string> {
	constructor(app: App) {
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
		if (!QUERY_PATTERN.test(query)) return null;

		return {
			start: { line: cursor.line, ch: triggerIndex },
			end: cursor,
			query,
		};
	}

	getSuggestions(context: EditorSuggestContext): string[] {
		return suggestDateCandidates(context.query, new Date(), MAX_SUGGESTIONS);
	}

	renderSuggestion(dateIso: string, el: HTMLElement): void {
		el.addClass("harang-calendar-date-suggestion");
		el.setText(this.label(dateIso));
	}

	selectSuggestion(dateIso: string, _evt: MouseEvent | KeyboardEvent): void {
		if (!this.context) return;
		const { editor, start, end } = this.context;
		const text = `[[cal:${dateIso}]]`;
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

	private label(dateIso: string): string {
		if (dateIso === todayKey()) return t("agendaToday");
		if (dateIso === tomorrowKey()) return t("agendaTomorrow");
		const [year, month, day] = dateIso.split("-").map(Number);
		return formatDateWithYear(new Date(year, month - 1, day));
	}
}
