import { Modal, App, TextComponent, ButtonComponent, Notice, TFile } from 'obsidian';
import PursePlugin from './main';

export class DeleteConfirmModal extends Modal {
	onConfirm: (confirmed: boolean) => void;

	constructor(app: App, onConfirm: (confirmed: boolean) => void) {
		super(app);
		this.onConfirm = onConfirm;
	}

	onOpen() {
		this.titleEl.setText('确认删除');
		this.contentEl.createDiv({ text: '确定要删除这条记录吗？此操作不可撤销。' });
		const buttonContainer = this.contentEl.createDiv('modal-button-container');
		
		const confirmBtn = new ButtonComponent(buttonContainer)
			.setButtonText('确认删除')
			.onClick(() => {
				this.onConfirm(true);
				this.close();
			});
		confirmBtn.buttonEl.addClass('mod-cta');
		
		const cancelBtn = new ButtonComponent(buttonContainer)
			.setButtonText('取消')
			.onClick(() => {
				this.onConfirm(false);
				this.close();
			});
	}

	onClose() {
		this.contentEl.empty();
	}
}

export class AddRecordModal extends Modal {
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

		// 验证必填项：类型、分类、数额
		if (!type || !category || isNaN(amount) || amount <= 0) {
			new Notice('请填写类型、分类和数额（数额必须大于0）');
			return;
		}

		// 格式化数额为两位小数
		const formattedAmount = amount.toFixed(2);

		// 构建新行（标签和备注可以为空）
		const newRow = `| ${type} | ${category} | ${tag || ''} | ${formattedAmount} | ${note || ''} |`;

		try {
			// 读取文件内容
			const content = await this.app.vault.read(this.file);
			const lines = content.split('\n');

			// 简化逻辑：找到目标日期标题的位置
			let dateIndex = -1;
			for (let i = 0; i < lines.length; i++) {
				const dateMatch = lines[i].match(/^## (\d+)号$/);
				if (dateMatch && dateMatch[1] === this.date) {
					dateIndex = i;
					break;
				}
			}

			if (dateIndex === -1) {
				new Notice('无法找到目标日期，请检查文件格式');
				return;
			}

			// 从日期标题后开始查找表头和分隔行
			let foundTableHeader = false;
			let headerSeparatorIndex = -1;
			let lastDataRowIndex = -1;

			for (let i = dateIndex + 1; i < lines.length; i++) {
				const trimmedLine = lines[i].trim();

				// 如果遇到新的日期标题，停止查找
				if (trimmedLine.match(/^## \d+号$/)) {
					break;
				}

				// 跳过空行（在日期标题和表头之间）
				if (!foundTableHeader && trimmedLine === '') {
					continue;
				}

				// 查找表头
				if (!foundTableHeader && this.plugin.isPurseTableHeader(trimmedLine)) {
					foundTableHeader = true;
					continue;
				}

				// 查找表头分隔行（必须在找到表头之后）
				// 格式：| --- | --- | --- | --- | --- |
				if (foundTableHeader && headerSeparatorIndex === -1) {
					// 匹配以 | 开头和结尾，中间包含多个 | 分隔的 --- 或 - 或 : 的行
					if (trimmedLine.match(/^\|(\s*[\-:]+\s*\|)+$/)) {
						headerSeparatorIndex = i;
						continue;
					}
					// 如果找到表头后不是分隔行，可能是格式错误
					if (trimmedLine !== '') {
						break;
					}
				}

				// 在找到分隔行后，查找数据行
				if (headerSeparatorIndex >= 0) {
					// 如果是空行，可能是表格结束，停止查找
					if (trimmedLine === '') {
						break;
					}

					// 检查是否是数据行（标签和备注可以为空）
					const rowMatch = trimmedLine.match(/^\| (支出|收入) \| (.+) \| (.*) \| (\d+\.\d{2}) \| (.*) \|$/);
					if (rowMatch) {
						lastDataRowIndex = i;
					} else if (trimmedLine.startsWith('|')) {
						// 如果是以 | 开头但不是有效数据行，可能是表格结束
						break;
					}
				}
			}

			// 确定插入位置
			let insertPos = -1;
			if (lastDataRowIndex >= 0) {
				// 如果有数据行，在最后一个数据行后插入
				insertPos = lastDataRowIndex + 1;
			} else if (headerSeparatorIndex >= 0) {
				// 如果没有数据行，在表头分隔行后插入
				insertPos = headerSeparatorIndex + 1;
			}

			// 保存文件
			if (insertPos >= 0) {
				// 在找到的位置插入新行
				lines.splice(insertPos, 0, newRow);
				
				// 保存添加后的内容
				await this.app.vault.modify(this.file, lines.join('\n'));
				
				// 格式化文件（清理多余换行）
				await this.plugin.formatFile(this.file);
				
				new Notice('记录已添加');
				this.close();
				this.onSuccess();
			} else {
				// 提供更详细的错误信息
				let errorMsg = '无法找到插入位置';
				if (!foundTableHeader) {
					errorMsg += '：未找到表头';
				} else if (headerSeparatorIndex === -1) {
					errorMsg += '：未找到表头分隔行';
				}
				new Notice(errorMsg + '，请检查文件格式');
				console.error('插入位置查找失败:', {
					date: this.date,
					dateIndex,
					foundTableHeader,
					headerSeparatorIndex,
					lastDataRowIndex
				});
			}
		} catch (error) {
			console.error('添加记录时出错:', error);
			new Notice('添加记录失败: ' + (error as Error).message);
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

export class EditRecordModal extends Modal {
	plugin: PursePlugin;
	file: TFile;
	date: string;
	oldType: string;
	oldCategory: string;
	oldTag: string;
	oldAmount: string;
	oldNote: string;
	oldRowContent: string;
	onSuccess: () => void;

	typeComponent: TextComponent;
	categoryComponent: TextComponent;
	tagComponent: TextComponent;
	amountComponent: TextComponent;
	noteComponent: TextComponent;
	typeSelect: HTMLSelectElement;

	constructor(app: App, plugin: PursePlugin, file: TFile, date: string, oldType: string, oldCategory: string, oldTag: string, oldAmount: string, oldNote: string, oldRowContent: string, onSuccess: () => void) {
		super(app);
		this.plugin = plugin;
		this.file = file;
		this.date = date;
		this.oldType = oldType;
		this.oldCategory = oldCategory;
		this.oldTag = oldTag;
		this.oldAmount = oldAmount;
		this.oldNote = oldNote;
		this.oldRowContent = oldRowContent;
		this.onSuccess = onSuccess;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('purse-add-modal');

		contentEl.createEl('h2', { text: '编辑记录' });

		// 类型选择
		const typeContainer = contentEl.createDiv();
		typeContainer.createEl('label', { text: '类型：', attr: { for: 'type-select' } });
		const typeSelect = typeContainer.createEl('select', { attr: { id: 'type-select' } });
		typeSelect.createEl('option', { text: '支出', attr: { value: '支出' } });
		typeSelect.createEl('option', { text: '收入', attr: { value: '收入' } });
		this.typeComponent = new TextComponent(typeContainer);
		this.typeComponent.inputEl.replaceWith(typeSelect);
		this.typeSelect = typeSelect;
		typeSelect.value = this.oldType || '支出';

		// 分类
		const categoryContainer = contentEl.createDiv();
		categoryContainer.createEl('label', { text: '分类：', attr: { for: 'category-input' } });
		this.categoryComponent = new TextComponent(categoryContainer);
		this.categoryComponent.inputEl.id = 'category-input';
		this.categoryComponent.setValue(this.oldCategory || '');

		// 标签
		const tagContainer = contentEl.createDiv();
		tagContainer.createEl('label', { text: '标签：', attr: { for: 'tag-input' } });
		this.tagComponent = new TextComponent(tagContainer);
		this.tagComponent.inputEl.id = 'tag-input';
		this.tagComponent.setValue(this.oldTag || '');

		// 数额
		const amountContainer = contentEl.createDiv();
		amountContainer.createEl('label', { text: '数额：', attr: { for: 'amount-input' } });
		this.amountComponent = new TextComponent(amountContainer);
		this.amountComponent.inputEl.id = 'amount-input';
		this.amountComponent.inputEl.type = 'number';
		this.amountComponent.inputEl.step = '0.01';
		this.amountComponent.setPlaceholder('0.00');
		this.amountComponent.setValue(this.oldAmount || '');

		// 备注
		const noteContainer = contentEl.createDiv();
		noteContainer.createEl('label', { text: '备注：', attr: { for: 'note-input' } });
		this.noteComponent = new TextComponent(noteContainer);
		this.noteComponent.inputEl.id = 'note-input';
		this.noteComponent.setValue(this.oldNote || '');

		// 按钮
		const buttonContainer = contentEl.createDiv('modal-button-container');
		const confirmBtn = new ButtonComponent(buttonContainer)
			.setButtonText('确认')
			.onClick(() => this.updateRecord(typeSelect.value));
		confirmBtn.buttonEl.addClass('mod-cta');

		const cancelBtn = new ButtonComponent(buttonContainer)
			.setButtonText('取消')
			.onClick(() => this.close());
	}

	async updateRecord(type: string) {
		const category = this.categoryComponent.getValue().trim();
		const tag = this.tagComponent.getValue().trim();
		const amount = parseFloat(this.amountComponent.getValue());
		const note = this.noteComponent.getValue().trim();

		// 验证必填项：类型、分类、数额
		if (!type || !category || isNaN(amount) || amount <= 0) {
			new Notice('请填写类型、分类和数额（数额必须大于0）');
			return;
		}

		// 格式化数额为两位小数
		const formattedAmount = amount.toFixed(2);

		// 构建新行（标签和备注可以为空）
		const newRow = `| ${type} | ${category} | ${tag || ''} | ${formattedAmount} | ${note || ''} |`;

		try {
			// 读取文件内容
			const content = await this.app.vault.read(this.file);
			const lines = content.split('\n');

			// 查找并替换旧行
			for (let i = 0; i < lines.length; i++) {
				if (lines[i].trim() === this.oldRowContent.trim()) {
					lines[i] = newRow;
					break;
				}
			}

			// 保存文件
			await this.app.vault.modify(this.file, lines.join('\n'));

			// 格式化文件（清理多余换行）
			await this.plugin.formatFile(this.file);

			new Notice('记录已更新');
			this.close();
			this.onSuccess();
		} catch (error) {
			console.error('更新记录时出错:', error);
			new Notice('更新记录失败: ' + (error as Error).message);
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

export class CreatePurseFileModal extends Modal {
	plugin: PursePlugin;
	dateComponent: TextComponent;

	constructor(app: App, plugin: PursePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('purse-add-modal');

		contentEl.createEl('h2', { text: '创建收支明细文件' });

		// 日期输入
		const dateContainer = contentEl.createDiv();
		dateContainer.createEl('label', { text: '日期（格式：yyyy-MM）：', attr: { for: 'date-input' } });
		this.dateComponent = new TextComponent(dateContainer);
		this.dateComponent.inputEl.id = 'date-input';
		this.dateComponent.setPlaceholder('例如：2024-01');
		
		// 设置默认值为当前年月
		const now = new Date();
		const defaultDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
		this.dateComponent.setValue(defaultDate);

		// 按钮
		const buttonContainer = contentEl.createDiv('modal-button-container');
		const confirmBtn = new ButtonComponent(buttonContainer)
			.setButtonText('创建')
			.onClick(() => this.createFile());
		confirmBtn.buttonEl.addClass('mod-cta');

		const cancelBtn = new ButtonComponent(buttonContainer)
			.setButtonText('取消')
			.onClick(() => this.close());
	}

	async createFile() {
		const dateStr = this.dateComponent.getValue().trim();
		
		// 验证日期格式
		const dateMatch = dateStr.match(/^(\d{4})-(\d{2})$/);
		if (!dateMatch) {
			new Notice('日期格式不正确，应为 yyyy-MM 格式（例如：2024-01）');
			return;
		}

		const year = parseInt(dateMatch[1]);
		const month = parseInt(dateMatch[2]);

		if (month < 1 || month > 12) {
			new Notice('月份必须在 1-12 之间');
			return;
		}

		try {
			await this.plugin.createPurseFile(year, month);
			new Notice('文件创建成功');
			this.close();
		} catch (error) {
			console.error('创建文件时出错:', error);
			new Notice('创建文件失败: ' + (error as Error).message);
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

