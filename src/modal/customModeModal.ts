import { App, Modal, Setting, Notice } from 'obsidian';
import GridExplorerPlugin from '../../main';
import { CustomMode } from '../settings';
import { t } from '../translations';

export class CustomModeModal extends Modal {
    plugin: GridExplorerPlugin;
    mode: CustomMode | null;
    onSubmit: (result: CustomMode) => void;

    constructor(app: App, plugin: GridExplorerPlugin, mode: CustomMode | null, onSubmit: (result: CustomMode) => void) {
        super(app);
        this.plugin = plugin;
        this.mode = mode;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: this.mode ? t('edit_custom_mode') : t('add_custom_mode') });

        let icon = this.mode ? this.mode.icon : '🧩';
        let displayName = this.mode ? this.mode.displayName : '';
        let dataviewCode = this.mode ? this.mode.dataviewCode : '';
        let enabled = this.mode ? (this.mode.enabled ?? true) : true;

        new Setting(contentEl)
        .setName(t('custom_mode_display_name'))
        .setDesc(t('custom_mode_display_name_desc'))
        .addText(text => {
            text.setValue(displayName)
                .onChange(value => {
                    displayName = value;
                });
        });

        new Setting(contentEl)
            .setName(t('custom_mode_icon'))
            .setDesc(t('custom_mode_icon_desc'))
            .addText(text => {
                text.setValue(icon)
                    .onChange(value => {
                        icon = value || '🧩';
                    });
            });

        const dvSetting = new Setting(contentEl)
            .setName(t('custom_mode_dataview_code'))
            .setDesc(t('custom_mode_dataview_code_desc'));

        // 使標題與描述佔據一行，輸入區域佔據了下一行
        dvSetting.settingEl.style.flexDirection = 'column';
        dvSetting.settingEl.style.alignItems = 'stretch';
        dvSetting.settingEl.style.gap = '0.5rem';

        dvSetting.addTextArea(text => {
            text.setValue(dataviewCode)
                .onChange(value => {
                    dataviewCode = value;
                });
            // 給TextArea有足夠的垂直空間和完整的寬度
            text.inputEl.setAttr('rows', 10);
            text.inputEl.style.width = '100%';
        });

        new Setting(contentEl)
            .addButton(button => {
                button.setButtonText(t('save'))
                    .setCta()
                    .onClick(() => {
                        if (!displayName.trim()) {
                            new Notice(t('display_name_cannot_be_empty'));
                            return;
                        }
                        const internalName = this.mode ? this.mode.internalName : `custom-${Date.now()}`;
                        this.onSubmit({
                            internalName,
                            icon,
                            displayName,
                            dataviewCode,
                            enabled
                        });
                        this.close();
                    });
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
