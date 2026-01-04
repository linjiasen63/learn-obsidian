import { App, PluginSettingTab, Setting } from 'obsidian';
import AccountPlugin from '../main';

export class AccountSettingsTab extends PluginSettingTab {
	plugin: AccountPlugin;

	constructor(app: App, plugin: AccountPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', {}, el => el.setText('账单管理设置'));

		new Setting(containerEl)
			.setName('货币符号')
			.setDesc('设置显示的货币符号（如 ¥、$、€ 等）')
			.addText(text => {
				text.setPlaceholder('¥');
				text.setValue(this.plugin.settings.currency || '¥');
				text.onChange(async (value) => {
					this.plugin.settings.currency = value || '¥';
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('默认分类')
			.setDesc('添加账单时的默认分类')
			.addText(text => {
				text.setPlaceholder('其他');
				text.setValue(this.plugin.settings.defaultCategory || '其他');
				text.onChange(async (value) => {
					this.plugin.settings.defaultCategory = value || '其他';
					await this.plugin.saveSettings();
				});
			});
	}
}

