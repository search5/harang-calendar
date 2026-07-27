import { App, Modal } from "obsidian";
import { resolveLocale } from "./agenda";
import { t } from "../i18n";

const MIN_YEAR = 1970;
const MAX_YEAR = 2999;

/**
 * A year display (click to edit) plus a pick-directly 12-month grid, for
 * jumping straight to any year/month. The year starts as plain text;
 * clicking it swaps in a text input (type a year, Enter to commit / Escape
 * to cancel), which reverts back to text after a commit or cancel.
 */
export class MonthPickerModal extends Modal {
	private year: number;
	private editingYear = false;

	constructor(
		app: App,
		private initialYear: number,
		private initialMonth: number,
		private onSelect: (year: number, month: number) => void
	) {
		super(app);
		this.year = initialYear;
	}

	onOpen(): void {
		this.setTitle(t("monthPickerTitle"));
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("harang-calendar-month-picker");

		const yearRow = contentEl.createDiv({ cls: "harang-calendar-month-picker-year-nav" });
		this.editingYear ? this.renderYearInput(yearRow) : this.renderYearLabel(yearRow);

		const monthGrid = contentEl.createDiv({ cls: "harang-calendar-month-picker-grid" });
		const formatter = new Intl.DateTimeFormat(resolveLocale(), { month: "short" });
		for (let i = 0; i < 12; i++) {
			const month = i + 1;
			const name = formatter.format(new Date(2023, i, 1));
			const btn = monthGrid.createEl("button", { cls: "harang-calendar-month-picker-month", text: name });
			if (this.year === this.initialYear && month === this.initialMonth) {
				btn.addClass("harang-calendar-month-picker-month-current");
			}
			btn.addEventListener("click", () => {
				this.onSelect(this.year, month);
				this.close();
			});
		}
	}

	private renderYearLabel(yearRow: HTMLElement): void {
		const btn = yearRow.createEl("button", {
			cls: "harang-calendar-month-picker-year-range",
			text: String(this.year),
			attr: { "aria-label": t("monthViewTypeYear") },
		});
		btn.addEventListener("click", () => {
			this.editingYear = true;
			this.render();
		});
	}

	private renderYearInput(yearRow: HTMLElement): void {
		const input = yearRow.createEl("input", {
			cls: "harang-calendar-month-picker-year-input",
			type: "number",
			value: String(this.year),
			attr: { min: String(MIN_YEAR), max: String(MAX_YEAR), "aria-label": t("monthViewTypeYear") },
		});

		const commit = () => this.commitYearInput(input.value);
		input.addEventListener("keydown", (evt: KeyboardEvent) => {
			if (evt.key === "Enter") {
				evt.preventDefault();
				input.removeEventListener("blur", commit);
				commit();
			} else if (evt.key === "Escape") {
				evt.preventDefault();
				// Removing the (focused) input from the DOM on re-render
				// would also fire "blur" and re-trigger commit - drop the
				// listener first so Escape actually cancels.
				input.removeEventListener("blur", commit);
				this.editingYear = false;
				this.render();
			}
		});
		input.addEventListener("blur", commit);

		window.setTimeout(() => {
			input.focus();
			input.select();
		}, 0);
	}

	private commitYearInput(rawValue: string): void {
		const parsed = Number(rawValue);
		if (Number.isInteger(parsed) && parsed >= MIN_YEAR && parsed <= MAX_YEAR) {
			this.year = parsed;
		}
		this.editingYear = false;
		this.render();
	}
}
