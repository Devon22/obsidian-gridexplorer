import { App, Modal, Setting, TFolder, TFile } from 'obsidian';
import GridExplorerPlugin from '../main';
import { GridView } from '../GridView';
import { t } from '../translations';

export interface FolderNoteSettings {
    sort: string;
    color: string;
    icon: string;
    isPinned: boolean;
    cardLayout: '' | 'horizontal' | 'vertical';
}

export function showFolderNoteSettingsModal(app: App, plugin: GridExplorerPlugin, folder: TFolder, gridView: GridView) {
    new FolderNoteSettingsModal(app, plugin, folder, gridView).open();
}

export class FolderNoteSettingsModal extends Modal {
    plugin: GridExplorerPlugin;
    folder: TFolder;
    gridView: GridView;
    settings: FolderNoteSettings = {
        sort: '',
        color: '',
        icon: '📁',
        isPinned: false,
        cardLayout: ''
    };
    existingFile: TFile | null = null;
    
    constructor(app: App, plugin: GridExplorerPlugin, folder: TFolder, gridView: GridView) {
        super(app);
        this.plugin = plugin;
        this.folder = folder;
        this.gridView = gridView;
        
        // 檢查同名筆記是否存在
        const notePath = `${folder.path}/${folder.name}.md`;
        const noteFile = this.app.vault.getAbstractFileByPath(notePath);
        if (noteFile instanceof TFile) {
            this.existingFile = noteFile;
        }
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        // 如果筆記已存在，讀取其設定
        if (this.existingFile) {
            await this.loadExistingSettings();
        }

        // 標題
        new Setting(contentEl).setName(t('folder_note_settings')).setHeading();

        // 排序選項
        new Setting(contentEl)
            .setName(t('folder_sort_type'))
            .setDesc(t('folder_sort_type_desc'))
            .addDropdown(dropdown => {
                dropdown
                    .addOption('', t('default'))
                    .addOption('name-asc', t('sort_name_asc'))
                    .addOption('name-desc', t('sort_name_desc'))
                    .addOption('mtime-desc', t('sort_mtime_desc'))
                    .addOption('mtime-asc', t('sort_mtime_asc'))
                    .addOption('ctime-desc', t('sort_ctime_desc'))
                    .addOption('ctime-asc', t('sort_ctime_asc'))
                    .addOption('random', t('sort_random'))
                    .setValue(this.settings.sort)
                    .onChange(value => {
                        this.settings.sort = value;
                    });
            });

        // 顏色選項
        // 檢查當前顏色是否為 HEX 格式
        const isCurrentColorHex = /^#([0-9A-Fa-f]{3}){1,2}$/.test(this.settings.color);
        
        new Setting(contentEl)
            .setName(t('folder_color'))
            .setDesc(t('folder_color_desc'))
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

        // 圖示選項
        const customFolderIcon = this.plugin.settings.customFolderIcon;
        new Setting(contentEl)
            .setName(t('folder_icon'))
            .setDesc(t('folder_icon_desc'))
            .addText(text => {
                text
                    .setPlaceholder(customFolderIcon)
                    .setValue(this.settings.icon || customFolderIcon)
                    .onChange(value => {
                        this.settings.icon = value || customFolderIcon;
                    });
            });

        // 卡片樣式選項
        new Setting(contentEl)
            .setName(t('card_layout'))
            .setDesc(t('card_layout_desc'))
            .addDropdown(drop => {
                drop.addOption('', t('default'));
                drop.addOption('horizontal', t('horizontal_card'));
                drop.addOption('vertical', t('vertical_card'));
                drop.setValue(this.settings.cardLayout);
                drop.onChange(async (value: 'horizontal' | 'vertical') => {
                    this.settings.cardLayout = value as any;
                });
            });

        // 置頂勾選框
        new Setting(contentEl)
            .setName(t('foldernote_pinned'))
            .setDesc(t('foldernote_pinned_desc'))
            .addToggle(toggle => {
                toggle
                    .setValue(this.settings.isPinned)
                    .onChange(value => {
                        this.settings.isPinned = value;
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
                    this.saveFolderNote();
                    this.close();
                });
        });
    }

    // 讀取現有筆記的設定
    async loadExistingSettings() {
        if (!this.existingFile) return;
        
        try {
            // 使用 metadataCache 讀取筆記的 frontmatter
            const fileCache = this.app.metadataCache.getFileCache(this.existingFile);
            if (fileCache && fileCache.frontmatter) {
                // 讀取排序設定
                if ('sort' in fileCache.frontmatter) {
                    this.settings.sort = fileCache.frontmatter.sort || '';
                }
                
                // 讀取顏色設定
                if ('color' in fileCache.frontmatter) {
                    this.settings.color = fileCache.frontmatter.color || '';
                }
                
                // 讀取圖示設定
                if ('icon' in fileCache.frontmatter) {
                    this.settings.icon = fileCache.frontmatter.icon || '📁';
                }            
                
                // 讀取卡片樣式設定
                if ('cardLayout' in fileCache.frontmatter) {
                    this.settings.cardLayout = fileCache.frontmatter.cardLayout || 'default';
                }
                
                // 讀取置頂設定
                if (fileCache.frontmatter?.pinned && Array.isArray(fileCache.frontmatter.pinned)) {
                    this.settings.isPinned = fileCache.frontmatter.pinned.some((item: any) => {
                        if (!item) return false;
                        const pinnedName = item.toString();
                        const pinnedNameWithoutExt = pinnedName.replace(/\.\w+$/, '');
                        return pinnedNameWithoutExt === this.folder.name;
                    });
                }           
            }
        } catch (error) {
            console.error('無法讀取資料夾筆記設定', error);
        }
    }

    // 儲存或更新資料夾筆記
    async saveFolderNote() {
        // 建立資料夾筆記路徑
        const notePath = `${this.folder.path}/${this.folder.name}.md`;
        
        try {
            let file: TFile;
            
            // 如果筆記已存在，更新它
            if (this.existingFile) {
                file = this.existingFile;
            } 
            // 否則建立新筆記
            else {
                // 建立筆記內容
                file = await this.app.vault.create(notePath, '');
                await this.app.workspace.getLeaf().openFile(file);  
            }
            
            // 使用 fileManager.processFrontMatter 更新 frontmatter
            await this.app.fileManager.processFrontMatter(file, (frontmatter) => {

                if (this.settings.sort) {
                    frontmatter['sort'] = this.settings.sort;
                } else {
                    delete frontmatter['sort'];
                }

                if (this.settings.color) {
                    frontmatter['color'] = this.settings.color;
                } else {
                    delete frontmatter['color'];
                }

                if (this.settings.icon && this.settings.icon !== '📁') {
                    frontmatter['icon'] = this.settings.icon;
                } else {
                    delete frontmatter['icon'];
                }
                
                if (this.settings.cardLayout) {
                    frontmatter['cardLayout'] = this.settings.cardLayout;
                } else {
                    delete frontmatter['cardLayout'];
                }
                
                const folderName = `${this.folder.name}.md`;
                if (this.settings.isPinned) {
                    // 如果原本就有 pinned 陣列，則添加或更新
                    if (Array.isArray(frontmatter['pinned'])) {
                        if (!frontmatter['pinned'].includes(folderName)) {
                            frontmatter['pinned'] = [folderName, ...frontmatter['pinned']];
                        }
                    } else {
                        // 如果沒有 pinned 陣列，則創建一個新的
                        frontmatter['pinned'] = [folderName];
                    }
                } else if (Array.isArray(frontmatter['pinned'])) {
                    // 如果取消置頂，則從陣列中移除
                    frontmatter['pinned'] = frontmatter['pinned'].filter(
                        (item: any) => item !== folderName
                    );
                    // 如果陣列為空，則刪除該欄位
                    if (frontmatter['pinned'].length === 0) {
                        delete frontmatter['pinned'];
                    }
                }
            });

            // 強制更新 metadata cache
            this.app.metadataCache.getFileCache(file);

            // 立刻通知 ExplorerView 更新（自訂事件）
            this.app.workspace.trigger('grid-explorer:folder-note-updated', this.folder.path);

            // 等待一小段時間以確保 metadata cache 已更新
            setTimeout(() => {
                // 重新渲染所有 grid-view 視圖
                this.app.workspace.getLeavesOfType('grid-view').forEach(leaf => {
                    if (leaf.view instanceof GridView) {
                        leaf.view.render();
                    }
                });
                // 再次通知（保險）
                this.app.workspace.trigger('grid-explorer:folder-note-updated', this.folder.path);
            }, 200);
        } catch (error) {
            console.error('無法儲存資料夾筆記', error);
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
