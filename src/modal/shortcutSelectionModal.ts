import { App, Modal, TFolder, TFile, FuzzySuggestModal } from 'obsidian';
import GridExplorerPlugin from '../main';
import { t } from '../translations';

interface ShortcutOption {
    type: 'mode' | 'folder' | 'file';
    value: string;
    display: string;
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
        folderButton.createSpan({ text: `📂 ${t('select_folder')}`});

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
        fileButton.createSpan({ text: `📄 ${t('select_file')}`});

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
            { type: 'mode', value: 'search', display: `🔎 ${t('search_results')}` },
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

    // 獲取所有可選的 Markdown 檔案
    getItems(): TFile[] {
        return this.app.vault.getMarkdownFiles();
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
