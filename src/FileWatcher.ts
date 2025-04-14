import { App, TFile } from 'obsidian';
import GridExplorerPlugin from '../main';
import { GridView } from './GridView';
import { isDocumentFile, isMediaFile } from './fileUtils';
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
    
        //新增檔案
        this.plugin.registerEvent(
            this.app.vault.on('create', (file) => {
                if (file instanceof TFile) {
                    if(this.gridView.sourceMode === 'random-note' || this.gridView.sourceMode === 'bookmarks') {
                        return;
                    } else if (this.gridView.sourceMode === 'recent-files') {
                        if(isDocumentFile(file) || (isMediaFile(file) && this.gridView.randomNoteIncludeMedia)) {
                            this.gridView.render();
                        }
                    } else if (this.gridView.sourceMode === 'folder') {
                        if (this.gridView.sourcePath && this.gridView.searchQuery === '') {
                            const fileDirPath = file.path.split('/').slice(0, -1).join('/') || '/';
                            if (fileDirPath === this.gridView.sourcePath) {
                                this.gridView.render();
                            } 
                        }
                    } else {
                        this.gridView.render();
                    }
                }
            })
        );
    
        //刪除檔案
        this.plugin.registerEvent(
            this.app.vault.on('delete', (file) => {
                if (file instanceof TFile) {
                    if(this.gridView.sourceMode === 'random-note' || this.gridView.sourceMode === 'bookmarks') {
                        return;
                    } else if (this.gridView.sourceMode === 'recent-files') {
                        if(isDocumentFile(file) || (isMediaFile(file) && this.gridView.randomNoteIncludeMedia)) {
                            this.gridView.render();
                        }
                    } else if (this.gridView.sourceMode === 'folder') {
                        if (this.gridView.sourcePath && this.gridView.searchQuery === '') {
                            const fileDirPath = file.path.split('/').slice(0, -1).join('/') || '/';
                            if (fileDirPath === this.gridView.sourcePath) {
                                this.gridView.render();
                            } 
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
                    if(this.gridView.sourceMode === 'random-note') {
                        return;
                    } else if (this.gridView.sourceMode === 'folder') {
                        if (this.gridView.sourcePath && this.gridView.searchQuery === '') {
                            const fileDirPath = file.path.split('/').slice(0, -1).join('/') || '/';
                            const oldDirPath = oldPath.split('/').slice(0, -1).join('/') || '/';
                            if (fileDirPath === this.gridView.sourcePath || oldDirPath === this.gridView.sourcePath) {
                                this.gridView.render();
                            } 
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

        // 監聽當前開啟的檔案變更，讀取反向連結
        this.plugin.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                if (file instanceof TFile) {
                    if (this.gridView.sourceMode === 'backlinks' && this.gridView.searchQuery === '') {
                        this.gridView.render();
                    }
                }
            })
        );
    }
    
}
