// 移除不存在的导入
import AccountPlugin from '../main';
import { DayEntryModal, DayEntryFormValues, DayEntryType } from './DayEntryModal';

export interface DayHeadingMeta {
	lineStart: number;
	heading: string;
}

interface DayEntry {
	title: string;
	type: DayEntryType;
	category: string;
	amount: number;
	note: string;
	lineNumber: number;
	raw: string;
}

interface SectionBounds {
	headingLine: number;
	contentStart: number;
	contentEndExclusive: number;
}

export class DayTableRenderer {
	private plugin: any; // AccountPlugin类型
	private app: any; // App类型
	private file: any; // TFile类型
	private dayMeta: DayHeadingMeta;
	private container: HTMLElement;
	private entries: DayEntry[] = [];
	private eventRefs: any[] = [];

	constructor(
		headingEl: HTMLElement,
		plugin: any,
		file: any,
		dayMeta: DayHeadingMeta
	) {
		this.plugin = plugin;
		// 直接使用app实例
		this.app = plugin?.app || {};
		this.file = file;
		this.dayMeta = dayMeta;
		this.container = headingEl.insertAdjacentElement('afterend', headingEl.ownerDocument.createElement('div')) as HTMLElement;
		if (this.container) {
			this.container.addClass('account-day-table-wrapper');
		}
	}
	
	// 辅助方法：获取货币符号
	private getCurrency(): string {
		// 使用类型断言访问设置
		const settings = (this.plugin as any).settings;
		return settings?.currency || '¥';
	}
	async load() {
		await this.renderEntries();

		// 保存事件引用以便后续清理
		if (this.app && this.app.vault) {
			const eventRef = this.app.vault.on('modify', (modifiedFile: any) => {
				if (modifiedFile === this.file) {
					this.renderEntries();
				}
			});
			this.eventRefs.push(eventRef);
		}
	}

	destroy() {
		// 清理事件监听器
		this.eventRefs.forEach(ref => {
			if (this.app && this.app.vault && typeof this.app.vault.off === 'function') {
				this.app.vault.off('modify', ref);
			}
		});
		if (this.container) {
			this.container.remove();
		}
	}

	private async renderEntries() {
		if (!this.container) return;
		const content = await this.app.vault.cachedRead(this.file);
		const lines = this.splitLines(content);
		const bounds = this.locateSectionBounds(lines);

		if (!bounds) {
			this.container.empty();
			this.container.createDiv('account-day-empty', el => {
				el.setText('未找到账单数据，请在此标题下添加明细。');
			});
			return;
		}

		this.entries = this.parseEntries(lines, bounds);
		this.renderTable();
	}

	private renderTable() {
		this.container.empty();

		const controls = this.container.createDiv('account-day-controls');
		controls.createSpan('account-day-title', el => {
			el.setText(this.dayMeta.heading);
		});
		const addBtn = controls.createEl('button', { text: '新增', cls: 'account-day-add-btn' });
		addBtn.addEventListener('click', () => {
			this.showModal('新增账单', '添加', (values) => this.addEntry(values));
		});

		if (this.entries.length === 0) {
			this.container.createDiv('account-day-empty', el => {
				el.setText('暂无数据，点击 "新增" 开始记录。');
			});
			return;
		}

		const table = this.container.createEl('table', { cls: 'account-day-table' });
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		['条目', '类型', '分类', '金额', '备注', '操作'].forEach(text => {
			headerRow.createEl('th', { text });
		});

		const tbody = table.createEl('tbody');
		this.entries.forEach(entry => {
			const row = tbody.createEl('tr');
			row.createEl('td', {}, el => {
				el.setText(entry.title);
			});
			row.createEl('td', { cls: entry.type === 'income' ? 'income' : 'expense' }, el => {
				el.setText(entry.type === 'income' ? '收入' : '支出');
			});
			row.createEl('td', {}, el => {
				el.setText(entry.category);
			});
			row.createEl('td', {}, el => {
				// 使用插件的货币符号
				// 使用安全的toFixed调用
				el.setText(`${this.getCurrency()}${(entry.amount || 0).toFixed(2)}`);
			});
			row.createEl('td', {}, el => {
				el.setText(entry.note || '-');
			});

			const actions = row.createEl('td', { cls: 'account-day-actions' });
			const editBtn = actions.createEl('button', { text: '编辑', cls: 'account-day-action-btn' });
			editBtn.addEventListener('click', () => {
				this.showModal('编辑账单', '保存', (values) => this.updateEntry(entry, values), entry);
			});

			const deleteBtn = actions.createEl('button', { text: '删除', cls: 'account-day-action-btn danger' });
			deleteBtn.addEventListener('click', () => {
				this.deleteEntry(entry);
			});
		});

		this.renderSummary();
	}

	private renderSummary() {
		const summary = this.container.createDiv('account-day-summary');
		const totalIncome = this.entries.filter(e => e.type === 'income').reduce((sum, e) => sum + e.amount, 0);
		const totalExpense = this.entries.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);
		const balance = totalIncome - totalExpense;

		summary.createSpan('income', el => {
			el.setText(`收入：${this.getCurrency()}${totalIncome.toFixed(2)}`);
		});
		summary.createSpan('expense', el => {
			el.setText(`支出：${this.getCurrency()}${totalExpense.toFixed(2)}`);
		});
		summary.createSpan(balance >= 0 ? 'income' : 'expense', el => {
			el.setText(`结余：${this.getCurrency()}${balance.toFixed(2)}`);
		});
	}

	private splitLines(content: string): string[] {
		return content.replace(/\r\n/g, '\n').split('\n');
	}

	private locateSectionBounds(lines: string[]): SectionBounds | null {
		const headingLine = this.findHeadingLine(lines);
		if (headingLine === -1) return null;

		let contentEndExclusive = headingLine + 1;
		for (let i = headingLine + 1; i < lines.length; i++) {
			const trimmed = lines[i].trim();
			if (trimmed.startsWith('## ') || /^#\s/.test(trimmed)) {
				break;
			}
			contentEndExclusive = i + 1;
		}

		return {
			headingLine,
			contentStart: headingLine + 1,
			contentEndExclusive
		};
	}

	private findHeadingLine(lines: string[]): number {
		const headingText = `## ${this.dayMeta.heading}`.trim();
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].trim() === headingText) {
				return i;
			}
		}
		return -1;
	}

	private parseEntries(lines: string[], bounds: SectionBounds): DayEntry[] {
		const entries: DayEntry[] = [];
		for (let lineIndex = bounds.contentStart; lineIndex < bounds.contentEndExclusive; lineIndex++) {
			const line = lines[lineIndex].trim();
			if (!line.startsWith('-')) continue;
			const withoutDash = line.replace(/^-+\s*/, '');
			const parts = withoutDash.split('|').map(part => part.trim());
			if (parts.length < 4) continue;
			const [title, typeText, category, amountText, note = ''] = parts;
			const amount = parseFloat(amountText.replace(/[^\d.-]/g, ''));
			if (!title || !category || isNaN(amount)) continue;
			const type = this.normalizeType(typeText);
			entries.push({
				title,
				type,
				category,
				amount,
				note,
				lineNumber: lineIndex,
				raw: line
			});
		}
		return entries;
	}

	private normalizeType(typeText: string): DayEntryType {
		if (typeText.includes('收') || typeText.toLowerCase() === 'income') {
			return 'income';
		}
		return 'expense';
	}

	private showModal(title: string, confirmLabel: string, onSubmit: (values: DayEntryFormValues) => void, entry?: DayEntry) {
		const modal = new DayEntryModal(this.app, {
			title,
			confirmLabel,
			initial: entry ? {
				title: entry.title,
				type: entry.type,
				category: entry.category,
				amount: entry.amount,
				note: entry.note === '-' ? '' : entry.note
			} : undefined,
			onSubmit
		});
		modal.open();
	}

	private async addEntry(values: DayEntryFormValues) {
		await this.editFile(lines => {
			const bounds = this.locateSectionBounds(lines);

			if (!bounds) {
				const headingLine = `## ${this.dayMeta.heading}`;
				lines.push('');
				lines.push(headingLine);
				lines.push(this.serializeEntry(values));
				return;
			}

			lines.splice(bounds.contentEndExclusive, 0, this.serializeEntry(values));
		});

		await this.renderEntries();
	}

	private async updateEntry(entry: DayEntry, values: DayEntryFormValues) {
		await this.editFile(lines => {
			const bounds = this.locateSectionBounds(lines);
			if (!bounds) {
				return;
			}

			const targetIndex = this.findLineIndex(lines, bounds, entry);
			if (targetIndex === -1) {
				return;
			}

			lines[targetIndex] = this.serializeEntry(values);
		});

		await this.renderEntries();
	}

	private async deleteEntry(entry: DayEntry) {
		await this.editFile(lines => {
			const bounds = this.locateSectionBounds(lines);
			if (!bounds) {
				return;
			}

			const targetIndex = this.findLineIndex(lines, bounds, entry);
			if (targetIndex === -1) {
				return;
			}

			lines.splice(targetIndex, 1);
		});

		await this.renderEntries();
	}

	private findLineIndex(lines: string[], bounds: SectionBounds, entry: DayEntry): number {
		if (lines[entry.lineNumber]?.trim() === entry.raw.trim()) {
			return entry.lineNumber;
		}

		for (let i = bounds.contentStart; i < bounds.contentEndExclusive; i++) {
			if (lines[i].trim() === entry.raw.trim()) {
				return i;
			}
		}
		return -1;
	}

	private serializeEntry(values: DayEntryFormValues): string {
		const typeText = values.type === 'income' ? '收入' : '支出';
		const amountText = values.amount.toFixed(2);
		const noteText = values.note || '-';
		return `- ${values.title} | ${typeText} | ${values.category} | ${amountText} | ${noteText}`;
	}

	private async editFile(mutator: (lines: string[]) => void) {
		// 使用any类型避免类型错误
	const vault = this.app.vault as any;
		const runMutations = (raw: string) => {
			const lines = this.splitLines(raw);
			mutator(lines);
			return lines.join('\n');
		};

		if (typeof vault.process === 'function') {
			await vault.process(this.file, runMutations);
			return;
		}

		const newContent = runMutations(await vault.read(this.file));
		await vault.modify(this.file, newContent);
	}
}

export function collectMonthMeta(
	cacheHeadings: any[] | undefined
): DayHeadingMeta[] | null {
	if (!cacheHeadings || cacheHeadings.length === 0) return null;
	const firstMonth = cacheHeadings.find(h => h.level === 1);
	if (!firstMonth) return null;
	const monthIndex = cacheHeadings.indexOf(firstMonth);
	const nextMonth = cacheHeadings.slice(monthIndex + 1).find(h => h.level === 1);
	const startLine = firstMonth.position.start.line;
	const endLine = nextMonth ? nextMonth.position.start.line : Number.POSITIVE_INFINITY;

	return cacheHeadings
		.filter(h => h.level === 2 && h.position.start.line > startLine && h.position.start.line < endLine)
		.map(h => ({
			lineStart: h.position.start.line,
			heading: h.heading
		}));
}

export function attachDayRenderers(
	element: HTMLElement,
	ctx: any,
	plugin: any,
	file: any
) {
	// 直接使用plugin获取metadataCache
	// 使用类型断言获取metadataCache
	const cache = (plugin as any).app?.metadataCache?.getFileCache(file);
	const dayHeadings = collectMonthMeta(cache?.headings);
	if (!dayHeadings || dayHeadings.length === 0) return;

	const dayLineMap = new Map<number, DayHeadingMeta>();
	dayHeadings.forEach(day => dayLineMap.set(day.lineStart, day));

	element.querySelectorAll('h2').forEach(headingEl => {
		const sectionInfo = ctx.getSectionInfo(headingEl);
		if (!sectionInfo) return;
		if (!dayLineMap.has(sectionInfo.lineStart)) return;
		if ((headingEl as HTMLElement).dataset.accountDayProcessed === 'true') return;
		(headingEl as HTMLElement).dataset.accountDayProcessed = 'true';

		const dayMeta = dayLineMap.get(sectionInfo.lineStart);
		if (!dayMeta) return;

		const renderer = new DayTableRenderer(headingEl as HTMLElement, plugin, file, dayMeta);
		ctx.addChild(renderer);
	});
}

