import { App, Modal, TFolder, TFile, FuzzySuggestModal } from 'obsidian';
import GridExplorerPlugin from '../main';
import { showSearchInputModal, showUriInputModal, SearchOptions } from './inputModal';
import { isDocumentFile } from '../utils/fileUtils';
import { t } from '../translations';

interface ShortcutOption {
    type: 'mode' | 'folder' | 'file' | 'search' | 'uri';
    value: string;
    display: string;
    searchOptions?: SearchOptions;
}

export class ShortcutSelectionModal extends Modal {
    plugin: GridExplorerPlugin;
    onSubmit: (option: ShortcutOption) => void;

    constructor(app: App, plugin: GridExplorerPlugin, onSubmit: (option: ShortcutOption) => void) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // 添加標題
        contentEl.createEl('h2', { text: t('create_shortcut') });

        // 資料夾選擇按鈕
        const folderButton = contentEl.createDiv('shortcut-option-button');
        folderButton.createSpan({ text: `📂 ${t('select_folder')}` });

        // 點擊資料夾按鈕時打開資料夾選擇模態框
        folderButton.addEventListener('click', () => {
            new FolderSuggestionModal(this.app, (folder) => {
                // 當選擇資料夾後，調用回調並關閉模態框
                this.onSubmit({
                    type: 'folder',
                    value: folder.path,
                    display: `📂 ${folder.name}`
                });
                this.close();
            }).open();
        });

        // 檔案選擇按鈕
        const fileButton = contentEl.createDiv('shortcut-option-button');
        fileButton.createSpan({ text: `📄 ${t('select_file')}` });

        // 點擊檔案按鈕時打開檔案選擇模態框
        fileButton.addEventListener('click', () => {
            new FileSuggestionModal(this.app, (file) => {
                // 當選擇檔案後，調用回調並關閉模態框
                this.onSubmit({
                    type: 'file',
                    value: file.path,
                    display: `📄 ${file.basename}`
                });
                this.close();
            }).open();
        });

        // 搜尋文字按鈕
        const searchButton = contentEl.createDiv('shortcut-option-button');
        searchButton.createSpan({ text: `🔎 ${t('search_text')}` });

        // 點擊搜尋按鈕時打開搜尋輸入模態框
        searchButton.addEventListener('click', () => {
            showSearchInputModal(this.app, (searchText, searchOptions) => {
                this.onSubmit({
                    type: 'search',
                    value: searchText,
                    display: `🔎 ${searchText}`,
                    searchOptions: searchOptions
                });
                this.close();
            });
        });

        // URI 按鈕
        const uriButton = contentEl.createDiv('shortcut-option-button');
        uriButton.createSpan({ text: `🌐 ${t('enter_uri')}` });

        // 點擊 URI 按鈕時打開 URI 輸入模態框
        uriButton.addEventListener('click', () => {
            showUriInputModal(this.app, (uri) => {
                // 為顯示生成友好的名稱
                let displayName: string;
                try {
                    if (uri.startsWith('obsidian://')) {
                        // 嘗試提取 vault 參數
                        const vaultMatch = uri.match(/[?&]vault=([^&]+)/);
                        if (vaultMatch) {
                            const vaultName = decodeURIComponent(vaultMatch[1]);
                            displayName = `🌐 Obsidian Link (${vaultName})`;
                        } else {
                            displayName = '🌐 Obsidian Link';
                        }
                    } else if (uri.startsWith('http://') || uri.startsWith('https://')) {
                        const url = new URL(uri);
                        let domain = url.hostname;
                        if (domain.startsWith('www.')) {
                            domain = domain.substring(4);
                        }
                        displayName = `🌐 ${domain}`;
                    } else if (uri.startsWith('file://')) {
                        displayName = '🌐 Local File';
                    } else {
                        const protocolMatch = uri.match(/^([^:]+):/);
                        if (protocolMatch) {
                            displayName = `🌐 ${protocolMatch[1].toUpperCase()} Link`;
                        } else {
                            displayName = `🌐 ${uri.substring(0, 20)}${uri.length > 20 ? '...' : ''}`;
                        }
                    }
                } catch (error) {
                    displayName = `🌐 ${uri.substring(0, 20)}${uri.length > 20 ? '...' : ''}`;
                }

                this.onSubmit({
                    type: 'uri',
                    value: uri,
                    display: displayName
                });
                this.close();
            });
        });

        contentEl.createEl('p');
        
        // 初始化模式選項，先添加自定義模式
        const modeOptions: ShortcutOption[] = [];

        // 添加所有自定義模式
        this.plugin.settings.customModes.forEach(mode => {
            modeOptions.push({
                type: 'mode',
                value: mode.internalName,
                display: `${mode.icon} ${mode.displayName}`
            });
        });

        // 添加內建模式
        modeOptions.push(
            { type: 'mode', value: 'bookmarks', display: `📑 ${t('bookmarks_mode')}` },
            { type: 'mode', value: 'search', display: `🔍 ${t('search_results')}` },
            { type: 'mode', value: 'backlinks', display: `🔗 ${t('backlinks_mode')}` },
            { type: 'mode', value: 'outgoinglinks', display: `🔗 ${t('outgoinglinks_mode')}` },
            { type: 'mode', value: 'all-files', display: `📔 ${t('all_files_mode')}` },
            { type: 'mode', value: 'recent-files', display: `📅 ${t('recent_files_mode')}` },
            { type: 'mode', value: 'random-note', display: `🎲 ${t('random_note_mode')}` },
            { type: 'mode', value: 'tasks', display: `☑️ ${t('tasks_mode')}` }
        );

        if (modeOptions.length > 0) {
            // 創建區塊容器
            const section = contentEl.createDiv('shortcut-section');

            // 為每個選項創建按鈕
            modeOptions.forEach(option => {
                const button = section.createDiv('shortcut-option-button');

                // 添加顯示文字
                button.createSpan({ text: option.display });

                // 點擊事件處理
                button.addEventListener('click', () => {
                    this.onSubmit(option);
                    this.close();
                });
            });
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// 選擇資料夾
class FolderSuggestionModal extends FuzzySuggestModal<TFolder> {
    onSubmit: (folder: TFolder) => void;

    constructor(app: App, onChoose: (folder: TFolder) => void) {
        super(app);
        this.onSubmit = onChoose;
    }

    // 獲取所有可選的資料夾
    getItems(): TFolder[] {
        return this.app.vault.getAllLoadedFiles().filter((file): file is TFolder => file instanceof TFolder);
    }

    // 獲取資料夾的顯示文本
    getItemText(folder: TFolder): string {
        return folder.path;
    }

    // 當選擇資料夾時調用
    onChooseItem(folder: TFolder, evt: MouseEvent | KeyboardEvent) {
        this.onSubmit(folder);
    }
}

// 選擇檔案
class FileSuggestionModal extends FuzzySuggestModal<TFile> {
    // 提交回調函數
    onSubmit: (file: TFile) => void;

    constructor(app: App, onChoose: (file: TFile) => void) {
        super(app);
        this.onSubmit = onChoose;
    }

    // 獲取所有可選的檔案（僅文件檔）
    getItems(): TFile[] {
        return this.app.vault.getFiles().filter((file) => isDocumentFile(file));
    }

    // 獲取檔案的顯示文本
    getItemText(file: TFile): string {
        return file.path;
    }

    // 當選擇檔案時調用
    onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent) {
        this.onSubmit(file);
    }
}
