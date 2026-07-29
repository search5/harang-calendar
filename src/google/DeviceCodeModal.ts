import { App, Modal, Notice } from "obsidian";
import { requestDeviceCode, pollForToken, fetchAccountEmail, GoogleAuthError, CancelSignal } from "./deviceAuth";
import { GoogleAccount } from "./types";
import { t } from "../i18n";

/**
 * Walks the user through Google's OAuth device authorization grant: request a
 * code, show it alongside the verification URL, poll until they approve it
 * elsewhere (any browser, any device - this is what makes it work on Obsidian
 * mobile, where a loopback redirect server isn't possible).
 */
export class DeviceCodeModal extends Modal {
	private readonly cancelSignal: CancelSignal = { cancelled: false };

	constructor(
		app: App,
		private onSuccess: (account: GoogleAccount) => void | Promise<void>
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(t("googleConnectModalTitle"));
		this.renderStatus(t("googleConnectModalRequesting"));
		void this.start();
	}

	onClose(): void {
		this.cancelSignal.cancelled = true;
		this.contentEl.empty();
	}

	private renderStatus(status: string): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("p", { text: status });
	}

	private renderCode(verificationUrl: string, userCode: string): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("p", { text: t("googleConnectModalInstructions") });

		const link = contentEl.createEl("a", { text: verificationUrl, href: verificationUrl });
		link.setAttr("target", "_blank");
		link.setAttr("rel", "noopener");

		contentEl.createEl("p", { cls: "harang-calendar-google-device-code", text: userCode });

		const copyBtn = contentEl.createEl("button", { text: t("googleConnectModalCopyCode") });
		copyBtn.addEventListener("click", () => {
			navigator.clipboard.writeText(userCode).then(
				() => new Notice(t("googleConnectModalCopied")),
				() => {
					/* Clipboard access denied - the code is still selectable as text. */
				}
			);
		});

		contentEl.createEl("p", { cls: "harang-calendar-google-device-waiting", text: t("googleConnectModalWaiting") });

		window.open(verificationUrl);
	}

	private async start(): Promise<void> {
		try {
			const device = await requestDeviceCode();
			this.renderCode(device.verificationUrl, device.userCode);

			const token = await pollForToken(device.deviceCode, device.intervalSec, device.expiresInSec, this.cancelSignal);
			if (!token.refreshToken) throw new GoogleAuthError(t("googleConnectModalNoRefreshToken"));

			const email = await fetchAccountEmail(token.accessToken);
			await this.onSuccess({
				accessToken: token.accessToken,
				refreshToken: token.refreshToken,
				expiresAt: token.expiresAt,
				scope: token.scope,
				email,
			});
			new Notice(t("googleConnectSuccessNotice", { email: email ?? "" }));
			this.close();
		} catch (e) {
			if (this.cancelSignal.cancelled) return;
			const message = e instanceof GoogleAuthError ? e.message : String(e);
			new Notice(t("googleConnectFailNotice", { message }));
			this.close();
		}
	}
}
