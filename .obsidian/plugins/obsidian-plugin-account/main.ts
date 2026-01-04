import { App, Plugin, MarkdownView, TFile } from 'obsidian';
import { AccountView, VIEW_TYPE_ACCOUNT } from './view/AccountView';
import { AccountSettingsTab } from './settings/SettingsTab';
import type { AccountPluginSettings, AccountData, AccountItem } from './types';
import { AccountEditor } from './view/AccountEditor';
import { attachDayRenderers } from './view/DayTableRenderer';

// 类型定义已经移到types.ts文件中
import { DEFAULT_SETTINGS } from './types';

export default class AccountPlugin extends Plugin {
	private settings: AccountPluginSettings;
	private accountData: AccountData = {};
	private fileCache: { [key: string]: string } = {};
	private accountEditor: AccountEditor;

	async onload() {
		await this.loadSettings();
		await this.loadAccountData();

		// 初始化账单编辑器
		this.accountEditor = new AccountEditor(this);

		// 注册代码块处理器
		this.registerMarkdownCodeBlockProcessor('account-editor', (source, el, ctx) => {
			this.accountEditor.processAccountEditor(source, el, ctx);
		});

		// 实时预览：在月度文件中渲染每日表格
		this.registerMarkdownPostProcessor((element, context) => {
			const file = this.app.vault.getAbstractFileByPath(context.sourcePath);
			if (file instanceof TFile) {
				attachDayRenderers(element, context, this, file);
			}
		});

		// 注册视图
		this.registerView(
			VIEW_TYPE_ACCOUNT,
			(leaf) => new AccountView(leaf, this)
		);

		// 添加命令：打开账单视图
		this.addCommand({
			id: 'open-account-view',
			name: '打开账单管理',
			callback: () => {
				this.activateView();
			}
		});

		// 添加命令：在当前编辑器中插入账单编辑器
		this.addCommand({
			id: 'insert-account-editor',
			name: '插入账单编辑器',
			editorCallback: (editor, view) => {
				this.insertAccountEditor(editor, view);
			}
		});

		// 添加设置标签页
		this.addSettingTab(new AccountSettingsTab(this.app, this));

		// 监听文件保存，自动保存账单数据
		this.registerEvent(
			this.app.workspace.on('file-save', () => {
				this.saveAccountData();
			})
		);
	}

	onunload() {
		this.saveAccountData();
	}

	async loadSettings() {
		const loadedSettings = await this.loadData();
		this.settings = { ...DEFAULT_SETTINGS, ...loadedSettings };
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async loadAccountData() {
		try {
			const data = await this.loadData();
			if (data && typeof data === 'object') {
				// Ensure proper type structure
				this.accountData = {};
				for (const key in data) {
					if (Array.isArray(data[key])) {
						this.accountData[key] = data[key];
					}
				}
			}
		} catch (error) {
			console.error('Failed to load account data:', error);
		}
	}

	async saveAccountData() {
		try {
			if (this.accountData && typeof this.accountData === 'object') {
				await this.saveData(this.accountData);
			}
		} catch (error) {
			console.error('Failed to save account data:', error);
		}
	}

	async activateView() {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_ACCOUNT)[0];

		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			await leaf.setViewState({ type: VIEW_TYPE_ACCOUNT, active: true });
		}

		workspace.revealLeaf(leaf);
	}

	insertAccountEditor(editor: any, view: MarkdownView) {
		const cursor = editor.getCursor();
		const currentDate = new Date();
		const year = currentDate.getFullYear();
		const month = String(currentDate.getMonth() + 1).padStart(2, '0');
		const monthKey = `${year}-${month}`;

		// 生成唯一的编辑器ID
		const editorId = `account-editor-${Date.now()}`;

		// 插入账单编辑器HTML
		const editorHTML = `
\`\`\`account-editor
id: ${editorId}
month: ${monthKey}
\`\`\`
`;

		editor.replaceRange(editorHTML, cursor);
		
		// 触发视图更新以渲染编辑器
		setTimeout(() => {
			this.app.workspace.trigger('account-editor-inserted', editorId);
		}, 100);
	}

	addAccountItem(month: string, item: AccountItem) {
		if (!this.accountData[month]) {
			this.accountData[month] = [];
		}
		this.accountData[month].push(item);
		this.saveAccountData();
	}

	updateAccountItem(month: string, index: number, item: AccountItem) {
		if (this.accountData[month] && this.accountData[month][index]) {
			this.accountData[month][index] = item;
			this.saveAccountData();
		}
	}

	deleteAccountItem(month: string, index: number) {
		if (this.accountData[month] && this.accountData[month][index]) {
			this.accountData[month].splice(index, 1);
			if (this.accountData[month].length === 0) {
				delete this.accountData[month];
			}
			this.saveAccountData();
		}
	}

	getAccountItems(month: string): AccountItem[] {
		return this.accountData[month] || [];
	}

	getMonthlySummary(month: string) {
		const items = this.getAccountItems(month);
		const summary = {
			totalIncome: 0,
			totalExpense: 0,
			balance: 0,
			byCategory: {} as Record<string, number>
		};

		items.forEach(item => {
			if (item.type === 'income') {
				summary.totalIncome += item.amount;
			} else {
				summary.totalExpense += item.amount;
				summary.byCategory[item.category] = (summary.byCategory[item.category] || 0) + item.amount;
			}
		});

		summary.balance = summary.totalIncome - summary.totalExpense;
		return summary;
	}

	getAllMonths(): string[] {
		return Object.keys(this.accountData).sort().reverse();
	}
}

