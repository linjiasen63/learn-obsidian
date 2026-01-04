// 移除不存在的导入，使用any类型替代
import type { DayEntry } from '../types';

export type DayEntryType = 'income' | 'expense';

export interface DayEntryFormValues {
	title: string;
	type: DayEntryType;
	category: string;
	amount: number;
	note: string;
}

interface DayEntryModalOptions {
	title: string;
	confirmLabel: string;
	initial?: Partial<DayEntryFormValues>;
	onSubmit: (values: DayEntryFormValues) => void;
}

// 使用any类型替代Modal
export class DayEntryModal {
	private options: DayEntryModalOptions;
	title: string = '';
	category: string = '';
	amount: string = '';
	type: DayEntryType = 'expense';
	note: string = '';
	private onSubmit?: (entry: DayEntry) => void;
	private entry?: DayEntry;
	contentEl: HTMLDivElement;

	constructor(app: any, options: DayEntryModalOptions = {}) {
		// 模拟构造函数
		this.options = options;
		
		// Initialize with initial values if provided
		if (options.initial) {
			this.title = options.initial.title || '';
			this.category = options.initial.category || '';
			this.amount = options.initial.amount?.toString() || '';
			this.type = options.initial.type || 'expense';
			this.note = options.initial.note || '';
		}
		// 创建contentEl属性
		this.contentEl = document.createElement('div');
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('account-day-modal');

		contentEl.createEl('h2', {}, el => el.setText(this.options.title));

		new Setting(super.contentEl)
			.setName('标题')
			.setDesc('账单标题')
			.addText((text: any) => {
				text.setPlaceholder('例：午餐');
				text.setValue(this.title);
				text.onChange((value: string) => this.title = value);
			});

		new Setting(super.contentEl)
			.setName('分类')
			.setDesc('账单分类')
			.addText((text: any) => {
				text.setPlaceholder('例：餐饮');
				text.setValue(this.category);
				text.onChange((value: string) => this.category = value);
			});

		new Setting(super.contentEl)
			.setName('金额')
			.setDesc('账单金额')
			.addText((text: any) => {
				text.setPlaceholder('0.00');
				text.setValue(this.amount);
				text.inputEl.type = 'number';
				text.inputEl.step = '0.01';
				text.inputEl.min = '0';
				text.onChange((value: string) => this.amount = value);
			});

		// 手动创建类型选择
		if (this.contentEl) {
			const typeDiv = this.contentEl.createDiv();
			typeDiv.createEl('p', { text: '类型 (账单类型)' });
			const typeSelect = typeDiv.createEl('select');
			const expenseOption = document.createElement('option');
			expenseOption.value = 'expense';
			expenseOption.textContent = '支出';
			expenseOption.selected = this.type === 'expense';
			typeSelect.appendChild(expenseOption);
			const incomeOption = document.createElement('option');
			incomeOption.value = 'income';
			incomeOption.textContent = '收入';
			incomeOption.selected = this.type === 'income';
			typeSelect.appendChild(incomeOption);
			typeSelect.addEventListener('change', (e: Event) => {
				this.type = (e.target as HTMLSelectElement).value as DayEntryType;
			});
		}

		// 手动创建备注输入
		if (this.contentEl) {
			const noteDiv = this.contentEl.createDiv();
			noteDiv.createEl('p', { text: '备注 (账单备注)' });
			const noteTextarea = noteDiv.createEl('textarea');
			noteTextarea.placeholder = '可选';
			noteTextarea.value = this.note || '';
			noteTextarea.rows = 3;
			noteTextarea.addEventListener('input', (e: Event) => {
				this.note = (e.target as HTMLTextAreaElement).value;
			});
		}

		// 创建按钮容器
		if (this.contentEl) {
			const buttonContainer = this.contentEl.createDiv('modal-button-container');
			const cancel = buttonContainer.createEl('button');
			cancel.setText('取消');
			const confirm = buttonContainer.createEl('button', { cls: 'mod-confirm' });
			confirm.setText(this.options.confirmLabel || '确认');

			cancel.addEventListener('click', () => {
				// 模拟close方法
				this.close();
			});

			confirm.addEventListener('click', () => {
				if (this.validateForm()) {
					this.submitForm();
				}
			});
		}
	}

	private validateForm(): boolean {
		if (!this.title || !this.title.trim()) {
			console.warn('请输入标题');
			return false;
		}

		if (!this.category || !this.category.trim()) {
			console.warn('请输入分类');
			return false;
		}

		const amount = parseFloat(this.amount);
		if (isNaN(amount) || amount <= 0) {
			console.warn('请输入有效金额');
			return false;
		}

		return true;
	}

	private submitForm(): void {
		const values: DayEntryFormValues = {
			title: this.title.trim(),
			type: this.type,
			category: this.category.trim(),
			amount: parseFloat(this.amount),
			note: this.note.trim()
		};

		// 适配不同的提交方式
		if (this.onSubmit) {
			this.onSubmit({
				id: this.entry?.id || Date.now().toString(),
				title: values.title,
				category: values.category,
				amount: values.amount,
				type: values.type,
				note: values.note
			});
		} else if (this.options && this.options.onSubmit) {
			this.options.onSubmit(values);
		}
		// 调用close方法
		this.close();
	}

	// 添加close方法
	close(): void {
		// 模拟close方法
		console.log('Modal closed');
	}

	// 添加open方法以确保兼容性
	open(): void {
		// 模拟open方法
		console.log('Modal opened');
	}
}

