import { ItemView, WorkspaceLeaf, TFile, Notice, Modal, App, TextComponent, ButtonComponent } from 'obsidian';
import PursePlugin from './main';

export const PURSE_VIEW_TYPE = 'purse-view';

export class PurseView extends ItemView {
	plugin: PursePlugin;
	file: TFile | null = null;
	contentEl: HTMLElement;

	constructor(leaf: WorkspaceLeaf, plugin: PursePlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return PURSE_VIEW_TYPE;
	}

	getDisplayText() {
		return this.file ? this.file.basename : '收支明细';
	}

	getIcon() {
		return 'wallet';
	}

	async onOpen() {
		this.contentEl = this.containerEl.children[1] as HTMLElement;
		this.contentEl.empty();
		this.contentEl.addClass('purse-view');

		// 监听文件变化
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (file === this.file) {
					this.loadFile();
				}
			})
		);

		// 监听元数据变化
		this.registerEvent(
			this.app.metadataCache.on('changed', (file) => {
				if (file === this.file) {
					this.loadFile();
				}
			})
		);

		// 获取当前活动文件
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile && this.plugin.isPurseFile(activeFile)) {
			this.file = activeFile;
			await this.loadFile();
		}
	}

	async onClose() {
		this.contentEl.empty();
	}

	async setState(state: any, result: { history: boolean }) {
		if (state.file) {
			const file = this.app.vault.getAbstractFileByPath(state.file);
			if (file instanceof TFile) {
				this.file = file;
				await this.loadFile();
			}
		}
		return super.setState(state, result);
	}

	async loadFile() {
		if (!this.file) {
			return;
		}

		this.contentEl.empty();

		const content = await this.app.vault.read(this.file);
		const lines = content.split('\n');

		// 解析内容并渲染
		let currentDate = '';
		let inTable = false;
		let tableRows: string[] = [];
		let tableStartIndex = -1;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			// 检查是否是主标题
			if (line === '# 收支明细') {
				const h1 = this.contentEl.createEl('h1', { text: '收支明细' });
				continue;
			}

			// 检查是否是日期标题
			const dateMatch = line.match(/^## (\d+)号$/);
			if (dateMatch) {
				// 如果之前有表格，先渲染它
				if (inTable && tableRows.length > 0) {
					this.renderTable(currentDate, tableRows);
					tableRows = [];
					inTable = false;
				}

				currentDate = dateMatch[1];
				const h2 = this.contentEl.createEl('h2', { text: `${currentDate}号` });
				continue;
			}

			// 检查是否是表头（忽略空格）
			if (this.plugin.isPurseTableHeader(line)) {
				inTable = true;
				tableStartIndex = i;
				tableRows = [line];
				continue;
			}

			// 检查是否是表头分隔行
			if (inTable && line.match(/^\|[\s\-:]+\|$/)) {
				tableRows.push(line);
				continue;
			}

			// 检查是否是表格数据行
			if (inTable && line.startsWith('|') && line.includes('|')) {
				const rowMatch = line.match(/^\| (支出|收入) \| (.+) \| (.*) \| (\d+\.\d{2}) \| (.*) \|$/);
				if (rowMatch) {
					tableRows.push(line);
				} else {
					// 表格结束，渲染之前的表格
					if (tableRows.length > 0) {
						this.renderTable(currentDate, tableRows, tableStartIndex);
						tableRows = [];
						inTable = false;
					}
				}
				continue;
			}

			// 如果遇到空行或其他内容，结束当前表格
			if (inTable && line.trim() === '') {
				if (tableRows.length > 0) {
					this.renderTable(currentDate, tableRows, tableStartIndex);
					tableRows = [];
					inTable = false;
				}
			}
		}

		// 渲染最后一个表格
		if (inTable && tableRows.length > 0) {
			this.renderTable(currentDate, tableRows, tableStartIndex);
		}
	}

	renderTable(date: string, tableRows: string[], startIndex: number = -1) {
		const tableContainer = this.contentEl.createDiv('purse-table-container');

		// 创建表格
		const table = tableContainer.createEl('table');
		table.addClass('purse-table');

		// 解析并渲染表头
		if (tableRows.length > 0) {
			const headerRow = table.createEl('thead').createEl('tr');
			const headers = ['类型', '分类', '标签', '数额', '备注', '操作'];
			headers.forEach(header => {
				const th = headerRow.createEl('th', { text: header });
			});
		}

		// 解析并渲染数据行
		const tbody = table.createEl('tbody');
		for (let i = 2; i < tableRows.length; i++) {
			const rowLine = tableRows[i];
			const rowMatch = rowLine.match(/^\| (支出|收入) \| (.+) \| (.*) \| (\d+\.\d{2}) \| (.*) \|$/);
			if (rowMatch) {
				const [, type, category, tag, amount, note] = rowMatch;
				const tr = tbody.createEl('tr');
				tr.createEl('td', { text: type });
				tr.createEl('td', { text: category });
				tr.createEl('td', { text: tag });
				tr.createEl('td', { text: amount });
				tr.createEl('td', { text: note });

				// 添加删除按钮
				const actionTd = tr.createEl('td');
				const deleteBtn = actionTd.createEl('button', { text: '删除', cls: 'purse-delete-btn' });
				deleteBtn.onclick = () => this.confirmDeleteRow(date, rowLine, startIndex + i);
			}
		}

		// 添加"添加"按钮
		const addBtnContainer = tableContainer.createDiv('purse-add-btn-container');
		const addBtn = addBtnContainer.createEl('button', { text: '添加', cls: 'purse-add-btn' });
		addBtn.onclick = () => this.openAddModal(date, startIndex);
	}

	openAddModal(date: string, insertIndex: number) {
		new AddRecordModal(this.app, this.plugin, this.file!, date, insertIndex, () => {
			this.loadFile();
		}).open();
	}

	async confirmDeleteRow(date: string, rowLine: string, rowIndex: number) {
		const confirmed = await new Promise<boolean>((resolve) => {
			const modal = new Modal(this.app);
			modal.titleEl.setText('确认删除');
			modal.contentEl.createDiv({ text: '确定要删除这条记录吗？此操作不可撤销。' });
			
			const buttonContainer = modal.contentEl.createDiv('modal-button-container');
			
			const confirmBtn = new ButtonComponent(buttonContainer)
				.setButtonText('确认删除')
				.onClick(() => {
					resolve(true);
					modal.close();
				});
			confirmBtn.buttonEl.addClass('mod-cta');
			
			const cancelBtn = new ButtonComponent(buttonContainer)
				.setButtonText('取消')
				.onClick(() => {
					resolve(false);
					modal.close();
				});

			modal.open();
		});

		if (confirmed) {
			await this.deleteRow(rowIndex);
			await this.loadFile();
			new Notice('记录已删除');
		}
	}

	async deleteRow(rowIndex: number) {
		if (!this.file) return;

		const content = await this.app.vault.read(this.file);
		const lines = content.split('\n');
		
		if (rowIndex >= 0 && rowIndex < lines.length) {
			lines.splice(rowIndex, 1);
			await this.app.vault.modify(this.file, lines.join('\n'));
		}
	}
}

class AddRecordModal extends Modal {
	plugin: PursePlugin;
	file: TFile;
	date: string;
	insertIndex: number;
	onSuccess: () => void;

	typeComponent: TextComponent;
	categoryComponent: TextComponent;
	tagComponent: TextComponent;
	amountComponent: TextComponent;
	noteComponent: TextComponent;

	constructor(app: App, plugin: PursePlugin, file: TFile, date: string, insertIndex: number, onSuccess: () => void) {
		super(app);
		this.plugin = plugin;
		this.file = file;
		this.date = date;
		this.insertIndex = insertIndex;
		this.onSuccess = onSuccess;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('purse-add-modal');

		contentEl.createEl('h2', { text: '添加记录' });

		// 类型选择
		const typeContainer = contentEl.createDiv();
		typeContainer.createEl('label', { text: '类型：', attr: { for: 'type-select' } });
		const typeSelect = typeContainer.createEl('select', { attr: { id: 'type-select' } });
		typeSelect.createEl('option', { text: '支出', attr: { value: '支出' } });
		typeSelect.createEl('option', { text: '收入', attr: { value: '收入' } });
		this.typeComponent = new TextComponent(typeContainer);
		this.typeComponent.inputEl.replaceWith(typeSelect);

		// 分类
		const categoryContainer = contentEl.createDiv();
		categoryContainer.createEl('label', { text: '分类：', attr: { for: 'category-input' } });
		this.categoryComponent = new TextComponent(categoryContainer);
		this.categoryComponent.inputEl.id = 'category-input';

		// 标签
		const tagContainer = contentEl.createDiv();
		tagContainer.createEl('label', { text: '标签：', attr: { for: 'tag-input' } });
		this.tagComponent = new TextComponent(tagContainer);
		this.tagComponent.inputEl.id = 'tag-input';

		// 数额
		const amountContainer = contentEl.createDiv();
		amountContainer.createEl('label', { text: '数额：', attr: { for: 'amount-input' } });
		this.amountComponent = new TextComponent(amountContainer);
		this.amountComponent.inputEl.id = 'amount-input';
		this.amountComponent.inputEl.type = 'number';
		this.amountComponent.inputEl.step = '0.01';
		this.amountComponent.setPlaceholder('0.00');

		// 备注
		const noteContainer = contentEl.createDiv();
		noteContainer.createEl('label', { text: '备注：', attr: { for: 'note-input' } });
		this.noteComponent = new TextComponent(noteContainer);
		this.noteComponent.inputEl.id = 'note-input';

		// 按钮
		const buttonContainer = contentEl.createDiv('modal-button-container');
		const confirmBtn = new ButtonComponent(buttonContainer)
			.setButtonText('确认')
			.onClick(() => this.addRecord(typeSelect.value));
		confirmBtn.buttonEl.addClass('mod-cta');

		const cancelBtn = new ButtonComponent(buttonContainer)
			.setButtonText('取消')
			.onClick(() => this.close());
	}

	async addRecord(type: string) {
		const category = this.categoryComponent.getValue().trim();
		const tag = this.tagComponent.getValue().trim();
		const amount = parseFloat(this.amountComponent.getValue());
		const note = this.noteComponent.getValue().trim();

		// 验证输入
		if (!category || !tag || isNaN(amount) || amount <= 0) {
			new Notice('请填写完整信息，数额必须大于0');
			return;
		}

		// 格式化数额为两位小数
		const formattedAmount = amount.toFixed(2);

		// 构建新行
		const newRow = `| ${type} | ${category} | ${tag} | ${formattedAmount} | ${note} |`;

		// 读取文件内容
		const content = await this.app.vault.read(this.file);
		const lines = content.split('\n');

		// 找到插入位置（在指定日期的表格中）
		let insertPos = -1;
		let inTargetTable = false;
		let currentDate = '';
		let foundHeaderSeparator = false;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const dateMatch = line.match(/^## (\d+)号$/);
			if (dateMatch) {
				currentDate = dateMatch[1];
				if (currentDate === this.date) {
					inTargetTable = true;
					foundHeaderSeparator = false;
				} else {
					inTargetTable = false;
				}
				continue;
			}

			if (inTargetTable && this.plugin.isPurseTableHeader(line)) {
				// 找到表头
				continue;
			}

			if (inTargetTable && line.match(/^\|[\s\-:]+\|$/)) {
				// 找到表头分隔行，下一行就是数据行开始位置
				insertPos = i + 1;
				foundHeaderSeparator = true;
				continue;
			}

			if (inTargetTable && foundHeaderSeparator) {
				// 在表格中，检查是否是数据行（标签和备注可以为空）
				const rowMatch = line.match(/^\| (支出|收入) \| .+ \| .* \| \d+\.\d{2} \| .* \|$/);
				if (rowMatch) {
					// 更新插入位置为当前行之后
					insertPos = i + 1;
					continue;
				} else if (line.trim() === '' || line.match(/^## \d+号$/)) {
					// 表格结束，在最后的数据行后插入（如果 insertPos 已设置）
					break;
				}
			}
		}

		// 如果找到了插入位置，插入新行
		if (insertPos >= 0) {
			lines.splice(insertPos, 0, newRow);
		} else {
			// 如果没找到合适位置，在表头分隔行后插入
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const dateMatch = line.match(/^## (\d+)号$/);
				if (dateMatch && dateMatch[1] === this.date) {
					// 找到目标日期，查找表头分隔行
					for (let j = i + 1; j < lines.length; j++) {
						if (lines[j].match(/^\|[\s\-:]+\|$/)) {
							lines.splice(j + 1, 0, newRow);
							break;
						}
					}
					break;
				}
			}
		}

		// 保存文件
		await this.app.vault.modify(this.file, lines.join('\n'));
		new Notice('记录已添加');
		this.close();
		this.onSuccess();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

