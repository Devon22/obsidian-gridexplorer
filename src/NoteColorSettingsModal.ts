import { App, Modal, Setting, TFile } from 'obsidian';
import { t } from './translations';
import GridExplorerPlugin from '../main';
import { GridView } from './GridView';

export interface NoteColorSettings {
    color: string;
}

export function showNoteColorSettingsModal(app: App, plugin: GridExplorerPlugin, file: TFile | TFile[]) {
    new NoteColorSettingsModal(app, plugin, file).open();
}

export class NoteColorSettingsModal extends Modal {
    plugin: GridExplorerPlugin;
    files: TFile[];
    settings: NoteColorSettings = {
        color: ''
    };
    
    constructor(app: App, plugin: GridExplorerPlugin, file: TFile | TFile[]) {
        super(app);
        this.plugin = plugin;
        // 確保 files 是陣列
        this.files = Array.isArray(file) ? file : [file];
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // 讀取現有設定
        await this.loadExistingSettings();

        // 標題
        if (this.files.length > 1) {
            new Setting(contentEl).setName(t('note_color_settings') + ` (${this.files.length} ${t('files')})`).setHeading();
        } else {
            new Setting(contentEl).setName(t('note_color_settings') + `: ${this.files[0].basename}`).setHeading();
        }

        // 顏色選項
        new Setting(contentEl)
            .setName(t('note_color'))
            .setDesc(t('note_color_desc'))
            .addDropdown(dropdown => {
                dropdown
                    .addOption('', t('no_color'))
                    .addOption('red', t('color_red'))
                    .addOption('orange', t('color_orange'))
                    .addOption('yellow', t('color_yellow'))
                    .addOption('green', t('color_green'))
                    .addOption('cyan', t('color_cyan'))
                    .addOption('blue', t('color_blue'))
                    .addOption('purple', t('color_purple'))
                    .addOption('pink', t('color_pink'))
                    .setValue(this.settings.color)
                    .onChange(value => {
                        this.settings.color = value;
                    });
            });

        // 按鈕區域
        const buttonSetting = new Setting(contentEl);
        
        // 顯示確認按鈕在右側
        buttonSetting.addButton(button => {
            button
                .setButtonText(t('confirm'))
                .setCta() // 設置為主要按鈕樣式
                .onClick(() => {
                    this.saveNoteColor();
                    this.close();
                });
        });
    }

    // 讀取現有筆記的設定
    async loadExistingSettings() {
        try {
            // 如果有多個檔案，只讀取第一個檔案的設定作為預設值
            if (this.files.length > 0) {
                const fileCache = this.app.metadataCache.getFileCache(this.files[0]);
                if (fileCache && fileCache.frontmatter) {
                    // 讀取顏色設定
                    if ('color' in fileCache.frontmatter) {
                        this.settings.color = fileCache.frontmatter.color || '';
                    }
                }
            }
        } catch (error) {
            console.error('無法讀取筆記顏色設定', error);
        }
    }

    // 儲存筆記顏色設定
    async saveNoteColor() {
        try {
            // 為每個檔案更新顏色設定
            for (const file of this.files) {
                // 使用 fileManager.processFrontMatter 更新 frontmatter
                await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                    frontmatter['color'] = this.settings.color;
                });
            }
            
            // 等待一小段時間以確保 metadata cache 已更新
            setTimeout(() => {
                // 重新渲染所有 grid-view 視圖
                this.app.workspace.getLeavesOfType('grid-view').forEach(leaf => {
                    if (leaf.view instanceof GridView) {
                        leaf.view.render();
                    }
                });
            }, 200);
        } catch (error) {
            console.error('無法儲存筆記顏色設定', error);
        }
    }
}
