import { App, Notice, PluginSettingTab, SettingDefinitionItem, SettingGroup } from "obsidian";
import type HarangCalendarPlugin from "./main";
import { createEmptyAccount, createGoogleAccount } from "./settings";
import { listKnownTimezones, formatUtcOffsetMinutes, parseUtcOffsetInput } from "./caldav/timezone";
import { CalDavClient, CalDavError } from "./caldav/client";
import { CalDavAccount } from "./types";
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
				render: (setting, group) => {
					setting.setName(t("settingsAccountsHeading")).setHeading();

					for (const account of this.plugin.settings.accounts) {
						this.renderAccount(group, account.id);
					}

					group.addSetting((addAccountSetting) => {
						addAccountSetting.setDesc(t("settingsAddAccountDesc")).addButton((btn) =>
							btn.setButtonText(t("settingsAddCaldavAccountButton")).onClick(async () => {
								this.plugin.settings.accounts.push(createEmptyAccount());
								await this.plugin.saveSettings();
								this.update();
							})
						);

						if (GOOGLE_INTEGRATION_ENABLED) {
							addAccountSetting.addButton((btn) =>
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
					});
				},
			},
		];
	}

	private renderAccount(parentGroup: SettingGroup, accountId: string): void {
		const account = this.plugin.settings.accounts.find((a) => a.id === accountId);
		if (!account) return;

		const section = new SettingGroup(parentGroup.listEl);
		section.addClass("harang-calendar-account");
		section.setHeading(account.name || t("settingsUnnamedAccount"));

		if (account.google) {
			const googleAccount = account.google;
			section.addSetting((setting) => {
				setting
					.setName(t("settingsAccountNameLabel"))
					.setDesc(t("googleConnectedAs", { email: googleAccount.email ?? "" }))
					.addText((text) =>
						text.setValue(account.name).onChange(async (value) => {
							account.name = value;
							await this.plugin.saveSettings();
						})
					);
			});

			section.addSetting((setting) => {
				setting
					.setName(t("settingsDiscoverName"))
					.setDesc(account.calendars.length > 0 ? t("settingsCalendarsSummary", { count: account.calendars.length }) : t("settingsCalendarsPending"))
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
			});

			for (const calendar of account.calendars) {
				this.renderCalendar(section, accountId, calendar.id);
			}
			return;
		}

		section.addSetting((setting) => {
			setting
				.setName(t("settingsAccountNameLabel"))
				.setDesc(t("settingsAccountNameDesc"))
				.addText((text) =>
					text.setValue(account.name).onChange(async (value) => {
						account.name = value;
						await this.plugin.saveSettings();
					})
				);
		});

		section.addSetting((setting) => {
			setting
				.setName(t("settingsServerUrlLabel"))
				.setDesc(t("settingsServerUrlDesc"))
				.addText((text) =>
					text
						.setPlaceholder(SERVER_URL_PLACEHOLDER)
						.setValue(account.serverUrl)
						.onChange(async (value) => {
							account.serverUrl = value;
							await this.plugin.saveSettings();
						})
				);
		});

		section.addSetting((setting) => {
			setting.setName(t("settingsUsernameLabel")).addText((text) =>
				text.setValue(account.username).onChange(async (value) => {
					account.username = value;
					await this.plugin.saveSettings();
				})
			);
		});

		section.addSetting((setting) => {
			setting
				.setName(t("settingsPasswordLabel"))
				.setDesc(t("settingsPasswordDesc"))
				.addText((text) => {
					text.inputEl.type = "password";
					text.setValue(account.password).onChange(async (value) => {
						account.password = value;
						await this.plugin.saveSettings();
					});
				});
		});

		section.addSetting((setting) => {
			setting
				.setName(t("settingsTimezoneLabel"))
				.setDesc(t("settingsTimezoneDesc"))
				.addDropdown((dropdown) => {
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
		});

		if (account.timezone.kind === "offset") {
			const offsetMinutes = account.timezone.offsetMinutes;
			section.addSetting((setting) => {
				setting
					.setName(t("settingsTimezoneOffsetLabel"))
					.setDesc(t("settingsTimezoneOffsetDesc"))
					.addText((text) =>
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
			});
		}

		section.addSetting((setting) => {
			setting
				.setName(t("settingsDiscoverName"))
				.setDesc(account.calendars.length > 0 ? t("settingsCalendarsSummary", { count: account.calendars.length }) : t("settingsCalendarsPending"))
				.addButton((btn) =>
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
		});

		for (const calendar of account.calendars) {
			this.renderCalendar(section, account.id, calendar.id);
		}

		section.addSetting((setting) => {
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
		});
	}

	private renderCalendar(parentGroup: SettingGroup, accountId: string, calendarId: string): void {
		const account = this.plugin.settings.accounts.find((a) => a.id === accountId);
		const calendar = account?.calendars.find((c) => c.id === calendarId);
		if (!account || !calendar) return;

		parentGroup.addSetting((setting) => {
			setting
				.setName(calendar.displayName)
				.setDesc(t("settingsCalendarColorDesc"))
				.addToggle((toggle) =>
					toggle.setTooltip(t("settingsCalendarEnabledLabel")).setValue(calendar.enabled).onChange(async (value) => {
						calendar.enabled = value;
						await this.plugin.saveSettings();
					})
				)
				.addText((text) =>
					text
						.setPlaceholder("#4285F4")
						.setValue(calendar.color ?? "")
						.onChange(async (value) => {
							calendar.color = value.trim() || null;
							await this.plugin.saveSettings();
						})
				);
		});
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
