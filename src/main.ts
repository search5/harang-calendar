import { Plugin, WorkspaceLeaf } from "obsidian";
import { HarangCalendarSettings } from "./types";
import { DEFAULT_SETTINGS } from "./settings";
import { HarangCalendarSettingTab } from "./settingsTab";
import { AgendaItemView, VIEW_TYPE_CALENDAR_AGENDA } from "./view/AgendaItemView";
import { MonthItemView, VIEW_TYPE_CALENDAR_MONTH } from "./view/MonthItemView";
import { CalendarStore } from "./caldav/store";
import { HrcalEditorSuggest } from "./editorSuggest/HrcalEditorSuggest";
import { buildHarangCalendarLivePreviewPlugin } from "./render/livePreview";
import { createHarangCalendarPostProcessor } from "./render/postProcessor";
import { closeEventCard } from "./render/eventCard";
import { caldavPasswordSecretId, googleTokenSecretId } from "./secrets";
import { t } from "./i18n";

interface GoogleTokenPair {
	accessToken: string;
	refreshToken: string;
}

export default class HarangCalendarPlugin extends Plugin {
	settings: HarangCalendarSettings = DEFAULT_SETTINGS;
	calendarStore: CalendarStore = new CalendarStore(() => this.settings);

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addSettingTab(new HarangCalendarSettingTab(this.app, this));
		this.registerView(VIEW_TYPE_CALENDAR_AGENDA, (leaf) => new AgendaItemView(leaf, this));
		this.registerView(VIEW_TYPE_CALENDAR_MONTH, (leaf) => new MonthItemView(leaf, this));
		this.registerEditorSuggest(new HrcalEditorSuggest(this.app, this));
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
		let needsMigrationSave = false;

		for (const account of this.settings.accounts) {
			const secretId = caldavPasswordSecretId(account.id);
			const savedSecret = this.app.secretStorage.getSecret(secretId);
			if (savedSecret !== null) {
				account.password = savedSecret;
			} else if (account.password) {
				// Pre-SecretStorage data.json still has this account's password in plain text - move it over.
				this.app.secretStorage.setSecret(secretId, account.password);
				needsMigrationSave = true;
			}

			if (account.google) {
				const tokenSecretId = googleTokenSecretId(account.id);
				const savedTokens = this.readGoogleTokens(tokenSecretId);
				if (savedTokens) {
					account.google.accessToken = savedTokens.accessToken;
					account.google.refreshToken = savedTokens.refreshToken;
				} else if (account.google.accessToken || account.google.refreshToken) {
					// Pre-SecretStorage data.json still has these tokens in plain text - move them over.
					this.writeGoogleTokens(tokenSecretId, account.google);
					needsMigrationSave = true;
				}
			}
		}

		if (needsMigrationSave) await this.saveSettings();
	}

	async saveSettings(): Promise<void> {
		for (const account of this.settings.accounts) {
			this.app.secretStorage.setSecret(caldavPasswordSecretId(account.id), account.password);
			if (account.google) this.writeGoogleTokens(googleTokenSecretId(account.id), account.google);
		}

		await this.saveData({
			...this.settings,
			accounts: this.settings.accounts.map((account) => ({
				...account,
				password: "",
				google: account.google ? { ...account.google, accessToken: "", refreshToken: "" } : null,
			})),
		});
	}

	private readGoogleTokens(secretId: string): GoogleTokenPair | null {
		const raw = this.app.secretStorage.getSecret(secretId);
		if (!raw) return null;
		try {
			return JSON.parse(raw) as GoogleTokenPair;
		} catch {
			return null;
		}
	}

	private writeGoogleTokens(secretId: string, tokens: GoogleTokenPair): void {
		this.app.secretStorage.setSecret(secretId, JSON.stringify({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }));
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
