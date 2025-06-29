import { App, Modal, Setting, Notice } from 'obsidian';
import { CustomMode } from './settings';
import { t } from './translations';
import GridExplorerPlugin from '../main';

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

        new Setting(contentEl)
            .setName(t('custom_mode_dataview_code'))
            .setDesc(t('custom_mode_dataview_code_desc'))
            .addTextArea(text => {
                text.setValue(dataviewCode)
                    .onChange(value => {
                        dataviewCode = value;
                    });
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
