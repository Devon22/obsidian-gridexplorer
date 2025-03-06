import { TFile, App } from 'obsidian';
import GridExplorerPlugin from '../main';
import { GridView } from './GridView';

//檔案監聽器
export class FileWatcher {
    private plugin: GridExplorerPlugin;
    private gridView: GridView;
    private app: App;

    constructor(plugin: GridExplorerPlugin, gridView: GridView) {
        this.plugin = plugin;
        this.gridView = gridView;
        this.app = plugin.app;
    }

    registerFileWatcher() {
        // 只有在設定啟用時才註冊檔案監聽器
        if (!this.plugin.settings.enableFileWatcher) {
            return;
        }
    
        this.plugin.registerEvent(
            this.app.vault.on('create', (file) => {
                if (file instanceof TFile) {
                    if (this.gridView.sourceMode === 'folder' && this.gridView.sourcePath && this.gridView.searchQuery === '') {
                        const fileDirPath = file.path.split('/').slice(0, -1).join('/') || '/';
                        if (fileDirPath === this.gridView.sourcePath) {
                            this.gridView.render();
                        } 
                    } else {
                        this.gridView.render();
                    }
                }
            })
        );
    
        this.plugin.registerEvent(
            this.app.vault.on('delete', (file) => {
                if (file instanceof TFile) {
                    if (this.gridView.sourceMode === 'folder' && this.gridView.sourcePath && this.gridView.searchQuery === '') {
                        const fileDirPath = file.path.split('/').slice(0, -1).join('/') || '/';
                        if (fileDirPath === this.gridView.sourcePath) {
                            this.gridView.render();
                        } 
                    } else {
                        this.gridView.render();
                    }
                }
            })
        );
    
        //更名及檔案移動
        this.plugin.registerEvent(
            this.app.vault.on('rename', (file, oldPath) => {
                if (file instanceof TFile) {
                    if (this.gridView.sourceMode === 'folder' && this.gridView.sourcePath && this.gridView.searchQuery === '') {
                        const fileDirPath = file.path.split('/').slice(0, -1).join('/') || '/';
                        const oldDirPath = oldPath.split('/').slice(0, -1).join('/') || '/';
                        if (fileDirPath === this.gridView.sourcePath || oldDirPath === this.gridView.sourcePath) {
                            this.gridView.render();
                        } 
                    } else {
                        this.gridView.render();
                    }
                }
            })
        );
    
        // 處理書籤變更
        this.plugin.registerEvent(
            (this.app as any).internalPlugins.plugins.bookmarks.instance.on('changed', () => {
                if (this.gridView.sourceMode === 'bookmarks') {
                    this.gridView.render();
                }
            })
        );
    }
    
}
