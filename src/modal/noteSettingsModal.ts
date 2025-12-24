import { App, Modal, Setting, TFile } from 'obsidian';
import GridExplorerPlugin from '../main';
import { GridView } from '../GridView';
import { t } from '../translations';

export interface NoteSettings {
    title: string;
    summary: string;
    color: string;
    isPinned: boolean;
    isMinimized: boolean;
    isHidden: boolean;
}

export function showNoteSettingsModal(app: App, plugin: GridExplorerPlugin, file: TFile | TFile[]) {
    new NoteSettingsModal(app, plugin, file).open();
}

export class NoteSettingsModal extends Modal {
    plugin: GridExplorerPlugin;
    files: TFile[];
    settings: NoteSettings = {
        title: '',
        summary: '',
        color: '',
        isPinned: false,
        isMinimized: false,
        isHidden: false,
    };
    private initialIsPinned: boolean = false; // 記錄初始的 isPinned 狀態
    
    constructor(app: App, plugin: GridExplorerPlugin, file: TFile | TFile[]) {
        super(app);
        this.plugin = plugin;
        this.files = Array.isArray(file) ? file : [file]; // 確保 files 是陣列
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // 讀取現有設定
        await this.loadAttributes();

        // 標題
        if (this.files.length > 1) {
            new Setting(contentEl).setName(t('note_attribute_settings') + ` (${this.files.length} ${t('files')})`).setHeading();
        } else {
            new Setting(contentEl).setName(t('note_attribute_settings') + `: ${this.files[0].basename}`).setHeading();
        }

        if (this.files.length === 1 && this.files[0].extension === "md") {
            // 自訂標題選項 
            new Setting(contentEl)
                .setName(t('note_title'))
                .setDesc(t('note_title_desc'))
                .addText(text => {
                    text.setValue(this.settings.title);
                    text.onChange(value => {
                        this.settings.title = value;
                    });
                });
            // 自訂筆記摘要
            new Setting(contentEl)
                .setName(t('note_summary'))
                .setDesc(t('note_summary_desc'))
                .addText(text => {
                    text.setValue(this.settings.summary);
                    text.onChange(value => {
                        this.settings.summary = value;
                    });
                });
        }

        // 顏色選項
        if (this.files[0].extension === "md") {
            // 檢查當前顏色是否為 HEX 格式
            const isCurrentColorHex = /^#([0-9A-Fa-f]{3}){1,2}$/.test(this.settings.color);
            
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
                        .addOption('custom', t('color_custom'))
                        .setValue(isCurrentColorHex ? 'custom' : this.settings.color)
                        .onChange(value => {
                            // 如果選擇的不是「自訂顏色」，則更新顏色值並清空 HEX 輸入框
                            if (value !== 'custom') {
                                this.settings.color = value;
                                if (hexInput) {
                                    hexInput.setValue('');
                                }
                            }
                        });
                });

            // HEX 自訂顏色輸入欄位
            let hexInput: any;
            const hexSetting = new Setting(contentEl)
                .setName(t('custom_hex_color'))
                .setDesc(t('custom_hex_color_desc'))
                .addText(text => {
                    hexInput = text;
                    text.setPlaceholder('#FF8800 or #F80')
                        .setValue(isCurrentColorHex ? this.settings.color : '')
                        .onChange(value => {
                            // 驗證 HEX 格式
                            if (value && /^#([0-9A-Fa-f]{3}){1,2}$/.test(value)) {
                                this.settings.color = value;
                                // 移除錯誤樣式
                                text.inputEl.removeClass('ge-input-error');
                            } else if (value && value.trim() !== '') {
                                // 顯示錯誤樣式但不更新 color
                                text.inputEl.addClass('ge-input-error');
                            } else {
                                // 空值時清除錯誤樣式
                                text.inputEl.removeClass('ge-input-error');
                                if (value === '') {
                                    this.settings.color = '';
                                }
                            }
                        });
                });
        }

        // 置頂勾選框
        if (this.files[0].parent && this.files[0].parent !== this.app.vault.getRoot()) {
            new Setting(contentEl)
                .setName(t('pinned'))
                .setDesc(t('pinned_desc'))
                .addToggle(toggle => {
                    toggle
                        .setValue(this.settings.isPinned)
                        .onChange(value => {
                            this.settings.isPinned = value;
                        });
                });
        }

        // 最小化顯示切換
        let minimizedToggle: any;
        let hiddenToggle: any;
        
        if (this.files[0].extension === "md") {
            new Setting(contentEl)
                .setName(t('display_minimized'))
                .setDesc(t('display_minimized_desc'))
                .addToggle(toggle => {
                    minimizedToggle = toggle;
                    toggle
                        .setValue(this.settings.isMinimized)
                        .onChange(value => {
                            this.settings.isMinimized = value;
                            if (value && this.settings.isHidden) {
                                this.settings.isHidden = false;
                                if (hiddenToggle) hiddenToggle.setValue(false);
                            }
                        });
                });
        }

        // 隱藏檔案切換
        if (this.files[0].extension === "md") {
            new Setting(contentEl)
                .setName(t('display_hidden'))
                .setDesc(t('display_hidden_desc'))
                .addToggle(toggle => {
                    hiddenToggle = toggle;
                    toggle
                        .setValue(this.settings.isHidden)
                        .onChange(value => {
                            this.settings.isHidden = value;
                            if (value && this.settings.isMinimized) {
                                this.settings.isMinimized = false;
                                if (minimizedToggle) minimizedToggle.setValue(false);
                            }
                        });
                });
        }

        // 按鈕區域
        const buttonSetting = new Setting(contentEl);
        
        // 支援多檔案時仍顯示新增重定向筆記按鈕
        buttonSetting.addButton(button => {
            button
                .setButtonText(t('create_shortcut'))
                .onClick(async () => {
                    await this.createShortcut();
                });
        });
        
        // 顯示確認按鈕在右側
        buttonSetting.addButton(button => {
            button
                .setButtonText(t('confirm'))
                .setCta() // 設置為主要按鈕樣式
                .onClick(() => {
                    this.saveAttributes();
                    this.close();
                });
        });
    }

    // 創建重定向筆記
    private async createShortcut() {
        try {
            for (const originalFile of this.files) {
                const originalName = originalFile.basename;
                const extension = originalFile.extension;

                // 生成不重複的新檔案路徑
                let counter = 0;
                let redirectName = `📄 ${originalName}`;
                let newPath = `${originalFile.parent?.path || ''}/${redirectName}.${extension}`;
                while (this.app.vault.getAbstractFileByPath(newPath)) {
                    counter++;
                    redirectName = `${originalName} ${counter}`;
                    newPath = `${originalFile.parent?.path || ''}/${redirectName}.${extension}`;
                }

                // 創建新檔案（先不包含 frontmatter）
                const newFile = await this.app.vault.create(newPath, '');

                // 使用 processFrontMatter 來更新 frontmatter
                await this.app.fileManager.processFrontMatter(newFile, (frontmatter: any) => {
                    // 設置 redirect 和 summary
                    const link = this.app.fileManager.generateMarkdownLink(originalFile, "");
                    frontmatter.type = "file";
                    frontmatter.redirect = link;
                });
            }

            // 等待一小段時間以確保 metadata cache 已更新
            setTimeout(() => {}, 200);

            // 關閉 modal
            this.close();

        } catch (error) {
            console.error('Create redirect note error', error);
        }
    }

    // 讀取現有筆記的設定
    async loadAttributes() {
        try {
            // 讀取自訂標題設定
            if (this.files.length === 1) {
                const fileCache = this.app.metadataCache.getFileCache(this.files[0]);
                if (fileCache && fileCache.frontmatter) {
                    const titleField = this.plugin.settings.noteTitleField || 'title';
                    if (fileCache.frontmatter[titleField]) {
                        this.settings.title = fileCache.frontmatter[titleField] || '';
                    }
                    const summaryField = this.plugin.settings.noteSummaryField || 'summary';
                    if (fileCache.frontmatter[summaryField]) {
                        this.settings.summary = fileCache.frontmatter[summaryField] || '';
                    }
                }
            }

            // 如果有多個檔案，只讀取第一個檔案的設定作為預設值
            if (this.files.length > 0) {
                const fileCache = this.app.metadataCache.getFileCache(this.files[0]);
                if (fileCache && fileCache.frontmatter) {
                    // 讀取顏色設定
                    if ('color' in fileCache.frontmatter) {
                        this.settings.color = fileCache.frontmatter.color || '';
                    }
                    // 讀取最小化設定
                    if (fileCache.frontmatter.display === 'minimized') {
                        this.settings.isMinimized = true;
                    }
                    // 讀取隱藏設定
                    if (fileCache.frontmatter.display === 'hidden') {
                        this.settings.isHidden = true;
                    }
                }
            }

            // 讀取置頂設定
            const folder = this.files[0].parent;
            if (folder && folder !== this.app.vault.getRoot()) {
                const notePath = `${folder.path}/${folder.name}.md`;
                const noteFile = this.app.vault.getAbstractFileByPath(notePath);
                if (noteFile instanceof TFile) {
                    const fm = this.app.metadataCache.getFileCache(noteFile)?.frontmatter;
                    if (fm && Array.isArray(fm['pinned'])) {
                        this.settings.isPinned = fm['pinned'].includes(this.files[0].name);
                    }
                }
                // 保存初始的 isPinned 狀態
                this.initialIsPinned = this.settings.isPinned;
            }
        } catch (error) {
            console.error('無法讀取筆記屬性設定', error);
        }
    }

    // 儲存筆記屬性設定
    async saveAttributes() {
        try {
            if (this.files.length === 1 && this.files[0].extension === "md") {
                // 使用 fileManager.processFrontMatter 更新 frontmatter
                await this.app.fileManager.processFrontMatter(this.files[0], (frontmatter) => {
                    const titleField = this.plugin.settings.noteTitleField || 'title';
                    if (this.settings.title) {
                        frontmatter[titleField] = this.settings.title;
                    } else {
                        delete frontmatter[titleField];
                    }
                    const summaryField = this.plugin.settings.noteSummaryField || 'summary';
                    if (this.settings.summary) {
                        frontmatter[summaryField] = this.settings.summary;
                    } else {
                        delete frontmatter[summaryField];
                    }
                    if (this.settings.color) {
                        frontmatter['color'] = this.settings.color;
                    } else {
                        delete frontmatter['color'];
                    }
                    if (this.settings.isHidden) {
                        frontmatter['display'] = 'hidden';
                    } else if (this.settings.isMinimized) {
                        frontmatter['display'] = 'minimized';
                    } else {
                        if (frontmatter['display'] === 'minimized' || frontmatter['display'] === 'hidden') delete frontmatter['display'];
                    }
                });
            }

            // 為每個檔案更新顏色設定
            if (this.files.length > 1) {
                for (const file of this.files) {
                    if (file.extension === "md") {
                        // 使用 fileManager.processFrontMatter 更新 frontmatter
                        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                            if (this.settings.color) {
                                frontmatter['color'] = this.settings.color;
                            } else {
                                delete frontmatter['color'];
                            }
                            if (this.settings.isHidden) {
                                frontmatter['display'] = 'hidden';
                            } else if (this.settings.isMinimized) {
                                frontmatter['display'] = 'minimized';
                            } else {
                                if (frontmatter['display'] === 'minimized' || frontmatter['display'] === 'hidden') delete frontmatter['display'];
                            }
                        });
                    }
                }
            }
            
            // 等待一小段時間以確保 metadata cache 已更新
            setTimeout(() => {}, 200);
            
            // 只有在 isPinned 有變更時才更新資料夾筆記的 pinned 欄位
            if (this.initialIsPinned !== this.settings.isPinned) {
                for (const file of this.files) {
                    const folder = file.parent;
                    if (!folder || folder === this.app.vault.getRoot()) continue;
                    const notePath = `${folder.path}/${folder.name}.md`;
                    let noteFile = this.app.vault.getAbstractFileByPath(notePath);

                    // 如果資料夾筆記不存在，先建立一個空白檔案並加上 frontmatter
                    if (!(noteFile instanceof TFile)) {
                        const initialFrontmatter = this.settings.isPinned ? `pinned:\n  - ${file.name}\n` : '';
                        const initialContent = `---\n${initialFrontmatter}---\n`;
                        noteFile = await this.app.vault.create(notePath, initialContent);
                    }

                    // 此時 noteFile 一定是 TFile
                    await this.app.fileManager.processFrontMatter(noteFile as TFile, (frontmatter) => {
                        let list: string[] = Array.isArray(frontmatter['pinned']) ? frontmatter['pinned'] : [];
                        if (this.settings.isPinned) {
                            if (!list.includes(file.name)) list.push(file.name);
                        } else {
                            list = list.filter(n => n !== file.name);
                        }
                        if (list.length > 0) {
                            frontmatter['pinned'] = list;
                        } else {
                            delete frontmatter['pinned'];
                        }
                    });
                }
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
            console.error('無法儲存筆記屬性設定', error);
        }
    }
}
