import { App, Modal, Setting, TFolder } from 'obsidian';
import { t } from './translations';
import GridExplorerPlugin from '../main';
import { GridView } from './GridView';

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

        // 如果有 GridView 實例，禁用其鍵盤導航
        if (this.gridView) {
            this.gridView.disableKeyboardNavigation();
        }

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
            await this.app.fileManager.renameFile(this.folder, this.newName);
            // 重新渲染視圖
            setTimeout(() => {
                this.gridView.render();
            }, 100);
        } catch (error) {
            console.error('Failed to rename folder', error);
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();

        // 如果有 GridView 實例，重新啟用其鍵盤導航
        if (this.gridView) {
            this.gridView.enableKeyboardNavigation();
        }
    }
}