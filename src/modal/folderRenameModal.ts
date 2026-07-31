import { App, Modal, TFolder, normalizePath, Notice } from 'obsidian';
import GridExplorerPlugin from '../main';
import { GridView } from '../GridView';
import { t } from '../translations';

export function showFolderRenameModal(app: App, plugin: GridExplorerPlugin, folder: TFolder, gridView: GridView) {
    new FolderRenameModal(app, plugin, folder, gridView).open();
}

// A generic name input modal that can be reused (e.g., for creating folders)
export class NameInputModal extends Modal {
    titleText: string;
    descText?: string;
    confirmText: string;
    cancelText: string;
    value: string;
    onSubmit: (value: string) => void;

    constructor(app: App, options: {
        title: string;
        description?: string;
        defaultValue?: string;
        confirmText?: string;
        cancelText?: string;
        onSubmit: (value: string) => void;
    }) {
        super(app);
        this.titleText = options.title;
        this.descText = options.description;
        this.confirmText = options.confirmText ?? t('confirm');
        this.cancelText = options.cancelText ?? t('cancel');
        this.value = options.defaultValue ?? '';
        this.onSubmit = options.onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // 標題
        contentEl.createEl('h2', { text: this.titleText });

        // 如果有描述文字
        if (this.descText) {
            contentEl.createEl('p', { text: this.descText, cls: 'setting-item-description' });
        }

        // 輸入框容器與輸入框
        const inputContainer = contentEl.createDiv('ge-input-field-container');
        const input = inputContainer.createEl('input', {
            type: 'text',
            value: this.value,
            cls: 'ge-input-field'
        });

        // 按鈕容器
        const buttonContainer = contentEl.createDiv('ge-button-container');
        const submitButton = buttonContainer.createEl('button', {
            text: this.confirmText,
            cls: 'mod-cta'
        });
        const cancelButton = buttonContainer.createEl('button', {
            text: this.cancelText
        });

        const performSubmit = () => {
            const val = input.value.trim();
            this.onSubmit(val);
            this.close();
        };

        submitButton.addEventListener('click', performSubmit);
        cancelButton.addEventListener('click', () => this.close());

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSubmit();
            }
        });

        // 自動聚焦與選取
        input.focus();
        input.select();
    }
}

export function showNameInputModal(app: App, options: {
    title: string;
    description?: string;
    defaultValue?: string;
    confirmText?: string;
    cancelText?: string;
    onSubmit: (value: string) => void;
}) {
    new NameInputModal(app, options).open();
}

export class FolderRenameModal extends Modal {
    plugin: GridExplorerPlugin;
    folder: TFolder;
    gridView: GridView;
    newName: string;

    constructor(app: App, plugin: GridExplorerPlugin, folder: TFolder, gridView: GridView) {
        super(app);
        this.plugin = plugin;
        this.folder = folder;
        this.gridView = gridView;
        this.newName = folder.name;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // 標題
        contentEl.createEl('h2', { text: t('rename_folder') });

        // 輸入框容器與輸入框
        const inputContainer = contentEl.createDiv('ge-input-field-container');
        const input = inputContainer.createEl('input', {
            type: 'text',
            value: this.folder.name,
            placeholder: t('enter_new_folder_name'),
            cls: 'ge-input-field'
        });

        // 按鈕容器
        const buttonContainer = contentEl.createDiv('ge-button-container');
        const submitButton = buttonContainer.createEl('button', {
            text: t('confirm'),
            cls: 'mod-cta'
        });
        const cancelButton = buttonContainer.createEl('button', {
            text: t('cancel')
        });

        const performSubmit = () => {
            this.newName = input.value.trim();
            void this.renameFolder();
            this.close();
        };

        submitButton.addEventListener('click', performSubmit);
        cancelButton.addEventListener('click', () => this.close());

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSubmit();
            }
        });

        // 自動聚焦與選取
        input.focus();
        input.select();
    }

    async renameFolder() {
        try {
            const parentPath = this.folder.parent ? this.folder.parent.path : '';
            const newPath = normalizePath(parentPath ? `${parentPath}/${this.newName}` : this.newName);
            await this.app.fileManager.renameFile(this.folder, newPath);
            // 重新渲染視圖
            window.setTimeout(() => {
                if (this.plugin.settings.folderDisplayStyle !== 'show') {
                    void this.gridView.setSource('folder', newPath || '/');
                } else {
                    void this.gridView.render();
                }
            }, 100);
        } catch (error) {
            new Notice('Failed to rename folder');
            console.error('Failed to rename folder', error);
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}