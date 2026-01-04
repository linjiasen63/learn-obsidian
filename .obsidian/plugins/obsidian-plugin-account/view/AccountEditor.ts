import AccountPlugin from '../main';
import { AccountItem } from '../types/AccountData';

export class AccountEditor {
	plugin: AccountPlugin;

	constructor(plugin: AccountPlugin) {
		this.plugin = plugin;
	}

	processAccountEditor(source: string, el: HTMLElement, ctx: any) {
		// 解析代码块参数
		const params = this.parseParams(source);
		const editorId = params.id || `editor-${Date.now()}`;
		const month = params.month || this.getCurrentMonth();

		// 清空容器
		(el as any).empty();
		(el as any).addClass('account-editor-container');

		// 创建编辑器UI
		const editorDiv = (el as any).createDiv('account-editor-wrapper');
		
		// 标题
		const title = editorDiv.createEl('h4', { text: `账单录入 - ${this.formatMonth(month)}` });
		
		// 表单
		const form = editorDiv.createEl('form', { cls: 'account-editor-form' });
		
		// 日期
		const dateGroup = form.createDiv('form-group');
		dateGroup.createEl('label', { text: '日期:', attr: { for: `${editorId}-date` } });
		const dateInput = dateGroup.createEl('input', {
			type: 'date',
			attr: { id: `${editorId}-date` }
		});
		dateInput.value = new Date().toISOString().split('T')[0];

		// 类型
		const typeGroup = form.createDiv('form-group');
		typeGroup.createEl('label', { text: '类型:', attr: { for: `${editorId}-type` } });
		const typeSelect = typeGroup.createEl('select', {
			attr: { id: `${editorId}-type` }
		});
		typeSelect.createEl('option', { text: '收入', value: 'income' });
		typeSelect.createEl('option', { text: '支出', value: 'expense', attr: { selected: 'true' } });

		// 分类
		const categoryGroup = form.createDiv('form-group');
		categoryGroup.createEl('label', { text: '分类:', attr: { for: `${editorId}-category` } });
		const categoryInput = categoryGroup.createEl('input', {
			type: 'text',
			attr: { 
				id: `${editorId}-category`,
				placeholder: '例如: 餐饮、交通、工资等'
			}
		});
		categoryInput.value = this.plugin.settings.defaultCategory;

		// 金额
		const amountGroup = form.createDiv('form-group');
		amountGroup.createEl('label', { text: '金额:', attr: { for: `${editorId}-amount` } });
		const amountInput = amountGroup.createEl('input', {
			type: 'number',
			attr: { 
				id: `${editorId}-amount`,
				step: '0.01',
				min: '0',
				placeholder: '0.00'
			}
		});

		// 备注
		const descGroup = form.createDiv('form-group');
		descGroup.createEl('label', { text: '备注:', attr: { for: `${editorId}-description` } });
		const descInput = descGroup.createEl('textarea', {
			attr: { 
				id: `${editorId}-description`,
				placeholder: '可选',
				rows: '2'
			}
		});

		// 按钮组
		const buttonGroup = form.createDiv('form-actions');
		const addButton = buttonGroup.createEl('button', { 
			text: '添加账单',
			type: 'button',
			cls: 'add-account-btn'
		});

		// 当前月份的账单列表
		const listDiv = editorDiv.createDiv('account-editor-list');
		this.renderAccountList(listDiv, month);

		// 添加按钮事件
		addButton.addEventListener('click', () => {
			const date = dateInput.value;
			const type = typeSelect.value as 'income' | 'expense';
			const category = categoryInput.value.trim();
			const amount = parseFloat(amountInput.value);
			const description = descInput.value.trim();

			if (!date || !category || isNaN(amount) || amount <= 0) {
				alert('请填写完整的账单信息');
				return;
			}

			const newItem: AccountItem = {
				id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
				date,
				type,
				category,
				amount,
				description
			};

			this.plugin.addAccountItem(month, newItem);
			
			// 清空表单（保留日期和类型）
			categoryInput.value = this.plugin.settings.defaultCategory;
			amountInput.value = '';
			descInput.value = '';

			// 刷新列表
			this.renderAccountList(listDiv, month);

			// 显示成功提示
			const notice = document.createElement('div');
			notice.className = 'account-notice success';
			notice.textContent = '账单添加成功！';
			editorDiv.appendChild(notice);
			setTimeout(() => notice.remove(), 2000);
		});

		// 监听数据变化，自动刷新列表
		const refreshInterval = setInterval(() => {
			this.renderAccountList(listDiv, month);
		}, 1000);

		// 清理定时器
		el.addEventListener('DOMNodeRemoved', () => {
			clearInterval(refreshInterval);
		}, { once: true });
	}

	renderAccountList(container: HTMLElement, month: string) {
		(container as any).empty();
		
		const items = this.plugin.getAccountItems(month);
		const summary = this.plugin.getMonthlySummary(month);

		if (items.length > 0) {
			// 显示汇总
			const summaryDiv = (container as any).createDiv('editor-summary');
			summaryDiv.createDiv('summary-line', (el: any) => {
				el.createSpan({ text: '总收入: ' });
				el.createSpan({ text: `${this.plugin.settings.currency}${summary.totalIncome.toFixed(2)}`, cls: 'income' });
			});
			summaryDiv.createDiv('summary-line', (el: any) => {
				el.createSpan({ text: '总支出: ' });
				el.createSpan({ text: `${this.plugin.settings.currency}${summary.totalExpense.toFixed(2)}`, cls: 'expense' });
			});
			summaryDiv.createDiv('summary-line', (el: any) => {
				el.createSpan({ text: '结余: ' });
				el.createSpan({ 
					text: `${this.plugin.settings.currency}${summary.balance.toFixed(2)}`, 
					cls: summary.balance >= 0 ? 'income' : 'expense' 
				});
			});

			// 显示列表
			const list = (container as any).createDiv('editor-items-list');
			items.forEach((item, index) => {
				const itemDiv = (list as any).createDiv('editor-item');
				itemDiv.createDiv('item-info', (el: any) => {
					el.createSpan('item-date', { text: item.date });
					el.createSpan('item-category', { text: item.category });
					if (item.description) {
						el.createSpan('item-desc', { text: item.description });
					}
				});
				const amountSpan = itemDiv.createSpan('item-amount', {
					text: `${item.type === 'income' ? '+' : '-'}${this.plugin.settings.currency}${item.amount.toFixed(2)}`
				});
				amountSpan.addClass(item.type === 'income' ? 'income' : 'expense');

				// 删除按钮
				const deleteBtn = itemDiv.createEl('button', { text: '删除', cls: 'delete-item-btn' });
				deleteBtn.addEventListener('click', () => {
					if (confirm('确定要删除这条账单吗？')) {
						this.plugin.deleteAccountItem(month, index);
						this.renderAccountList(container, month);
					}
				});
			});
		} else {
			(container as any).createDiv('empty-state', { text: '暂无账单记录' });
		}
	}

	parseParams(source: string): Record<string, string> {
		const params: Record<string, string> = {};
		const lines = source.split('\n');
		lines.forEach(line => {
			const match = line.match(/(\w+):\s*(.+)/);
			if (match) {
				params[match[1].trim()] = match[2].trim();
			}
		});
		return params;
	}

	getCurrentMonth(): string {
		const date = new Date();
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		return `${year}-${month}`;
	}

	formatMonth(month: string): string {
		const [year, monthNum] = month.split('-');
		return `${year}年${parseInt(monthNum)}月`;
	}
}

