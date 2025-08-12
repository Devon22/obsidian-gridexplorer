import { App, TFile } from 'obsidian';
import GridExplorerPlugin from './main';
import { GridView } from './GridView';
import { isDocumentFile, isMediaFile } from './fileUtils';

//檔案監聽器
export class FileWatcher {
    private plugin: GridExplorerPlugin;
    private gridView: GridView;
    private app: App;
    private renderTimer: number | null = null; // 用於去抖動 render()

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
    
        //編輯檔案
        this.plugin.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file instanceof TFile) {
                    if (this.gridView.sourceMode === 'recent-files') {
                        if(isDocumentFile(file) || (isMediaFile(file) && this.gridView.includeMedia)) {
                            this.scheduleRender(5000);
                        }
                    }
                }
            })
        );

        //新增檔案
        this.plugin.registerEvent(
            this.app.vault.on('create', (file) => {
                if (file instanceof TFile) {
                    if(this.gridView.searchQuery && !this.gridView.searchCurrentLocationOnly) {
                        this.scheduleRender(2000);
                        return;
                    }
                    if(this.gridView.sourceMode === 'random-note') {
                        return;
                    } else if (this.gridView.sourceMode === 'recent-files') {
                        if(isDocumentFile(file) || (isMediaFile(file) && this.gridView.includeMedia)) {
                            this.scheduleRender(2000);
                        }
                    } else if (this.gridView.sourceMode === 'folder') {
                        if (this.gridView.sourcePath) {
                            const fileDirPath = file.path.split('/').slice(0, -1).join('/') || '/';
                            if (fileDirPath === this.gridView.sourcePath) {
                                this.scheduleRender();
                            }
                        } 
                    } else if (this.gridView.sourceMode === 'backlinks') {
                        if(isDocumentFile(file)) {
                            this.scheduleRender();
                        }
                    } else {
                        this.scheduleRender();
                    }
                }
            })
        );
    
        //刪除檔案
        this.plugin.registerEvent(
            this.app.vault.on('delete', (file) => {
                if (file instanceof TFile) {
                    // 如果有 GridView 實例
                    if (this.gridView) {
                        // 找到當前檔案在 GridView 中的索引
                        const gridItemIndex = this.gridView.gridItems.findIndex((item: HTMLElement) => 
                            item.dataset.filePath === file.path
                        );

                        // 如果找到了對應的項目，移除項目
                        if (gridItemIndex >= 0) {
                            this.gridView.gridItems[gridItemIndex].remove();
                            this.gridView.gridItems.splice(gridItemIndex, 1);
                            const gridContainer = this.gridView.containerEl.querySelector('.ge-grid-container') as HTMLElement;
                            this.cleanupDateDividers(gridContainer);
                        }
                    }
                }
            })
        );
    
        //更名及檔案移動
        this.plugin.registerEvent(
            this.app.vault.on('rename', (file, oldPath) => {
                if (file instanceof TFile) {
                    const fileDirPath = file.path.split('/').slice(0, -1).join('/') || '/';
                    const oldDirPath = oldPath.split('/').slice(0, -1).join('/') || '/';
                    // 來源與目標路徑不同，表示移動檔案
                    if (fileDirPath !== oldDirPath) {
                        if (this.gridView.sourceMode === 'folder') {
                            if (this.gridView.sourcePath && this.gridView.searchQuery === '') {
                                if (fileDirPath === this.gridView.sourcePath || oldDirPath === this.gridView.sourcePath) {
                                    this.scheduleRender();
                                    return;
                                } 
                            }
                        }
                    }

                    // 來源與目標路徑相同，表示更改檔名
                    if (this.gridView) {
                        // 找到當前GridView中的索引
                        const gridItemIndex = this.gridView.gridItems.findIndex((item: HTMLElement) => 
                            item.dataset.filePath === oldPath
                        );

                        // 如果找到了對應的項目，更改title和path
                        if (gridItemIndex >= 0) {
                            const getitle = this.gridView.gridItems[gridItemIndex].querySelector('.ge-grid-item .ge-title');
                            if (getitle) {
                                this.gridView.gridItems[gridItemIndex].dataset.filePath = file.path;
                                getitle.textContent = file.basename;
                                getitle.setAttribute('title', file.basename);
                            }
                        }
                    }
                }
            })
        );
    
        // 處理書籤變更
        this.plugin.registerEvent(
            (this.app as any).internalPlugins.plugins.bookmarks.instance.on('changed', () => {
                if (this.gridView.sourceMode === 'bookmarks') {
                    this.scheduleRender();
                }
            })
        );

        // 監聽當前開啟的檔案變更，讀取反向連結
        this.plugin.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                if (file instanceof TFile && this.gridView.searchQuery === '') {
                    const sourceMode = this.gridView.sourceMode;

                    // 處理反向連結和出向連結
                    if (sourceMode === 'backlinks' || sourceMode === 'outgoinglinks') {
                        this.scheduleRender();
                        return;
                    }

                    // 處理自訂模式，僅當腳本包含 dv.current 時才觸發
                    if (sourceMode.startsWith('custom-')) {
                        const mode = this.plugin.settings.customModes.find(m => m.internalName === sourceMode);
                        if (mode && mode.dataviewCode.includes('dv.current')) {
                            this.scheduleRender();
                        }
                    }
                }
            })
        );
    }

    // 以 200ms 去抖動的方式排程 render，避免短時間內大量重繪
    private scheduleRender = (delay: number = 200): void => {
        // 若分頁被釘選或正在顯示筆記，暫停重新渲染
        if ((this.gridView.isPinned() && this.gridView.sourceMode === 'backlinks') || 
            this.gridView.isShowingNote) {
            return;
        }
        if(this.gridView.sourceMode === 'recent-files' && this.gridView.containerEl.offsetParent === null) {
            return;
        }
        if (this.renderTimer !== null) {
            clearTimeout(this.renderTimer);
        }
        // 200ms 延遲，可視需求調整
        this.renderTimer = window.setTimeout((): void => {
            this.gridView.render();
            this.renderTimer = null;
        }, delay);
    }

    // 清理日期分隔線
    private cleanupDateDividers(container: HTMLElement | null): void {
        if (!container) return;
        
        const dateDividers = Array.from(container.querySelectorAll('.ge-date-divider'));
        
        for (let i = dateDividers.length - 1; i >= 0; i--) {
            const currentDivider = dateDividers[i];
            const nextDivider = dateDividers[i + 1];
            let nextElement = currentDivider.nextElementSibling;
            let hasItemsBetween = false;
            
            while (nextElement && (!nextDivider || nextElement !== nextDivider)) {
                if (!(nextElement as HTMLElement).classList.contains('ge-date-divider')) {
                    hasItemsBetween = true;
                    break;
                }
                nextElement = nextElement.nextElementSibling;
            }
            
            if (!nextDivider) {
                hasItemsBetween = currentDivider.nextElementSibling !== null;
            }
            
            if (!hasItemsBetween) {
                currentDivider.remove();
            }
        }
    }
}
