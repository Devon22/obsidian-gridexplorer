import { App, Modal, Setting, TFolder, normalizePath, Notice } from 'obsidian';
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

        new Setting(contentEl)
            .setName(this.titleText)
            .setDesc(this.descText ?? '')
            .addText(text => {
                text
                    .setValue(this.value)
                    .onChange(value => {
                        this.value = value;
                    });

                // Focus and select current value for quick edit
                window.setTimeout(() => {
                    text.inputEl.focus();
                    text.inputEl.select();
                });

                // Submit on Enter key
                text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.value = text.getValue();
                        this.onSubmit(this.value.trim());
                        this.close();
                    }
                });
            });

        new Setting(contentEl)
            .addButton(button => {
                button
                    .setButtonText(this.confirmText)
                    .setCta()
                    .onClick(() => {
                        this.onSubmit(this.value.trim());
                        this.close();
                    });
            })
            .addButton(button => {
                button
                    .setButtonText(this.cancelText)
                    .onClick(() => {
                        this.close();
                    });
            });
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

        new Setting(contentEl)
            .setName(t('rename_folder'))
            .setDesc(t('enter_new_folder_name'))
            .addText(text => {
                text
                    .setValue(this.folder.name)
                    .onChange(value => {
                        this.newName = value;
                    });

                window.setTimeout(() => {
                    text.inputEl.focus();
                    text.inputEl.select();
                });

                text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.newName = text.getValue();
                        this.renameFolder();
                        this.close();
                    }
                });
            });

        new Setting(contentEl)
            .addButton(button => {
                button
                    .setButtonText(t('confirm'))
                    .setCta()
                    .onClick(() => {
                        this.renameFolder();
                        this.close();
                    });
            })
            .addButton(button => {
                button
                    .setButtonText(t('cancel'))
                    .onClick(() => {
                        this.close();
                    });
            });
    }

    async renameFolder() {
        try {
            const parentPath = this.folder.parent ? this.folder.parent.path : '';
            const newPath = normalizePath(parentPath ? `${parentPath}/${this.newName}` : this.newName);
            await this.app.fileManager.renameFile(this.folder, newPath);
            // 重新渲染視圖
            setTimeout(() => {
                if (this.plugin.settings.folderDisplayStyle !== 'show') {
                    this.gridView.setSource('folder', newPath || '/');
                } else {
                    this.gridView.render();
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