import { App, Modal, Setting, TFolder, normalizePath, Notice } from 'obsidian';
import GridExplorerPlugin from '../main';
import { GridView } from '../GridView';
import { t } from '../translations';

export function showFolderRenameModal(app: App, plugin: GridExplorerPlugin, folder: TFolder, gridView: GridView) {
    new FolderRenameModal(app, plugin, folder, gridView).open();
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
                if (!this.plugin.settings.showFolder) {
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