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
        // 新增名稱欄位，用於原始 dataviewCode 的選項名稱
        let name = this.mode && (this.mode as any).name ? (this.mode as any).name : t('default');
        // 支援多個子選項，每個選項包含名稱與 Dataview 程式碼
        let options = this.mode?.options ? this.mode.options.map(opt => ({ ...opt })) : []; // 其他選項（不含 Default）
        // 向下相容：使用第一個選項作為主要 dataviewCode
        let dataviewCode = this.mode ? this.mode.dataviewCode : '';
        let enabled = this.mode ? (this.mode.enabled ?? true) : true;
        let fields = this.mode ? this.mode.fields : '';

        new Setting(contentEl)
            .setName(t('custom_mode_display_name'))
            .setDesc(t('custom_mode_display_name_desc'))
            .addText(text => {
                text.setValue(icon)
                    .onChange(value => {
                        icon = value || '🧩';
                    });
                // 設置固定寬度，適合單個圖示
                text.inputEl.style.width = '3em';
                text.inputEl.style.minWidth = '3em';
            })
            .addText(text => {
                text.setValue(displayName)
                    .onChange(value => {
                        displayName = value;
                    });
            });

        const dvSetting = new Setting(contentEl)
            .setName(t('custom_mode_dataview_code'))
            .setDesc(t('custom_mode_dataview_code_desc'));

        // 使標題與描述佔據一行，輸入區域佔據了下一行
        dvSetting.settingEl.style.flexDirection = 'column';
        dvSetting.settingEl.style.alignItems = 'stretch';
        dvSetting.settingEl.style.gap = '0.5rem';

        dvSetting.addText(text => {
            text.setValue(name)
                .setPlaceholder(t('default'))
                .onChange(v => name = v);
        });
        
        dvSetting.addTextArea(text => {
            text.setValue(dataviewCode)
                .onChange(value => {
                    dataviewCode = value;
                })
                .setPlaceholder('Dataview JS code');
            // 給TextArea有足夠的垂直空間和完整的寬度
            text.inputEl.setAttr('rows', 6);
            text.inputEl.style.width = '100%';
        });

        dvSetting.addText(text => {
            text.setValue(fields || '')
                .setPlaceholder(t('custom_mode_fields_placeholder'))
                .onChange(value => {
                    fields = value;
                });
        });

        // 讓 Text 與 TextArea 在 control 區域各佔一行
        dvSetting.controlEl.style.display = 'flex';
        dvSetting.controlEl.style.flexDirection = 'column';
        dvSetting.controlEl.style.alignItems = 'stretch';
        dvSetting.controlEl.style.gap = '0.5rem';

        // ===== 選項管理區域 =====
        contentEl.createEl('h3', { text: t('custom_mode_sub_options') });
        const optionsContainer = contentEl.createDiv();

        const renderOptions = () => {
            optionsContainer.empty();
            options.forEach((opt, idx) => {
                const optSetting = new Setting(optionsContainer);
                // 使標題與描述佔據一行，輸入區域佔據了下一行
                optSetting.settingEl.style.flexDirection = 'column';
                optSetting.settingEl.style.alignItems = 'stretch';
                optSetting.settingEl.style.gap = '0.5rem';
                // 讓 Text 與 TextArea 在 control 區域各佔一行
                optSetting.controlEl.style.display = 'flex';
                optSetting.controlEl.style.flexDirection = 'column';
                optSetting.controlEl.style.alignItems = 'stretch';
                optSetting.controlEl.style.gap = '0.5rem';
                optSetting
                    .addText(text => {
                        text.setPlaceholder(t('option_name'))
                            .setValue(opt.name)
                            .onChange(val => {
                                opt.name = val;
                            });
                    })
                    .addTextArea(text => {
                        text.setPlaceholder('Dataview JS code')
                            .setValue(opt.dataviewCode)
                            .onChange(val => {
                                opt.dataviewCode = val;
                                
                            });
                        text.inputEl.setAttr('rows', 6);
                        text.inputEl.style.width = '100%';
                    })
                    .addText(text => {
                        text.setPlaceholder(t('custom_mode_fields_placeholder'))
                            .setValue(opt.fields || '')
                            .onChange(val => {
                                opt.fields = val;
                            });
                    });

                // 移除按鈕（至少保留一個）
                if (options.length > 0) {
                    optSetting.addExtraButton(btn => {
                        btn.setIcon('trash')
                            .setTooltip(t('remove'))
                            .onClick(() => {
                                options.splice(idx, 1);
                                if (idx === 0 && options.length > 0) {
                                    dataviewCode = options[0].dataviewCode;
                                }
                                renderOptions();
                            });
                    });
                }
            });
        };

        // 新增選項按鈕
        new Setting(contentEl)
            .addButton(btn => {
                btn.setButtonText(t('add_option'))
                    .onClick(() => {
                        options.push({ name: `${t('option')} ${options.length + 1}`, dataviewCode: '' });
                        renderOptions();
                    });
            });

        renderOptions();

        new Setting(contentEl)
            .addButton(button => {
                button.setButtonText(t('save'))
                    .setCta()
                    .onClick(() => {
                        if (!displayName.trim()) displayName = t('untitled');
                        const internalName = this.mode ? this.mode.internalName : `custom-${Date.now()}`;
                        this.onSubmit({
                            internalName,
                            icon,
                            displayName,
                            name,
                            dataviewCode,
                            options: options,
                            enabled,
                            fields
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
