import { App, Notice, PluginSettingTab, SettingDefinitionItem, SettingGroupItem } from "obsidian";
import type HarangCalendarPlugin from "./main";
import { createEmptyAccount, createGoogleAccount } from "./settings";
import { listKnownTimezones, formatUtcOffsetMinutes, parseUtcOffsetInput } from "./caldav/timezone";
import { CalDavClient, CalDavError } from "./caldav/client";
import { CalDavAccount, CalDavCalendar } from "./types";
import { DeviceCodeModal } from "./google/DeviceCodeModal";
import { GoogleCalendarClient, GoogleCalendarError } from "./google/calendarClient";
import { caldavPasswordSecretId, googleTokenSecretId } from "./secrets";
import { GOOGLE_INTEGRATION_ENABLED } from "./featureFlags";
import { t } from "./i18n";

const SERVER_URL_PLACEHOLDER = "https://example.com/dav.php/calendars/user/";
const CUSTOM_OFFSET_OPTION = "__custom_offset__";
const KNOWN_TIMEZONES = listKnownTimezones();
const GOOGLE_CALDAV_EVENTS_URL = (calendarId: string): string =>
	`https://apidata.googleusercontent.com/caldav/v2/${encodeURIComponent(calendarId)}/events`;

export class HarangCalendarSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: HarangCalendarPlugin) {
		super(app, plugin);
	}

	// Each account (and each of its calendars) is its own declarative `type: "group"` item,
	// computed fresh from this.plugin.settings.accounts every time getSettingDefinitions() runs
	// -- mirrors harang-contacts' profile list. A dynamically-sized list rendered this way (as
	// opposed to imperatively poking a shared SettingGroup/listEl from inside a `render`
	// callback, which is how this used to work) is what Obsidian 1.13.4's declarative Settings
	// API actually keeps in sync: anything added to the DOM outside of what it can trace back to
	// a declarative item gets silently pruned on the next reconciliation pass, which is why the
	// old imperative approach stopped showing newly-added accounts at all after upgrading past
	// 1.13.0 -- confirmed empirically (via CDP against a real running instance) that the DOM
	// nodes were actually being created and momentarily present, then removed again.
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: t("settingsCacheTtlName"),
				desc: t("settingsCacheTtlDesc"),
				render: (setting) => {
					setting
						.setName(t("settingsCacheTtlName"))
						.setDesc(t("settingsCacheTtlDesc"))
						.addText((text) =>
							text.setValue(String(this.plugin.settings.cacheTtlMinutes)).onChange(async (value) => {
								const parsed = Number(value);
								if (!Number.isFinite(parsed) || parsed <= 0) return;
								this.plugin.settings.cacheTtlMinutes = parsed;
								await this.plugin.saveSettings();
							})
						);
				},
			},
			{
				name: t("settingsRefreshAllName"),
				render: (setting) => {
					setting.setName(t("settingsRefreshAllName")).addButton((btn) =>
						btn.setButtonText(t("settingsRefreshButtonIdle")).onClick(async () => {
							btn.setDisabled(true).setButtonText(t("settingsRefreshButtonLoading"));
							await this.plugin.calendarStore.refreshAll();
							btn.setDisabled(false).setButtonText(t("settingsRefreshButtonIdle"));
							new Notice(t("settingsRefreshNotice"));
						})
					);
				},
			},
			{
				name: t("settingsAccountsHeading"),
				render: (setting) => {
					setting.setName(t("settingsAccountsHeading")).setHeading();
				},
			},
			...this.plugin.settings.accounts.map((account) => this.accountDefinition(account)),
			this.addAccountDefinition(),
		];
	}

	private accountDefinition(account: CalDavAccount): SettingDefinitionItem {
		const accountId = account.id;

		if (account.google) {
			const googleAccount = account.google;
			return {
				type: "group",
				heading: account.name || t("settingsUnnamedAccount"),
				cls: "harang-calendar-account",
				items: [
					{
						name: t("settingsAccountNameLabel"),
						desc: t("googleConnectedAs", { email: googleAccount.email ?? "" }),
						render: (setting) => {
							setting.addText((text) =>
								text.setValue(account.name).onChange(async (value) => {
									account.name = value;
									await this.plugin.saveSettings();
								})
							);
						},
					},
					{
						name: t("settingsDiscoverName"),
						desc: account.calendars.length > 0 ? t("settingsCalendarsSummary", { count: account.calendars.length }) : t("settingsCalendarsPending"),
						render: (setting) => {
							setting
								.addButton((btn) =>
									btn.setButtonText(t("googleDiscoverCalendarsButton")).onClick(async () => {
										btn.setDisabled(true);
										try {
											await this.discoverGoogleCalendars(accountId);
											this.update();
										} finally {
											btn.setDisabled(false);
										}
									})
								)
								.addButton((btn) =>
									btn
										.setButtonText(t("googleDisconnectButton"))
										.setDestructive()
										.onClick(async () => {
											this.plugin.settings.accounts = this.plugin.settings.accounts.filter((a) => a.id !== accountId);
											this.app.secretStorage.setSecret(googleTokenSecretId(accountId), "");
											await this.plugin.saveSettings();
											this.update();
										})
								);
						},
					},
					...account.calendars.map((calendar) => this.calendarDefinition(accountId, calendar)),
				],
			};
		}

		return {
			type: "group",
			heading: account.name || t("settingsUnnamedAccount"),
			cls: "harang-calendar-account",
			items: [
				{
					name: t("settingsAccountNameLabel"),
					desc: t("settingsAccountNameDesc"),
					render: (setting) => {
						setting.addText((text) =>
							text.setValue(account.name).onChange(async (value) => {
								account.name = value;
								await this.plugin.saveSettings();
							})
						);
					},
				},
				{
					name: t("settingsServerUrlLabel"),
					desc: t("settingsServerUrlDesc"),
					render: (setting) => {
						setting.addText((text) =>
							text
								.setPlaceholder(SERVER_URL_PLACEHOLDER)
								.setValue(account.serverUrl)
								.onChange(async (value) => {
									account.serverUrl = value;
									await this.plugin.saveSettings();
								})
						);
					},
				},
				{
					name: t("settingsUsernameLabel"),
					render: (setting) => {
						setting.addText((text) =>
							text.setValue(account.username).onChange(async (value) => {
								account.username = value;
								await this.plugin.saveSettings();
							})
						);
					},
				},
				{
					name: t("settingsPasswordLabel"),
					desc: t("settingsPasswordDesc"),
					render: (setting) => {
						setting.addText((text) => {
							text.inputEl.type = "password";
							text.setValue(account.password).onChange(async (value) => {
								account.password = value;
								await this.plugin.saveSettings();
							});
						});
					},
				},
				{
					name: t("settingsTimezoneLabel"),
					desc: t("settingsTimezoneDesc"),
					render: (setting) => {
						setting.addDropdown((dropdown) => {
							for (const zone of KNOWN_TIMEZONES) dropdown.addOption(zone, zone);
							dropdown.addOption(CUSTOM_OFFSET_OPTION, t("settingsTimezoneCustomOffsetOption"));
							dropdown.setValue(account.timezone.kind === "iana" ? account.timezone.zone : CUSTOM_OFFSET_OPTION);
							dropdown.onChange(async (value) => {
								account.timezone =
									value === CUSTOM_OFFSET_OPTION
										? { kind: "offset", offsetMinutes: account.timezone.kind === "offset" ? account.timezone.offsetMinutes : 0 }
										: { kind: "iana", zone: value };
								await this.plugin.saveSettings();
								this.update();
							});
						});
					},
				},
				...(account.timezone.kind === "offset"
					? [
							{
								name: t("settingsTimezoneOffsetLabel"),
								desc: t("settingsTimezoneOffsetDesc"),
								render: (setting) => {
									const offsetMinutes = account.timezone.kind === "offset" ? account.timezone.offsetMinutes : 0;
									setting.addText((text) =>
										text
											.setPlaceholder("+09:00")
											.setValue(formatUtcOffsetMinutes(offsetMinutes))
											.onChange(async (value) => {
												const parsed = parseUtcOffsetInput(value);
												if (parsed === null) return;
												account.timezone = { kind: "offset", offsetMinutes: parsed };
												await this.plugin.saveSettings();
											})
									);
								},
							} satisfies SettingGroupItem,
						]
					: []),
				{
					name: t("settingsDiscoverName"),
					desc: account.calendars.length > 0 ? t("settingsCalendarsSummary", { count: account.calendars.length }) : t("settingsCalendarsPending"),
					render: (setting) => {
						setting.addButton((btn) =>
							btn.setButtonText(t("settingsTestConnectionIdle")).onClick(async () => {
								btn.setDisabled(true).setButtonText(t("settingsTestConnectionLoading"));
								try {
									await this.discoverCalendars(account);
									this.update();
								} finally {
									btn.setDisabled(false).setButtonText(t("settingsTestConnectionIdle"));
								}
							})
						);
					},
				},
				...account.calendars.map((calendar) => this.calendarDefinition(accountId, calendar)),
				{
					name: "",
					render: (setting) => {
						setting.addButton((btn) =>
							btn
								.setButtonText(t("settingsDeleteAccountButton"))
								.setDestructive()
								.onClick(async () => {
									this.plugin.settings.accounts = this.plugin.settings.accounts.filter((a) => a.id !== accountId);
									this.app.secretStorage.setSecret(caldavPasswordSecretId(accountId), "");
									await this.plugin.saveSettings();
									this.update();
								})
						);
					},
				},
			],
		};
	}

	private calendarDefinition(accountId: string, calendar: CalDavCalendar): SettingGroupItem {
		return {
			name: calendar.displayName,
			desc: t("settingsCalendarColorDesc"),
			render: (setting) => {
				const account = this.plugin.settings.accounts.find((a) => a.id === accountId);
				const current = account?.calendars.find((c) => c.id === calendar.id);
				if (!account || !current) return;
				setting
					.addToggle((toggle) =>
						toggle.setTooltip(t("settingsCalendarEnabledLabel")).setValue(current.enabled).onChange(async (value) => {
							current.enabled = value;
							await this.plugin.saveSettings();
						})
					)
					.addText((text) =>
						text
							.setPlaceholder("#4285F4")
							.setValue(current.color ?? "")
							.onChange(async (value) => {
								current.color = value.trim() || null;
								await this.plugin.saveSettings();
							})
					);
			},
		};
	}

	private addAccountDefinition(): SettingDefinitionItem {
		return {
			name: "",
			desc: t("settingsAddAccountDesc"),
			render: (setting) => {
				setting.addButton((btn) =>
					btn.setButtonText(t("settingsAddCaldavAccountButton")).onClick(async () => {
						this.plugin.settings.accounts.push(createEmptyAccount());
						await this.plugin.saveSettings();
						this.update();
					})
				);

				if (GOOGLE_INTEGRATION_ENABLED) {
					setting.addButton((btn) =>
						btn
							.setButtonText(t("settingsAddGoogleAccountButton"))
							.setCta()
							.onClick(() => {
								new DeviceCodeModal(this.app, async (connected) => {
									const account = createGoogleAccount(connected);
									this.plugin.settings.accounts.push(account);
									await this.plugin.saveSettings();
									await this.discoverGoogleCalendars(account.id);
									this.update();
								}).open();
							})
					);
				}
			},
		};
	}

	private async discoverCalendars(account: CalDavAccount): Promise<void> {
		try {
			const client = new CalDavClient(account);
			const discovered = await client.discoverCalendars();
			const existingByUrl = new Map(account.calendars.map((c) => [c.url, c]));
			account.calendars = discovered.map((d) => {
				const existing = existingByUrl.get(d.url);
				return {
					id: d.url,
					url: d.url,
					displayName: d.displayName,
					color: existing?.color ?? d.color,
					enabled: existing?.enabled ?? true,
				};
			});
			await this.plugin.saveSettings();
			new Notice(t("settingsDiscoverySuccessNotice", { count: discovered.length }));
			await this.plugin.calendarStore.refreshAll();
		} catch (e) {
			const message = e instanceof CalDavError ? e.message : String(e);
			new Notice(t("settingsDiscoveryFailNotice", { message }));
		}
	}

	/**
	 * Uses the Calendar API's calendarList (not CalDAV) to enumerate a Google
	 * account's calendars, since CalDAV alone can't discover them - you need
	 * to already know a calendar's ID to address it. Actual event fetching
	 * still goes through CalDavClient against the resulting per-calendar
	 * CalDAV URL, same as any other CalDAV calendar.
	 */
	private async discoverGoogleCalendars(accountId: string): Promise<void> {
		const account = this.plugin.settings.accounts.find((a) => a.id === accountId);
		if (!account?.google) return;
		try {
			const client = new GoogleCalendarClient(account.google, (refreshed) => {
				account.google = refreshed;
			});
			const entries = await client.listCalendars();
			const existingById = new Map(account.calendars.map((c) => [c.id, c]));
			account.calendars = entries.map((entry) => {
				const existing = existingById.get(entry.id);
				return {
					id: entry.id,
					url: GOOGLE_CALDAV_EVENTS_URL(entry.id),
					displayName: entry.summary,
					color: existing?.color ?? entry.backgroundColor ?? null,
					enabled: existing?.enabled ?? true,
				};
			});
			await this.plugin.saveSettings();
			new Notice(t("settingsDiscoverySuccessNotice", { count: entries.length }));
			await this.plugin.calendarStore.refreshAll();
		} catch (e) {
			const message = e instanceof GoogleCalendarError ? e.message : String(e);
			new Notice(t("settingsDiscoveryFailNotice", { message }));
		}
	}
}
