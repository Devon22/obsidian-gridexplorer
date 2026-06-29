import { WorkspaceLeaf, ItemView, TFolder, TFile, Menu, Notice, Platform, setIcon, getFrontMatterInfo, FrontMatterCache, normalizePath, setTooltip } from 'obsidian';
import JSZip from 'jszip';
import GridExplorerPlugin from './main';
import { renderHeaderButton } from './renderHeaderButton';
import { renderModePath } from './renderModePath';
import { renderFolder } from './renderFolder';
import { renderFiles } from './renderFiles';
import { handleKeyDown } from './handleKeyDown';
import { isMediaFile, isImageFile, isVideoFile, isAudioFile, getFiles, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from './utils/fileUtils';
import { FileWatcher } from './FileWatcher';
import { findFirstImageInNote, getFirstImageFromZip } from './utils/mediaUtils';
import { isHexColor, hexToRgba } from './utils/colorUtils';
import { showFolderSelectionModal } from './modal/folderSelectionModal';
import { MediaModal } from './modal/mediaModal';
import { showNoteSettingsModal } from './modal/noteSettingsModal';
import { showSearchModal } from './modal/searchModal';
import { FloatingAudioPlayer } from './FloatingAudioPlayer';
import { ExplorerView, EXPLORER_VIEW_TYPE } from './ExplorerView';
import { GridPreviewManager } from './GridPreviewManager';
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

// 定義網格視圖
type GridViewLeaf = WorkspaceLeaf & {
    pinned?: boolean;
    updateHeader?: () => void;
};

interface DataviewEventSource {
    on(name: 'dataview:index-ready', callback: () => void): ReturnType<GridExplorerPlugin['app']['metadataCache']['on']>;
}

interface WorkspaceEventTrigger {
    trigger?: (name: 'ge-grid-source-changed', data: { mode: string; path: string }) => void;
}

interface InternalPlugins {
    plugins: {
        bookmarks?: {
            enabled?: boolean;
        };
    };
    getPluginById?: (id: string) => {
        instance?: {
            openGlobalSearch?: (query: string) => void;
        };
    } | undefined;
}

interface AppWithInternalPlugins {
    internalPlugins?: InternalPlugins;
}

interface CommandManager {
    executeCommandById?: (id: string) => void;
}

interface AppWithCommands {
    commands?: CommandManager;
}

interface MenuItemWithWarning {
    setWarning: (warning: boolean) => void;
}

interface ExplorerViewActions {
    addToStash: (filePaths: string[]) => void;
    refresh: () => void;
}

interface WorkspaceSplitWithChildren {
    children?: unknown[];
}

interface SourceInfo {
    mode: string;
    path?: string;
    searchQuery?: string;
    searchCurrentLocationOnly?: boolean;
    searchFilesNameOnly?: boolean;
    searchMediaFiles?: boolean;
}

interface GridViewStateData {
    sourceMode?: string;
    sourcePath?: string;
    baseSortType?: string;
    sortType?: string;
    searchQuery?: string;
    searchCurrentLocationOnly?: boolean;
    searchFilesNameOnly?: boolean;
    searchMediaFiles?: boolean;
    fileNameFilterQuery?: string;
    includeMedia?: boolean | 'media-only';
    baseMinMode?: boolean;
    minMode?: boolean;
    showIgnoredItems?: boolean;
    baseCardLayout?: 'horizontal' | 'vertical';
    cardLayout?: 'horizontal' | 'vertical';
    hideHeaderElements?: boolean;
    showFileNameFilter?: boolean;
    baseShowDateDividers?: boolean;
    showDateDividers?: boolean;
    showNoteTags?: boolean;
    recentSources?: string[];
    futureSources?: string[];
    bookmarkGroupId?: string;
}

interface GridViewState {
    state?: GridViewStateData;
}

interface ShortcutFrontmatter extends FrontMatterCache {
    type?: unknown;
    redirect?: unknown;
    cardLayout?: unknown;
    searchCurrentLocationOnly?: unknown;
    searchFilesNameOnly?: unknown;
    searchMediaFiles?: unknown;
}

function getFrontmatterValue(frontmatter: FrontMatterCache | undefined, key: string): unknown {
    return frontmatter ? (frontmatter as Record<string, unknown>)[key] : undefined;
}

function formatFrontmatterValue(value: unknown): string {
    if (typeof value === 'number') return value.toLocaleString();
    if (typeof value === 'string') return value;
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'symbol' || typeof value === 'function') return '';
    if (Array.isArray(value)) return value.map(item => formatFrontmatterValue(item)).join(', ');
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return '';
        }
    }
    return '';
}

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
    fileNameFilterQuery: string = ''; // 目前列表的檔名篩選關鍵字
    includeMedia: boolean | 'media-only' = false; // 是否包含媒體檔案
    selectedItemIndex: number = -1; // 當前選中的項目索引
    selectedItems: Set<number> = new Set(); // 存儲多選的項目索引
    gridItems: HTMLElement[] = []; // 存儲所有網格項目的引用
    hasKeyboardFocus: boolean = false; // 是否有鍵盤焦點
    fileWatcher: FileWatcher | null = null; // 檔案監聽器
    recentSources: string[] = []; // 歷史記錄
    futureSources: string[] = []; // 未來紀錄（前進堆疊）
    baseMinMode: boolean = false; // 基礎最小模式（不受資料夾臨時覆蓋影響）
    minMode: boolean = false; // 目前實際使用的最小模式（可能被資料夾 metadata 臨時覆蓋）
    showIgnoredItems: boolean = false; // 顯示忽略的資料夾及檔案
    baseShowDateDividers: boolean = false; // 基礎顯示日期分隔器狀態（不受資料夾臨時覆蓋影響）
    showDateDividers: boolean = false; // 目前實際使用的顯示日期分隔器狀態（可能被資料夾 metadata 臨時覆蓋）
    showNoteTags: boolean = false; // 顯示筆記標籤
    showFileNameFilter: boolean = true; // 顯示檔名篩選輸入框
    pinnedList: string[] = []; // 置頂清單
    taskFilter: string = 'uncompleted'; // 任務分類
    hideHeaderElements: boolean = false; // 是否隱藏標題列元素（模式名稱和按鈕）
    bookmarkGroupId: string = 'all'; // 書籤群組 ID
    customOptionIndex: number = -1; // 自訂模式選項索引
    baseCardLayout: 'horizontal' | 'vertical' = 'horizontal'; // 使用者在設定或 UI 中選擇的基礎卡片樣式（不受資料夾臨時覆蓋影響）
    cardLayout: 'horizontal' | 'vertical' = 'horizontal'; // 目前實際使用的卡片樣式（可能被資料夾 metadata 臨時覆蓋）
    renderToken: number = 0; // 用於取消尚未完成之批次排程的遞增令牌
    isShowingNote: boolean = false; // 是否正在顯示筆記
    noteViewContainer: HTMLElement | null = null; // 筆記檢視容器
    isShowingZip: boolean = false; // 是否正在顯示 ZIP 預覽
    zipViewContainer: HTMLElement | null = null; // ZIP 檢視容器
    zipThumbnailUrls: Map<number, string> = new Map(); // 暫存縮圖 Blob URL
    zipObserver: IntersectionObserver | null = null; // 用於 Lazy loading
    activeZip: JSZip | null = null; // 解析後的 JSZip 物件
    zipImageFiles: string[] = []; // ZIP 內的圖片路徑列表
    zipCurrentIndex: number = -1; // 當前聚焦的圖片索引
    eventCleanupFunctions: (() => void)[] = []; // 存儲事件清理函數
    targetFocusPath: string | null = null; // 指定下次渲染要對焦的檔案路徑
    previewManager: GridPreviewManager;

    constructor(leaf: WorkspaceLeaf, plugin: GridExplorerPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.previewManager = new GridPreviewManager(this);
        this.containerEl.addClass('ge-grid-view-container');
        this.baseSortType = this.plugin.settings.defaultSortType; // 使用設定中的預設排序模式
        this.sortType = this.baseSortType;
        this.baseCardLayout = this.plugin.settings.cardLayout;
        this.cardLayout = this.baseCardLayout;
        this.baseMinMode = false;
        this.minMode = this.baseMinMode;
        this.baseShowDateDividers = this.plugin.settings.dateDividerMode !== 'none';
        this.showDateDividers = this.baseShowDateDividers;
        this.showNoteTags = this.plugin.settings.showNoteTags;
        this.showFileNameFilter = this.plugin.settings.showFileNameFilter;
        this.searchCurrentLocationOnly = this.plugin.settings.searchCurrentLocationOnly;
        this.searchFilesNameOnly = this.plugin.settings.searchFilesNameOnly;
        this.searchMediaFiles = this.plugin.settings.searchMediaFiles;

        // 根據設定決定是否註冊檔案變更監聽器
        if (this.plugin.settings.enableFileWatcher) {
            this.fileWatcher = new FileWatcher(plugin, this);
            this.fileWatcher.registerFileWatcher();
        }

        // 在 window 層級以捕獲階段攔截快捷鍵，優先阻擋 Obsidian 內建快捷鍵並處理歷史前後退與關閉預覽
        this.registerDomEvent(window, 'keydown', (event: KeyboardEvent) => {
            // 如果焦點在輸入框或可編輯區域，不處理
            const target = event.target as HTMLElement | null;
            if (target && (
                target.isContentEditable ||
                target.closest('input, textarea, select, [contenteditable="true"]')
            )) {
                return;
            }

            if (event.key === 'ArrowLeft' && event.altKey) {
                // 僅在本視圖為活動視圖時才處理
                if (this.app.workspace.getActiveViewOfType(GridView) !== this) return;
                // 有 modal 時不處理
                if (activeDocument.querySelector('.modal-container')) return;

                // 阻止內建快捷鍵與其他監聽器
                event.preventDefault();
                // 停止後續所有監聽器（包含 Obsidian 內建 hotkey）
                event.stopImmediatePropagation();

                if (this.isShowingNote || this.isShowingZip) {
                    void this.previewManager.navigatePreviewBack();
                } else {
                    void this.navigateBack();
                    this.clearSelection();
                }
            } else if (event.key === 'ArrowRight' && event.altKey) {
                // 僅在本視圖為活動視圖時才處理
                if (this.app.workspace.getActiveViewOfType(GridView) !== this) return;
                // 有 modal 時不處理
                if (activeDocument.querySelector('.modal-container')) return;

                // 阻止內建快捷鍵與其他監聽器
                event.preventDefault();
                // 停止後續所有監聽器（包含 Obsidian 內建 hotkey）
                event.stopImmediatePropagation();

                if (this.isShowingNote || this.isShowingZip) {
                    void this.previewManager.navigatePreviewForward();
                } else {
                    void this.navigateForward();
                    this.clearSelection();
                }
            } else if ((event.key === 'ArrowUp' && event.altKey) || event.key === 'Backspace') {
                // 僅在本視圖為活動視圖時才處理
                if (this.app.workspace.getActiveViewOfType(GridView) !== this) return;
                // 有 modal 時不處理
                if (activeDocument.querySelector('.modal-container')) return;

                // 若正在顯示預覽，則關閉預覽
                if (this.isShowingNote || this.isShowingZip) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    if (this.isShowingZip) {
                        this.previewManager.hideZipInGrid();
                    } else {
                        this.previewManager.hideNoteInGrid();
                    }
                }
            }
        }, true);

        // 註冊鍵盤事件處理
        this.registerDomEvent(activeDocument, 'keydown', (event: KeyboardEvent) => {
            // 只有當 GridView 是活動視圖時才處理鍵盤事件
            if (this.app.workspace.getActiveViewOfType(GridView) === this) {
                return handleKeyDown(this, event);
            }
        });

        // 監聽 dataview:index-ready
        this.registerEvent(
            (this.app.metadataCache as unknown as DataviewEventSource).on('dataview:index-ready', () => {
                if (this.sourceMode.startsWith('custom-')) {
                    void this.render();
                }
            })
        );

        // 在行動端監聽分頁切換事件，當離開當前視圖時恢復導航欄
        if (Platform.isPhone) {
            this.registerEvent(
                this.app.workspace.on('active-leaf-change', () => {
                    const activeView = this.app.workspace.getActiveViewOfType(GridView);
                    if (activeView !== this) {
                        const navbar = activeDocument.querySelector('.mobile-navbar') as HTMLElement;
                        if (navbar) {
                            navbar.setCssProps({
                                transform: 'translateY(0)',
                                transition: 'transform 0.3s ease-in',
                            });
                        }
                    }
                })
            );
        }

        // 監聽外部檔案拖曳進來並複製到目前資料夾
        this.registerDomEvent(this.containerEl, 'dragover', (event: DragEvent) => {
            if (this.sourceMode === 'folder') {
                const types = event.dataTransfer?.types || [];
                // 確保為外部系統檔案拖曳，排除內部元素拖曳 (內部拖曳通常含有 text/html 或 text/plain)
                const isExternalFile = types.includes('Files') && !types.includes('text/html') && !types.includes('text/plain');
                if (isExternalFile) {
                    event.preventDefault();
                    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
                    this.containerEl.addClass('ge-dragover');
                }
            }
        });

        this.registerDomEvent(this.containerEl, 'dragleave', () => {
            this.containerEl.removeClass('ge-dragover');
        });

        this.registerDomEvent(this.containerEl, 'drop', async (event: DragEvent) => {
            if (this.sourceMode !== 'folder') return;
            this.containerEl.removeClass('ge-dragover');

            if (!event.dataTransfer) return;

            const types = event.dataTransfer.types || [];
            const isExternalFile = types.includes('Files') && !types.includes('text/html') && !types.includes('text/plain');
            
            // 如果不是外部檔案，直接返回（交給其他已經寫好搬移邏輯的處理器處理，不攔截）
            if (!isExternalFile) return;

            // 處理外部檔案的複製匯入 (Copy/Import)
            event.preventDefault();
            event.stopPropagation();

            const files = event.dataTransfer.files;
            if (!files || files.length === 0) return;

            let importedCount = 0;
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                try {
                    const arrayBuffer = await file.arrayBuffer();

                    // 處理檔名重複
                    let baseName = file.name;
                    let extension = '';
                    const lastDotIndex = file.name.lastIndexOf('.');
                    if (lastDotIndex !== -1) {
                        baseName = file.name.substring(0, lastDotIndex);
                        extension = file.name.substring(lastDotIndex);
                    }

                    let targetPath = normalizePath(`${this.sourcePath}/${file.name}`);
                    let counter = 1;
                    while (this.app.vault.getAbstractFileByPath(targetPath)) {
                        targetPath = normalizePath(`${this.sourcePath}/${baseName}_${counter}${extension}`);
                        counter++;
                    }

                    await this.app.vault.createBinary(targetPath, arrayBuffer);
                    importedCount++;
                } catch (err) {
                    console.error(`GridExplorer: Failed to import file ${file.name}`, err);
                    new Notice(t('import_fail_notice'));
                }
            }

            if (importedCount > 0) {
                if (!this.fileWatcher) {
                    await this.render();
                }
            }
        });
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
        return (this.leaf as GridViewLeaf).pinned ?? false;
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

    private parseSourceInfo(sourceInfoStr: string): SourceInfo | null {
        try {
            return JSON.parse(sourceInfoStr) as SourceInfo;
        } catch {
            return null;
        }
    }

    // 歷史記錄後退
    async navigateBack() {
        if (this.recentSources.length > 0) {
            const currentKey = JSON.stringify({
                mode: this.sourceMode,
                path: this.sourcePath,
                searchQuery: this.searchQuery,
                searchCurrentLocationOnly: this.searchCurrentLocationOnly,
                searchFilesNameOnly: this.searchFilesNameOnly,
                searchMediaFiles: this.searchMediaFiles,
            });
            this.futureSources.unshift(currentKey);
            if (this.futureSources.length > 10) {
                this.futureSources.length = 10;
            }

            const lastSource = this.parseSourceInfo(this.recentSources[0]);
            if (!lastSource) return;
            this.recentSources.shift(); // 從歷史記錄中移除

            await this.setSource(
                lastSource.mode,
                lastSource.path || '',
                false, // 不記錄到歷史
                lastSource.searchQuery || '',
                lastSource.searchCurrentLocationOnly ?? false,
                lastSource.searchFilesNameOnly ?? false,
                lastSource.searchMediaFiles ?? false
            );
        }
    }

    // 歷史記錄前進
    async navigateForward() {
        if (this.futureSources.length > 0) {
            const currentKey = JSON.stringify({
                mode: this.sourceMode,
                path: this.sourcePath,
                searchQuery: this.searchQuery,
                searchCurrentLocationOnly: this.searchCurrentLocationOnly,
                searchFilesNameOnly: this.searchFilesNameOnly,
                searchMediaFiles: this.searchMediaFiles,
            });
            this.recentSources.unshift(currentKey);
            if (this.recentSources.length > 10) {
                this.recentSources.length = 10;
            }

            const nextSource = this.parseSourceInfo(this.futureSources[0]);
            if (!nextSource) return;
            this.futureSources.shift(); // 從未來紀錄中移除

            await this.setSource(
                nextSource.mode,
                nextSource.path || '',
                false, // 不記錄到歷史
                nextSource.searchQuery || '',
                nextSource.searchCurrentLocationOnly ?? false,
                nextSource.searchFilesNameOnly ?? false,
                nextSource.searchMediaFiles ?? false
            );
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
        searchMediaFiles?: boolean,
        bookmarkGroupId?: string
    ) {

        // 如果新的狀態與當前狀態相同，則不進行任何操作
        if (this.sourceMode === mode &&
            this.sourcePath === path &&
            this.searchQuery === searchQuery &&
            this.searchCurrentLocationOnly === searchCurrentLocationOnly &&
            this.searchFilesNameOnly === searchFilesNameOnly &&
            this.searchMediaFiles === searchMediaFiles &&
            (bookmarkGroupId === undefined || this.bookmarkGroupId === bookmarkGroupId)) {
            return;
        }

        // 當切換來源路徑或模式時，應先隱藏當前筆記/ZIP預覽，並清空預覽歷史記錄
        if (this.isShowingNote) {
            this.hideNoteInGrid();
        }
        if (this.isShowingZip) {
            this.hideZipInGrid();
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
            let tempMinMode: boolean = this.baseMinMode;
            let tempShowDateDividers: boolean = this.baseShowDateDividers;

            if (mdFile instanceof TFile) {
                const metadata = this.app.metadataCache.getFileCache(mdFile)?.frontmatter;
                folderSort = typeof metadata?.sort === 'string' ? metadata.sort : undefined;
                if (metadata?.cardLayout === 'horizontal' || metadata?.cardLayout === 'vertical') {
                    tempLayout = metadata.cardLayout as 'horizontal' | 'vertical';
                }
                if (metadata?.minMode === true || metadata?.minMode === 'true') {
                    tempMinMode = true;
                } else if (metadata?.minMode === false || metadata?.minMode === 'false') {
                    tempMinMode = false;
                }
                if (metadata?.showDateDividers === true || metadata?.showDateDividers === 'true') {
                    tempShowDateDividers = true;
                } else if (metadata?.showDateDividers === false || metadata?.showDateDividers === 'false') {
                    tempShowDateDividers = false;
                }
            }
            this.cardLayout = tempLayout;
            this.minMode = tempMinMode;
            this.showDateDividers = tempShowDateDividers;

            // 根據資料夾 frontmatter 的 sort 覆蓋實際排序，否則使用 baseSortType
            this.sortType = folderSort && typeof folderSort === 'string' && folderSort.trim() !== ''
                ? folderSort
                : this.baseSortType;
        } else {
            // 非資料夾模式時
            this.cardLayout = this.baseCardLayout; // 回復基礎卡片排列
            this.minMode = this.baseMinMode; // 回復基礎最小化模式
            this.showDateDividers = this.baseShowDateDividers; // 回復基礎日期分隔器模式
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
        if (bookmarkGroupId !== undefined) {
            this.bookmarkGroupId = bookmarkGroupId;
        }

        // 通知 Obsidian 保存視圖狀態
        this.app.workspace.requestSaveLayout();

        // 發送自訂事件，通知 ExplorerView 目前來源已變更
        try {
            (this.app.workspace as WorkspaceEventTrigger).trigger?.('ge-grid-source-changed', {
                mode: this.sourceMode,
                path: this.sourcePath,
            });
        } catch (error) {
            console.error('GridExplorer: Error triggering ge-grid-source-changed event', error);
        }

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

        // 清空整個容器，移除 Obsidian 原生的標題列以實現滿版
        this.containerEl.empty();

        // 添加頂部按鈕
        renderHeaderButton(this);

        // 顯示路徑 / 模式名稱
        renderModePath(this);

        if (this.showFileNameFilter) {
            // 顯示目前列表的檔名篩選輸入框
            this.renderFileNameFilter();
        }

        // 創建內容區域（使用自訂類別避開行動端 margin-top 影響）
        this.containerEl.createDiv('ge-view-content');

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
                            this.pinnedList = (metadata['pinned'] as string[]).filter((name: string) => name !== `${folderName}.md`);
                            // 將資料夾筆記添加到最前面
                            this.pinnedList.unshift(`${folderName}.md`);
                        } else {
                            this.pinnedList = metadata['pinned'] as string[];
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
        (this.leaf as GridViewLeaf).updateHeader?.();


        // 如果有之前選中的檔案路徑，嘗試恢復選中狀態
        if (selectedFilePath && this.hasKeyboardFocus) {
            const newIndex = this.gridItems.findIndex(item => item.dataset.filePath === selectedFilePath);
            if (newIndex >= 0) {
                this.selectItem(newIndex);
            }
        }

        // new Notice('GridExplorer: ' + this.sourceMode + ' ' + this.sourcePath);
    }

    // 渲染檔名篩選框
    renderFileNameFilter() {
        const filterContainer = this.containerEl.createDiv('ge-file-filter-container');
        const contentEl = this.containerEl.querySelector('.ge-view-content');
        if (contentEl) {
            this.containerEl.insertBefore(filterContainer, contentEl);
        }
        const inputWrapper = filterContainer.createDiv('ge-file-filter-input-wrapper');
        const filterInput = inputWrapper.createEl('input', {
            type: 'text',
            cls: 'ge-file-filter-input',
            attr: {
                placeholder: t('file_name_filter_placeholder')
            }
        });
        const searchButton = inputWrapper.createEl('button', {
            cls: 'ge-file-filter-search clickable-icon',
            attr: {
                'aria-label': t('search')
            }
        });
        setIcon(searchButton, 'arrow-right');
        const clearButton = inputWrapper.createEl('button', {
            cls: 'ge-file-filter-clear clickable-icon',
            attr: {
                'aria-label': t('clear_file_name_filter')
            }
        });
        setIcon(clearButton, 'x');

        const updateClearButton = () => {
            const hasContent = filterInput.value.length > 0;
            searchButton.toggleClass('is-visible', hasContent);
            clearButton.toggleClass('is-visible', hasContent);
        };
        let filterRenderTimer: number | null = null;
        const renderFilteredFiles = async () => {
            filterRenderTimer = null;
            this.clearSelection();
            await this.grid_render();
        };
        const scheduleFilteredRender = () => {
            if (filterRenderTimer !== null) {
                window.clearTimeout(filterRenderTimer);
            }
            filterRenderTimer = window.setTimeout(() => { void renderFilteredFiles(); }, 250);
        };
        let isComposingFilterText = false;

        filterInput.value = this.fileNameFilterQuery;
        updateClearButton();
        filterInput.addEventListener('compositionstart', () => {
            isComposingFilterText = true;
            if (filterRenderTimer !== null) {
                window.clearTimeout(filterRenderTimer);
                filterRenderTimer = null;
            }
        });
        filterInput.addEventListener('compositionend', () => {
            isComposingFilterText = false;
            this.fileNameFilterQuery = filterInput.value;
            updateClearButton();
            scheduleFilteredRender();
        });
        filterInput.addEventListener('input', (event: InputEvent) => {
            if (isComposingFilterText || event.isComposing) return;
            this.fileNameFilterQuery = filterInput.value;
            updateClearButton();
            scheduleFilteredRender();
        });
        searchButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const query = filterInput.value.trim();
            if (!query) return;
            if (filterRenderTimer !== null) {
                window.clearTimeout(filterRenderTimer);
                filterRenderTimer = null;
            }
            // filterInput.value = '';
            // this.fileNameFilterQuery = '';
            updateClearButton();
            showSearchModal(this.app, this, query, searchButton);
        });
        clearButton.addEventListener('click', (event) => {
            void (async () => {
                event.preventDefault();
                event.stopPropagation();
                if (!filterInput.value) return;
                if (filterRenderTimer !== null) {
                    window.clearTimeout(filterRenderTimer);
                    filterRenderTimer = null;
                }
                filterInput.value = '';
                this.fileNameFilterQuery = '';
                updateClearButton();
                this.clearSelection();
                await this.grid_render();
                filterInput.focus();
            })();
        });
    }

    // 渲染網格內容
    setFileNameFilterVisibility(show: boolean, filterButton?: HTMLElement) {
        this.showFileNameFilter = show;
        filterButton?.toggleClass('is-active', show);

        let fileNameFilterContainer = this.containerEl.querySelector('.ge-file-filter-container') as HTMLElement;
        if (!fileNameFilterContainer && show) {
            this.renderFileNameFilter();
            fileNameFilterContainer = this.containerEl.querySelector('.ge-file-filter-container') as HTMLElement;
        }

        if (fileNameFilterContainer) {
            fileNameFilterContainer.style.display = this.hideHeaderElements || !show ? 'none' : 'block';
            if (show && !this.hideHeaderElements) {
                const filterInput = fileNameFilterContainer.querySelector<HTMLInputElement>('.ge-file-filter-input');
                filterInput?.focus();
            }
        }
    }

    async grid_render() {
        const container = this.containerEl.querySelector('.ge-view-content') as HTMLElement;
        container.empty();
        this.renderToken++;
        container.addClass('ge-grid-container');

        // 隱藏頂部元素
        const displayValue = this.hideHeaderElements ? 'none' : 'flex';
        const headerButtons = this.containerEl.querySelector('.ge-header-buttons') as HTMLElement;
        const fileNameFilterContainer = this.containerEl.querySelector('.ge-file-filter-container') as HTMLElement;
        const modeHeaderContainer = this.containerEl.querySelector('.ge-mode-header-container') as HTMLElement;

        if (headerButtons) headerButtons.style.display = displayValue;
        if (fileNameFilterContainer) fileNameFilterContainer.style.display = this.hideHeaderElements || !this.showFileNameFilter ? 'none' : 'block';
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

        // 在移動端添加滾動監聽，根據滾動方向控制導航欄顯示/隱藏
        if (Platform.isPhone) {
            let lastScrollTop = 0;
            let accumulateScroll = 0;
            const handleScroll = () => {
                const mobileNavbar = activeDocument.querySelector('.mobile-navbar') as HTMLElement;
                if (!mobileNavbar) return;

                const currentScrollTop = container.scrollTop;
                const delta = currentScrollTop - lastScrollTop;

                if (delta > 0) {
                    // 往上捲（滾動位置增加）
                    if (accumulateScroll < 0) accumulateScroll = 0;
                    accumulateScroll += delta;
                    if (accumulateScroll > 50 && currentScrollTop > 50) {
                        if (!activeDocument.body.classList.contains('is-floating-nav')) {
                            mobileNavbar.setCssProps({ transform: 'translateY(100%)' });
                        } else {
                            mobileNavbar.setCssProps({ transform: 'translateY(200%)' });
                        }
                        mobileNavbar.setCssProps({ transition: 'transform 0.3s ease-out' });
                    }
                } else if (delta < 0) {
                    // 往下捲（滾動位置減少）
                    if (accumulateScroll > 0) accumulateScroll = 0;
                    accumulateScroll += delta;
                    if (accumulateScroll < -50 || currentScrollTop <= 0) {
                        mobileNavbar.setCssProps({
                            transform: 'translateY(0)',
                            transition: 'transform 0.3s ease-in',
                        });
                    }
                }

                lastScrollTop = currentScrollTop;
            };

            container.addEventListener('scroll', handleScroll);

            // 儲存滾動事件清理函數
            this.eventCleanupFunctions.push(() => {
                container.removeEventListener('scroll', handleScroll);
            });
        }

        // 設定網格項目寬度和高度等設定
        const settings = this.plugin.settings;
        const gridItemWidth = this.cardLayout === 'vertical' ? settings.verticalGridItemWidth : settings.gridItemWidth;
        const gridItemHeight = this.cardLayout === 'vertical' ? settings.verticalGridItemHeight : settings.gridItemHeight;
        const imageAreaWidth = settings.imageAreaWidth;
        const imageAreaHeight = this.cardLayout === 'vertical' ? settings.verticalImageAreaHeight : settings.imageAreaHeight;

        container.setCssProps({
            '--grid-item-width': `${gridItemWidth}px`,
            '--grid-item-height': gridItemHeight === 0 || this.minMode ? '100%' : `${gridItemHeight}px`,
            '--image-area-width': `${imageAreaWidth}px`,
            '--image-area-height': `${imageAreaHeight}px`,
            '--title-font-size': `${settings.titleFontSize}em`,
        });

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
        if (this.sourceMode === 'bookmarks' && !(this.app as AppWithInternalPlugins).internalPlugins?.plugins.bookmarks?.enabled) {
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
        void renderFolder(this, container);

        // 顯示檔案
        let files = await renderFiles(this, container);

        // 根據輸入框內容篩選目前列表中的檔案名稱
        const fileNameFilterKeywords = this.fileNameFilterQuery
            .trim()
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean);
        if (this.showFileNameFilter && fileNameFilterKeywords.length > 0) {
            files = files.filter(file => {
                const fileName = file.name.toLowerCase();
                return fileNameFilterKeywords.every(keyword => fileName.includes(keyword));
            });
        }

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

        // 如果資料夾筆記設定為隱藏，則隱藏資料夾筆記（僅在非搜尋模式下執行）
        if (this.sourceMode === 'folder' && this.sourcePath !== '/' && this.searchQuery === '') {
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
            const loadEntry = async (entry: IntersectionObserverEntry) => {
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
                                void this.plugin.saveSettings();
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
                                let summaryValue = formatFrontmatterValue(getFrontmatterValue(metadata, summaryField));
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
                                            const fieldList = fields.split(',').map(f => f.trim()).filter(Boolean);
                                            const fieldValues: string[] = [];

                                            // 收集所有欄位值，並處理別名（"原始欄位|別名"）
                                            fieldList.forEach(fieldEntry => {
                                                const raw = fieldEntry.trim();
                                                // 處理 alias
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

                                                const rawValue = getFrontmatterValue(metadata, fieldKey);
                                                if (rawValue !== undefined && rawValue !== '' && rawValue !== null) {
                                                    const value = formatFrontmatterValue(rawValue);
                                                    fieldValues.push(`${labelName}: ${value}`);
                                                }
                                            });

                                            // 如果有找到任何欄位值，則組合起來
                                            if (fieldValues.length > 0) {
                                                summaryValue = fieldValues.join('\n');
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
                                        .replace(/!?\[([^\]]*)\]\([^)]+\)|!?\[\[([^\]]+)\]\]/g, (_match: string, p1?: string, p2?: string) => {
                                            const rawLinkText = p1 || p2 || '';
                                            if (!rawLinkText) return '';

                                            const wikiLinkParts = p2 ? rawLinkText.split('|') : [];
                                            const linkTarget = p2 ? wikiLinkParts[0] : rawLinkText;
                                            const linkText = p2 && wikiLinkParts.length > 1 ? wikiLinkParts.slice(1).join('|') : rawLinkText;

                                            // 獲取副檔名並檢查是否為圖片或影片
                                            const extension = linkTarget.split('.').pop()?.toLowerCase() || '';
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
                                const colorValue = getFrontmatterValue(metadata, 'color');
                                if (colorValue) {
                                    // 檢查是否為 HEX 色值
                                    if (typeof colorValue === 'string' && isHexColor(colorValue)) {
                                        // 使用自訂 CSS 變數來設置 HEX 顏色
                                        fileEl.addClass('ge-note-color-custom');
                                        fileEl.setCssProps({
                                            '--ge-note-color-bg': hexToRgba(colorValue, 0.2),
                                            '--ge-note-color-border': hexToRgba(colorValue, 0.5),
                                        });

                                        // 設置預覽內容文字顏色
                                        if (pEl) {
                                            pEl.addClass('ge-note-color-custom-text');
                                            pEl.setCssProps({
                                                '--ge-note-color-text': hexToRgba(colorValue, 0.7),
                                            });
                                        }
                                    } else if (typeof colorValue === 'string') {
                                        // 使用預設的 CSS 類別來設置顏色
                                        fileEl.addClass(`ge-note-color-${colorValue}`);

                                        // 設置預覽內容文字顏色
                                        if (pEl) {
                                            pEl.addClass(`ge-note-color-${colorValue}-text`);
                                        }
                                    }
                                }
                                const titleField = this.plugin.settings.noteTitleField || 'title';
                                const titleValue = formatFrontmatterValue(getFrontmatterValue(metadata, titleField));
                                if (titleValue) {
                                    // 將標題文字設為 frontmatter 的 title
                                    if (titleEl) {
                                        titleEl.textContent = titleValue;
                                    }
                                }

                                const displayValue = getFrontmatterValue(metadata, 'display');
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
                                    fileEl.addClass('ge-grid-item-full-height');
                                } else if (displayValue === 'hidden') {
                                    // 為隱藏的筆記添加特殊樣式類別
                                    fileEl.addClass('ge-note-hidden');
                                }

                                // 如果 frontmatter 同時存在 type 與非空的 redirect（視為捷徑檔），將圖示設為 shuffle
                                const redirectType = getFrontmatterValue(metadata, 'type');
                                const redirectPath = getFrontmatterValue(metadata, 'redirect');
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
                                const extension = file.extension.toLowerCase();
                                const pEl = contentArea.createEl('p', { cls: 'ge-non-doc-preview' });
                                const iconSpan = pEl.createSpan({ cls: 'ge-non-doc-icon' });
                                let iconName = 'file';
                                if (isImageFile(file)) {
                                    iconName = 'image';
                                    iconSpan.addClass('ge-img');
                                } else if (isVideoFile(file)) {
                                    iconName = 'play-circle';
                                    iconSpan.addClass('ge-video');
                                } else if (isAudioFile(file)) {
                                    iconName = 'music';
                                    iconSpan.addClass('ge-audio');
                                } else if (extension === 'pdf') {
                                    iconName = 'paperclip';
                                    iconSpan.addClass('ge-pdf');
                                } else if (extension === 'canvas') {
                                    iconName = 'layout-dashboard';
                                    iconSpan.addClass('ge-canvas');
                                } else if (extension === 'base') {
                                    iconName = 'layout-list';
                                    iconSpan.addClass('ge-base');
                                } else if (extension === 'zip') {
                                    iconName = 'folder-archive';
                                    iconSpan.addClass('ge-zip');
                                }
                                setIcon(iconSpan, iconName);
                                pEl.createSpan({ text: file.extension.toUpperCase() });
                            }

                            setTooltip(fileEl, `${file.name}`, { delay: 2000 })
                        }

                        // 顯示標籤（僅限 Markdown 檔案）
                        if (file.extension === 'md' && this.showNoteTags && !this.minMode) {
                            const fileCache = this.app.metadataCache.getFileCache(file);
                            const displaySetting = getFrontmatterValue(fileCache?.frontmatter, 'display');

                            // 如果筆記是最小化就直接跳過標籤邏輯
                            if (displaySetting !== 'minimized') {

                                const allTags = new Set<string>();

                                // 從 frontmatter 獲取標籤
                                const frontmatterTags = getFrontmatterValue(fileCache?.frontmatter, 'tags');

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
                                                        void this.setSource('', '', true, searchQuery);
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
                                                        void this.setSource('', '', true, searchQuery);
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
                                                void this.setSource('', '', true, tagText);
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
                            } else if (file.extension.toLowerCase() === 'zip') {
                                const zipImgUrl = await getFirstImageFromZip(this.app, file);
                                if (zipImgUrl) {
                                    const img = imageArea.createEl('img');
                                    img.src = zipImgUrl;
                                    img.draggable = false;
                                    imageArea.setAttribute('data-loaded', 'true');
                                } else {
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
            };

            entries.forEach(entry => {
                void loadEntry(entry);
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
            const batchSize = 50;
            let currentIndex = 0;

            // 建立哨兵元素，用於觸發後續載入
            const sentinel = container.createDiv('ge-load-more-sentinel');

            let isLoading = false;

            const loadMore = (entries?: IntersectionObserverEntry[]) => {
                if (currentToken !== this.renderToken) return;

                if (entries && entries[0] && !entries[0].isIntersecting) {
                    return;
                }

                if (isLoading) return;
                isLoading = true;

                // 暫時移除哨兵
                sentinel.remove();

                let targetMaxEnd = currentIndex + batchSize;
                if (this.targetFocusPath) {
                    const tIndex = files.findIndex(f => f.path === this.targetFocusPath);
                    if (tIndex >= currentIndex) {
                        targetMaxEnd = Math.max(targetMaxEnd, tIndex + 1);
                    }
                }
                const end = Math.min(targetMaxEnd, files.length);
                const TIME_BUDGET_MS = Platform.isIosApp ? 6 : 16;

                const renderChunk = () => {
                    if (currentToken !== this.renderToken) return;

                    const startTime = performance.now();
                    while (currentIndex < end && (performance.now() - startTime) < TIME_BUDGET_MS) {
                        this.processFile(files[currentIndex], paramsBase);
                        currentIndex++;
                    }

                    if (currentIndex < end) {
                        window.requestAnimationFrame(renderChunk);
                    } else {
                        // 這一批次處理完畢
                        if (this.targetFocusPath) {
                            // 尋找剛剛載入的目標項目並捲動到該位置
                            const gridItem = Array.from(container.querySelectorAll('.ge-grid-item')).find(
                                item => (item as HTMLElement).dataset.filePath === this.targetFocusPath
                            ) as HTMLElement;

                            if (gridItem) {
                                gridItem.scrollIntoView({ block: 'nearest' });
                                const itemIndex = this.gridItems.indexOf(gridItem);
                                if (itemIndex >= 0) {
                                    this.selectItem(itemIndex);
                                }
                                this.targetFocusPath = null; // 處理完清除目標
                            }
                        }

                        if (currentIndex < files.length) {
                            // 還有剩餘檔案，將哨兵加回底部
                            container.appendChild(sentinel);

                            // 主動判斷是否仍在可視範圍內（解決捲動跳轉後 IntersectionObserver 未觸發的問題）
                            window.setTimeout(() => {
                                if (currentToken !== this.renderToken) return;
                                // 由於不一定是在 root container，也可以透過 getBoundingClientRect 簡單測算
                                const rect = sentinel.getBoundingClientRect();
                                const containerRect = container.getBoundingClientRect();
                                if (rect.top - containerRect.bottom < 400) {
                                    loadMore();
                                }
                            }, 50);
                        }

                        isLoading = false;
                    }
                };

                renderChunk();
            };

            const sentinelObserver = new IntersectionObserver(loadMore, {
                root: container,
                rootMargin: '400px', // 提早 400px 載入
                threshold: 0
            });

            sentinelObserver.observe(sentinel);

            // 初始載入
            loadMore();
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
                pinDivider.addClass('ge-ios-divider');
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
                            const dateStr = getFrontmatterValue(metadata.frontmatter, fieldName);
                            if (dateStr) {
                                if (typeof dateStr !== 'string' && typeof dateStr !== 'number' && !(dateStr instanceof Date)) continue;
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
                    dateDivider.addClass('ge-ios-divider');
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

        // 創建標題（立即載入）
        const shouldShowExtension = this.minMode && extension !== 'md';
        const displayText = shouldShowExtension ? `${file.basename}.${file.extension}` : file.basename;
        const titleEl = titleContainer.createEl('span', { cls: 'ge-title', text: displayText });
        if (this.plugin.settings.multiLineTitle) {
            titleEl.addClass('ge-multiline-title');
            titleContainer.addClass('has-multiline-title');
        }

        // 創建圖片區域，但先不載入圖片
        if (!this.minMode) {
            fileEl.createDiv('ge-image-area');
        }

        // 開始觀察這個元素
        observer.observe(fileEl);

        // 加入滑鼠移入顯示的右上角圓形按鈕（僅針對可在網格中顯示筆記的檔案）
        // 位置與顯示由 CSS 控制（.ge-hover-open-note）
        // 當設定為「直接在網格中顯示筆記」時，不顯示此按鈕
        /*
        if (file.extension === 'md' && !this.plugin.settings.showNoteInGrid) {
            // 確保容器可做為定位參考
            fileEl.style.position = fileEl.style.position || 'relative';
            const quickBtn = fileEl.createDiv({ cls: 'ge-hover-open-note' });
            setIcon(quickBtn, 'maximize-2');
            quickBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                // 如果是捷徑檔案，遵循捷徑開啟邏輯；否則在網格中顯示筆記
                if (!this.openShortcutFile(file)) {
                    void this.showNoteInGrid(file);
                }
            });
            // 阻止滑鼠事件影響拖曳或選取
            quickBtn.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });
        }*/

        // 滑鼠懸停在項目上時，按 Ctrl 鍵直接顯示筆記或 ZIP 圖片網格
        if (Platform.isDesktop && (file.extension === 'md' || file.extension === 'zip') && !this.plugin.settings.showNoteInGrid) {
            let triggeredInHover = false;
            let isHovering = false;
            let isMouseDown = false; // 追蹤滑鼠按下狀態
            let keydownListener: ((e: KeyboardEvent) => void) | null = null;

            const trigger = () => {
                if (triggeredInHover || isMouseDown) return; // 如果滑鼠按下則不觸發
                triggeredInHover = true;
                if (!this.openShortcutFile(file)) {
                    if (file.extension === 'md') {
                        void this.showNoteInGrid(file);
                    } else if (file.extension === 'zip') {
                        void this.showZipInGrid(file);
                    }
                }
            };

            const onKeyDown = (e: KeyboardEvent) => {
                const target = e.target as HTMLElement | null;
                const isEditingText = target?.closest('input, textarea, select, [contenteditable="true"]');

                // 只有在滑鼠確實懸停在此項目上且單獨按下 Ctrl 時才觸發
                // 避免在篩選輸入框使用 Ctrl+C / Ctrl+V 等快捷鍵時誤開筆記
                // 且滑鼠沒有按下（避免干擾 Ctrl+click）
                // 並且當前 GridView 必須是活動視圖
                if (isHovering && e.key === 'Control' && !isEditingText && !isMouseDown &&
                    this.app.workspace.getActiveViewOfType(GridView) === this) {
                    // 短暫延遲以確保不是 Ctrl+click 操作
                    window.setTimeout(() => {
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
                window.setTimeout(() => {
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
                    activeDocument.addEventListener('keydown', keydownListener, { capture: true });
                }
            };

            const onMouseLeave = () => {
                isHovering = false;
                isMouseDown = false;
                if (keydownListener) {
                    activeDocument.removeEventListener('keydown', keydownListener, { capture: true });
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
                    activeDocument.removeEventListener('keydown', keydownListener, { capture: true });
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
                        void this.app.workspace.getLeaf('split').openFile(file);
                    } else {
                        // 開啟文件檔案到新分頁
                        void this.app.workspace.getLeaf(true).openFile(file);
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
                    void this.getLeafByMode(file).openFile(file);
                } else {
                    // 非媒體檔案
                    // 如果是捷徑檔案，則開啟捷徑，否則在網格視圖中直接顯示筆記
                    if (!this.openShortcutFile(file)) {
                   		if(file.extension === 'md') {
                        	void this.showNoteInGrid(file); // 在網格視圖中直接顯示筆記
                    	} else if (file.extension === 'zip') {
                            void this.showZipInGrid(file); // 在網格視圖中直接顯示 ZIP
                        } else {
	                    	void this.getLeafByMode(file).openFile(file);
	                    }
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
                            void (async () => {
                                const content = await this.app.vault.cachedRead(file);
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
                                    await this.openNoteFile(leaf, file, { eState: { line: lineNumber } });
                                    (this.app as AppWithCommands).commands?.executeCommandById?.('editor:focus');
                                    return;
                                }
                                // 若都找不到關鍵字，直接開檔
                                await this.openNoteFile(leaf, file);
                            })();
                        } else {
                            void this.openNoteFile(leaf, file);
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
                    void this.app.workspace.getLeaf(true).openFile(file);
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

                if (selectedFiles.length > 1) {
                    // 設定 text/plain
                    const mdList = selectedFiles
                        .map(f => {
                            const link = this.app.fileManager.generateMarkdownLink(f, '');
                            return isMediaFile(f) ? `!${link}` : link;
                        })
                        .join('\n');
                    event.dataTransfer?.setData('text/plain', mdList);

                    // 兼容舊版：提供 markdown 連結與舊自定義 MIME，供 main.ts 使用
                    event.dataTransfer?.setData('application/obsidian-grid-explorer-files', JSON.stringify(selectedFiles.map(f => f.path)));

                    drag_filename = `${selectedFiles.length} ${t('files')}`;
                } else {
                    // 設定 text/plain
                    let mdLink = this.app.fileManager.generateMarkdownLink(file, '');
                    if (isMediaFile(file)) {
                        mdLink = `!${mdLink}`;
                    }
                    event.dataTransfer?.setData('text/plain', mdLink);

                    // 兼容舊版：提供 markdown 連結與舊自定義 MIME，供 main.ts 使用
                    event.dataTransfer?.setData('application/obsidian-grid-explorer-files', JSON.stringify([file.path]));

                    drag_filename = file.basename;
                }

                const dragImage = activeDocument.createElement('div');
                dragImage.className = 'ge-custom-drag-preview';
                dragImage.textContent = drag_filename;

                // 將元素暫時加入 DOM
                activeDocument.body.appendChild(dragImage);

                // 設定拖曳圖示
                event.dataTransfer!.setDragImage(dragImage, 20, 20);

                // 延遲移除元素（讓拖曳圖示正常顯示）
                window.setTimeout(() => {
                    activeDocument.body.removeChild(dragImage);
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
                                void this.app.workspace.getLeaf(true).openFile(f);
                            }
                        } else {
                            void this.app.workspace.getLeaf(true).openFile(file);
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

            // 複製選項
            menu.addItem((item) => {
                item
                    .setTitle(t("make_a_copy"))
                    .setIcon("copy")
                    .setSection?.("action")
                    .onClick(async () => {
                        for (const f of selectedFiles) {
                            const parentPath = f.parent ? f.parent.path : "";
                            let copyPath = "";
                            if (parentPath && parentPath !== "/") {
                                copyPath = `${parentPath}/${f.basename} 1.${f.extension}`;
                            } else {
                                copyPath = `${f.basename} 1.${f.extension}`;
                            }

                            let counter = 1;
                            while (this.app.vault.getAbstractFileByPath(copyPath)) {
                                counter++;
                                if (parentPath && parentPath !== "/") {
                                    copyPath = `${parentPath}/${f.basename} ${counter}.${f.extension}`;
                                } else {
                                    copyPath = `${f.basename} ${counter}.${f.extension}`;
                                }
                            }

                            try {
                                await this.app.vault.copy(f, copyPath);
                            } catch (err) {
                                console.error("Failed to copy file:", err);
                            }
                        }
                    });
            });

            // 刪除選項
            menu.addItem((item) => {
                (item as MenuItemWithWarning).setWarning(true);
                item
                    .setTitle(t('delete_note'))
                    .setIcon("trash")
                    .onClick(() => {
                        void (async () => {
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
                        })();
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
            new Notice('找不到 explorer 視圖');
            return;
        }

        // 使用第一個找到的 ExplorerView
        const explorerView = explorerLeaves[0].view as ExplorerView;

        if (!explorerView) {
            new Notice('無法訪問 explorer 視圖');
            return;
        }

        // 將檔案路徑轉換為字串陣列
        const filePaths = files.map(file => file.path);

        // 調用 ExplorerView 的 addToStash 方法
        (explorerView as unknown as ExplorerViewActions).addToStash(filePaths);

        // 強制立即重新渲染 ExplorerView 以確保畫面更新
        (explorerView as unknown as ExplorerViewActions).refresh();

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
                    void this.render();
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
                    void this.render();
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

        void getMediaFilesPromise.then(filteredMediaFiles => {
            // 找到當前檔案在媒體檔案列表中的索引
            const currentIndex = filteredMediaFiles.findIndex(f => f.path === file.path);
            if (currentIndex === -1) return;

            // 使用 MediaModal 開啟媒體檔案，並傳入 this 作為 gridView 參數
            const mediaModal = new MediaModal(this.app, file, filteredMediaFiles, this);
            mediaModal.open();
        });
    }

    // 開啟筆記檔案，必要時關閉目前的網格視圖
    private async openNoteFile(leaf: WorkspaceLeaf, file: TFile, openState?: Parameters<WorkspaceLeaf['openFile']>[1]): Promise<void> {
        await leaf.openFile(file, openState);

        if (this.plugin.settings.closeGridViewOnOpenNote && leaf !== this.leaf) {
            this.leaf.detach();
        }
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
            case 'split': {
                // 檢查是否已經有 split 視圖存在
                const mainEntry = this.app.workspace.rootSplit as WorkspaceSplitWithChildren | undefined;
                if ((mainEntry?.children?.length ?? 0) > 1) {
                    // 如果已經有 split，直接在現有的 split 中開啟
                    return this.app.workspace.getLeaf(false);
                } else {
                    // 如果沒有 split，創建新的 split
                    return this.app.workspace.getLeaf('split');
                }
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
        const frontmatter: ShortcutFrontmatter | undefined = fileCache?.frontmatter;
        if (!frontmatter) return false;

        const redirectType = typeof frontmatter.type === 'string' ? frontmatter.type : '';
        const redirectPath = typeof frontmatter.redirect === 'string' ? frontmatter.redirect : '';
        const cardLayout = frontmatter.cardLayout === 'horizontal' || frontmatter.cardLayout === 'vertical'
            ? frontmatter.cardLayout
            : undefined;

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
                    void this.getLeafByMode(target).openFile(target);
                    return true;
                } else {
                    new Notice(`${t('target_not_found')}: ${redirectPath}`);
                }
            } else if (redirectType === 'folder') {
                target = this.app.vault.getAbstractFileByPath(normalizePath(redirectPath));
                if (!target) return false;

                // 判斷redirectPath是否為資料夾
                if (target instanceof TFolder) {
                    void this.setSource('folder', redirectPath);
                    this.clearSelection();
                    window.requestAnimationFrame(() => {
                        if (cardLayout && cardLayout !== this.cardLayout) {
                            this.cardLayout = cardLayout;
                            void this.render();
                        }
                    });
                    return true;
                } else {
                    new Notice(`${t('target_not_found')}: ${redirectPath}`);
                }
            } else if (redirectType === 'mode') {
                // 判斷redirectPath是否為模式
                void this.setSource(redirectPath);
                this.clearSelection();
                window.requestAnimationFrame(() => {
                    if (cardLayout && cardLayout !== this.cardLayout) {
                        this.cardLayout = cardLayout;
                        void this.render();
                    }
                });
                return true;
            } else if (redirectType === 'search') {
                const searchCurrentLocationOnly = frontmatter.searchCurrentLocationOnly === true;
                const searchFilesNameOnly = frontmatter.searchFilesNameOnly === true;
                const searchMediaFiles = frontmatter.searchMediaFiles === true;
                void this.setSource('', '', true, redirectPath, searchCurrentLocationOnly, searchFilesNameOnly, searchMediaFiles);
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
        return this.previewManager.showNoteInGrid(file);
    }

    // 隱藏筆記顯示
    hideNoteInGrid() {
        this.previewManager.hideNoteInGrid();
    }

    // 在網格視圖中直接顯示 ZIP 圖片網格
    async showZipInGrid(file: TFile) {
        return this.previewManager.showZipInGrid(file);
    }

    // 開啟 ZIP 內部圖片的 MediaModal
    openZipMediaModal(index: number, gridEl: HTMLElement) {
        this.previewManager.openZipMediaModal(index, gridEl);
    }

    // 隱藏 ZIP 顯示
    hideZipInGrid() {
        this.previewManager.hideZipInGrid();
    }

    selectZipItem(idx: number, gridEl: HTMLElement) {
        this.previewManager.selectZipItem(idx, gridEl);
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
                fileNameFilterQuery: this.fileNameFilterQuery,
                includeMedia: this.includeMedia,
                baseMinMode: this.baseMinMode,
                minMode: this.minMode,
                showIgnoredItems: this.showIgnoredItems,
                baseCardLayout: this.baseCardLayout,
                cardLayout: this.cardLayout,
                hideHeaderElements: this.hideHeaderElements,
                showFileNameFilter: this.showFileNameFilter,
                baseShowDateDividers: this.baseShowDateDividers,
                showDateDividers: this.showDateDividers,
                showNoteTags: this.showNoteTags,
                recentSources: this.recentSources,
                futureSources: this.futureSources,
                bookmarkGroupId: this.bookmarkGroupId,
            }
        };
    }

    // 讀取視圖狀態
    async setState(state: GridViewState): Promise<void> {
        if (state?.state) {
            this.sourceMode = state.state.sourceMode || 'folder';
            this.sourcePath = state.state.sourcePath || '/';
            this.baseSortType = state.state.baseSortType || this.plugin.settings.defaultSortType;
            this.sortType = state.state.sortType || this.baseSortType;
            this.searchQuery = state.state.searchQuery || '';
            this.searchCurrentLocationOnly = state.state.searchCurrentLocationOnly ?? false;
            this.searchFilesNameOnly = state.state.searchFilesNameOnly ?? false;
            this.searchMediaFiles = state.state.searchMediaFiles ?? false;
            this.fileNameFilterQuery = state.state.fileNameFilterQuery ?? '';
            this.includeMedia = state.state.includeMedia ?? false;
            this.baseMinMode = state.state.baseMinMode ?? state.state.minMode ?? false;
            this.minMode = state.state.minMode ?? this.baseMinMode;
            this.showIgnoredItems = state.state.showIgnoredItems ?? false;
            this.baseCardLayout = state.state.baseCardLayout ?? 'horizontal';
            this.cardLayout = state.state.cardLayout ?? this.baseCardLayout;
            this.hideHeaderElements = state.state.hideHeaderElements ?? false;
            this.showFileNameFilter = state.state.showFileNameFilter ?? this.plugin.settings.showFileNameFilter;
            this.baseShowDateDividers = state.state.baseShowDateDividers ?? state.state.showDateDividers ?? (this.plugin.settings.dateDividerMode !== 'none');
            this.showDateDividers = state.state.showDateDividers ?? this.baseShowDateDividers;
            this.showNoteTags = state.state.showNoteTags ?? this.plugin.settings.showNoteTags;
            this.recentSources = state.state.recentSources ?? [];
            this.futureSources = state.state.futureSources ?? [];
            this.bookmarkGroupId = state.state.bookmarkGroupId ?? 'all';
            await this.render();
        }
    }
}
