import { Plugin, WorkspaceLeaf } from "obsidian";
import { HarangCalendarSettings } from "./types";
import { DEFAULT_SETTINGS } from "./settings";
import { HarangCalendarSettingTab } from "./settingsTab";
import { AgendaItemView, VIEW_TYPE_CALENDAR_AGENDA } from "./view/AgendaItemView";
import { MonthItemView, VIEW_TYPE_CALENDAR_MONTH } from "./view/MonthItemView";
import { CalendarStore } from "./caldav/store";
import { DateEditorSuggest } from "./editorSuggest/DateEditorSuggest";
import { EventEditorSuggest } from "./editorSuggest/EventEditorSuggest";
import { buildHarangCalendarLivePreviewPlugin } from "./render/livePreview";
import { createHarangCalendarPostProcessor } from "./render/postProcessor";
import { closeEventCard } from "./render/eventCard";
import { t } from "./i18n";

export default class HarangCalendarPlugin extends Plugin {
	settings: HarangCalendarSettings = DEFAULT_SETTINGS;
	calendarStore: CalendarStore = new CalendarStore(() => this.settings);

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addSettingTab(new HarangCalendarSettingTab(this.app, this));
		this.registerView(VIEW_TYPE_CALENDAR_AGENDA, (leaf) => new AgendaItemView(leaf, this));
		this.registerView(VIEW_TYPE_CALENDAR_MONTH, (leaf) => new MonthItemView(leaf, this));
		this.registerEditorSuggest(new DateEditorSuggest(this.app));
		this.registerEditorSuggest(new EventEditorSuggest(this.app, this));
		this.registerEditorExtension(buildHarangCalendarLivePreviewPlugin(this));
		this.registerMarkdownPostProcessor(createHarangCalendarPostProcessor(this));

		this.registerDomEvent(document, "keydown", (evt: KeyboardEvent) => {
			if (evt.key === "Escape") closeEventCard();
		});

		this.addCommand({
			id: "open-calendar-sidebar",
			name: t("commandOpenSidebarView"),
			callback: () => void this.openAgendaInSidebar(),
		});

		this.addCommand({
			id: "open-calendar-tab",
			name: t("commandOpenFullView"),
			callback: () => void this.openMonthInTab(),
		});

		this.addCommand({
			id: "refresh-calendars",
			name: t("commandRefreshCalendars"),
			callback: async () => {
				await this.calendarStore.refreshAll();
			},
		});

		if (this.settings.accounts.some((a) => a.calendars.some((c) => c.enabled))) {
			void this.calendarStore.refreshIfStale();
		}
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<HarangCalendarSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private async openAgendaInSidebar(): Promise<void> {
		const { workspace } = this.app;
		const leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
		await leaf.setViewState({ type: VIEW_TYPE_CALENDAR_AGENDA, active: true });
		await workspace.revealLeaf(leaf);
	}

	private async openMonthInTab(): Promise<void> {
		const { workspace } = this.app;
		const leaf: WorkspaceLeaf = workspace.getLeaf(true);
		await leaf.setViewState({ type: VIEW_TYPE_CALENDAR_MONTH, active: true });
		await workspace.revealLeaf(leaf);
	}
}
