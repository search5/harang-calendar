import { App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from "obsidian";
import type HarangCalendarPlugin from "../main";
import { CalDavAccount, CalDavEvent } from "../types";
import { suggestDateCandidates } from "./dateCandidates";
import { formatDateWithYear, formatEventTime, todayKey, tomorrowKey } from "../view/agenda";
import { t } from "../i18n";

const TRIGGER = "{{hrcal:";
const MAX_SUGGESTIONS = 10;

type HrcalSuggestion =
	| { stage: "account"; account: CalDavAccount }
	| { stage: "calendar"; name: string }
	| { stage: "date"; dateIso: string }
	| { stage: "event"; event: CalDavEvent };

/**
 * Types "{{hrcal:" and walks account name -> calendar name -> a combined
 * date/event picker, one colon-separated segment at a time - there's no
 * separate "@date["/"@event[" trigger. The account segment is typed/matched
 * by name (what the user recognizes) but selecting it inserts the account's
 * stable id instead, so a later rename never breaks the reference; the
 * calendar segment stays name-based on purpose (see types.ts's CalendarScope
 * doc). Each selection appends to the same reference and re-triggers the
 * next stage, finally inserting either
 * `{{hrcal:<accountId>:<calendarName>:date:<yyyy-mm-dd>}}` or
 * `{{hrcal:<accountId>:<calendarName>:event:<uid>}}`.
 */
export class HrcalEditorSuggest extends EditorSuggest<HrcalSuggestion> {
	constructor(app: App, private plugin: HarangCalendarPlugin) {
		super(app);
	}

	onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
		const line = editor.getLine(cursor.line).slice(0, cursor.ch);
		const triggerIndex = line.lastIndexOf(TRIGGER);
		if (triggerIndex === -1) return null;

		const query = line.slice(triggerIndex + TRIGGER.length);
		// A "}" here means the cursor has moved past an already-closed
		// reference earlier on the line - don't reopen it.
		if (query.includes("}")) return null;

		return {
			start: { line: cursor.line, ch: triggerIndex },
			end: cursor,
			query,
		};
	}

	getSuggestions(context: EditorSuggestContext): HrcalSuggestion[] {
		const segments = context.query.split(":");

		if (segments.length === 1) {
			return this.matchingAccounts(segments[0]);
		}

		const account = this.plugin.settings.accounts.find((a) => a.id === segments[0]);
		if (!account) return [];

		if (segments.length === 2) {
			return this.matchingCalendars(account, segments[1]);
		}

		if (segments.length === 3) {
			const calendar = account.calendars.find((c) => c.displayName === segments[1]);
			if (!calendar) return [];
			void this.plugin.calendarStore.refreshIfStale();
			return this.dateAndEventSuggestions(segments[2], account.id, calendar.displayName);
		}

		return [];
	}

	private matchingAccounts(query: string): HrcalSuggestion[] {
		const q = query.trim().toLowerCase();
		return this.plugin.settings.accounts
			.filter((a) => a.name.toLowerCase().includes(q))
			.slice(0, MAX_SUGGESTIONS)
			.map((account) => ({ stage: "account" as const, account }));
	}

	private matchingCalendars(account: CalDavAccount, query: string): HrcalSuggestion[] {
		const q = query.trim().toLowerCase();
		return account.calendars
			.map((c) => c.displayName)
			.filter((name) => name.toLowerCase().includes(q))
			.slice(0, MAX_SUGGESTIONS)
			.map((name) => ({ stage: "calendar" as const, name }));
	}

	private dateAndEventSuggestions(query: string, accountId: string, calendarName: string): HrcalSuggestion[] {
		const half = Math.ceil(MAX_SUGGESTIONS / 2);
		const dates: HrcalSuggestion[] = suggestDateCandidates(query, new Date(), half).map((dateIso) => ({
			stage: "date" as const,
			dateIso,
		}));
		const events: HrcalSuggestion[] = this.plugin.calendarStore
			.searchEvents(query, half, { accountId, accountName: null, calendarName })
			.map((event) => ({ stage: "event" as const, event }));
		return [...dates, ...events];
	}

	renderSuggestion(suggestion: HrcalSuggestion, el: HTMLElement): void {
		if (suggestion.stage === "account") {
			el.addClass("harang-calendar-hrcal-suggestion");
			el.setText(suggestion.account.name);
			return;
		}

		if (suggestion.stage === "calendar") {
			el.addClass("harang-calendar-hrcal-suggestion");
			el.setText(suggestion.name);
			return;
		}

		if (suggestion.stage === "date") {
			el.addClass("harang-calendar-date-suggestion");
			el.setText(this.dateLabel(suggestion.dateIso));
			return;
		}

		el.addClass("harang-calendar-event-suggestion");
		el.createDiv({ cls: "harang-calendar-event-suggestion-title", text: suggestion.event.summary });
		el.createDiv({
			cls: "harang-calendar-event-suggestion-meta",
			text: `${formatEventTime(suggestion.event, t("agendaAllDay"))} · ${suggestion.event.calendarName}`,
		});
	}

	selectSuggestion(suggestion: HrcalSuggestion, _evt: MouseEvent | KeyboardEvent): void {
		if (!this.context) return;
		const { editor, start, end, query } = this.context;
		const segments = query.split(":");

		let text: string;
		let closesReference = false;
		switch (suggestion.stage) {
			case "account":
				text = `${TRIGGER}${suggestion.account.id}:`;
				break;
			case "calendar":
				text = `${TRIGGER}${segments[0]}:${suggestion.name}:`;
				break;
			case "date":
				text = `${TRIGGER}${segments[0]}:${segments[1]}:date:${suggestion.dateIso}}}`;
				closesReference = true;
				break;
			case "event":
				text = `${TRIGGER}${segments[0]}:${segments[1]}:event:${suggestion.event.uid}}}`;
				closesReference = true;
				break;
		}

		editor.replaceRange(text, start, end);
		const afterText = { line: start.line, ch: start.ch + text.length };

		if (closesReference) {
			// Obsidian's editor likely auto-closed the "{{" from the trigger with
			// a "}}" right after the original `end` position. Our own text
			// already closes the reference, so consume up to two stray "}"
			// left behind instead of leaving them in the note.
			for (let i = 0; i < 2; i++) {
				const nextChar = editor.getRange(afterText, { line: afterText.line, ch: afterText.ch + 1 });
				if (nextChar !== "}") break;
				editor.replaceRange("", afterText, { line: afterText.line, ch: afterText.ch + 1 });
			}
		}

		editor.setCursor(afterText);
	}

	private dateLabel(dateIso: string): string {
		if (dateIso === todayKey()) return t("agendaToday");
		if (dateIso === tomorrowKey()) return t("agendaTomorrow");
		const [year, month, day] = dateIso.split("-").map(Number);
		return formatDateWithYear(new Date(year, month - 1, day));
	}
}
