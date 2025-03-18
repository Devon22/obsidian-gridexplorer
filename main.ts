import { Plugin, TFolder, TFile, App } from 'obsidian';
import { GridView } from './src/GridView';
import { showFolderSelectionModal } from './src/FolderSelectionModal';
import { GallerySettings, DEFAULT_SETTINGS, GridExplorerSettingTab } from './src/settings';
import { t } from './src/translations';

// 插件類型定義
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

        // 註冊指令
        this.addCommand({
            id: 'open-grid-view',
            name: t('open_grid_view'),
            callback: () => {
                showFolderSelectionModal(this.app, this);
            }
        });

        this.addCommand({
            id: 'view-current-note-in-grid-view',
            name: t('view_current_note_in_grid_view'),
            callback: () => {
                this.viewCurrentNoteInGridView();
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
            this.app.workspace.on('file-menu', (menu, file) => {
                if (file instanceof TFolder || file instanceof TFile) {
                    menu.addItem((item) => {
                        item
                            .setTitle(t('open_in_grid_view'))
                            .setIcon('grid')
                            .onClick(() => {
                                this.openInGridView(file);
                            });
                    });
                }
            })
        );
    }

    // 獲取當前頁面並嘗試打開
    // 如果獲取失敗，打開根目錄
    viewCurrentNoteInGridView() {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            this.openInGridView(activeFile);
        } else {
            // 如果沒有當前筆記，則打開根目錄
            this.openInGridView(this.app.vault.getRoot());
        }
    }

    openInGridView(file: TFile | TFolder = this.app.vault.getRoot()) {
        // 如果是文件，使用其父資料夾路徑
        const folderPath = file ? (file instanceof TFile ? file.parent?.path : file.path) : "/";
        this.activateView('folder', folderPath);
    }

    async activateView(mode = 'bookmarks', path = '') {
        const { workspace } = this.app;

        let leaf = null;
        const leaves = workspace.getLeavesOfType('grid-view');

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
        
        // 確保 leaf 不為 null
        if (!leaf) {
            // 如果無法獲取指定位置的 leaf，則回退到新分頁
            leaf = workspace.getLeaf('tab');
        }
        
        await leaf.setViewState({ type: 'grid-view', active: true });

        // 設定資料來源
        if (leaf.view instanceof GridView) {
            leaf.view.setSource(mode, path);
        }

        // 確保視圖是活躍的
        workspace.revealLeaf(leaf);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        
        // 當設定變更時，更新所有開啟的 GridView 實例
        const leaves = this.app.workspace.getLeavesOfType('grid-view');
        leaves.forEach(leaf => {
            if (leaf.view instanceof GridView) {
                // 重新渲染視圖以套用新設定
                leaf.view.render();
            }
        });
    }
}