import { App, Modal, Setting, TFolder, TFile } from 'obsidian';
import { t } from './translations';
import GridExplorerPlugin from '../main';
import { GridView } from './GridView';

export interface FolderNoteSettings {
    sort: string;
    color: string;
}

export function showFolderNoteSettingsModal(app: App, plugin: GridExplorerPlugin, folder: TFolder) {
    new FolderNoteSettingsModal(app, plugin, folder).open();
}

export class FolderNoteSettingsModal extends Modal {
    plugin: GridExplorerPlugin;
    folder: TFolder;
    settings: FolderNoteSettings = {
        sort: '',
        color: ''
    };
    existingFile: TFile | null = null;
    
    constructor(app: App, plugin: GridExplorerPlugin, folder: TFolder) {
        super(app);
        this.plugin = plugin;
        this.folder = folder;
        
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
                frontmatter['sort'] = this.settings.sort;
                frontmatter['color'] = this.settings.color;
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
