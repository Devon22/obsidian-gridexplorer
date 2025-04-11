import { Plugin, TFolder, TFile, App, Menu } from 'obsidian';
import { GridView } from './src/GridView';
import { showFolderSelectionModal } from './src/FolderSelectionModal';
import { showNoteColorSettingsModal } from './src/NoteColorSettingsModal';
import { GallerySettings, DEFAULT_SETTINGS, GridExplorerSettingTab } from './src/settings';
import { t } from './src/translations';
import { updateCustomDocumentExtensions } from './src/fileUtils';

export default class GridExplorerPlugin extends Plugin {
    settings: GallerySettings;
    statusBarItem: HTMLElement;
    app: App;

    async onload() {
        await this.loadSettings();

        // 註冊視圖類型
        this.registerView(
            'grid-view',
            (leaf) => new GridView(leaf, this)
        );

        // 註冊設定頁面
        this.addSettingTab(new GridExplorerSettingTab(this.app, this));

        // 註冊開啟視圖指令
        this.addCommand({
            id: 'open-grid-view',
            name: t('open_grid_view'),
            callback: () => {
                showFolderSelectionModal(this.app, this);
            }
        });

        // 註冊開啟當前筆記指令
        this.addCommand({
            id: 'view-current-note-in-grid-view',
            name: t('open_note_in_grid_view'),
            callback: () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    this.openNoteInFolder(activeFile);
                } else {
                    // 如果沒有當前筆記，則打開根目錄
                    this.openNoteInFolder(this.app.vault.getRoot());
                }
            }
        });

        // 註冊開啟反向連結指令
        this.addCommand({
            id: 'view-backlinks-in-grid-view',
            name: t('open_backlinks_in_grid_view'),
            callback: () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    this.activateView('backlinks');
                } else {
                    // 如果沒有當前筆記，則打開根目錄
                    this.openNoteInFolder(this.app.vault.getRoot());
                }
            }
        });

        // 註冊開啟最近筆記指令
        this.addCommand({
            id: 'view-recent-files-in-grid-view',
            name: t('open_recent_files_in_grid_view'),
            callback: () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    this.openNoteInRecentFiles(activeFile);
                } else {
                    // 如果沒有當前筆記，則打開根目錄
                    this.openNoteInFolder(this.app.vault.getRoot());
                }
            }
        });

        // 新增 Ribbon 圖示
        this.addRibbonIcon('grid', t('open_grid_view'), () => {
            showFolderSelectionModal(this.app, this);
        });

        // 註冊狀態列項目
        this.statusBarItem = this.addStatusBarItem();
        this.statusBarItem.onClickEvent(() => {
            this.activateView();
        });

        // 註冊資料夾的右鍵選單
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu: Menu, file) => {
                if (file instanceof TFolder) {
                    menu.addItem(item => {
                        item
                            .setTitle(t('open_in_grid_view'))
                            .setIcon('grid')
                            .setSection?.("open")
                            .onClick(() => {
                                this.openNoteInFolder(file);
                            });
                    });
                }
                if (file instanceof TFile) {
                    menu.addItem(item => {
                        item.setTitle(t('open_in_grid_view'));
                        item.setIcon('grid');
                        item.setSection?.("open");
                        const ogSubmenu: Menu = (item as any).setSubmenu();
                        ogSubmenu.addItem((item) => {
                            item
                                .setTitle(t('open_note_in_grid_view'))
                                .setIcon('folder')
                                .onClick(() => {
                                    this.openNoteInFolder(file);
                                });
                        });
                        if (this.settings.showBacklinksMode) {
                            ogSubmenu.addItem((item) => {
                                item
                                    .setTitle(t('open_backlinks_in_grid_view'))
                                    .setIcon('paperclip')
                                    .onClick(() => {
                                        this.app.workspace.getLeaf().openFile(file);
                                        setTimeout(() => {
                                            this.activateView('backlinks');
                                        }, 100);
                                    });
                            });
                        }
                        if (this.settings.showRecentFilesMode && file instanceof TFile) {
                            ogSubmenu.addItem((item) => {
                                item
                                    .setTitle(t('open_recent_files_in_grid_view'))
                                    .setIcon('calendar-days')
                                    .onClick(() => {
                                        this.openNoteInRecentFiles(file);
                                    });
                            });
                        }
                    });
                    menu.addItem((item) => {
                        item
                            .setTitle(t('set_note_color'))
                            .setIcon('palette')
                            .onClick(() => {
                                showNoteColorSettingsModal(this.app, this, file);
                            });
                    });
                }
            })
        );

        // 註冊編輯器選單
        this.registerEvent(
            this.app.workspace.on('editor-menu', (menu: Menu, editor) => {
                if (editor.somethingSelected()) {
                    const selectedText = editor.getSelection();
                    // 截斷過長的文字，最多顯示 20 個字元
                    const truncatedText = selectedText.length > 20 ? selectedText.substring(0, 20) + '...' : selectedText;
                    const menuItemTitle = t('search_selection_in_grid_view').replace('...', `「${truncatedText}」`); // 假設翻譯中有...代表要替換的部分，或者直接格式化

                    menu.addItem(item => {
                        item
                            .setTitle(menuItemTitle)
                            .setIcon('search')
                            .setSection?.("view")
                            .onClick(async () => {
                                const selectedText = editor.getSelection();
                                // 取得或啟用 GridView
                                const view = await this.activateView('folder','/');
                                if (view instanceof GridView) {
                                    // 設定搜尋模式和關鍵字
                                    view.searchQuery = selectedText;
                                    // 設定搜尋範圍 (預設搜尋所有檔案，不含媒體)
                                    view.searchAllFiles = true;
                                    view.searchMediaFiles = false;
                                    // 重新渲染視圖
                                    view.render(true); // resetScroll = true
                                }
                            });
                    });
                }
            })
        );
    }

    async openNoteInRecentFiles(file: TFile) {
        const view = await this.activateView('recent-files') as GridView;
        // 如果是文件，等待視圖渲染完成後捲動到該文件位置
        if (file instanceof TFile) {
            // 等待下一個事件循環以確保視圖已完全渲染
            setTimeout(() => {
                const gridContainer = view.containerEl.querySelector('.ge-grid-container') as HTMLElement;
                if (!gridContainer) return;
                
                // 找到對應的網格項目
                const gridItem = Array.from(gridContainer.querySelectorAll('.ge-grid-item')).find(
                    item => (item as HTMLElement).dataset.filePath === file.path
                ) as HTMLElement;
                
                if (gridItem) {
                    // 捲動到該項目的位置
                    gridItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // 選中該項目
                    const itemIndex = view.gridItems.indexOf(gridItem);
                    if (itemIndex >= 0) {
                        view.selectItem(itemIndex);
                    }
                }
            }, 100);
        }
    }

    async openNoteInFolder(file: TFile | TFolder = this.app.vault.getRoot()) {
        // 如果是文件，使用其父資料夾路徑
        const folderPath = file ? (file instanceof TFile ? file.parent?.path : file.path) : "/";
        const view = await this.activateView('folder', folderPath) as GridView;
        
        // 如果是文件，等待視圖渲染完成後捲動到該文件位置
        if (file instanceof TFile) {
            // 等待下一個事件循環以確保視圖已完全渲染
            setTimeout(() => {
                const gridContainer = view.containerEl.querySelector('.ge-grid-container') as HTMLElement;
                if (!gridContainer) return;
                
                // 找到對應的網格項目
                const gridItem = Array.from(gridContainer.querySelectorAll('.ge-grid-item')).find(
                    item => (item as HTMLElement).dataset.filePath === file.path
                ) as HTMLElement;
                
                if (gridItem) {
                    // 捲動到該項目的位置
                    gridItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // 選中該項目
                    const itemIndex = view.gridItems.indexOf(gridItem);
                    if (itemIndex >= 0) {
                        view.selectItem(itemIndex);
                    }
                }
            }, 100);
        }
    }

    async activateView(mode = 'bookmarks', path = '') {
        const { workspace } = this.app;

        let leaf = null;
        const leaves = workspace.getLeavesOfType('grid-view');

        // 如果設定為重用現有的leaf且存在已開啟的 grid-view，則使用第一個
        if (this.settings.reuseExistingLeaf && leaves.length > 0) {
            leaf = leaves[0];
        } else {
            // 根據設定選擇開啟位置
            switch (this.settings.defaultOpenLocation) {
                case 'left':
                    leaf = workspace.getLeftLeaf(false);
                    break;
                case 'right':
                    leaf = workspace.getRightLeaf(false);
                    break;
                case 'tab':
                default:
                    leaf = workspace.getLeaf('tab');
                    break;
            }
        }
        
        // 確保 leaf 不為 null
        if (!leaf) {
            // 如果無法獲取指定位置的 leaf，則回退到新分頁
            leaf = workspace.getLeaf('tab');
        }
        
        await leaf.setViewState({ type: 'grid-view', active: true });

        // 設定資料來源
        if (leaf.view instanceof GridView) {
            await leaf.view.setSource(mode, path);
        }

        // 確保視圖是活躍的
        workspace.revealLeaf(leaf);
        return leaf.view;
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        updateCustomDocumentExtensions(this.settings);
    }

    async saveSettings(update = true) {
        await this.saveData(this.settings);
        updateCustomDocumentExtensions(this.settings);
        
        // 當設定變更時，更新所有開啟的 GridView 實例
        if (update) {
            const leaves = this.app.workspace.getLeavesOfType('grid-view');
            leaves.forEach(leaf => {
                if (leaf.view instanceof GridView) {
                    // 重新渲染視圖以套用新設定
                    leaf.view.render();
                }
            });
        }
    }
}