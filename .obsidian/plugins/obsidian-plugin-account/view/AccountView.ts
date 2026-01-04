import { ItemView, WorkspaceLeaf } from 'obsidian';
import AccountPlugin from '../main';
import { AccountItem } from '../types/AccountData';

export const VIEW_TYPE_ACCOUNT = 'account-view';

export class AccountView extends ItemView {
	plugin: AccountPlugin;
	selectedMonth: string;

	constructor(leaf: WorkspaceLeaf, plugin: AccountPlugin) {
		super(leaf);
		this.plugin = plugin;
		const currentDate = new Date();
		this.selectedMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
	}

	getViewType() {
		return VIEW_TYPE_ACCOUNT;
	}

	getDisplayText() {
		return '账单管理';
	}

	getIcon() {
		return 'receipt';
	}

	async onOpen() {
		this.render();
	}

	async onClose() {
		// 清理工作
	}

	render() {
		const container = this.containerEl.children[1];
		container.empty();

		const header = container.createDiv('account-header');
		header.createEl('h2', { text: '账单管理' });

		// 月份选择器
		const monthSelector = header.createEl('select', { cls: 'month-selector' });
		const months = this.plugin.getAllMonths();
		if (months.length === 0 || !months.includes(this.selectedMonth)) {
			months.unshift(this.selectedMonth);
		}

		months.forEach(month => {
			const option = monthSelector.createEl('option', { text: this.formatMonth(month), value: month });
			if (month === this.selectedMonth) {
				option.setAttribute('selected', 'true');
			}
		});

		monthSelector.addEventListener('change', (e) => {
			this.selectedMonth = (e.target as HTMLSelectElement).value;
			this.render();
		});

		// 汇总信息
		const summary = this.plugin.getMonthlySummary(this.selectedMonth);
		const summaryDiv = container.createDiv('account-summary');
		summaryDiv.createEl('h3', { text: '月度汇总' });
		summaryDiv.createDiv('summary-item', el => {
			el.createSpan({ text: '总收入: ' });
			el.createSpan({ text: `${this.plugin.settings.currency}${summary.totalIncome.toFixed(2)}`, cls: 'income' });
		});
		summaryDiv.createDiv('summary-item', el => {
			el.createSpan({ text: '总支出: ' });
			el.createSpan({ text: `${this.plugin.settings.currency}${summary.totalExpense.toFixed(2)}`, cls: 'expense' });
		});
		summaryDiv.createDiv('summary-item', el => {
			el.createSpan({ text: '结余: ' });
			el.createSpan({ 
				text: `${this.plugin.settings.currency}${summary.balance.toFixed(2)}`, 
				cls: summary.balance >= 0 ? 'income' : 'expense' 
			});
		});

		// 按类别汇总
		if (Object.keys(summary.byCategory).length > 0) {
			const categoryDiv = summaryDiv.createDiv('category-summary');
			categoryDiv.createEl('h4', { text: '支出分类' });
			Object.entries(summary.byCategory).forEach(([category, amount]) => {
				categoryDiv.createDiv('category-item', el => {
					el.createSpan({ text: `${category}: ` });
					el.createSpan({ text: `${this.plugin.settings.currency}${amount.toFixed(2)}`, cls: 'expense' });
				});
			});
		}

		// 账单列表
		const items = this.plugin.getAccountItems(this.selectedMonth);
		const listDiv = container.createDiv('account-list');
		listDiv.createEl('h3', { text: '账单记录' });

		// 添加按钮
		const addButton = listDiv.createEl('button', { text: '+ 添加账单', cls: 'add-button' });
		addButton.addEventListener('click', () => {
			this.showAddDialog();
		});

		// 账单项列表
		const itemsList = listDiv.createDiv('items-list');
		items.forEach((item, index) => {
			this.renderAccountItem(itemsList, item, index);
		});

		if (items.length === 0) {
			itemsList.createDiv('empty-state', { text: '暂无账单记录，点击上方按钮添加' });
		}
	}

	renderAccountItem(container: HTMLElement, item: AccountItem, index: number) {
		const itemDiv = container.createDiv('account-item');
		itemDiv.setAttribute('data-index', index.toString());

		const leftDiv = itemDiv.createDiv('item-left');
		leftDiv.createDiv('item-date', { text: item.date });
		leftDiv.createDiv('item-category', { text: item.category });
		if (item.description) {
			leftDiv.createDiv('item-description', { text: item.description });
		}

		const rightDiv = itemDiv.createDiv('item-right');
		const amountSpan = rightDiv.createSpan('item-amount', { 
			text: `${item.type === 'income' ? '+' : '-'}${this.plugin.settings.currency}${item.amount.toFixed(2)}` 
		});
		amountSpan.addClass(item.type === 'income' ? 'income' : 'expense');

		const actionsDiv = rightDiv.createDiv('item-actions');
		const editBtn = actionsDiv.createEl('button', { text: '编辑', cls: 'edit-btn' });
		const deleteBtn = actionsDiv.createEl('button', { text: '删除', cls: 'delete-btn' });

		editBtn.addEventListener('click', () => {
			this.showEditDialog(item, index);
		});

		deleteBtn.addEventListener('click', () => {
			if (confirm('确定要删除这条账单吗？')) {
				this.plugin.deleteAccountItem(this.selectedMonth, index);
				this.render();
			}
		});
	}

	showAddDialog() {
		this.showItemDialog(null, -1);
	}

	showEditDialog(item: AccountItem, index: number) {
		this.showItemDialog(item, index);
	}

	showItemDialog(item: AccountItem | null, index: number) {
		const isEdit = item !== null;
		const dialog = document.createElement('div');
		dialog.className = 'account-dialog';
		dialog.innerHTML = `
			<div class="dialog-content">
				<h3>${isEdit ? '编辑' : '添加'}账单</h3>
				<div class="form-group">
					<label>日期:</label>
					<input type="date" id="item-date" value="${item?.date || new Date().toISOString().split('T')[0]}">
				</div>
				<div class="form-group">
					<label>类型:</label>
					<select id="item-type">
						<option value="income" ${item?.type === 'income' ? 'selected' : ''}>收入</option>
						<option value="expense" ${item?.type === 'expense' || !item ? 'selected' : ''}>支出</option>
					</select>
				</div>
				<div class="form-group">
					<label>分类:</label>
					<input type="text" id="item-category" value="${item?.category || this.plugin.settings.defaultCategory}" placeholder="例如: 餐饮、交通、工资等">
				</div>
				<div class="form-group">
					<label>金额:</label>
					<input type="number" id="item-amount" value="${item?.amount || ''}" step="0.01" min="0" placeholder="0.00">
				</div>
				<div class="form-group">
					<label>备注:</label>
					<textarea id="item-description" placeholder="可选">${item?.description || ''}</textarea>
				</div>
				<div class="dialog-actions">
					<button class="cancel-btn">取消</button>
					<button class="save-btn">保存</button>
				</div>
			</div>
		`;

		document.body.appendChild(dialog);

		const saveBtn = dialog.querySelector('.save-btn');
		const cancelBtn = dialog.querySelector('.cancel-btn');

		saveBtn?.addEventListener('click', () => {
			const date = (dialog.querySelector('#item-date') as HTMLInputElement).value;
			const type = (dialog.querySelector('#item-type') as HTMLSelectElement).value as 'income' | 'expense';
			const category = (dialog.querySelector('#item-category') as HTMLInputElement).value;
			const amount = parseFloat((dialog.querySelector('#item-amount') as HTMLInputElement).value);
			const description = (dialog.querySelector('#item-description') as HTMLTextAreaElement).value;

			if (!date || !category || isNaN(amount) || amount <= 0) {
				alert('请填写完整的账单信息');
				return;
			}

			const newItem: AccountItem = {
				id: item?.id || `item-${Date.now()}`,
				date,
				type,
				category,
				amount,
				description
			};

			if (isEdit) {
				this.plugin.updateAccountItem(this.selectedMonth, index, newItem);
			} else {
				this.plugin.addAccountItem(this.selectedMonth, newItem);
			}

			document.body.removeChild(dialog);
			this.render();
		});

		cancelBtn?.addEventListener('click', () => {
			document.body.removeChild(dialog);
		});

		// 点击背景关闭
		dialog.addEventListener('click', (e) => {
			if (e.target === dialog) {
				document.body.removeChild(dialog);
			}
		});
	}

	formatMonth(month: string): string {
		const [year, monthNum] = month.split('-');
		return `${year}年${parseInt(monthNum)}月`;
	}
}

