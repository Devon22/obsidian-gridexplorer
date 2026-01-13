import { WorkspaceLeaf, ItemView, TFolder, TFile, Menu, Notice, Platform, setIcon, getFrontMatterInfo, FrontMatterCache, normalizePath, setTooltip, MarkdownRenderer } from 'obsidian';
import GridExplorerPlugin from './main';
import { renderHeaderButton } from './renderHeaderButton';
import { renderModePath } from './renderModePath';
import { renderFolder } from './renderFolder';
import { renderFiles } from './renderFiles';
import { handleKeyDown } from './handleKeyDown';
import { isMediaFile, isImageFile, isVideoFile, isAudioFile, getFiles, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from './utils/fileUtils';
import { FileWatcher } from './fileWatcher';
import { findFirstImageInNote } from './utils/mediaUtils';
import { isHexColor, hexToRgba } from './utils/colorUtils';
import { showFolderSelectionModal } from './modal/folderSelectionModal';
import { MediaModal } from './modal/mediaModal';
import { showNoteSettingsModal } from './modal/noteSettingsModal';
import { FloatingAudioPlayer } from './floatingAudioPlayer';
import { ExplorerView, EXPLORER_VIEW_TYPE } from './ExplorerView';
import { t } from './translations';

// 定義分隔器狀態
interface DividerState { lastDateString: string; pinDividerAdded: boolean; blankDividerAdded: boolean; }

// 定義檔案渲染參數
interface FileRenderParams {
    container: HTMLElement;
    observer: IntersectionObserver;
    files: TFile[];
    dateDividerMode: string;
    sortType: string;
    shouldShowDateDividers: boolean;
    state: DividerState;
}

// 導入顏色輔助函數


// 定義網格視圖
export class GridView extends ItemView {
    plugin: GridExplorerPlugin;
    sourceMode: string = ''; // 模式選擇
    sourcePath: string = ''; // 用於資料夾模式的路徑
    baseSortType: string; // 使用者在設定或 UI 中選擇的基礎排序模式（不受資料夾臨時覆蓋影響）
    sortType: string; // 目前實際使用的排序模式（可能被資料夾 metadata 臨時覆蓋）
    searchQuery: string = ''; // 搜尋關鍵字
    searchCurrentLocationOnly: boolean = false; // 是否只搜尋當前位置
    searchFilesNameOnly: boolean = false; // 是否只搜尋筆記名稱
    searchMediaFiles: boolean = false; // 是否搜尋媒體檔案
    includeMedia: boolean = false; // 是否包含媒體檔案
    selectedItemIndex: number = -1; // 當前選中的項目索引
    selectedItems: Set<number> = new Set(); // 存儲多選的項目索引
    gridItems: HTMLElement[] = []; // 存儲所有網格項目的引用
    hasKeyboardFocus: boolean = false; // 是否有鍵盤焦點
    fileWatcher: FileWatcher; // 檔案監聽器
    recentSources: string[] = []; // 歷史記錄
    futureSources: string[] = []; // 未來紀錄（前進堆疊）
    minMode: boolean = false; // 最小模式
    showIgnoredItems: boolean = false; // 顯示忽略的資料夾及檔案
    showDateDividers: boolean = false; // 顯示日期分隔器
    showNoteTags: boolean = false; // 顯示筆記標籤
    pinnedList: string[] = []; // 置頂清單
    taskFilter: string = 'uncompleted'; // 任務分類
    hideHeaderElements: boolean = false; // 是否隱藏標題列元素（模式名稱和按鈕）
    customOptionIndex: number = -1; // 自訂模式選項索引    
    baseCardLayout: 'horizontal' | 'vertical' = 'horizontal'; // 使用者在設定或 UI 中選擇的基礎卡片樣式（不受資料夾臨時覆蓋影響）
    cardLayout: 'horizontal' | 'vertical' = 'horizontal'; // 目前實際使用的卡片樣式（可能被資料夾 metadata 臨時覆蓋）
    renderToken: number = 0; // 用於取消尚未完成之批次排程的遞增令牌
    isShowingNote: boolean = false; // 是否正在顯示筆記
    noteViewContainer: HTMLElement | null = null; // 筆記檢視容器
    eventCleanupFunctions: (() => void)[] = []; // 存儲事件清理函數

    constructor(leaf: WorkspaceLeaf, plugin: GridExplorerPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.containerEl.addClass('ge-grid-view-container');
        this.baseSortType = this.plugin.settings.defaultSortType; // 使用設定中的預設排序模式
        this.sortType = this.baseSortType;
        this.baseCardLayout = this.plugin.settings.cardLayout;
        this.cardLayout = this.baseCardLayout;
        this.showDateDividers = this.plugin.settings.dateDividerMode !== 'none';
        this.showNoteTags = this.plugin.settings.showNoteTags;
        this.searchCurrentLocationOnly = this.plugin.settings.searchCurrentLocationOnly;
        this.searchFilesNameOnly = this.plugin.settings.searchFilesNameOnly;
        this.searchMediaFiles = this.plugin.settings.searchMediaFiles;

        // 根據設定決定是否註冊檔案變更監聽器
        if (this.plugin.settings.enableFileWatcher) {
            this.fileWatcher = new FileWatcher(plugin, this);
            this.fileWatcher.registerFileWatcher();
        }

        // 在 window 層級以捕獲階段攔截 Alt+ArrowLeft，優先阻擋 Obsidian 內建快捷鍵
        this.registerDomEvent(window, 'keydown', (event: KeyboardEvent) => {
            if (event.key === 'ArrowLeft' && event.altKey) {
                // 僅在本視圖為活動視圖時才處理
                if (this.app.workspace.getActiveViewOfType(GridView) !== this) return;
                // 與一般鍵盤邏輯相同的防護：顯示筆記中或有 modal 時不處理
                if (this.isShowingNote) return;
                if (document.querySelector('.modal-container')) return;
                // 僅在資料夾模式且不是根目錄時才後退
                if (this.sourceMode === 'folder' && this.sourcePath && this.sourcePath !== '/') {
                    // 阻止內建快捷鍵與其他監聽器
                    event.preventDefault();
                    // 停止後續所有監聽器（包含 Obsidian 內建 hotkey）
                    if (typeof (event as any).stopImmediatePropagation === 'function') {
                        (event as any).stopImmediatePropagation();
                    } else {
                        event.stopPropagation();
                    }
                    const parentPath = this.sourcePath.split('/').slice(0, -1).join('/') || '/';
                    this.setSource('folder', parentPath);
                    this.clearSelection();
                }
            } else if (event.key === 'ArrowRight' && event.altKey) {
                // Alt + 右鍵：若有選中項目則模擬點擊（例如開啟/預覽）
                // 僅在本視圖為活動視圖時才處理
                if (this.app.workspace.getActiveViewOfType(GridView) !== this) return;
                // 與一般鍵盤邏輯相同的防護：顯示筆記中或有 modal 時不處理
                if (this.isShowingNote) return;
                if (document.querySelector('.modal-container')) return;
                if (this.selectedItemIndex >= 0 && this.selectedItemIndex < this.gridItems.length) {
                    // 阻止可能的其他快捷鍵或後續處理，避免重複觸發
                    event.preventDefault();
                    if (typeof (event as any).stopImmediatePropagation === 'function') {
                        (event as any).stopImmediatePropagation();
                    } else {
                        event.stopPropagation();
                    }
                    this.gridItems[this.selectedItemIndex].click();
                }
            }
        }, true);

        // 註冊鍵盤事件處理
        this.registerDomEvent(document, 'keydown', (event: KeyboardEvent) => {
            // 只有當 GridView 是活動視圖時才處理鍵盤事件
            if (this.app.workspace.getActiveViewOfType(GridView) === this) {
                return handleKeyDown(this, event);
            }
        });

        // 監聽 dataview:index-ready
        this.registerEvent(
            (this.app.metadataCache as any).on('dataview:index-ready', () => {
                if (this.sourceMode.startsWith('custom-')) {
                    this.render();
                }
            })
        );
    }

    getViewType() {
        return 'grid-view';
    }

    getIcon() {
        if (this.sourceMode.startsWith('custom-')) {
            return 'puzzle';
        } else if (this.sourceMode === 'bookmarks') {
            return 'bookmark';
        } else if (this.sourceMode === 'search') {
            return 'search';
        } else if (this.sourceMode === 'backlinks') {
            return 'links-coming-in';
        } else if (this.sourceMode === 'outgoinglinks') {
            return 'links-going-out';
        } else if (this.sourceMode === 'all-files') {
            return 'book-text';
        } else if (this.sourceMode === 'recent-files') {
            return 'calendar-days';
        } else if (this.sourceMode === 'random-note') {
            return 'dice';
        } else if (this.sourceMode === 'tasks') {
            return 'square-check-big';
        } else if (this.sourceMode === 'folder') {
            return 'folder';
        } else {
            return 'grid';
        }
    }

    getDisplayText() {
        if (this.sourceMode.startsWith('custom-')) {
            const mode = this.plugin.settings.customModes.find(m => m.internalName === this.sourceMode);
            return mode ? mode.displayName : t('custom_mode');
        } else if (this.sourceMode === '') {
            return t('grid_view_title');
        } else if (this.sourceMode === 'bookmarks') {
            return t('bookmarks_mode');
        } else if (this.sourceMode === 'search') {
            return t('search_results');
        } else if (this.sourceMode === 'backlinks') {
            return t('backlinks_mode');
        } else if (this.sourceMode === 'outgoinglinks') {
            return t('outgoinglinks_mode');
        } else if (this.sourceMode === 'all-files') {
            return t('all_files_mode');
        } else if (this.sourceMode === 'recent-files') {
            return t('recent_files_mode');
        } else if (this.sourceMode === 'random-note') {
            return t('random_note_mode');
        } else if (this.sourceMode === 'tasks') {
            return t('tasks_mode');
        } else if (this.sourceMode === 'folder') {
            if (this.sourcePath === '/') {
                return t('root');
            }
            return this.sourcePath;
        } else {
            return '';
        }
    }

    // 判斷當前Leaf是否被釘選
    isPinned(): boolean {
        return (this.leaf as any)?.pinned ?? false;
    }

    // 將來源加入歷史記錄
    // 1. 插入到陣列開頭，代表最新使用
    // 2. 超過上限時裁切
    public pushHistory(
        mode: string,
        path: string | null,
        searchQuery: string = '',
        searchCurrentLocationOnly: boolean = false,
        searchFilesNameOnly: boolean = false,
        searchMediaFiles: boolean = false,
    ) {
        const sanitizedPath = path ?? '';
        const key = JSON.stringify({
            mode,
            path: sanitizedPath,
            searchQuery,
            searchCurrentLocationOnly,
            searchFilesNameOnly,
            searchMediaFiles,
        });

        this.recentSources.unshift(key);
        // 一旦有新的歷史被推入，清空 futureSources
        this.futureSources = [];
        const limit = 10;
        if (this.recentSources.length > limit) {
            this.recentSources.length = limit;
        }
    }

    // 設定來源模式
    async setSource(
        mode: string,
        path = '',
        recordHistory = true, // 是否將當前狀態加入歷史記錄
        searchQuery?: string,
        searchCurrentLocationOnly?: boolean,
        searchFilesNameOnly?: boolean,
        searchMediaFiles?: boolean
    ) {

        // 如果新的狀態與當前狀態相同，則不進行任何操作
        if (this.sourceMode === mode &&
            this.sourcePath === path &&
            this.searchQuery === searchQuery &&
            this.searchCurrentLocationOnly === searchCurrentLocationOnly &&
            this.searchFilesNameOnly === searchFilesNameOnly &&
            this.searchMediaFiles === searchMediaFiles) {
            return;
        }

        // 記錄之前的狀態到歷史記錄中（如果有）
        if (this.sourceMode && recordHistory) {
            this.pushHistory(
                this.sourceMode,
                this.sourcePath,
                this.searchQuery,
                this.searchCurrentLocationOnly,
                this.searchFilesNameOnly,
                this.searchMediaFiles,
            );
        }

        // 全域搜尋時切換路徑則清空搜尋
        if (this.searchQuery && !this.searchCurrentLocationOnly) {
            this.searchQuery = '';
        }

        // 更新來源模式和路徑
        if (mode !== '') this.sourceMode = mode;
        if (path !== '') this.sourcePath = path;
        if (this.sourceMode === '') this.sourceMode = 'folder';
        if (this.sourcePath === '') this.sourcePath = '/';

        // 讀取Folder設定
        this.pinnedList = [];
        if (this.sourceMode === 'folder') {
            // 檢查是否有與資料夾同名的 md 檔案
            const folderName = this.sourcePath.split('/').pop() || '';
            const mdFilePath = `${this.sourcePath}/${folderName}.md`;
            const mdFile = this.app.vault.getAbstractFileByPath(mdFilePath);
            let tempLayout: 'horizontal' | 'vertical' = this.baseCardLayout;
            let folderSort: string | undefined;
            if (mdFile instanceof TFile) {
                const metadata = this.app.metadataCache.getFileCache(mdFile)?.frontmatter;
                folderSort = metadata?.sort;
                if (metadata?.cardLayout === 'horizontal' || metadata?.cardLayout === 'vertical') {
                    tempLayout = metadata.cardLayout as 'horizontal' | 'vertical';
                }
            }
            this.cardLayout = tempLayout;
            // 根據資料夾 frontmatter 的 sort 覆蓋實際排序，否則使用 baseSortType
            this.sortType = folderSort && typeof folderSort === 'string' && folderSort.trim() !== ''
                ? folderSort
                : this.baseSortType;
        } else {
            // 非資料夾模式時
            this.cardLayout = this.baseCardLayout; // 回復基礎卡片排列
            this.sourcePath = '/'; // 強制設定路徑為根目錄 (創建筆記用)

            // 切換到自訂模式時：重設選項索引，並將排序設為 'none'
            // 其餘模式：恢復使用 baseSortType 作為實際排序
            if (this.sourceMode.startsWith('custom-')) {
                this.customOptionIndex = -1;
                this.sortType = 'none';
            } else {
                this.sortType = this.baseSortType;
            }
        }

        // 設定搜尋相關狀態
        if (searchQuery !== undefined) {
            this.searchQuery = searchQuery;
        }
        if (searchCurrentLocationOnly !== undefined) {
            this.searchCurrentLocationOnly = searchCurrentLocationOnly;
        }
        if (searchFilesNameOnly !== undefined) {
            this.searchFilesNameOnly = searchFilesNameOnly;
        }
        if (searchMediaFiles !== undefined) {
            this.searchMediaFiles = searchMediaFiles;
        }

        // 通知 Obsidian 保存視圖狀態
        this.app.workspace.requestSaveLayout();

        // 發送自訂事件，通知 ExplorerView 目前來源已變更
        try {
            (this.app.workspace as any).trigger?.('ge-grid-source-changed', {
                mode: this.sourceMode,
                path: this.sourcePath,
            });
        } catch { }

        await this.render();
    }

    // 清理事件監聽器
    onunload() {
        // 清理所有事件監聽器
        this.eventCleanupFunctions.forEach(cleanup => {
            try {
                cleanup();
            } catch (error) {
                console.warn('GridExplorer: Error during event cleanup:', error);
            }
        });
        this.eventCleanupFunctions = [];

        // 清理檔案監聽器（FileWatcher 的事件監聽器會在插件卸載時自動清理）

        super.onunload();
    }

    // 渲染網格
    async render() {

        // 保存選中項目的檔案路徑（如果有）
        let selectedFilePath: string | null = null;
        if (this.selectedItemIndex >= 0 && this.selectedItemIndex < this.gridItems.length) {
            const selectedItem = this.gridItems[this.selectedItemIndex];
            selectedFilePath = selectedItem.dataset.filePath || null;
        }

        // 清理之前的事件監聽器
        this.eventCleanupFunctions.forEach(cleanup => {
            try {
                cleanup();
            } catch (error) {
                console.warn('GridExplorer: Error during event cleanup:', error);
            }
        });
        this.eventCleanupFunctions = [];

        // 清空整個容器
        this.containerEl.empty();

        // 添加頂部按鈕
        renderHeaderButton(this);

        // 顯示路徑 / 模式名稱
        renderModePath(this);

        // 創建內容區域
        const contentEl = this.containerEl.createDiv('view-content');


        // 取得置頂清單
        if (this.sourceMode === 'folder' && this.sourcePath !== '/') {
            this.pinnedList = [];
            const folderPath = this.sourcePath;
            if (!folderPath || folderPath === '/') return;
            const folderName = folderPath.split('/').pop() || '';
            const notePath = `${folderPath}/${folderName}.md`;
            const noteFile = this.app.vault.getAbstractFileByPath(notePath);
            if (noteFile instanceof TFile) {
                const metadata = this.app.metadataCache.getFileCache(noteFile)?.frontmatter;
                if (metadata) {
                    if (Array.isArray(metadata['pinned'])) {
                        if (this.plugin.settings.folderNoteDisplaySettings === 'pinned') {
                            // 先過濾掉所有重複的資料夾筆記
                            this.pinnedList = metadata['pinned'].filter((name: string) => name !== `${folderName}.md`);
                            // 將資料夾筆記添加到最前面
                            this.pinnedList.unshift(`${folderName}.md`);
                        } else {
                            this.pinnedList = metadata['pinned'];
                        }
                    } else if (this.plugin.settings.folderNoteDisplaySettings === 'pinned') {
                        // 如果沒有置頂清單，則建立一個僅包含資料夾筆記的清單
                        this.pinnedList = [`${folderName}.md`];
                    }
                }
            }
        };

        // 渲染網格內容
        await this.grid_render();
        (this.leaf as any).updateHeader();


        // 如果有之前選中的檔案路徑，嘗試恢復選中狀態
        if (selectedFilePath && this.hasKeyboardFocus) {
            const newIndex = this.gridItems.findIndex(item => item.dataset.filePath === selectedFilePath);
            if (newIndex >= 0) {
                this.selectItem(newIndex);
            }
        }

        // new Notice('GridExplorer: ' + this.sourceMode + ' ' + this.sourcePath);
    }

    // 渲染網格內容
    async grid_render() {
        const container = this.containerEl.querySelector('.view-content') as HTMLElement;
        container.empty();
        container.addClass('ge-grid-container');

        // 隱藏頂部元素
        const displayValue = this.hideHeaderElements ? 'none' : 'flex';
        const headerButtons = this.containerEl.querySelector('.ge-header-buttons') as HTMLElement;
        const modeHeaderContainer = this.containerEl.querySelector('.ge-mode-header-container') as HTMLElement;

        if (headerButtons) headerButtons.style.display = displayValue;
        if (modeHeaderContainer) modeHeaderContainer.style.display = displayValue;

        // 根據設定決定是否啟用卡片模式
        if (this.cardLayout === 'vertical') {
            container.addClass('ge-vertical-card');
        } else {
            container.removeClass('ge-vertical-card');
        }

        // 添加點擊空白處取消選中的事件處理器
        container.addEventListener('click', (event) => {
            // 只有當點擊的是容器本身，而不是其子元素時才清除選中
            if (event.target === container) {
                this.clearSelection();
                this.hasKeyboardFocus = false;
            }
        });

        // 設定網格項目寬度和高度等設定
        const settings = this.plugin.settings;
        const gridItemWidth = this.cardLayout === 'vertical' ? settings.verticalGridItemWidth : settings.gridItemWidth;
        const gridItemHeight = this.cardLayout === 'vertical' ? settings.verticalGridItemHeight : settings.gridItemHeight;
        const imageAreaWidth = settings.imageAreaWidth;
        const imageAreaHeight = this.cardLayout === 'vertical' ? settings.verticalImageAreaHeight : settings.imageAreaHeight;

        container.style.setProperty('--grid-item-width', gridItemWidth + 'px');
        if (gridItemHeight === 0 || this.minMode) {
            container.style.setProperty('--grid-item-height', '100%');
        } else {
            container.style.setProperty('--grid-item-height', gridItemHeight + 'px');
        }
        container.style.setProperty('--image-area-width', imageAreaWidth + 'px');
        container.style.setProperty('--image-area-height', imageAreaHeight + 'px');
        container.style.setProperty('--title-font-size', settings.titleFontSize + 'em');

        // 依圖片位置設定切換樣式類別
        if (this.cardLayout === 'vertical') {
            if (settings.verticalCardImagePosition === 'top') {
                container.addClass('ge-image-top');
                container.removeClass('ge-image-bottom');
            } else {
                container.addClass('ge-image-bottom');
                container.removeClass('ge-image-top');
            }
        }

        // 定義所有可能的模式（不包括 custom-）
        const modeClasses = [
            'bookmarks',
            'search',
            'backlinks',
            'outgoinglinks',
            'all-files',
            'recent-files',
            'random-note',
            'tasks',
            'folder'
        ];

        // 先移除所有模式相關的 class
        this.containerEl.removeClass('ge-mode-custom');  // 特別處理 custom 類別
        modeClasses.forEach(mode => {
            this.containerEl.removeClass(`ge-mode-${mode}`);
        });

        // 添加當前模式的 class
        if (this.sourceMode.startsWith('custom-')) {
            this.containerEl.addClass('ge-mode-custom');
        } else if (modeClasses.includes(this.sourceMode)) {
            this.containerEl.addClass(`ge-mode-${this.sourceMode}`);
        }

        // 重置網格項目數組
        this.gridItems = [];

        // 如果是書籤模式且書籤插件未啟用，顯示提示
        if (this.sourceMode === 'bookmarks' && !(this.app as any).internalPlugins.plugins.bookmarks?.enabled) {
            new Notice(t('bookmarks_plugin_disabled'));
            return;
        }

        // 如果是反向連結模式，但沒有活動中的檔案
        if (this.sourceMode === 'backlinks' && !this.app.workspace.getActiveFile()) {
            const noFilesDiv = container.createDiv('ge-no-files');
            noFilesDiv.setText(t('no_backlinks'));
            if (this.plugin.statusBarItem) {
                this.plugin.statusBarItem.setText('');
            }
            return;
        }

        // 顯示資料夾
        renderFolder(this, container);

        // 顯示檔案
        let files = await renderFiles(this, container);

        // 如果沒有檔案，顯示提示訊息
        if (files.length === 0) {
            const noFilesDiv = container.createDiv('ge-no-files');
            if (this.sourceMode !== 'backlinks') {
                noFilesDiv.setText(t('no_files'));
            } else {
                noFilesDiv.setText(t('no_backlinks'));
            }
            if (this.plugin.statusBarItem) {
                this.plugin.statusBarItem.setText('');
            }
            return;
        }

        // 若有置頂清單且目前為資料夾模式，將置頂檔案移到最前面並維持其在清單中的順序
        if (this.pinnedList.length > 0 && this.sourceMode === 'folder') {
            const pinnedFiles = files.filter(f => this.pinnedList.includes(f.name));
            // 依照 pinnedList 順序排序
            pinnedFiles.sort((a, b) => this.pinnedList.indexOf(a.name) - this.pinnedList.indexOf(b.name));
            const otherFiles = files.filter(f => !this.pinnedList.includes(f.name));
            files = [...pinnedFiles, ...otherFiles];
        }

        // 如果資料夾筆記設定為隱藏，則隱藏資料夾筆記
        if (this.sourceMode === 'folder' && this.sourcePath !== '/') {
            if (this.plugin.settings.folderNoteDisplaySettings === 'hidden') {
                const currentFolder = this.app.vault.getAbstractFileByPath(this.sourcePath);
                if (currentFolder instanceof TFolder) {
                    const folderName = currentFolder.name;
                    files = files.filter(f => f.name !== `${folderName}.md`);
                }
            }
        }

        // 創建 Intersection Observer
        const observer = new IntersectionObserver((entries, observer) => {
            entries.forEach(async entry => {
                if (entry.isIntersecting) {
                    const fileEl = entry.target as HTMLElement;
                    const filePath = fileEl.dataset.filePath;
                    if (!filePath) return;

                    const file = this.app.vault.getAbstractFileByPath(filePath);
                    if (!(file instanceof TFile)) return;

                    // 載入預覽內容
                    let imageUrl: string | null = '';
                    const contentArea = fileEl.querySelector('.ge-content-area') as Element;
                    if (!contentArea.hasAttribute('data-loaded')) {
                        // 根據檔案類型處理
                        if (file.extension === 'md') {
                            let summaryLength = this.plugin.settings.summaryLength;
                            if (summaryLength < 50) {
                                summaryLength = 100;
                                this.plugin.settings.summaryLength = 100;
                                this.plugin.saveSettings();
                            }

                            // Markdown 檔案顯示內容預覽
                            const content = await this.app.vault.cachedRead(file);
                            const frontMatterInfo = getFrontMatterInfo(content);
                            let metadata: FrontMatterCache | undefined = undefined;
                            if (frontMatterInfo.exists) {
                                metadata = this.app.metadataCache.getFileCache(file)?.frontmatter;
                            }

                            let pEl: HTMLElement | null = null;
                            if (!this.minMode) {
                                let summaryField = this.plugin.settings.noteSummaryField || 'summary';
                                let summaryValue = metadata?.[summaryField];
                                if (this.sourceMode.startsWith('custom-')) {
                                    // 自訂模式下，使用自訂的 fields 來顯示摘要
                                    const mode = this.plugin.settings.customModes.find(m => m.internalName === this.sourceMode);
                                    if (mode) {
                                        let fields = mode?.fields || '';
                                        // 當有選到子選項 (index >= 0) 而且 options 陣列確實存在
                                        if (this.customOptionIndex >= 0 &&
                                            mode.options &&
                                            this.customOptionIndex < mode.options.length) {
                                            const option = mode.options[this.customOptionIndex];
                                            fields = option.fields || '';
                                        }

                                        // 如果 fields 不為空，則使用它來顯示摘要
                                        if (fields) {
                                            // 以逗號拆分，但忽略 {{ ... }} 內的逗號
                                            const fieldList: string[] = (() => {
                                                const parts: string[] = [];
                                                let buf = '';
                                                let depth = 0; // 在 {{...}} 內時 depth > 0
                                                for (let i = 0; i < fields.length; i++) {
                                                    const ch = fields[i];
                                                    const next = fields[i + 1];
                                                    // 偵測 '{{'
                                                    if (ch === '{' && next === '{') {
                                                        depth++;
                                                        buf += '{{';
                                                        i++;
                                                        continue;
                                                    }
                                                    // 偵測 '}}'
                                                    if (ch === '}' && next === '}') {
                                                        if (depth > 0) depth--;
                                                        buf += '}}';
                                                        i++;
                                                        continue;
                                                    }
                                                    // 只有在不在 {{...}} 內時，逗號才作為分隔符
                                                    if (ch === ',' && depth === 0) {
                                                        if (buf.trim()) parts.push(buf.trim());
                                                        buf = '';
                                                        continue;
                                                    }
                                                    buf += ch;
                                                }
                                                if (buf.trim()) parts.push(buf.trim());
                                                return parts;
                                            })();
                                            const fieldValues: string[] = [];

                                            // 收集所有欄位值，並處理別名（"原始欄位|別名"）
                                            fieldList.forEach(fieldEntry => {
                                                // 解析欄位 (fieldKey)、別名 (labelName)、運算式 (calcExpr)
                                                // 格式示例：
                                                //   birthday|年齡 {{ Math.floor(...) }}
                                                //   birthday {{ Math.floor(...) }}
                                                //   birthday|年齡
                                                //   birthday

                                                let raw = fieldEntry.trim();
                                                let calcExpr: string | null = null;
                                                // 先取出運算區塊 {{ ... }}
                                                const calcMatch = raw.match(/\{\{(.*?)\}\}/);
                                                if (calcMatch) {
                                                    calcExpr = calcMatch[1];
                                                    raw = raw.substring(0, calcMatch.index).trim(); // 去掉運算部分
                                                }
                                                // 再處理 alias
                                                const aliasIdx = raw.lastIndexOf('|');
                                                let fieldKey: string;
                                                let labelName: string;
                                                if (aliasIdx !== -1) {
                                                    fieldKey = raw.substring(0, aliasIdx).trim();
                                                    labelName = raw.substring(aliasIdx + 1).trim() || fieldKey;
                                                } else {
                                                    fieldKey = raw;
                                                    labelName = fieldKey;
                                                }

                                                if (metadata?.[fieldKey] !== undefined && metadata?.[fieldKey] !== '' && metadata?.[fieldKey] !== null) {

                                                    let value = metadata[fieldKey];

                                                    // 如果是數字，則加入千位分隔符號
                                                    if (typeof metadata[fieldKey] === 'number') {
                                                        value = metadata[fieldKey].toLocaleString();
                                                    }
                                                    // 如果是陣列，則轉換為字串
                                                    if (Array.isArray(metadata[fieldKey])) {
                                                        value = metadata[fieldKey].join(', ');
                                                    }

                                                    let outputValue: string | number | null = value;
                                                    if (calcExpr) {
                                                        try {
                                                            const fn = new Function('value', 'metadata', 'app', 'dv', `return (${calcExpr});`);

                                                            // 獲取 Dataview API
                                                            const dvApi = this.app.plugins.plugins.dataview?.api;

                                                            outputValue = fn(value, metadata, this.app, dvApi);
                                                        } catch (error) {
                                                            console.error('GridExplorer: evaluate displayName error', error);
                                                        }
                                                    }
                                                    fieldValues.push(`${labelName}: ${outputValue}`);
                                                }
                                            });

                                            // 如果有找到任何欄位值，則組合起來
                                            if (fieldValues.length > 0) {
                                                summaryValue = fieldValues.join('\n'); // 使用 | 分隔不同欄位
                                            }
                                        }
                                    }
                                }
                                if (summaryValue) {
                                    if (!this.sourceMode.startsWith('custom-')) {
                                        // Frontmatter 有設定摘要值
                                        pEl = contentArea.createEl('p', { text: summaryValue.trim() });
                                    } else {
                                        // custom mode 有設定顯示欄位值
                                        pEl = contentArea.createEl('p', { text: summaryValue.trim(), cls: 'ge-content-area-p-field' });
                                    }
                                } else {
                                    // Frontmatter 沒有設定摘要值，則使用內文
                                    let contentWithoutFrontmatter = '';
                                    if (summaryLength < 500) {
                                        contentWithoutFrontmatter = content.substring(frontMatterInfo.contentStart).slice(0, 500);
                                    } else {
                                        contentWithoutFrontmatter = content.substring(frontMatterInfo.contentStart).slice(0, summaryLength + summaryLength);
                                    }

                                    let contentWithoutMediaLinks = '';

                                    if (this.plugin.settings.showCodeBlocksInSummary) {
                                        contentWithoutMediaLinks = contentWithoutFrontmatter;
                                    } else {
                                        // 刪除 code block
                                        contentWithoutMediaLinks = contentWithoutFrontmatter
                                            .replace(/```[\s\S]*?```\n/g, '')
                                            .replace(/```[\s\S]*$/, '');
                                    }

                                    // 刪除註解及連結
                                    contentWithoutMediaLinks = contentWithoutMediaLinks
                                        .replace(/<!--[\s\S]*?-->/g, '')
                                        .replace(/!?\[([^\]]*)\]\([^)]+\)|!?\[\[([^\]]+)\]\]/g, (match, p1, p2) => {
                                            const linkText = p1 || p2 || '';
                                            if (!linkText) return '';

                                            // 獲取副檔名並檢查是否為圖片或影片
                                            const extension = linkText.split('.').pop()?.toLowerCase() || '';
                                            return (IMAGE_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension)) ? '' : linkText;
                                        });

                                    //把開頭的標題整行刪除
                                    if (contentWithoutMediaLinks.startsWith('# ') || contentWithoutMediaLinks.startsWith('## ') || contentWithoutMediaLinks.startsWith('### ')) {
                                        contentWithoutMediaLinks = contentWithoutMediaLinks.split('\n').slice(1).join('\n');
                                    }

                                    if (!this.plugin.settings.showCodeBlocksInSummary) {
                                        // 不刪除code block的情況下，包含這些特殊符號
                                        contentWithoutMediaLinks = contentWithoutMediaLinks.replace(/[>|\-#*]/g, '').trim();
                                    }

                                    // 只取前 summaryLength 個字符作為預覽
                                    const preview = contentWithoutMediaLinks.slice(0, summaryLength) + (contentWithoutMediaLinks.length > summaryLength ? '...' : '');

                                    // 創建預覽內容
                                    pEl = contentArea.createEl('p', { text: preview.trim() });
                                }
                            }

                            //將預覽文字設定到標題的 title 屬性中
                            const titleEl = fileEl.querySelector('.ge-title');
                            if (titleEl) {
                                setTooltip(contentArea as HTMLElement, `${titleEl.textContent}`)
                            }

                            if (frontMatterInfo.exists) {
                                const colorValue = metadata?.color;
                                if (colorValue) {
                                    // 檢查是否為 HEX 色值
                                    if (isHexColor(colorValue)) {
                                        // 使用自訂 CSS 變數來設置 HEX 顏色
                                        fileEl.addClass('ge-note-color-custom');
                                        fileEl.style.setProperty('--ge-note-color-bg', hexToRgba(colorValue, 0.2));
                                        fileEl.style.setProperty('--ge-note-color-border', hexToRgba(colorValue, 0.5));

                                        // 設置預覽內容文字顏色
                                        if (pEl) {
                                            pEl.addClass('ge-note-color-custom-text');
                                            pEl.style.setProperty('--ge-note-color-text', hexToRgba(colorValue, 0.7));
                                        }
                                    } else {
                                        // 使用預設的 CSS 類別來設置顏色
                                        fileEl.addClass(`ge-note-color-${colorValue}`);

                                        // 設置預覽內容文字顏色
                                        if (pEl) {
                                            pEl.addClass(`ge-note-color-${colorValue}-text`);
                                        }
                                    }
                                }
                                const titleField = this.plugin.settings.noteTitleField || 'title';
                                const titleValue = metadata?.[titleField];
                                if (titleValue) {
                                    // 將標題文字設為 frontmatter 的 title
                                    if (titleEl) {
                                        titleEl.textContent = titleValue;
                                    }
                                }

                                const displayValue = metadata?.display;
                                if (displayValue === 'minimized') {
                                    // 移除已建立的預覽段落
                                    if (pEl) {
                                        pEl.remove();
                                    }
                                    // 移除圖片區域（若已存在）
                                    const imageAreaEl = fileEl.querySelector('.ge-image-area');
                                    if (imageAreaEl) {
                                        imageAreaEl.remove();
                                    }
                                    fileEl.style.height = '100%';
                                } else if (displayValue === 'hidden') {
                                    // 為隱藏的筆記添加特殊樣式類別
                                    fileEl.addClass('ge-note-hidden');
                                }

                                // 如果 frontmatter 同時存在 type 與非空的 redirect（視為捷徑檔），將圖示設為 shuffle
                                const redirectType = metadata?.type;
                                const redirectPath = metadata?.redirect;
                                if (redirectType && typeof redirectPath === 'string' && redirectPath.trim() !== '') {
                                    const iconContainer = fileEl.querySelector('.ge-icon-container');
                                    if (iconContainer) {
                                        setIcon(iconContainer as HTMLElement, 'shuffle');
                                    }
                                }
                            }

                            imageUrl = await findFirstImageInNote(this.app, content);
                        } else {
                            // 其他檔案顯示副檔名
                            if (!this.minMode) {
                                contentArea.createEl('p', { text: file.extension.toUpperCase() });
                            }

                            setTooltip(fileEl as HTMLElement, `${file.name}`, { delay: 2000 })
                        }

                        // 顯示標籤（僅限 Markdown 檔案）
                        if (file.extension === 'md' && this.showNoteTags && !this.minMode) {
                            const fileCache = this.app.metadataCache.getFileCache(file);
                            const displaySetting = fileCache?.frontmatter?.display;

                            // 如果筆記是最小化就直接跳過標籤邏輯
                            if (displaySetting !== 'minimized') {

                                const allTags = new Set<string>();

                                // 從 frontmatter 獲取標籤
                                let frontmatterTags = fileCache?.frontmatter?.tags || [];

                                // 處理不同的標籤格式
                                if (typeof frontmatterTags === 'string') {
                                    // 如果是字符串，按逗號或空格分割
                                    frontmatterTags.split(/[,\s]+/).filter(tag => tag.trim() !== '')
                                        .forEach(tag => allTags.add(tag));
                                } else if (Array.isArray(frontmatterTags)) {
                                    frontmatterTags.forEach(tag => {
                                        // 處理陣列中的每個標籤，可能是字符串或包含空格的字符串
                                        if (typeof tag === 'string') {
                                            // 檢查標籤是否包含空格（可能是未被正確分割的多個標籤）
                                            if (tag.includes(' ')) {
                                                // 按空格分割並添加每個子標籤
                                                tag.split(/\s+/).filter(subTag => subTag.trim() !== '')
                                                    .forEach(subTag => allTags.add(subTag));
                                            } else {
                                                allTags.add(tag);
                                            }
                                        }
                                    });
                                }

                                // 從檔案 cache 中獲取內文標籤
                                const cacheTags = fileCache?.tags || [];
                                cacheTags.forEach(tagObj => {
                                    const tag = tagObj.tag.startsWith('#') ? tagObj.tag.substring(1) : tagObj.tag;
                                    allTags.add(tag);
                                });

                                if (allTags.size > 0) {
                                    // 創建標籤容器
                                    const tagsContainer = contentArea.createDiv('ge-tags-container');

                                    // 取得所有標籤
                                    const displayTags = Array.from(allTags);

                                    displayTags.forEach(tag => {
                                        const tagEl = tagsContainer.createEl('span', {
                                            cls: 'ge-tag',
                                            text: tag.startsWith('#') ? tag : `#${tag}`
                                        });

                                        //添加右鍵選單事件，點擊後開啟選單，點擊選單中的選項後追加標籤到搜尋關鍵字內並重新渲染
                                        tagEl.addEventListener('contextmenu', (e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const tagText = tag.startsWith('#') ? tag : `#${tag}`;
                                            const menu = new Menu();
                                            //添加加入搜尋選項
                                            if (!this.searchQuery.includes(tagText)) {
                                                menu.addItem(item => item
                                                    .setTitle(t('add_tag_to_search'))
                                                    .setIcon('circle-plus')
                                                    .onClick(() => {
                                                        const searchQuery = this.searchQuery + ` ${tagText}`;
                                                        this.setSource('', '', true, searchQuery);
                                                        return false;
                                                    })
                                                );
                                            }
                                            // 添加刪除標籤選項
                                            if (this.searchQuery.includes(tagText)) {
                                                menu.addItem(item => item
                                                    .setTitle(t('remove_tag_from_search'))
                                                    .setIcon('circle-minus')
                                                    .onClick(() => {
                                                        const searchQuery = this.searchQuery.replace(tagText, '');
                                                        this.setSource('', '', true, searchQuery);
                                                        return false;
                                                    })
                                                );
                                            }
                                            menu.showAtPosition({
                                                x: e.clientX,
                                                y: e.clientY
                                            });
                                        });

                                        // 添加點擊事件，點擊後設置搜尋關鍵字並重新渲染
                                        tagEl.addEventListener('click', (e) => {
                                            e.preventDefault();
                                            e.stopPropagation(); // 防止事件冒泡到卡片
                                            const tagText = tag.startsWith('#') ? tag : `#${tag}`;
                                            if (this.searchQuery !== tagText) {
                                                this.setSource('', '', true, tagText);
                                            }
                                            return false;
                                        });
                                    });
                                }
                            }
                        }

                        contentArea.setAttribute('data-loaded', 'true');
                    }

                    // 載入圖片預覽
                    if (!this.minMode) {
                        const imageArea = fileEl.querySelector('.ge-image-area');
                        if (imageArea && !imageArea.hasAttribute('data-loaded')) {
                            // 根據檔案類型處理
                            if (isImageFile(file)) {
                                // 直接顯示圖片
                                const img = imageArea.createEl('img');
                                img.src = this.app.vault.getResourcePath(file);
                                img.draggable = false;
                                imageArea.setAttribute('data-loaded', 'true');
                            } else if (isVideoFile(file)) {
                                // 根據設定決定是否顯示影片縮圖
                                if (this.plugin.settings.showVideoThumbnails) {
                                    // 顯示影片縮圖
                                    const video = imageArea.createEl('video');
                                    video.src = this.app.vault.getResourcePath(file);
                                } else {
                                    // 顯示播放圖示
                                    const videoThumb = imageArea.createDiv('ge-video-thumbnail');
                                    setIcon(videoThumb, 'play-circle');
                                }
                                imageArea.setAttribute('data-loaded', 'true');
                            } else if (file.extension === 'md') {
                                // Markdown 檔案尋找內部圖片
                                if (imageUrl) {
                                    const img = imageArea.createEl('img');
                                    img.src = imageUrl;
                                    img.draggable = false;
                                    imageArea.setAttribute('data-loaded', 'true');
                                } else {
                                    // 如果沒有圖片，移除圖片區域
                                    imageArea.remove();
                                }
                            } else {
                                // 其他檔案類型，移除圖片區域
                                imageArea.remove();
                            }
                        }
                    }

                    // 一旦載入完成，就不需要再觀察這個元素
                    observer.unobserve(fileEl);
                }
            });
        }, {
            root: container,
            rootMargin: '50px', // 預先載入視窗外 50px 的內容
            threshold: 0.1
        });

        // 顯示檔案
        if (files.length > 0) {
            // 檢查是否應該顯示日期分隔器
            const dateDividerMode = this.plugin.settings.dateDividerMode || 'none';
            const sortType = this.sortType;
            const shouldShowDateDividers = dateDividerMode !== 'none' &&
                (sortType.startsWith('mtime-') || sortType.startsWith('ctime-')) &&
                this.sourceMode !== 'random-note' &&
                this.sourceMode !== 'bookmarks' &&
                this.showDateDividers;

            let lastDateString = '';
            let pinDividerAdded = false;
            let blankDividerAdded = false;

            // 每次重新渲染時遞增 token，以便中斷舊批次
            const currentToken = ++this.renderToken;
            // 設定批次渲染狀態
            const state: DividerState = { lastDateString: lastDateString, pinDividerAdded: pinDividerAdded, blankDividerAdded: blankDividerAdded };
            const paramsBase: FileRenderParams = { container, observer, files, dateDividerMode, sortType, shouldShowDateDividers, state };
            const selfRef = this;

            if (Platform.isIosApp) {
                // iOS 專用：以 time-slice 方式分批，避免阻塞點擊事件
                const TIME_BUDGET_MS = 6; // 每幀最多執行 6ms
                const processChunk = (start: number) => {
                    if (currentToken !== this.renderToken) return;
                    const startTime = performance.now();
                    let i = start;
                    for (; i < files.length; i++) {
                        selfRef.processFile(files[i], paramsBase);
                        if (performance.now() - startTime > TIME_BUDGET_MS) {
                            break; // 超過時間預算，讓出主執行緒
                        }
                    }
                    if (i < files.length) {
                        requestAnimationFrame(() => processChunk(i)); // 下一幀繼續
                    }
                };
                processChunk(0);
            } else {
                // 其他平台維持原本固定 batchSize 的邏輯
                const batchSize = 50;
                const processBatch = (start: number) => {
                    if (currentToken !== this.renderToken) return;
                    const end = Math.min(start + batchSize, files.length);
                    for (let i = start; i < end; i++) {
                        selfRef.processFile(files[i], paramsBase);
                    }
                    if (end < files.length) {
                        const cb = () => processBatch(end);
                        if (typeof (window as any).requestIdleCallback === 'function') {
                            (window as any).requestIdleCallback(cb);
                        } else {
                            setTimeout(cb, 0);
                        }
                    }
                };
                processBatch(0);
            }
        }

        if (this.plugin.statusBarItem) {
            this.plugin.statusBarItem.setText(`${files.length} ${t('files')}`);
        }
    }

    // 處理單個檔案渲染
    private processFile(file: TFile, params: FileRenderParams): void {
        const { container, observer, files, dateDividerMode, sortType, shouldShowDateDividers, state } = params;

        // 如果需要顯示置頂分隔器，且尚未加入，當前檔案為置頂清單之一時插入
        if (!state.pinDividerAdded && this.pinnedList.includes(file.name)) {
            const pinDivider = container.createDiv('ge-pin-divider');
            pinDivider.textContent = t('pinned');
            state.pinDividerAdded = true;

            // 針對 iOS 設備進行特殊處理
            if (Platform.isIosApp) {
                pinDivider.style.width = 'calc(100% - 16px)';
            }
        }

        // 插入空白分隔器：當已加入置頂分隔器且尚未加入空白分隔器，且當前檔案不是置頂檔案
        if (state.pinDividerAdded && !state.blankDividerAdded && !this.pinnedList.includes(file.name)) {
            container.createDiv('ge-break');
            state.blankDividerAdded = true;
        }

        // 日期分隔器
        if (shouldShowDateDividers && !this.pinnedList.includes(file.name)) {
            let timestamp = 0;

            // 根據排序類型獲取日期時間戳
            if (sortType.startsWith('mtime-') || sortType.startsWith('ctime-')) {
                // 判斷是否以修改日期排序，最近檔案模式使用修改日期排序
                const isModifiedTime = sortType.startsWith('mtime-') || this.sourceMode === 'recent-files';

                // 檢查是否是 Markdown 文件，且有設定對應的 frontmatter 字段
                let frontMatterDate = null;
                if (file.extension === 'md') {
                    const metadata = this.app.metadataCache.getFileCache(file);
                    if (metadata?.frontmatter) {
                        const fieldSetting = isModifiedTime
                            ? this.plugin.settings.modifiedDateField
                            : this.plugin.settings.createdDateField;

                        const fieldNames = fieldSetting
                            ? fieldSetting.split(',').map(f => f.trim()).filter(Boolean)
                            : [];

                        for (const fieldName of fieldNames) {
                            const dateStr = metadata.frontmatter[fieldName];
                            if (dateStr) {
                                const date = new Date(dateStr);
                                if (!isNaN(date.getTime())) {
                                    frontMatterDate = date;
                                    break; // 已找到有效日期
                                }
                            }
                        }
                    }
                }

                // 使用 frontmatter 中的日期或檔案的狀態日期
                if (frontMatterDate) {
                    timestamp = frontMatterDate.getTime();
                } else {
                    timestamp = isModifiedTime ? file.stat.mtime : file.stat.ctime;
                }
            }

            // 創建日期物件並格式化
            const fileDate = new Date(timestamp);

            // 根據日期分隔器模式設定格式化
            let currentDateString = '';

            if (dateDividerMode === 'year') {
                // 年分隔器：只顯示年份
                currentDateString = fileDate.getFullYear().toString();
            } else if (dateDividerMode === 'month') {
                // 月分隔器：顯示年-月
                const year = fileDate.getFullYear();
                const month = fileDate.getMonth() + 1; // getMonth() 回傳 0-11
                currentDateString = `${year}-${month.toString().padStart(2, '0')}`;
            } else {
                // 日分隔器：顯示完整日期（預設行為）
                currentDateString = fileDate.toLocaleDateString();
            }

            // 如果日期不同於上一個檔案的日期，添加分隔器
            if (currentDateString !== state.lastDateString) {
                state.lastDateString = currentDateString;

                // 創建日期分隔器
                const dateDivider = container.createDiv('ge-date-divider');
                dateDivider.textContent = currentDateString;

                // 針對 iOS 設備進行特殊處理
                if (Platform.isIosApp) {
                    dateDivider.style.width = 'calc(100% - 16px)';
                }
            }
        }

        const fileEl = container.createDiv('ge-grid-item');
        this.gridItems.push(fileEl); // 添加到網格項目數組
        fileEl.dataset.filePath = file.path;

        // 如果檔案與父資料夾同名，添加 ge-foldernote 類別
        const parentPath = file.parent?.path || '';
        const parentName = parentPath.split('/').pop() || '';
        if (parentName === file.basename) {
            fileEl.addClass('ge-foldernote');
        }

        //如果檔案是否處於置頂範圍，添加 ge-pinned 類別
        if (this.pinnedList.includes(file.name)) {
            fileEl.addClass('ge-pinned');
        }

        // 創建左側內容區，包含圖示和標題
        const contentArea = fileEl.createDiv('ge-content-area');

        // 創建標題容器
        const titleContainer = contentArea.createDiv('ge-title-container');
        const extension = file.extension.toLowerCase();

        // 檢查是否為媒體檔案，如果是則添加 ge-media-card 類別
        if (this.cardLayout === 'vertical' &&
            (isImageFile(file) || isVideoFile(file)) &&
            !this.minMode) {
            fileEl.addClass('ge-media-card');
        }

        // 添加檔案類型圖示
        if (isImageFile(file)) {
            const iconContainer = titleContainer.createDiv('ge-icon-container ge-img');
            setIcon(iconContainer, 'image');
        } else if (isVideoFile(file)) {
            const iconContainer = titleContainer.createDiv('ge-icon-container ge-video');
            setIcon(iconContainer, 'play-circle');
        } else if (isAudioFile(file)) {
            const iconContainer = titleContainer.createDiv('ge-icon-container ge-audio');
            setIcon(iconContainer, 'music');
        } else if (extension === 'pdf') {
            const iconContainer = titleContainer.createDiv('ge-icon-container ge-pdf');
            setIcon(iconContainer, 'paperclip');
        } else if (extension === 'canvas') {
            const iconContainer = titleContainer.createDiv('ge-icon-container ge-canvas');
            setIcon(iconContainer, 'layout-dashboard');
        } else if (extension === 'base') {
            const iconContainer = titleContainer.createDiv('ge-icon-container ge-base');
            setIcon(iconContainer, 'layout-list');
        } else if (extension === 'md' || extension === 'txt') {
            const iconContainer = titleContainer.createDiv('ge-icon-container');
            setIcon(iconContainer, 'file-text');
        } else {
            const iconContainer = titleContainer.createDiv('ge-icon-container');
            setIcon(iconContainer, 'file');
        }

        // 創建標題（立即載入）
        const shouldShowExtension = this.minMode && extension !== 'md';
        const displayText = shouldShowExtension ? `${file.basename}.${file.extension}` : file.basename;
        const titleEl = titleContainer.createEl('span', { cls: 'ge-title', text: displayText });
        if (this.plugin.settings.multiLineTitle) titleEl.addClass('ge-multiline-title');

        // 創建圖片區域，但先不載入圖片
        if (!this.minMode) {
            fileEl.createDiv('ge-image-area');
        }

        // 開始觀察這個元素
        observer.observe(fileEl);

        // 加入滑鼠移入顯示的右上角圓形按鈕（僅針對可在網格中顯示筆記的檔案）
        // 位置與顯示由 CSS 控制（.ge-hover-open-note）
        // 當設定為「直接在網格中顯示筆記」時，不顯示此按鈕
        // if (file.extension === 'md' && !this.plugin.settings.showNoteInGrid) {
        //     // 確保容器可做為定位參考
        //     fileEl.style.position = fileEl.style.position || 'relative';
        //     const quickBtn = fileEl.createDiv({ cls: 'ge-hover-open-note' });
        //     setIcon(quickBtn, 'maximize-2');
        //     quickBtn.addEventListener('click', (e) => {
        //         e.stopPropagation();
        //         e.preventDefault();
        //         // 如果是捷徑檔案，遵循捷徑開啟邏輯；否則在網格中顯示筆記
        //         if (!this.openShortcutFile(file)) {
        //             this.showNoteInGrid(file);
        //         }
        //     });
        //     // 阻止滑鼠事件影響拖曳或選取
        //     quickBtn.addEventListener('mousedown', (e) => {
        //         e.stopPropagation();
        //     });
        // }

        // 滑鼠懸停在項目上時，按 Ctrl 鍵直接顯示筆記
        if (Platform.isDesktop && file.extension === 'md' && !this.plugin.settings.showNoteInGrid) {
            let triggeredInHover = false;
            let isHovering = false;
            let isMouseDown = false; // 追蹤滑鼠按下狀態
            let keydownListener: ((e: KeyboardEvent) => void) | null = null;

            const trigger = () => {
                if (triggeredInHover || isMouseDown) return; // 如果滑鼠按下則不觸發
                triggeredInHover = true;
                if (!this.openShortcutFile(file)) {
                    this.showNoteInGrid(file);
                }
            };

            const onKeyDown = (e: KeyboardEvent) => {
                // 只有在滑鼠確實懸停在此項目上且按下 Ctrl 時才觸發
                // 且滑鼠沒有按下（避免干擾 Ctrl+click）
                // 並且當前 GridView 必須是活動視圖
                if (isHovering && e.ctrlKey && !isMouseDown &&
                    this.app.workspace.getActiveViewOfType(GridView) === this) {
                    // 短暫延遲以確保不是 Ctrl+click 操作
                    setTimeout(() => {
                        if (isHovering && !triggeredInHover && !isMouseDown &&
                            this.app.workspace.getActiveViewOfType(GridView) === this) {
                            trigger();
                        }
                    }, 300);
                }
            };

            const onMouseDown = () => {
                isMouseDown = true;
                triggeredInHover = true; // 防止在點擊過程中觸發 hover 功能
            };

            const onMouseUp = () => {
                isMouseDown = false;
                // 重置觸發狀態，但稍微延遲以避免立即重新觸發
                setTimeout(() => {
                    if (isHovering) {
                        triggeredInHover = false;
                    }
                }, 50);
            };

            const onMouseEnter = () => {
                triggeredInHover = false;
                isHovering = true;
                if (!keydownListener) {
                    keydownListener = onKeyDown;
                    document.addEventListener('keydown', keydownListener, { capture: true });
                }
            };

            const onMouseLeave = () => {
                isHovering = false;
                isMouseDown = false;
                if (keydownListener) {
                    document.removeEventListener('keydown', keydownListener, { capture: true });
                    keydownListener = null;
                }
                triggeredInHover = false;
            };

            fileEl.addEventListener('mouseenter', onMouseEnter);
            fileEl.addEventListener('mouseleave', onMouseLeave);
            fileEl.addEventListener('mousedown', onMouseDown);
            fileEl.addEventListener('mouseup', onMouseUp);

            // 添加清理函數到數組中
            this.eventCleanupFunctions.push(() => {
                if (keydownListener) {
                    document.removeEventListener('keydown', keydownListener, { capture: true });
                }
                fileEl.removeEventListener('mouseenter', onMouseEnter);
                fileEl.removeEventListener('mouseleave', onMouseLeave);
                fileEl.removeEventListener('mousedown', onMouseDown);
                fileEl.removeEventListener('mouseup', onMouseUp);
            });
        }

        // 點擊時開啟檔案
        fileEl.addEventListener('click', (event) => {
            // 獲取項目索引
            const index = this.gridItems.indexOf(fileEl);
            if (index < 0) return;

            if (event.ctrlKey || event.metaKey) {
                if (isMediaFile(file)) {
                    // 開啟媒體檔案
                    if (isAudioFile(file)) {
                        FloatingAudioPlayer.open(this.app, file);
                    } else {
                        this.openMediaFile(file, files);
                    }
                } else {
                    if (event.ctrlKey && event.altKey) {
                        // Ctrl+Alt：開啟在分割視窗
                        this.app.workspace.getLeaf('split').openFile(file);
                    } else {
                        // 開啟文件檔案到新分頁
                        this.app.workspace.getLeaf(true).openFile(file);
                    }
                }
                event.preventDefault();
                return;
            } else if (event.shiftKey) {
                // Shift 鍵：範圍選擇
                this.handleRangeSelection(index);
                this.hasKeyboardFocus = true;
                event.preventDefault();
                return;
            } else if (event.altKey) {
                // Alt 鍵或設定為預設時：網格視圖中直接顯示筆記
                this.selectItem(index, true);
                this.hasKeyboardFocus = true;
                event.preventDefault();
                return;
            } else if (this.plugin.settings.showNoteInGrid) {
                this.selectItem(index);
                this.hasKeyboardFocus = true;

                if (isMediaFile(file)) {
                    // 媒體檔案：正常開啟
                    if (isAudioFile(file)) {
                        FloatingAudioPlayer.open(this.app, file);
                    } else {
                        this.openMediaFile(file, files);
                    }
                } else if (file.extension === 'pdf' || file.extension === 'canvas' || file.extension === 'base') {
                    this.getLeafByMode(file).openFile(file);
                } else {
                    // 非媒體檔案
                    // 如果是捷徑檔案，則開啟捷徑，否則在網格視圖中直接顯示筆記
                    if (!this.openShortcutFile(file)) {
                        this.showNoteInGrid(file); // 在網格視圖中直接顯示筆記
                    }
                }
                event.preventDefault();
                return;
            } else {
                // 一般點擊：選中單個項目並開啟
                this.selectItem(index);
                this.hasKeyboardFocus = true;

                // 根據檔案類型處理點擊事件
                if (isMediaFile(file)) {
                    // 開啟媒體檔案
                    if (isAudioFile(file)) {
                        FloatingAudioPlayer.open(this.app, file);
                    } else {
                        this.openMediaFile(file, files);
                    }
                } else {
                    // 非媒體檔案
                    // 如果是捷徑檔案，則開啟捷徑，否則正常開啟檔案
                    if (!this.openShortcutFile(file)) {
                        // 非捷徑就正常開啟檔案
                        const leaf = this.getLeafByMode(file);
                        if (this.searchQuery) {
                            this.app.vault.cachedRead(file).then((content) => {
                                const searchQuery = this.searchQuery;
                                const lowerContent = content.toLowerCase();
                                let idx = -1;
                                let lineNumber = 0;

                                // 1. 先嘗試完整比對（不分大小寫）
                                idx = lowerContent.indexOf(searchQuery.toLowerCase());

                                // 2. 若找不到，嘗試拆開關鍵字搜尋
                                if (idx === -1 && searchQuery.includes(' ')) {
                                    const keywords = searchQuery.split(/\s+/).filter(k => k.trim() !== '');
                                    if (keywords.length > 1) {
                                        // 找第一個出現的關鍵字
                                        for (const keyword of keywords) {
                                            const keywordIdx = lowerContent.indexOf(keyword.toLowerCase());
                                            if (keywordIdx !== -1) {
                                                idx = keywordIdx;
                                                break;
                                            }
                                        }
                                    }
                                }

                                if (idx !== -1) {
                                    lineNumber = content.substring(0, idx).split('\n').length - 1;
                                    leaf.openFile(file, { eState: { line: lineNumber } }).then(() => {
                                        (this.app as any)?.commands?.executeCommandById?.('editor:focus');
                                    });
                                    return;
                                }
                                // 若都找不到關鍵字，直接開檔
                                leaf.openFile(file);
                            });
                        } else {
                            leaf.openFile(file);
                        }
                    }
                }
            }
        });

        // 避免中鍵點擊會自動滾動頁面
        fileEl.addEventListener('mousedown', (event) => {
            if (event.button === 1) {
                event.preventDefault();
            }
        });

        fileEl.addEventListener('mouseup', (event) => {
            if (event.button === 1) {
                event.preventDefault();
                if (!isMediaFile(file)) {
                    this.app.workspace.getLeaf(true).openFile(file);
                }
            }
        });

        if (Platform.isDesktop) {
            // 添加拖曳功能
            fileEl.setAttribute('draggable', 'true');
            fileEl.addEventListener('dragstart', (event) => {
                // 獲取項目索引
                const index = this.gridItems.indexOf(fileEl);
                if (index >= 0) {
                    // 如果項目未被選中，則選中它
                    if (!this.selectedItems.has(index)) {
                        this.selectItem(index);
                    }
                }

                // 獲取選中的檔案
                const selectedFiles = this.getSelectedFiles();
                let drag_filename = '';

                // 使用 Obsidian 內建的拖曳格式（obsidian:// URI）
                // const vaultName = this.app.vault.getName();

                if (selectedFiles.length > 1) {
                    // 多檔案：建立多個 obsidian://open URI
                    // const obsidianUris = selectedFiles.map(f => 
                    //     `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(f.path)}`
                    // );

                    // // 設定 text/uri-list
                    // event.dataTransfer?.setData('text/uri-list', obsidianUris.join('\n'));
                    // console.log(obsidianUris.join('\n'));

                    // 設定 text/plain
                    const mdList = selectedFiles
                        .map(f => this.app.fileManager.generateMarkdownLink(f, ''))
                        .join('\n');
                    event.dataTransfer?.setData('text/plain', mdList);

                    // 兼容舊版：提供 markdown 連結與舊自定義 MIME，供 main.ts 使用
                    event.dataTransfer?.setData('application/obsidian-grid-explorer-files', JSON.stringify(selectedFiles.map(f => f.path)));

                    drag_filename = `${selectedFiles.length} ${t('files')}`;
                } else {
                    // 單檔案：建立單一 obsidian://open URI
                    // const obsidianUri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(file.path)}`;

                    // 設定為 text/uri-list
                    // event.dataTransfer?.setData('text/uri-list', obsidianUri);

                    // 設定 text/plain
                    const mdLink = this.app.fileManager.generateMarkdownLink(file, '');
                    event.dataTransfer?.setData('text/plain', mdLink);

                    // 兼容舊版：提供 markdown 連結與舊自定義 MIME，供 main.ts 使用
                    event.dataTransfer?.setData('application/obsidian-grid-explorer-files', JSON.stringify([file.path]));

                    drag_filename = file.basename;
                }

                const dragImage = document.createElement('div');
                dragImage.className = 'ge-custom-drag-preview';
                dragImage.textContent = drag_filename;

                // 將元素暫時加入 DOM
                document.body.appendChild(dragImage);

                // 設定拖曳圖示
                event.dataTransfer!.setDragImage(dragImage, 20, 20);

                // 延遲移除元素（讓拖曳圖示正常顯示）
                setTimeout(() => {
                    document.body.removeChild(dragImage);
                }, 0);

                // 設定拖曳效果
                event.dataTransfer!.effectAllowed = 'all';
                // 添加拖曳中的視覺效果
                fileEl.addClass('ge-dragging');
            });

            fileEl.addEventListener('dragend', () => {
                // 移除拖曳中的視覺效果
                fileEl.removeClass('ge-dragging');
            });
        }

        // 添加右鍵選單
        fileEl.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            const menu = new Menu();

            // 獲取項目索引
            const index = this.gridItems.indexOf(fileEl);
            if (index >= 0) {
                // 如果項目未被選中，則選中它
                if (!this.selectedItems.has(index)) {
                    this.selectItem(index);
                }
            }

            // 獲取選中的檔案
            const selectedFiles = this.getSelectedFiles();

            if (selectedFiles.length > 1) {
                // 多個檔案被選中，使用 files-menu
                this.app.workspace.trigger('files-menu', menu, selectedFiles);

                // 檢查是否所有選中的檔案都是 md 檔案
                const allMdFiles = selectedFiles.every(file => file.extension === 'md');
                if (allMdFiles) {
                    menu.addItem((item) => {
                        item
                            .setTitle(t('set_note_attribute'))
                            .setIcon("palette")
                            .onClick(() => {
                                showNoteSettingsModal(this.app, this.plugin, selectedFiles);
                            });
                    });
                }
            } else {
                this.app.workspace.trigger('file-menu', menu, file);
            }
            // 新增在新分頁開啟選項
            menu.addItem((item) => {
                item
                    .setTitle(t('open_in_new_tab'))
                    .setIcon("external-link")
                    .setSection?.("open")
                    .onClick(() => {
                        if (selectedFiles.length > 1) {
                            // 如果多個檔案被選中，開啟所有檔案
                            for (const f of selectedFiles) {
                                this.app.workspace.getLeaf(true).openFile(f);
                            }
                        } else {
                            this.app.workspace.getLeaf(true).openFile(file);
                        }
                    });
            });

            // 加入暫存區選項 (僅在行動裝置上顯示)
            if (Platform.isMobile) {
                menu.addItem((item) => {
                    item
                        .setTitle(t('add_to_stash'))
                        .setIcon("archive")
                        .onClick(() => {
                            this.addFilesToStash(selectedFiles);
                        });
                });
            }

            // 刪除選項
            menu.addItem((item) => {
                (item as any).setWarning(true);
                item
                    .setTitle(t('delete_note'))
                    .setIcon("trash")
                    .onClick(async () => {
                        if (selectedFiles.length > 1) {
                            // 刪除多個檔案
                            for (const f of selectedFiles) {
                                await this.app.fileManager.trashFile(f);
                            }
                        } else {
                            // 刪除單個檔案
                            await this.app.fileManager.trashFile(file);
                        }
                        // 清除選中狀態
                        this.clearSelection();
                    });
            });
            menu.showAtMouseEvent(event);
        });
    }

    // 將檔案添加到 ExplorerView 的暫存區
    private addFilesToStash(files: TFile[]) {
        // 獲取當前活動的 ExplorerView
        const explorerLeaves = this.app.workspace.getLeavesOfType(EXPLORER_VIEW_TYPE);

        if (explorerLeaves.length === 0) {
            new Notice('找不到 Explorer 視圖');
            return;
        }

        // 使用第一個找到的 ExplorerView
        const explorerView = explorerLeaves[0].view as ExplorerView;

        if (!explorerView) {
            new Notice('無法訪問 Explorer 視圖');
            return;
        }

        // 將檔案路徑轉換為字串陣列
        const filePaths = files.map(file => file.path);

        // 調用 ExplorerView 的 addToStash 方法
        (explorerView as any).addToStash(filePaths);

        // 強制立即重新渲染 ExplorerView 以確保畫面更新
        (explorerView as any).refresh();

        // 顯示成功通知
        new Notice(t('added_to_stash'));
    }

    onPaneMenu(menu: Menu, source: string) {
        menu.addItem(item => {
            item
                .setTitle(t('hide_header_elements'))
                .setIcon("archive-restore")
                .setChecked(this.hideHeaderElements)
                .onClick(() => {
                    this.hideHeaderElements = !this.hideHeaderElements;
                    this.app.workspace.requestSaveLayout();
                    this.render();
                });
        });
        menu.addItem((item) => {
            item
                .setTitle(t('reselect'))
                .setIcon("grid")
                .onClick(() => {
                    showFolderSelectionModal(this.app, this.plugin, this);
                });
        });
        menu.addItem((item) => {
            item
                .setTitle(t('refresh'))
                .setIcon("refresh-cw")
                .onClick(() => {
                    this.render();
                });
        });
    }

    // 清除選中狀態
    clearSelection() {
        this.gridItems.forEach(item => {
            item.removeClass('ge-selected-item');
        });
        this.selectedItemIndex = -1;
        this.selectedItems.clear();
    }

    // 選中指定索引的項目
    selectItem(index: number, multiSelect = false) {
        // 如果不是多選模式，先清除所有項目的選中狀態
        if (!multiSelect) {
            this.gridItems.forEach(item => {
                item.removeClass('ge-selected-item');
            });
            this.selectedItems.clear();
        }

        // 確保索引在有效範圍內
        if (index >= 0 && index < this.gridItems.length) {
            this.selectedItemIndex = index;
            const selectedItem = this.gridItems[index];

            // 如果是多選模式且項目已被選中，則取消選中
            if (multiSelect && this.selectedItems.has(index)) {
                selectedItem.removeClass('ge-selected-item');
                this.selectedItems.delete(index);
                // 如果取消選中後沒有選中項目，則設置 selectedItemIndex 為 -1
                if (this.selectedItems.size === 0) {
                    this.selectedItemIndex = -1;
                } else {
                    // 否則設置為最後一個選中項目
                    this.selectedItemIndex = Array.from(this.selectedItems).pop() || -1;
                }
            } else {
                // 否則選中項目
                selectedItem.addClass('ge-selected-item');
                this.selectedItems.add(index);
            }

            // 確保選中的項目在視圖中可見
            selectedItem.scrollIntoView({ block: 'nearest' });
        }
    }

    // 處理範圍選擇（Shift 鍵）
    handleRangeSelection(index: number) {
        if (this.selectedItemIndex === -1) {
            // 如果沒有已選中的項目，直接選中當前項目
            this.selectItem(index);
            return;
        }

        // 計算範圍的起始和結束索引
        const startIndex = Math.min(this.selectedItemIndex, index);
        const endIndex = Math.max(this.selectedItemIndex, index);

        // 清除現有選擇
        this.gridItems.forEach(item => {
            item.removeClass('ge-selected-item');
        });
        this.selectedItems.clear();

        // 選中範圍內的所有項目
        for (let i = startIndex; i <= endIndex; i++) {
            this.gridItems[i].addClass('ge-selected-item');
            this.selectedItems.add(i);
        }

        // 更新當前選中索引
        this.selectedItemIndex = index;
    }

    // 獲取所有選中項目的檔案
    getSelectedFiles(): TFile[] {
        const files: TFile[] = [];
        this.selectedItems.forEach(index => {
            const fileEl = this.gridItems[index];
            const filePath = fileEl.dataset.filePath;
            if (filePath) {
                const file = this.app.vault.getAbstractFileByPath(filePath);
                if (file instanceof TFile) {
                    files.push(file);
                }
            }
        });
        return files;
    }

    // 開啟媒體檔案
    openMediaFile(file: TFile, mediaFiles?: TFile[]) {
        // 如果沒有傳入媒體檔案列表，則獲取
        const getMediaFilesPromise = mediaFiles
            ? Promise.resolve(mediaFiles.filter(f => isMediaFile(f)))
            : getFiles(this, this.includeMedia).then(allFiles => allFiles.filter(f => isMediaFile(f)));

        getMediaFilesPromise.then(filteredMediaFiles => {
            // 找到當前檔案在媒體檔案列表中的索引
            const currentIndex = filteredMediaFiles.findIndex(f => f.path === file.path);
            if (currentIndex === -1) return;

            // 使用 MediaModal 開啟媒體檔案，並傳入 this 作為 gridView 參數
            const mediaModal = new MediaModal(this.app, file, filteredMediaFiles, this);
            mediaModal.open();
        });
    }

    // 根據 openNoteLayout 設定獲取對應的 leaf
    getLeafByMode(file?: TFile): WorkspaceLeaf {
        const mode = this.plugin.settings.openNoteLayout;
        switch (mode) {
            case 'newTab':
                // 如果提供了檔案，先檢查是否已經在某個分頁中開啟
                if (file) {
                    // 獲取所有 leaves，不限定類型
                    const allLeaves = this.app.workspace.getLeavesOfType('markdown')
                        .concat(this.app.workspace.getLeavesOfType('pdf'))
                        .concat(this.app.workspace.getLeavesOfType('canvas'))
                        .concat(this.app.workspace.getLeavesOfType('bases'))
                        .concat(this.app.workspace.getLeavesOfType('excalidraw'));;
                    for (const leaf of allLeaves) {
                        const viewState = leaf.getViewState();
                        if (viewState.state?.file === file.path) {
                            // 找到已開啟的分頁，切換焦點到該分頁
                            this.app.workspace.setActiveLeaf(leaf, { focus: true });
                            return leaf;
                        }
                    }
                }
                // 沒有找到已開啟的分頁，開新分頁
                return this.app.workspace.getLeaf('tab');
            case 'split':
                // 檢查是否已經有 split 視圖存在
                const mainEntry = this.app.workspace.rootSplit;
                if (mainEntry && (mainEntry as any)?.children?.length > 1) {
                    // 如果已經有 split，直接在現有的 split 中開啟
                    return this.app.workspace.getLeaf(false);
                } else {
                    // 如果沒有 split，創建新的 split
                    return this.app.workspace.getLeaf('split');
                }
            case 'newWindow':
                return this.app.workspace.getLeaf('window');
            case 'default':
            default:
                return this.app.workspace.getLeaf();
        }
    }

    // 開啟捷徑檔案
    openShortcutFile(file: TFile): boolean {
        const fileCache = this.app.metadataCache.getFileCache(file);
        if (!fileCache?.frontmatter) return false;
        const redirectType = fileCache?.frontmatter?.type;
        const redirectPath = fileCache?.frontmatter?.redirect;

        if (redirectType && typeof redirectPath === 'string' && redirectPath.trim() !== '') {
            let target;

            if (redirectType === 'file') {
                // 支援 ![[...]]（嵌入）與 [[file|alias]]（別名）格式
                const trimmed = redirectPath.trim();
                const isEmbed = trimmed.startsWith('!');
                const wikilink = isEmbed ? trimmed.substring(1) : trimmed; // 去除前置 '!'
                if (wikilink.startsWith('[[') && wikilink.endsWith(']]')) {
                    let linkInner = wikilink.slice(2, -2).trim();
                    // 去除別名部分，例如 "path|alias" -> "path"
                    const pipeIdx = linkInner.indexOf('|');
                    if (pipeIdx !== -1) linkInner = linkInner.substring(0, pipeIdx).trim();
                    target = this.app.metadataCache.getFirstLinkpathDest(linkInner, file.path);
                } else {
                    target = this.app.vault.getAbstractFileByPath(normalizePath(redirectPath));
                }
                if (!target) return false;

                if (target instanceof TFile) {
                    this.getLeafByMode(target).openFile(target);
                    return true;
                } else {
                    new Notice(`${t('target_not_found')}: ${redirectPath}`);
                }
            } else if (redirectType === 'folder') {
                target = this.app.vault.getAbstractFileByPath(normalizePath(redirectPath));
                if (!target) return false;

                // 判斷redirectPath是否為資料夾
                if (target instanceof TFolder) {
                    this.setSource('folder', redirectPath);
                    this.clearSelection();
                    requestAnimationFrame(async () => {
                        const cardLayout = fileCache?.frontmatter?.cardLayout;
                        if (cardLayout && cardLayout !== this.cardLayout) {
                            this.cardLayout = cardLayout;
                            this.render();
                        }
                    });
                    return true;
                } else {
                    new Notice(`${t('target_not_found')}: ${redirectPath}`);
                }
            } else if (redirectType === 'mode') {
                // 判斷redirectPath是否為模式
                this.setSource(redirectPath);
                this.clearSelection();
                requestAnimationFrame(async () => {
                    const cardLayout = fileCache?.frontmatter?.cardLayout;
                    if (cardLayout && cardLayout !== this.cardLayout) {
                        this.cardLayout = cardLayout;
                        this.render();
                    }
                });
                return true;
            } else if (redirectType === 'search') {
                const searchCurrentLocationOnly = fileCache?.frontmatter?.searchCurrentLocationOnly || false;
                const searchFilesNameOnly = fileCache?.frontmatter?.searchFilesNameOnly || false;
                const searchMediaFiles = fileCache?.frontmatter?.searchMediaFiles || false;
                this.setSource('', '', true, redirectPath, searchCurrentLocationOnly, searchFilesNameOnly, searchMediaFiles);
                this.clearSelection();
                return true;
            } else if (redirectType === 'uri') {
                // 檢查是否為 http/https 或 obsidian:// 協議
                if (redirectPath.startsWith('http://') ||
                    redirectPath.startsWith('https://') ||
                    redirectPath.startsWith('obsidian://') ||
                    redirectPath.startsWith('file://')) {
                    // 使用 window.open 打開網址或 obsidian 協議
                    window.open(redirectPath, '_blank');
                    return true;
                } else {
                    new Notice(`${t('target_not_found')}: ${redirectPath}`);
                }
            } else {
                new Notice(`${t('target_not_found')}: ${redirectPath}`);
            }
        }

        return false;
    }

    // 在網格視圖中直接顯示筆記
    async showNoteInGrid(file: TFile) {

        // 關閉之前的筆記顯示
        if (this.isShowingNote) {
            this.hideNoteInGrid();
        }

        const gridContainer = this.containerEl.querySelector('.ge-grid-container');
        if (!gridContainer) return;

        // 創建筆記顯示容器
        this.noteViewContainer = this.containerEl.createDiv('ge-note-view-container');

        // 頂部列 (左右區塊)
        const topBar = this.noteViewContainer.createDiv('ge-note-top-bar');
        const leftBar = topBar.createDiv('ge-note-top-left');
        const rightBar = topBar.createDiv('ge-note-top-right');

        // 筆記標題
        const noteTitle = leftBar.createDiv('ge-note-title');
        noteTitle.textContent = file.basename;
        setTooltip(noteTitle, file.basename);

        // 編輯按鈕
        const editButton = rightBar.createEl('button', { cls: 'ge-note-edit-button' });
        setIcon(editButton, 'pencil');
        editButton.addEventListener('click', () => {
            this.getLeafByMode(file).openFile(file);
        });

        // 關閉按鈕
        const closeButton = rightBar.createEl('button', { cls: 'ge-note-close-button' });
        setIcon(closeButton, 'x');
        closeButton.addEventListener('click', () => {
            this.hideNoteInGrid();
        });

        // 捲動內容容器
        const scrollContainer = this.noteViewContainer.createDiv('ge-note-scroll-container');

        // 假設在視圖側邊欄則把字型調小
        const isInSidebar = this.leaf.getRoot() === this.app.workspace.leftSplit ||
            this.leaf.getRoot() === this.app.workspace.rightSplit;
        if (isInSidebar) {
            scrollContainer.style.fontSize = '1em';
            scrollContainer.style.backgroundColor = 'var(--background-secondary)';
        }

        // 創建筆記內容容器
        const noteContent = scrollContainer.createDiv('ge-note-content-container');
        if (isInSidebar) {
            noteContent.style.padding = '15px';
        }

        // 創建筆記內容區域
        const noteContentArea = noteContent.createDiv('ge-note-content');

        try {
            // 讀取筆記內容
            const content = await this.app.vault.read(file);

            // 使用 Obsidian 的 MarkdownRenderer 渲染內容
            await MarkdownRenderer.render(
                this.app,
                content,
                noteContentArea,
                file.path,
                this
            );

            // 加上自訂屬性 data-source-path
            noteContentArea
                .querySelectorAll<HTMLImageElement>('img')
                .forEach((img) => (img.dataset.sourcePath = file.path));

            // 處理內部連結點擊
            const handleLinkClick = (e: MouseEvent) => {
                const target = e.target as HTMLElement;
                const link = target.closest('a.internal-link');
                if (link) {
                    e.preventDefault();
                    e.stopPropagation();

                    const href = link.getAttribute('href');
                    if (href) {
                        const linkText = link.getAttribute('data-href') || href;
                        const linkedFile = this.app.metadataCache.getFirstLinkpathDest(linkText, file.path);
                        if (linkedFile) {
                            this.getLeafByMode(linkedFile).openFile(linkedFile);
                        }
                    }
                }
            };

            // 使用 registerDomEvent 註冊事件
            this.registerDomEvent(noteContentArea, 'click', handleLinkClick);
        } catch (error) {
            noteContentArea.textContent = '無法載入筆記內容';
            console.error('Error loading note content:', error);
        }

        // 設定狀態
        this.isShowingNote = true;

        // 註冊鍵盤事件監聽器
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this.hideNoteInGrid();
                e.preventDefault();
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        // 儲存事件監聽器以便後續移除
        (this.noteViewContainer as any).keydownHandler = handleKeyDown;
    }

    // 隱藏筆記顯示
    hideNoteInGrid() {
        if (!this.isShowingNote) return;

        //const gridContainer = this.containerEl.querySelector('.ge-grid-container');

        if (this.noteViewContainer) {
            // 移除鍵盤事件監聽器
            const keydownHandler = (this.noteViewContainer as any).keydownHandler;
            if (keydownHandler) {
                document.removeEventListener('keydown', keydownHandler);
            }

            this.noteViewContainer.remove();
            this.noteViewContainer = null;
        }

        this.isShowingNote = false;
    }

    // 保存視圖狀態
    getState() {
        return {
            type: 'grid-view',
            state: {
                sourceMode: this.sourceMode,
                sourcePath: this.sourcePath,
                baseSortType: this.baseSortType,
                sortType: this.sortType,
                searchQuery: this.searchQuery,
                searchCurrentLocationOnly: this.searchCurrentLocationOnly,
                searchFilesNameOnly: this.searchFilesNameOnly,
                searchMediaFiles: this.searchMediaFiles,
                includeMedia: this.includeMedia,
                minMode: this.minMode,
                showIgnoredItems: this.showIgnoredItems,
                baseCardLayout: this.baseCardLayout,
                cardLayout: this.cardLayout,
                hideHeaderElements: this.hideHeaderElements,
                showDateDividers: this.showDateDividers,
                showNoteTags: this.showNoteTags,
                recentSources: this.recentSources,
                futureSources: this.futureSources,
            }
        };
    }

    // 讀取視圖狀態
    async setState(state: any): Promise<void> {
        if (state?.state) {
            this.sourceMode = state.state.sourceMode || 'folder';
            this.sourcePath = state.state.sourcePath || '/';
            this.baseSortType = state.state.baseSortType || this.plugin.settings.defaultSortType;
            this.sortType = state.state.sortType || this.baseSortType;
            this.searchQuery = state.state.searchQuery || '';
            this.searchCurrentLocationOnly = state.state.searchCurrentLocationOnly ?? false;
            this.searchFilesNameOnly = state.state.searchFilesNameOnly ?? false;
            this.searchMediaFiles = state.state.searchMediaFiles ?? false;
            this.includeMedia = state.state.includeMedia ?? false;
            this.minMode = state.state.minMode ?? false;
            this.showIgnoredItems = state.state.showIgnoredItems ?? false;
            this.baseCardLayout = state.state.baseCardLayout ?? 'horizontal';
            this.cardLayout = state.state.cardLayout ?? this.baseCardLayout;
            this.hideHeaderElements = state.state.hideHeaderElements ?? false;
            this.showDateDividers = state.state.showDateDividers ?? this.plugin.settings.dateDividerMode !== 'none';
            this.showNoteTags = state.state.showNoteTags ?? this.plugin.settings.showNoteTags;
            this.recentSources = state.state.recentSources ?? [];
            this.futureSources = state.state.futureSources ?? [];
            await this.render();
        }
    }
}