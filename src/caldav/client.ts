import { requestUrl } from "obsidian";
import { CalDavAccount, CalDavEvent } from "../types";
import { parseICalEvents } from "./ics";
import { t } from "../i18n";

const DAV_NS = "DAV:";
const CALDAV_NS = "urn:ietf:params:xml:ns:caldav";
// Not part of RFC 4791, but widely supported (Radicale, Nextcloud, iCloud) for
// per-calendar color. Read on a best-effort basis only.
const ICAL_NS = "http://apple.com/ns/ical/";

export class CalDavError extends Error {}

export interface DiscoveredCalendar {
	url: string;
	displayName: string;
	color: string | null;
}

export interface CalDavTimeRange {
	start: Date;
	end: Date;
}

function utf8ToBase64(str: string): string {
	const bytes = new TextEncoder().encode(str);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function basicAuthHeader(username: string, password: string): string {
	return "Basic " + utf8ToBase64(`${username}:${password}`);
}

function resolveUrl(base: string, href: string): string {
	return new URL(href, base).toString();
}

function toICalUtc(date: Date): string {
	return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export class CalDavClient {
	constructor(private account: CalDavAccount) {}

	private authHeader(): string {
		return basicAuthHeader(this.account.username, this.account.password);
	}

	private async dav(url: string, method: string, depth: string, body: string): Promise<{ status: number; text: string; url: string }> {
		const res = await requestUrl({
			url,
			method,
			headers: {
				Authorization: this.authHeader(),
				"Content-Type": "application/xml; charset=utf-8",
				Depth: depth,
			},
			body,
			throw: false,
		});
		if (res.status >= 400) {
			throw new CalDavError(t("davRequestFailed", { method, url, status: res.status }));
		}
		return { status: res.status, text: res.text, url };
	}

	private parseMultistatus(xmlText: string): Document {
		const parser = new DOMParser();
		const doc = parser.parseFromString(xmlText, "application/xml");
		const parserError = doc.getElementsByTagName("parsererror")[0];
		if (parserError) {
			throw new CalDavError(t("davParseError"));
		}
		return doc;
	}

	private firstText(el: Element, ns: string, tag: string): string | null {
		const found = el.getElementsByTagNameNS(ns, tag)[0];
		return found?.textContent?.trim() ?? null;
	}

	private hasResourceType(el: Element, ns: string, tag: string): boolean {
		const resType = el.getElementsByTagNameNS(DAV_NS, "resourcetype")[0];
		if (!resType) return false;
		return resType.getElementsByTagNameNS(ns, tag).length > 0;
	}

	/** Attempts to resolve the CalDAV calendar collection(s) for this account. */
	async discoverCalendars(): Promise<DiscoveredCalendar[]> {
		const base = this.account.serverUrl.trim();
		if (!base) throw new CalDavError(t("davEmptyServerUrl"));

		// 1) Check whether the given URL is already a calendar collection
		try {
			const selfCheck = await this.dav(
				base,
				"PROPFIND",
				"0",
				`<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:IC="${ICAL_NS}"><D:prop><D:resourcetype/><D:displayname/><IC:calendar-color/></D:prop></D:propfind>`
			);
			const doc = this.parseMultistatus(selfCheck.text);
			const response = doc.getElementsByTagNameNS(DAV_NS, "response")[0];
			if (response && this.hasResourceType(response, CALDAV_NS, "calendar")) {
				const displayName = this.firstText(response, DAV_NS, "displayname") || this.account.name;
				const color = this.firstText(response, ICAL_NS, "calendar-color");
				return [{ url: base, displayName, color }];
			}
		} catch {
			// Ignore and fall through to discovery
		}

		// 2) Walk principal -> calendar-home-set -> calendar collections
		const principalUrl = await this.findCurrentUserPrincipal(base);
		const homeSetUrl = await this.findCalendarHomeSet(principalUrl);
		return await this.listCalendars(homeSetUrl);
	}

	private async findCurrentUserPrincipal(base: string): Promise<string> {
		const candidates = [base];
		try {
			const origin = new URL(base).origin;
			candidates.push(`${origin}/.well-known/caldav`);
		} catch {
			// Ignore if base isn't an absolute URL
		}

		for (const candidate of candidates) {
			try {
				const res = await this.dav(
					candidate,
					"PROPFIND",
					"0",
					`<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:"><D:prop><D:current-user-principal/></D:prop></D:propfind>`
				);
				const doc = this.parseMultistatus(res.text);
				const href = doc
					.getElementsByTagNameNS(DAV_NS, "current-user-principal")[0]
					?.getElementsByTagNameNS(DAV_NS, "href")[0]?.textContent?.trim();
				if (href) return resolveUrl(res.url, href);
			} catch {
				// Try the next candidate
			}
		}
		throw new CalDavError(t("davPrincipalNotFound"));
	}

	private async findCalendarHomeSet(principalUrl: string): Promise<string> {
		const res = await this.dav(
			principalUrl,
			"PROPFIND",
			"0",
			`<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="${CALDAV_NS}">
<D:prop><C:calendar-home-set/></D:prop></D:propfind>`
		);
		const doc = this.parseMultistatus(res.text);
		const href = doc
			.getElementsByTagNameNS(CALDAV_NS, "calendar-home-set")[0]
			?.getElementsByTagNameNS(DAV_NS, "href")[0]?.textContent?.trim();
		if (!href) throw new CalDavError(t("davHomeSetNotFound"));
		return resolveUrl(res.url, href);
	}

	private async listCalendars(homeSetUrl: string): Promise<DiscoveredCalendar[]> {
		const res = await this.dav(
			homeSetUrl,
			"PROPFIND",
			"1",
			`<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:IC="${ICAL_NS}"><D:prop><D:resourcetype/><D:displayname/><IC:calendar-color/></D:prop></D:propfind>`
		);
		const doc = this.parseMultistatus(res.text);
		const responses = Array.from(doc.getElementsByTagNameNS(DAV_NS, "response"));
		const calendars: DiscoveredCalendar[] = [];
		for (const response of responses) {
			if (!this.hasResourceType(response, CALDAV_NS, "calendar")) continue;
			const href = response.getElementsByTagNameNS(DAV_NS, "href")[0]?.textContent?.trim();
			if (!href) continue;
			const displayName = this.firstText(response, DAV_NS, "displayname") || href;
			const color = this.firstText(response, ICAL_NS, "calendar-color");
			calendars.push({ url: resolveUrl(res.url, href), displayName, color });
		}
		if (calendars.length === 0) throw new CalDavError(t("davNoCalendars"));
		return calendars;
	}

	/** Fetches VEVENTs from a calendar collection via REPORT (calendar-query), optionally windowed to a UTC time range. */
	async fetchEvents(calendarId: string, calendarName: string, calendarUrl: string, range?: CalDavTimeRange): Promise<CalDavEvent[]> {
		const timeRange = range ? `<C:time-range start="${toICalUtc(range.start)}" end="${toICalUtc(range.end)}"/>` : "";
		const res = await this.dav(
			calendarUrl,
			"REPORT",
			"1",
			`<?xml version="1.0" encoding="utf-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="${CALDAV_NS}">
<D:prop><D:getetag/><C:calendar-data/></D:prop>
<C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT">${timeRange}</C:comp-filter></C:comp-filter></C:filter>
</C:calendar-query>`
		);
		const doc = this.parseMultistatus(res.text);
		const responses = Array.from(doc.getElementsByTagNameNS(DAV_NS, "response"));
		const events: CalDavEvent[] = [];
		for (const response of responses) {
			const href = response.getElementsByTagNameNS(DAV_NS, "href")[0]?.textContent?.trim();
			const icsText = this.firstText(response, CALDAV_NS, "calendar-data");
			const etag = this.firstText(response, DAV_NS, "getetag");
			if (!href || !icsText) continue;
			events.push(...parseICalEvents(icsText, calendarId, calendarName, resolveUrl(res.url, href), etag, this.account.timezone));
		}
		return events;
	}
}
