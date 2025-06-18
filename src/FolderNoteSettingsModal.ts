import { App, Modal, Setting, TFolder, TFile } from 'obsidian';
import { t } from './translations';
import GridExplorerPlugin from '../main';
import { GridView } from './GridView';

export interface FolderNoteSettings {
    sort: string;
    color: string;
    icon: string;
    isPinned: boolean;
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
        isPinned: false
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
                    .addOption('', t('default_sort'))
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
                    .setValue(this.settings.color)
                    .onChange(value => {
                        this.settings.color = value;
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

        // 置頂勾選框
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
            console.error('無法儲存資料夾筆記', error);
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
