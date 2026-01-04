import { Plugin, TFile, MarkdownView, Notice, WorkspaceLeaf } from 'obsidian';
import { PurseView, PURSE_VIEW_TYPE } from './purseView';
import { DeleteConfirmModal, AddRecordModal, EditRecordModal, CreatePurseFileModal } from './modals';

/**
 * 格式校验结果
 */
interface FormatCheckResult {
	isValid: boolean;
	reason?: string;
}

export default class PursePlugin extends Plugin {
	async onload() {
		// 注册 markdown 后处理器，用于自定义渲染表格
		this.registerMarkdownPostProcessor((element, context) => {
			const file = context.sourcePath ? this.app.vault.getAbstractFileByPath(context.sourcePath) : null;
			if (!(file instanceof TFile) || !this.isPurseFile(file)) {
				return;
			}

			// 查找所有表格
			const tables = element.querySelectorAll('table');
			tables.forEach((table) => {
				// 检查是否是收支明细表格
				const headerRow = table.querySelector('thead tr');
				if (!headerRow) return;

			const headers = Array.from(headerRow.querySelectorAll('th')).map(th => th.textContent?.trim());
			// 检查表头列名（忽略空格）
			if (headers.length >= 5 && 
				headers[0] === '类型' && 
				headers[1] === '分类' && 
				headers[2] === '标签' && 
				headers[3] === '数额' && 
				headers[4] === '备注') {
					
					// 这是收支明细表格，进行自定义渲染
					this.customizeTable(table, file, context);
				}
			});
		});

		// 监听文件打开事件
		this.app.workspace.on('file-open', async (file: TFile | null) => {
			if (file && this.isPurseFile(file)) {
				const result = await this.validateFileFormat(file);
				const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf;
				
				if (activeLeaf) {
					if (!result.isValid) {
						// 格式校验失败，切换到源码模式
						await activeLeaf.setViewState({
							type: 'markdown',
							state: { mode: 'source' }
						});
						new Notice(`账单格式不对：${result.reason || '请调整'}`);
					} else {
						// 格式校验通过，切换到预览模式（阅读模式）
						await activeLeaf.setViewState({
							type: 'markdown',
							state: { mode: 'preview' }
						});
					}
				}
			}
		});

		// 监听活动文件变化
		this.app.workspace.on('active-leaf-change', async (leaf) => {
			if (leaf?.view instanceof MarkdownView) {
				const file = leaf.view.file;
				if (file && this.isPurseFile(file)) {
					const result = await this.validateFileFormat(file);
					if (!result.isValid) {
						// 格式校验失败，切换到源码模式
						await leaf.setViewState({
							type: 'markdown',
							state: { mode: 'source' }
						});
						new Notice(`账单格式不对：${result.reason || '请调整'}`);
					} else {
						// 格式校验通过，切换到预览模式（阅读模式）
						await leaf.setViewState({
							type: 'markdown',
							state: { mode: 'preview' }
						});
					}
				}
			}
		});

		// 注册命令：创建收支明细文件
		this.addCommand({
			id: 'create-purse-file',
			name: '创建收支明细文件',
			callback: () => {
				const modal = new CreatePurseFileModal(this.app, this);
				modal.open();
			}
		});
	}

	onunload() {
		// 清理视图
		this.app.workspace.detachLeavesOfType(PURSE_VIEW_TYPE);
	}

	/**
	 * 检查文件是否是目标文件
	 */
	isPurseFile(file: TFile | null): boolean {
		if (!file || !file.extension) {
			return false;
		}

		if (file.extension !== 'md') {
			return false;
		}

		// 检查文件名是否符合正则表达式 (0[1-9]|1[0-2])月
		const fileNamePattern = /^(0[1-9]|1[0-2])月$/;
		if (!file.basename || !fileNamePattern.test(file.basename)) {
			return false;
		}

		// 检查 frontMatter 中是否有 purse=true
		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		return frontmatter?.purse === true;
	}

	/**
	 * 格式化文件内容（清理多余换行）
	 */
	async formatFile(file: TFile): Promise<void> {
		try {
			const content = await this.app.vault.read(file);
			const formattedContent = this.cleanupExtraNewlines(content);
			
			// 如果内容有变化，保存格式化后的内容
			if (formattedContent !== content) {
				await this.app.vault.modify(file, formattedContent);
			}
		} catch (error) {
			console.error('格式化文件时出错:', error);
		}
	}

	/**
	 * 清理二级标题和表格之间的多余换行
	 */
	cleanupExtraNewlines(content: string): string {
		const lines = content.split('\n');
		const dateHeaderPattern = /^## \d+号$/;
		const cleanedLines: string[] = [];
		let i = 0;
		
		while (i < lines.length) {
			const line = lines[i];
			const trimmedLine = line.trim();
			
			// 检查是否是日期标题
			if (dateHeaderPattern.test(trimmedLine)) {
				cleanedLines.push(line);
				i++;
				
				// 跳过所有连续的空行
				let emptyLineCount = 0;
				while (i < lines.length && lines[i].trim() === '') {
					emptyLineCount++;
					i++;
				}
				
				// 如果下一个非空行是表头，只保留最多一个空行
				if (i < lines.length && this.isPurseTableHeader(lines[i].trim())) {
					// 如果原来有空行，只保留一个；如果没有空行，不添加
					if (emptyLineCount > 0) {
						cleanedLines.push('');
					}
				} else {
					// 如果下一个非空行不是表头，保留所有空行
					for (let k = 0; k < emptyLineCount; k++) {
						cleanedLines.push('');
					}
				}
				
				continue;
			}
			
			cleanedLines.push(line);
			i++;
		}
		
		return cleanedLines.join('\n');
	}

	/**
	 * 验证文件格式
	 */
	async validateFileFormat(file: TFile): Promise<FormatCheckResult> {
		console.log(`[Purse Plugin] 开始校验文件格式: ${file.path}`);
		const content = await this.app.vault.read(file);
		const result = this.checkFormat(content);
		
		// 如果格式校验通过，清理多余的换行
		if (result.isValid) {
			console.log(`[Purse Plugin] 文件格式校验通过: ${file.path}`);
			let cleanedContent = this.cleanupExtraNewlines(content);
			
			// 检查 frontmatter 中是否有 date 属性
			const cache = this.app.metadataCache.getFileCache(file);
			const frontmatter = cache?.frontmatter;
			if (frontmatter?.date) {
				const dateStr = frontmatter.date as string;
				console.log(`[Purse Plugin] 检测到 date 属性: ${dateStr}`);
				// 检查日期格式是否为 yyyy-MM
				const dateMatch = dateStr.match(/^(\d{4})-(\d{2})$/);
				if (dateMatch) {
					const year = parseInt(dateMatch[1]);
					const month = parseInt(dateMatch[2]);
					console.log(`[Purse Plugin] 开始补全缺失的日期: ${year}-${month.toString().padStart(2, '0')}`);
					// 补全缺失的日期
					cleanedContent = await this.completeMissingDates(cleanedContent, year, month);
				} else {
					console.warn(`[Purse Plugin] date 属性格式不正确，应为 yyyy-MM 格式: ${dateStr}`);
				}
			}
			
			if (cleanedContent !== content) {
				// 如果内容有变化，保存清理后的内容
				console.log(`[Purse Plugin] 文件内容已更新，保存文件: ${file.path}`);
				await this.app.vault.modify(file, cleanedContent);
			}
		} else {
			console.error(`[Purse Plugin] 文件格式校验失败: ${file.path}`, result.reason);
		}
		
		return result;
	}

	/**
	 * 补全缺失的日期
	 */
	async completeMissingDates(content: string, year: number, month: number): Promise<string> {
		console.log(`[Purse Plugin] 开始补全缺失的日期: ${year}-${month.toString().padStart(2, '0')}`);
		const lines = content.split('\n');
		
		// 获取该月的天数
		const daysInMonth = new Date(year, month, 0).getDate();
		console.log(`[Purse Plugin] 该月共有 ${daysInMonth} 天`);
		
		// 查找已有的日期及其位置
		const existingDates = new Map<number, number>(); // day -> line index
		for (let i = 0; i < lines.length; i++) {
			const dateMatch = lines[i].match(/^## (\d+)号$/);
			if (dateMatch) {
				const day = parseInt(dateMatch[1]);
				if (day >= 1 && day <= daysInMonth) {
					existingDates.set(day, i);
				}
			}
		}
		console.log(`[Purse Plugin] 已存在的日期: ${Array.from(existingDates.keys()).sort((a, b) => a - b).join(', ') || '无'}`);
		
		// 找出缺失的日期
		const missingDates: number[] = [];
		for (let day = 1; day <= daysInMonth; day++) {
			if (!existingDates.has(day)) {
				missingDates.push(day);
			}
		}
		
		// 如果没有缺失的日期，直接返回
		if (missingDates.length === 0) {
			console.log('[Purse Plugin] 所有日期都已存在，无需补全');
			return content;
		}
		console.log(`[Purse Plugin] 缺失的日期: ${missingDates.join(', ')}，共 ${missingDates.length} 个`);
		
		// 构建缺失日期的表格结构
		const tableHeader = '| 类型 | 分类 | 标签 | 数额 | 备注 |';
		const tableSeparator = '| --- | --- | --- | --- | --- |';
		
		// 按日期顺序插入缺失的日期
		const newLines = [...lines];
		
		// 辅助函数：查找日期表格的结束位置
		const findDateTableEnd = (startIndex: number): number => {
			let inTable = false;
			let foundHeaderSeparator = false;
			
			for (let i = startIndex + 1; i < newLines.length; i++) {
				const trimmedLine = newLines[i].trim();
				
				// 如果遇到新的日期标题，停止查找
				if (trimmedLine.match(/^## \d+号$/)) {
					return i;
				}
				
				// 查找表头
				if (!inTable && this.isPurseTableHeader(trimmedLine)) {
					inTable = true;
					continue;
				}
				
				// 查找分隔行
				if (inTable && !foundHeaderSeparator && trimmedLine.match(/^\|(\s*[\-:]+\s*\|)+$/)) {
					foundHeaderSeparator = true;
					continue;
				}
				
				// 在找到分隔行后，查找数据行
				if (foundHeaderSeparator) {
					if (trimmedLine === '') {
						// 空行可能是表格结束
						return i + 1;
					}
					
					// 检查是否是数据行
					const rowMatch = trimmedLine.match(/^\| (支出|收入) \| (.+) \| (.*) \| (\d+\.\d{2}) \| (.*) \|$/);
					if (rowMatch) {
						// 继续查找，记录最后一个数据行的位置
						continue;
					} else if (trimmedLine.startsWith('|')) {
						// 如果是以 | 开头但不是有效数据行，可能是表格结束
						return i + 1;
					}
				}
			}
			
			return newLines.length;
		};
		
		for (const day of missingDates) {
			// 找到应该插入的位置（在比当前日期小的最大日期之后）
			let insertIndex = -1;
			let maxSmallerDay = 0;
			let maxSmallerIndex = -1;
			
			// 查找比当前日期小的最大日期（包括已存在的和已插入的）
			for (const [existingDay, lineIndex] of existingDates.entries()) {
				if (existingDay < day && existingDay > maxSmallerDay) {
					maxSmallerDay = existingDay;
					maxSmallerIndex = lineIndex;
				}
			}
			
			if (maxSmallerIndex >= 0) {
				// 找到该日期表格的结束位置（使用当前 newLines 数组的索引）
				insertIndex = findDateTableEnd(maxSmallerIndex);
			} else {
				// 如果没有找到更小的日期，在主标题后插入
				for (let i = 0; i < newLines.length; i++) {
					if (newLines[i].trim() === '# 收支明细') {
						insertIndex = i + 1;
						break;
					}
				}
			}
			
			if (insertIndex >= 0) {
				// 构建日期部分
				const dateSection = [
					`## ${day}号`,
					'',
					tableHeader,
					tableSeparator,
					''
				];
				
				// 插入日期部分
				newLines.splice(insertIndex, 0, ...dateSection);
				
				// 更新所有已有日期的索引（因为插入了新行）
				// 所有在插入位置之后的日期索引都需要增加
				for (const [existingDay, lineIndex] of existingDates.entries()) {
					if (lineIndex >= insertIndex) {
						existingDates.set(existingDay, lineIndex + dateSection.length);
					}
				}
				
				// 记录新插入的日期位置
				existingDates.set(day, insertIndex);
				console.log(`[Purse Plugin] 已补全日期: ${day}号，插入位置: ${insertIndex}`);
			} else {
				console.warn(`[Purse Plugin] 无法找到日期 ${day}号 的插入位置`);
			}
		}
		
		console.log(`[Purse Plugin] 日期补全完成，共补全 ${missingDates.length} 个日期`);
		return newLines.join('\n');
	}

	/**
	 * 检查是否是收支明细表头（忽略空格）
	 */
	isPurseTableHeader(line: string): boolean {
		if (!line.startsWith('|') || !line.endsWith('|')) {
			return false;
		}
		
		// 提取所有列名（去除首尾的 | 和空格）
		const columns = line.split('|')
			.map(col => col.trim())
			.filter(col => col.length > 0);
		
		// 检查列名是否匹配：类型、分类、标签、数额、备注
		return columns.length === 5 &&
			columns[0] === '类型' &&
			columns[1] === '分类' &&
			columns[2] === '标签' &&
			columns[3] === '数额' &&
			columns[4] === '备注';
	}

	/**
	 * 检查文件内容格式
	 */
	checkFormat(content: string): FormatCheckResult {
		console.log('[Purse Plugin] 开始检查文件内容格式');
		const lines = content.split('\n');
		
		// 检查是否有 # 收支明细 标题
		if (!content.includes('# 收支明细')) {
			console.error('[Purse Plugin] 格式校验失败: 缺少主标题 "# 收支明细"');
			return {
				isValid: false,
				reason: '缺少主标题 "# 收支明细"'
			};
		}
		console.log('[Purse Plugin] ✓ 主标题检查通过');

		// 检查日期标题格式 (## xx号)
		const dateHeaderPattern = /^## \d+号$/;
		let hasDateHeader = false;
		let inTable = false;
		let foundTableHeader = false;
		let foundHeaderSeparator = false;
		let hasValidRow = false;
		let invalidRowLine = -1;
		let invalidRowContent = '';
		let afterDateHeader = false; // 标记是否在日期标题之后

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmedLine = line.trim();
			
			// 检查是否是日期标题
			if (dateHeaderPattern.test(trimmedLine)) {
				hasDateHeader = true;
				// 重置表格状态
				inTable = false;
				foundTableHeader = false;
				foundHeaderSeparator = false;
				afterDateHeader = true; // 标记在日期标题之后
				continue;
			}

			// 如果遇到空行且在日期标题之后（还未找到表头），继续查找表头（忽略换行）
			if (afterDateHeader && trimmedLine === '') {
				continue;
			}

			// 检查是否是表头（忽略空格）
			if (afterDateHeader && this.isPurseTableHeader(trimmedLine)) {
				foundTableHeader = true;
				inTable = true;
				afterDateHeader = false; // 找到表头后重置标记
				continue;
			}

			// 如果遇到其他非空行但不是表头，重置 afterDateHeader
			if (afterDateHeader && trimmedLine !== '') {
				afterDateHeader = false;
			}

			// 检查是否是表头分隔行
			// 格式：| --- | --- | --- | --- | --- |
			if (inTable && foundTableHeader && trimmedLine.match(/^\|(\s*[\-:]+\s*\|)+$/)) {
				foundHeaderSeparator = true;
				continue;
			}

			// 检查是否是表格数据行（忽略空行）
			if (inTable && foundTableHeader && foundHeaderSeparator) {
				// 如果遇到空行，跳过（可能是表格内部或表格结束的空行）
				if (trimmedLine === '') {
					// 检查下一个非空行是否是新的日期标题，如果是则表格结束
					let j = i + 1;
					while (j < lines.length && lines[j].trim() === '') {
						j++;
					}
					if (j < lines.length && dateHeaderPattern.test(lines[j].trim())) {
						// 遇到新的日期标题，表格结束
						inTable = false;
						foundTableHeader = false;
						foundHeaderSeparator = false;
					}
					continue;
				}
				
				// 如果遇到新的日期标题，表格结束
				if (dateHeaderPattern.test(trimmedLine)) {
					inTable = false;
					foundTableHeader = false;
					foundHeaderSeparator = false;
					hasDateHeader = true;
					afterDateHeader = true;
					continue;
				}
				
				// 检查是否是数据行
				if (trimmedLine.startsWith('|')) {
					// 验证行格式：| 类型 | 分类 | 标签 | 数额 | 备注 |（标签和备注可以为空）
					const rowMatch = trimmedLine.match(/^\| (支出|收入) \| (.+) \| (.*) \| (\d+\.\d{2}) \| (.*) \|$/);
					if (rowMatch) {
						hasValidRow = true;
					} else {
						// 如果包含 | 但不是有效格式，记录错误
						invalidRowLine = i + 1;
						invalidRowContent = trimmedLine;
						const errorMsg = `第 ${invalidRowLine} 行格式不正确：表格数据行格式应为 "| 类型 | 分类 | 标签 | 数额 | 备注 |"，其中类型为"支出"或"收入"，分类和数额为必填，标签和备注可以为空，数额为两位小数。当前行：${invalidRowContent.substring(0, 50)}${invalidRowContent.length > 50 ? '...' : ''}`;
						console.error(`[Purse Plugin] 格式校验失败: ${errorMsg}`);
						return {
							isValid: false,
							reason: errorMsg
						};
					}
				} else {
					// 遇到非空行但不是表格行，可能是表格结束
					inTable = false;
					foundTableHeader = false;
					foundHeaderSeparator = false;
				}
			}
		}

		// 检查是否有日期标题
		if (!hasDateHeader) {
			console.error('[Purse Plugin] 格式校验失败: 缺少日期标题（格式应为 "## xx号"，如 "## 1号"）');
			return {
				isValid: false,
				reason: '缺少日期标题（格式应为 "## xx号"，如 "## 1号"）'
			};
		}
		console.log('[Purse Plugin] ✓ 日期标题检查通过');

		// 检查是否有有效的数据行
		if (!hasValidRow) {
			console.error('[Purse Plugin] 格式校验失败: 缺少有效的表格数据行。每个日期标题下应至少有一条记录');
			return {
				isValid: false,
				reason: '缺少有效的表格数据行。每个日期标题下应至少有一条记录，格式为 "| 支出/收入 | 分类 | 标签 | 数额(两位小数) | 备注 |"'
			};
		}
		console.log('[Purse Plugin] ✓ 数据行检查通过');
		console.log('[Purse Plugin] ✓ 文件格式校验全部通过');

		return { isValid: true };
	}

	/**
	 * 自定义表格渲染
	 */
	customizeTable(table: HTMLTableElement, file: TFile, context: any) {
		// 添加操作列到表头
		const headerRow = table.querySelector('thead tr');
		if (headerRow) {
			const actionTh = document.createElement('th');
			actionTh.textContent = '操作';
			actionTh.className = 'purse-action-header';
			headerRow.appendChild(actionTh);
		}

		// 为每行添加删除按钮
		const tbody = table.querySelector('tbody');
		if (tbody) {
			const rows = Array.from(tbody.querySelectorAll('tr'));
			rows.forEach((row, index) => {
				// 获取行数据
				const cells = Array.from(row.querySelectorAll('td'));
				if (cells.length < 5) return;

				const type = cells[0].textContent?.trim() || '';
				const category = cells[1].textContent?.trim() || '';
				const tag = cells[2].textContent?.trim() || '';
				const amount = cells[3].textContent?.trim() || '';
				const note = cells[4].textContent?.trim() || '';

				// 验证是否是有效的收支记录行
				if ((type === '支出' || type === '收入') && /^\d+\.\d{2}$/.test(amount)) {
					// 添加操作列
					const actionTd = document.createElement('td');
					actionTd.className = 'purse-action-cell';
					
					// 按钮容器
					const buttonContainer = document.createElement('div');
					buttonContainer.className = 'purse-action-buttons';
					
					// 编辑按钮
					const editBtn = document.createElement('button');
					editBtn.textContent = '编辑';
					editBtn.className = 'purse-edit-btn';
					editBtn.onclick = () => {
						this.handleEditRow(file, row, type, category, tag, amount, note);
					};
					buttonContainer.appendChild(editBtn);
					
					// 删除按钮
					const deleteBtn = document.createElement('button');
					deleteBtn.textContent = '删除';
					deleteBtn.className = 'purse-delete-btn';
					deleteBtn.onclick = async () => {
						await this.handleDeleteRow(file, row, type, category, tag, amount, note);
					};
					buttonContainer.appendChild(deleteBtn);
					
					actionTd.appendChild(buttonContainer);
					row.appendChild(actionTd);
				}
			});
		}

		// 在表格后添加"添加"按钮
		// 检查是否已经添加过按钮
		const existingBtn = table.nextElementSibling?.classList.contains('purse-add-btn-container');
		if (existingBtn) return;

		// 找到对应的日期
		const date = this.findDateForTable(table, file);
		
		const addBtnContainer = document.createElement('div');
		addBtnContainer.className = 'purse-add-btn-container';
		const addBtn = document.createElement('button');
		addBtn.textContent = '添加';
		addBtn.className = 'purse-add-btn';
		addBtn.onclick = () => {
			this.handleAddRecord(file, date);
		};
		addBtnContainer.appendChild(addBtn);
		
		// 在表格后插入按钮
		table.insertAdjacentElement('afterend', addBtnContainer);
	}

	/**
	 * 查找表格对应的日期
	 */
	findDateForTable(table: HTMLTableElement, file: TFile): string {
		// 向上查找最近的 h2 标题
		let element: Element | null = table;
		while (element) {
			element = element.previousElementSibling;
			if (element && element.tagName === 'H2') {
				const text = element.textContent?.trim() || '';
				const match = text.match(/^(\d+)号$/);
				if (match) {
					return match[1];
				}
			}
		}
		
		// 如果没找到，尝试在父元素中查找
		let parent: Element | null = table.parentElement;
		while (parent) {
			const h2 = parent.querySelector('h2');
			if (h2) {
				const text = h2.textContent?.trim() || '';
				const match = text.match(/^(\d+)号$/);
				if (match) {
					return match[1];
				}
			}
			parent = parent.parentElement;
		}
		
		return '1'; // 默认返回1号
	}

	/**
	 * 处理删除行
	 */
	async handleDeleteRow(file: TFile, row: HTMLTableRowElement, type: string, category: string, tag: string, amount: string, note: string) {
		const confirmed = await new Promise<boolean>((resolve) => {
			const modal = new DeleteConfirmModal(this.app, resolve);
			modal.open();
		});

		if (confirmed) {
			// 构建要删除的行内容
			const rowContent = `| ${type} | ${category} | ${tag} | ${amount} | ${note} |`;
			
			// 读取文件并删除对应行
			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			
			for (let i = 0; i < lines.length; i++) {
				if (lines[i].trim() === rowContent.trim()) {
					lines.splice(i, 1);
					// 先保存删除后的内容
					const modifiedContent = lines.join('\n');
					await this.app.vault.modify(file, modifiedContent);
					
					// 格式化文件（清理多余换行）
					await this.formatFile(file);
					
					break;
				}
			}
			
			// 刷新视图
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view) {
				view.previewMode.rerender(true);
			}
			
			new Notice('记录已删除');
		}
	}

	/**
	 * 处理编辑行
	 */
	handleEditRow(file: TFile, row: HTMLTableRowElement, type: string, category: string, tag: string, amount: string, note: string) {
		// 构建旧行内容
		const oldRowContent = `| ${type} | ${category} | ${tag} | ${amount} | ${note} |`;
		
		// 查找对应的日期
		const date = this.findDateForTable(row.closest('table') as HTMLTableElement, file);
		
		// 使用 EditRecordModal
		const modal = new EditRecordModal(this.app, this, file, date, type, category, tag, amount, note, oldRowContent, async () => {
			// 格式化文件（清理多余换行）
			await this.formatFile(file);
			
			// 刷新视图
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view) {
				view.previewMode.rerender(true);
			}
		});
		modal.open();
	}

	/**
	 * 处理添加记录
	 */
	handleAddRecord(file: TFile, date: string) {
		// 使用 AddRecordModal
		const modal = new AddRecordModal(this.app, this, file, date, -1, async () => {
			// 格式化文件（清理多余换行）
			await this.formatFile(file);
			
			// 刷新视图
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view) {
				view.previewMode.rerender(true);
			}
		});
		modal.open();
	}

	/**
	 * 创建收支明细文件
	 */
	async createPurseFile(year: number, month: number): Promise<void> {
		// 获取该月的天数
		const daysInMonth = new Date(year, month, 0).getDate();
		
		// 构建文件内容
		const dateStr = `${year}-${String(month).padStart(2, '0')}`;
		const monthName = `${String(month).padStart(2, '0')}月`;
		
		// Frontmatter
		let content = '---\n';
		content += 'purse: true\n';
		content += `date: ${dateStr}\n`;
		content += '---\n\n';
		
		// 主标题
		content += '# 收支明细\n\n';
		
		// 生成所有日期的表格结构
		const tableHeader = '| 类型 | 分类 | 标签 | 数额 | 备注 |';
		const tableSeparator = '| --- | --- | --- | --- | --- |';
		
		for (let day = 1; day <= daysInMonth; day++) {
			content += `## ${day}号\n\n`;
			content += `${tableHeader}\n`;
			content += `${tableSeparator}\n\n`;
		}
		
		// 创建文件
		const fileName = `${monthName}.md`;
		const file = await this.app.vault.create(fileName, content);
		
		// 打开文件
		await this.app.workspace.openLinkText(fileName, '', true);
		
		console.log(`[Purse Plugin] 已创建文件: ${fileName}, 日期: ${dateStr}`);
	}

}

