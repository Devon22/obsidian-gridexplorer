import { App, TFile } from 'obsidian';
import GridExplorerPlugin from './main';
import { GridView } from './GridView';
import { isDocumentFile, isMediaFile } from './utils/fileUtils';

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
                        const isDocAllowed = isDocumentFile(file) && this.gridView.includeMedia !== 'media-only';
                        const isMediaAllowed = isMediaFile(file) && !!this.gridView.includeMedia;
                        if (isDocAllowed || isMediaAllowed) {
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
                        const isDocAllowed = isDocumentFile(file) && this.gridView.includeMedia !== 'media-only';
                        const isMediaAllowed = isMediaFile(file) && !!this.gridView.includeMedia;
                        if (isDocAllowed || isMediaAllowed) {
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
                        // 如果刪除的檔案剛好是目前正在預覽的檔案，應隱藏預覽
                        if (this.gridView.isShowingNote || this.gridView.isShowingZip) {
                            const currentFile = this.gridView.previewManager.getCurrentFile();
                            if (currentFile && file.path === currentFile.path) {
                                if (this.gridView.isShowingNote) {
                                    this.gridView.hideNoteInGrid();
                                } else {
                                    this.gridView.hideZipInGrid();
                                }
                            }
                        }

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
                    // 如果重命名的檔案是目前正在預覽的檔案，需要更新預覽標題與內容
                    if (this.gridView.isShowingNote || this.gridView.isShowingZip) {
                        const currentFile = this.gridView.previewManager.getCurrentFile();
                        if (currentFile && (file === currentFile || currentFile.path === oldPath || currentFile.path === file.path)) {
                            if (this.gridView.isShowingNote) {
                                // 更新頂部標題文字
                                const titleEl = this.gridView.noteViewContainer?.querySelector('.ge-note-title');
                                if (titleEl) {
                                    titleEl.textContent = file.basename;
                                }
                                // 更新預覽內容（這會重新讀取並渲染，順便更新內部的第一行標題與 backlinks）
                                void this.gridView.previewManager.updateCurrentPreview();
                            } else if (this.gridView.isShowingZip) {
                                // ZIP 預覽：更新頂部標題文字
                                const titleEl = this.gridView.zipViewContainer?.querySelector('.ge-zip-title');
                                if (titleEl) {
                                    titleEl.textContent = file.basename;
                                }
                            }
                        }
                    }

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
        const bookmarks = this.app.internalPlugins.plugins.bookmarks;
        if (bookmarks?.instance) {
            this.plugin.registerEvent(
                bookmarks.instance.on('changed', () => {
                    if (this.gridView.sourceMode === 'bookmarks') {
                        this.scheduleRender();
                    }
                })
            );
        }

        // 監聽當前開啟的檔案變更，讀取反向連結
        this.plugin.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                if (this.gridView.searchQuery !== '') return;
                const sourceMode = this.gridView.sourceMode;

                if (file instanceof TFile) {
                    // 處理反向連結和出向連結
                    if (sourceMode === 'backlinks' || sourceMode === 'outgoinglinks') {
                        // 若分頁已釘選，維持鎖定的目標檔案，不跟著切換（與內建反向連結行為一致）
                        if (!this.gridView.isPinned() && this.gridView.sourcePath !== file.path) {
                            this.gridView.sourcePath = file.path;
                            this.scheduleRender();
                        }
                        return;
                    }

                    // 處理自訂模式，僅當查詢包含 this.file 時才觸發
                    if (sourceMode.startsWith('custom-')) {
                        const mode = this.plugin.settings.customModes.find(m => m.internalName === sourceMode);
                        if (mode) {
                            const hasThisFile = mode.dataviewQuery.includes('this.file') || 
                                (mode.options && mode.options.some(opt => opt.dataviewQuery.includes('this.file')));
                            if (hasThisFile) {
                                this.scheduleRender();
                            }
                        }
                    }
                } else if (file === null) {
                    // 當 file 為 null，代表切換到非檔案檢視，交由 active-leaf-change 處理
                }
            })
        );

        // 監聽 active-leaf-change 來處理切回 GridView 或其他檢視的狀況
        this.plugin.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                if (!leaf || !leaf.view) return;
                const view = leaf.view;
                // 忽略自己被設為活動的事件，避免自我循環與自我清空
                if (view === this.gridView) return;

                // 忽略側邊欄的活動分頁變更，避免切換側邊欄頁籤或點擊側邊欄時，反向連結被清空
                const isSidebarLeaf = leaf.getRoot() === this.app.workspace.leftSplit ||
                    leaf.getRoot() === this.app.workspace.rightSplit;
                if (isSidebarLeaf) return;

                if (this.gridView.searchQuery !== '') return;

                const sourceMode = this.gridView.sourceMode;
                if (sourceMode === 'backlinks' || sourceMode === 'outgoinglinks') {
                    if (this.gridView.isPinned()) return;

                    let newSourcePath = '';
                    if (view.getViewType() === 'grid-view') {
                        const activeGridView = view as unknown as Record<string, unknown>;
                        const previewedFile = activeGridView.previewedFile;
                        if (activeGridView.isShowingNote === true && previewedFile instanceof TFile) {
                            newSourcePath = previewedFile.path;
                        }
                    } else if ('file' in view && view.file instanceof TFile) {
                        newSourcePath = view.file.path;
                    }

                    // 如果 sourcePath 有改變，就更新並重新渲染
                    if (this.gridView.sourcePath !== newSourcePath) {
                        this.gridView.sourcePath = newSourcePath;
                        this.scheduleRender();
                    }
                }
            })
        );

        // 監聽其他 GridView 在網格內預覽筆記的事件（GridPreviewManager.showNoteInGrid/hideNoteInGrid）
        // 讓側邊欄的反向連結/外部連結模式能跟著預覽的筆記更新，行為與內建反向連結面板一致
        this.plugin.registerEvent(
            (this.app.workspace as unknown as {
                on(name: 'ge-preview-file-change', callback: (file: TFile | null, sourceView: unknown) => void): import('obsidian').EventRef
            }).on('ge-preview-file-change', (file, sourceView) => {
                // 忽略自己觸發的事件，避免自我循環
                if (sourceView === this.gridView) return;
                if (this.gridView.searchQuery !== '') return;

                const sourceMode = this.gridView.sourceMode;
                if (sourceMode !== 'backlinks' && sourceMode !== 'outgoinglinks') return;

                // 若分頁已釘選，維持鎖定的目標檔案，不跟著切換
                if (this.gridView.isPinned()) return;

                if (file instanceof TFile) {
                    this.gridView.sourcePath = file.path;
                    this.scheduleRender();
                } else if (file === null) {
                    this.gridView.sourcePath = '';
                    this.scheduleRender();
                }
            })
        );
    }

    public renderPending = false;

    public performPendingRender() {
        if (this.renderPending) {
            this.renderPending = false;
            this.scheduleRender();
        }
    }

    // 以 200ms 去抖動的方式排程 render，避免短時間內大量重繪
    private scheduleRender = (delay: number = 200): void => {
        // 若分頁被釘選或正在顯示筆記/ZIP，暫停重新渲染，但標記為待更新
        if ((this.gridView.isPinned() && this.gridView.sourceMode === 'backlinks') || 
            this.gridView.isShowingNote || this.gridView.isShowingZip) {
            this.renderPending = true;
            return;
        }
        if(this.gridView.sourceMode === 'recent-files' && this.gridView.containerEl.offsetParent === null) {
            return;
        }
        if (this.renderTimer !== null) {
            window.clearTimeout(this.renderTimer);
        }
        // 200ms 延遲，可視需求調整
        this.renderTimer = window.setTimeout((): void => {
            void this.gridView.render();
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
