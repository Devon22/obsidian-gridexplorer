import { TFile, TFolder, WorkspaceLeaf, Menu, setIcon, Platform, normalizePath, ItemView, EventRef, FuzzySuggestModal, parseLinktext } from 'obsidian';
import GridExplorerPlugin from './main';
import { GridView } from './GridView';
import { isFolderIgnored, isImageFile, isVideoFile, isAudioFile, isMediaFile } from './utils/fileUtils';
import { extractObsidianPathsFromDT } from './utils/dragUtils';
import { createNewNote, createNewFolder, createNewCanvas, createNewBase, createShortcut } from './utils/createItemUtils';
import { CustomModeModal } from './modal/customModeModal';
import { showFolderNoteSettingsModal } from './modal/folderNoteSettingsModal';
import { showFolderRenameModal } from './modal/folderRenameModal';
import { showFolderMoveModal } from './modal/folderMoveModal';
import { MediaModal } from './modal/mediaModal';
import { ShortcutSelectionModal } from './modal/shortcutSelectionModal';
import { FloatingAudioPlayer } from './FloatingAudioPlayer';
import { t } from './translations';

// 探索器視圖類型常數
export const EXPLORER_VIEW_TYPE = 'explorer-view';

export class ExplorerView extends ItemView {
    plugin: GridExplorerPlugin;

    // 事件監聽器的引用陣列，用於在視圖關閉時清理
    private eventRefs: EventRef[] = [];

    // 延遲渲染的計時器，避免頻繁重繪造成效能問題
    private renderTimer: number | null = null;

    // 記錄展開的資料夾路徑，維持更新後的展開狀態
    // 使用 Set 來快速查詢和去重
    private expandedPaths: Set<string> = new Set();

    // 緩存最後一次已知的 GridView 位置（當焦點不在 GridView 時仍可維持標註）
    // 這樣即使切換到其他視圖，樹狀圖仍能正確顯示當前位置
    private lastMode: string | null = null;
    private lastPath: string | null = null;

    // 篩選輸入字串（依 NAV-SEARCH-STYLES.md）
    private searchQuery: string = '';
    // 在輸入時保持焦點用的旗標
    private keepSearchFocus: boolean = false;
    // 追蹤輸入法組字狀態，避免組字中重繪打斷輸入
    private isComposing: boolean = false;
    private searchInputEl: HTMLInputElement | null = null;
    private searchContainerEl: HTMLElement | null = null;

    // Stash functionality
    private stashFilePaths: string[] = [];

    // Built-in mode icons
    private readonly BUILTIN_MODE_EMOJIS: Record<string, string> = {
        'bookmarks': '📑',
        'search': '🔍',
        'backlinks': '🔗',
        'outgoinglinks': '🔗',
        'recent-files': '📅',
        'all-files': '📔',
        'random-note': '🎲',
        'tasks': '☑️',
    };

    constructor(leaf: WorkspaceLeaf, plugin: GridExplorerPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.containerEl.addClass('ge-explorer-view-container');
    }

    // 延遲渲染，避免頻繁更新
    private scheduleRender() {
        if (this.renderTimer !== null) {
            window.clearTimeout(this.renderTimer);
        }

        this.renderTimer = window.setTimeout(() => {
            this.renderTimer = null;
            if (this.containerEl?.isConnected) {
                this.render();
            }
        }, 100);
    }

    // 獲取視圖類型
    getViewType(): string {
        return EXPLORER_VIEW_TYPE;
    }

    // 獲取顯示名稱
    getDisplayText(): string {
        return t('explorer') || 'Explorer';
    }

    // 獲取圖示
    getIcon(): string {
        return 'folder-tree';
    }

    // 保存視圖狀態
    getState(): Record<string, unknown> {
        return {
            ...super.getState(),
            expandedPaths: Array.from(this.expandedPaths),
            searchQuery: this.searchQuery,
            stashFilePaths: Array.from(this.stashFilePaths),
        };
    }

    // 恢復視圖狀態
    async setState(state: any, result?: any): Promise<void> {
        await super.setState(state, result);

        this.restoreExpandedPaths(state);
        this.restoreSearchQuery(state);
        this.restoreStashFiles(state);
        // 若 state 未提供 stash 或為空，從設定補齊（避免 setState 在 onOpen 之後將暫存清空的情況）
        this.loadStashFromSettingsIfNeeded();
        this.syncSearchInput();
        this.scheduleRender();
    }

    // 恢復展開路徑狀態
    private restoreExpandedPaths(state: any) {
        if (state?.expandedPaths && Array.isArray(state.expandedPaths)) {
            this.expandedPaths = new Set(
                state.expandedPaths.filter((p: unknown) => typeof p === 'string')
            );
        } else {
            this.expandedPaths.clear();
        }
    }

    // 恢復搜尋查詢
    private restoreSearchQuery(state: any) {
        this.searchQuery = (state?.searchQuery && typeof state.searchQuery === 'string')
            ? state.searchQuery
            : '';
    }

    // 恢復暫存檔案列表
    private restoreStashFiles(state: any) {
        if (state?.stashFilePaths && Array.isArray(state.stashFilePaths)) {
            const validPaths = state.stashFilePaths
                .filter((p: unknown) => typeof p === 'string' && p)
                .filter((p: string) => this.app.vault.getAbstractFileByPath(p) instanceof TFile);
            this.stashFilePaths = Array.from(new Set(validPaths));
            // 將還原的暫存區同步回設定，確保下次新建視圖也能取得
            this.persistStashToSettings();
        }
    }

    // 若當前暫存區為空，嘗試從設定載入（處理新建 ExplorerView 未觸發 setState 的情況）
    private loadStashFromSettingsIfNeeded() {
        try {
            if (this.stashFilePaths.length > 0) return;
            const paths = (this.plugin.settings as any)?.explorerStashPaths as unknown;
            if (!Array.isArray(paths)) return;
            const validPaths = paths
                .filter((p: unknown) => typeof p === 'string' && p)
                .filter((p: string) => this.app.vault.getAbstractFileByPath(p) instanceof TFile);
            this.stashFilePaths = Array.from(new Set(validPaths));
        } catch (error) {
            console.error('ExplorerView: Failed to load stash from settings', error);
        }
    }

    // 將目前的暫存清單寫回設定（去重）
    private persistStashToSettings() {
        try {
            const unique = Array.from(new Set(this.stashFilePaths));
            (this.plugin.settings as any).explorerStashPaths = unique;
            // 保存但不觸發整體視圖更新，避免頻繁重繪
            void this.plugin.saveSettings(false);
        } catch (error) {
            console.error('ExplorerView: Failed to save stash to settings', error);
        }
    }

    // 同步搜尋輸入框狀態
    private syncSearchInput() {
        if (this.searchInputEl) {
            this.searchInputEl.value = this.searchQuery;
            const clearBtn = this.searchContainerEl?.querySelector('.ge-explorer-search-clear');
            clearBtn?.toggleClass('show', !!this.searchQuery.trim());
        }
    }

    // 視圖開啟時初始化
    async onOpen(): Promise<void> {
        // 從設定載入暫存區（若目前沒有透過 setState 還原）
        this.loadStashFromSettingsIfNeeded();
        this.render();
        this.registerEventListeners();
    }

    // 註冊事件監聽器
    private registerEventListeners() {
        const { vault } = this.app;
        const schedule = () => this.scheduleRender();

        this.eventRefs.push(
            vault.on('create', schedule),
            vault.on('delete', (file: any) => this.handleFileDelete(file, schedule)),
            vault.on('rename', (file: any, oldPath: string) => this.handleFileRename(file, oldPath, schedule))
        );

        this.registerCustomEvent('ge-grid-source-changed', (payload: any) => {
            // 檢查模式或路徑是否真的改變了
            const newMode = payload?.mode ?? this.lastMode;
            const newPath = payload?.path ?? this.lastPath;
            
            // 只有在模式或路徑真正改變時才更新狀態和觸發重繪
            if (newMode !== this.lastMode || newPath !== this.lastPath) {
                this.lastMode = newMode;
                this.lastPath = newPath;
                
                // 當模式切換時，清理搜尋狀態以避免資料夾被強制展開
                if (this.searchQuery.trim()) {
                    this.searchQuery = '';
                    if (this.searchInputEl) {
                        this.searchInputEl.value = '';
                    }
                    // 同步搜尋輸入框狀態
                    this.syncSearchInput();
                }
                
                schedule();
            }
        });

        this.registerCustomEvent('grid-explorer:folder-note-updated', schedule);
    }

    // 處理檔案刪除事件
    private handleFileDelete(file: any, schedule: () => void) {
        const path = file?.path as string | undefined;
        if (path) {
            this.removeExpandedPrefix(path);
            if (file instanceof TFile) {
                this.stashFilePaths = this.stashFilePaths.filter(p => p !== path);
                this.app.workspace.requestSaveLayout();
                this.persistStashToSettings();
            }
        }
        schedule();
    }

    // 處理檔案重新命名事件
    private handleFileRename(file: any, oldPath: string, schedule: () => void) {
        const newPath = file?.path as string || '';
        if (oldPath && newPath) {
            this.renameExpandedPrefix(oldPath, newPath);
            if (file instanceof TFile) {
                this.stashFilePaths = this.stashFilePaths.map(p => p === oldPath ? newPath : p);
                this.app.workspace.requestSaveLayout();
                this.persistStashToSettings();
            }
        }
        schedule();
    }

    // 註冊自定義事件
    private registerCustomEvent(eventName: string, callback: (...args: any[]) => void) {
        try {
            const ref = (this.app.workspace as any).on?.(eventName, callback);
            if (ref) this.eventRefs.push(ref);
        } catch (error) {
            console.warn(`Failed to register event ${eventName}:`, error);
        }
    }

    // 視圖關閉時清理資源
    async onClose(): Promise<void> {
        this.cleanupEventListeners();
        this.cleanupTimer();
        this.cleanupSearchElements();
    }

    // 清理事件監聽器
    private cleanupEventListeners() {
        const { vault, workspace } = this.app;
        for (const ref of this.eventRefs) {
            try { vault.offref(ref); } catch (error) {
                console.error('ExplorerView: Failed to remove vault event listener', error);
            }
            try { workspace.offref(ref); } catch (error) {
                console.error('ExplorerView: Failed to remove workspace event listener', error);
            }
        }
        this.eventRefs = [];
    }

    // 清理計時器
    private cleanupTimer() {
        if (this.renderTimer !== null) {
            window.clearTimeout(this.renderTimer);
            this.renderTimer = null;
        }
    }

    // 清理搜尋元素引用
    private cleanupSearchElements() {
        this.searchInputEl = null;
        this.searchContainerEl = null;
    }

    // 刷新視圖
    public refresh() {
        this.scheduleRender();
    }

    // 在新視圖中開啟資料夾
    private openFolderInNewView(folderPath: string) {
        const { workspace } = this.app;
        let leaf: any = null;
        switch (this.plugin.settings.defaultOpenLocation) {
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
        if (!leaf) leaf = workspace.getLeaf('tab');
        leaf.setViewState({ type: 'grid-view', active: true });
        if (leaf.view instanceof GridView) {
            leaf.view.setSource('folder', folderPath);
        }
        void workspace.revealLeaf(leaf);
    }

    // 在新視圖中開啟模式
    private openModeInNewView(mode: string) {
        const { workspace } = this.app;
        let leaf: any = null;
        switch (this.plugin.settings.defaultOpenLocation) {
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
        if (!leaf) leaf = workspace.getLeaf('tab');
        leaf.setViewState({ type: 'grid-view', active: true });
        if (leaf.view instanceof GridView) {
            leaf.view.setSource(mode);
        }
        void workspace.revealLeaf(leaf);
    }

    // 主要渲染方法
    private render() {
        const { contentEl } = this;
        const prevScrollTop = contentEl.scrollTop;

        this.ensureSearchContainer(contentEl);
        this.clearContentExceptSearch(contentEl);

        const { currentMode, currentPath, showIgnoredItems } = this.getCurrentGridState();

        this.renderSearchOption(contentEl);
        this.renderStashGroup(contentEl);
        this.renderModeGroups(contentEl, currentMode);
        this.renderFoldersGroup(contentEl, currentMode, currentPath, showIgnoredItems);

        this.handleSearchFocus();
        this.restoreScrollPosition(contentEl, prevScrollTop);
    }

    // 確保搜尋容器存在
    private ensureSearchContainer(contentEl: HTMLElement) {
        if (!this.searchContainerEl || !this.searchContainerEl.isConnected) {
            this.createSearchContainer(contentEl);
        }
    }

    // 清除除搜尋容器外的所有內容
    private clearContentExceptSearch(contentEl: HTMLElement) {
        Array.from(contentEl.children).forEach(child => {
            if (child !== this.searchContainerEl) {
                child.remove();
            }
        });
    }

    // 處理搜尋框焦點
    private handleSearchFocus() {
        if (this.keepSearchFocus && this.searchInputEl) {
            window.setTimeout(() => {
                if (this.searchInputEl) {
                    this.searchInputEl.focus();
                    try {
                        const len = this.searchInputEl.value.length;
                        this.searchInputEl.setSelectionRange(len, len);
                    } catch (error) {
                        console.error('ExplorerView: Failed to set selection range', error);
                    }
                }
            }, 0);
            this.keepSearchFocus = false;
        }
    }

    // 創建搜尋容器
    private createSearchContainer(contentEl: HTMLElement) {
        this.searchContainerEl = contentEl.createDiv({ cls: 'ge-explorer-search-container' });
        this.searchInputEl = this.searchContainerEl.createEl('input', { type: 'text' }) as HTMLInputElement;
        this.searchInputEl.addClass('ge-explorer-search-input');
        this.searchInputEl.placeholder = t?.('search') || 'Search';
        this.searchInputEl.value = this.searchQuery;

        const clearBtn = this.searchContainerEl.createEl('button', { cls: 'ge-explorer-search-clear clickable-icon' });
        setIcon(clearBtn, 'x');
        if (this.searchQuery.trim()) clearBtn.addClass('show');

        this.setupSearchEventListeners(clearBtn, contentEl);
    }

    // 設置搜尋事件監聽器
    private setupSearchEventListeners(clearBtn: HTMLElement, contentEl: HTMLElement) {
        if (!this.searchInputEl) return;

        this.searchInputEl.addEventListener('compositionstart', () => {
            this.isComposing = true;
        });

        this.searchInputEl.addEventListener('compositionend', () => {
            this.isComposing = false;
            this.updateSearchQuery(clearBtn);
        });

        this.searchInputEl.addEventListener('input', () => {
            this.updateSearchQuery(clearBtn);
        });

        this.searchInputEl.addEventListener('keydown', (evt: KeyboardEvent) => {
            this.handleSearchKeydown(evt, clearBtn, contentEl);
        });

        clearBtn.addEventListener('click', () => {
            this.clearSearch(clearBtn);
        });
    }

    // 更新搜尋查詢
    private updateSearchQuery(clearBtn: HTMLElement) {
        if (!this.searchInputEl) return;

        this.searchQuery = this.searchInputEl.value;
        clearBtn.toggleClass('show', !!this.searchQuery.trim());

        if (!this.isComposing) {
            this.keepSearchFocus = true;
            this.scheduleRender();
            this.app.workspace.requestSaveLayout();
        }
    }

    // 處理搜尋框按鍵事件
    private handleSearchKeydown(evt: KeyboardEvent, clearBtn: HTMLElement, contentEl: HTMLElement) {
        if (this.isComposing) return;

        if (evt.key === 'ArrowDown') {
            const searchOptionEl = contentEl.querySelector('.ge-explorer-search-option') as HTMLElement;
            if (searchOptionEl) {
                evt.preventDefault();
                searchOptionEl.focus();
            }
        } else if (evt.key === 'Escape') {
            this.clearSearch(clearBtn);
        }
    }

    // 清除搜尋
    private clearSearch(clearBtn: HTMLElement) {
        this.searchQuery = '';
        if (this.searchInputEl) this.searchInputEl.value = '';
        clearBtn.removeClass('show');
        this.scheduleRender();
        this.app.workspace.requestSaveLayout();
        window.setTimeout(() => this.searchInputEl?.focus(), 0);
    }

    /**
     * 渲染搜尋選項（如果有搜尋字串）
     */
    private renderSearchOption(contentEl: HTMLElement) {
        const trimmed = this.searchQuery.trim();
        if (trimmed.length > 0) {
            const searchItem = contentEl.createDiv({
                cls: 'ge-explorer-folder-header ge-explorer-mode-item ge-explorer-search-option'
            });
            // 讓搜尋選項可被鍵盤聚焦與操作
            searchItem.setAttr('tabindex', '0');
            searchItem.setAttr('role', 'button');
            const searchIcon = searchItem.createSpan({ cls: 'ge-explorer-folder-icon' });
            setIcon(searchIcon, 'search');
            const searchName = searchItem.createSpan({ cls: 'ge-explorer-folder-name' });
            searchName.textContent = `${t ? t('search_for') : 'Search for'} "${trimmed}"`;
            searchItem.addEventListener('click', async (evt) => {
                evt.stopPropagation();
                await this.openFolderSearch(trimmed);
            });
            // 鍵盤支援：Enter 觸發、ArrowUp 返回輸入框、Escape 清空並返回
            searchItem.addEventListener('keydown', async (evt: KeyboardEvent) => {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    await this.openFolderSearch(trimmed);
                } else if (evt.key === 'ArrowUp') {
                    evt.preventDefault();
                    this.searchInputEl?.focus();
                } else if (evt.key === 'Escape') {
                    evt.preventDefault();
                    this.searchQuery = '';
                    if (this.searchInputEl) this.searchInputEl.value = '';
                    const clearBtn = this.searchContainerEl?.querySelector('.ge-explorer-search-clear');
                    clearBtn?.removeClass('show');
                    this.scheduleRender();
                    // 通知 Obsidian 保存視圖狀態
                    this.app.workspace.requestSaveLayout();
                    window.setTimeout(() => this.searchInputEl?.focus(), 0);
                }
            });
        }
    }

    /**
     * 獲取當前 GridView 的狀態資訊
     * 如果沒有活躍的 GridView，則使用快取的最後已知狀態
     * @returns 包含模式、路徑和顯示設定的狀態物件
     */
    private getCurrentGridState() {
        // 嘗試獲取當前活躍的 GridView
        const activeGrid = this.app.workspace.getActiveViewOfType(GridView);

        // 如果有活躍的 GridView，檢查是否需要更新快取的狀態
        if (activeGrid) {
            const currentMode = activeGrid.sourceMode;
            const currentPath = activeGrid.sourcePath;
            
            // 只有在狀態真正改變時才更新快取
            if (currentMode !== this.lastMode || currentPath !== this.lastPath) {
                this.lastMode = currentMode;
                this.lastPath = currentPath;
            }
        }

        // 返回當前狀態，優先使用活躍 GridView 的狀態，否則使用快取
        return {
            currentMode: (activeGrid?.sourceMode ?? this.lastMode) ?? '',
            currentPath: (activeGrid?.sourcePath ?? this.lastPath) ?? '',
            showIgnoredItems: activeGrid?.showIgnoredItems ?? false
        };
    }

    // 檢查是否正在過濾
    private isFiltering(): boolean {
        return !!this.searchQuery?.trim();
    }

    // 檢查文字是否符合查詢
    private matchesQuery(text?: string): boolean {
        const query = this.searchQuery?.trim().toLowerCase();
        if (!query) return true;
        return (text || '').toLowerCase().includes(query);
    }

    // 檢查資料夾是否應該顯示
    private shouldShowFolder(folder: TFolder): boolean {
        if (!this.isFiltering()) return true;
        if (this.matchesQuery(folder.name)) return true;

        const settings = this.plugin.settings;
        const activeGrid = this.app.workspace.getActiveViewOfType(GridView);
        const showIgnoredItems = activeGrid?.showIgnoredItems ?? false;

        const childFolders = folder.children
            .filter((f): f is TFolder => f instanceof TFolder)
            .filter((f) => !isFolderIgnored(f, settings.ignoredFolders, settings.ignoredFolderPatterns, showIgnoredItems));

        return childFolders.some((child) => this.shouldShowFolder(child));
    }

    // 檢查是否有可見的頂層資料夾
    private hasVisibleTopLevelFolders(showIgnoredItems: boolean): boolean {
        const root = this.app.vault.getRoot();
        const settings = this.plugin.settings;

        const topLevelFolders = root.children
            .filter((f): f is TFolder => f instanceof TFolder)
            .filter(f => !isFolderIgnored(f, settings.ignoredFolders, settings.ignoredFolderPatterns, showIgnoredItems));

        return topLevelFolders.some((f) => this.shouldShowFolder(f));
    }

    // 檢查資料夾是否有符合搜尋條件的子項目
    private hasMatchingChildren(folder: TFolder): boolean {
        if (!this.isFiltering()) return false;
        
        // 檢查資料夾名稱本身是否符合搜尋條件
        if (this.matchesQuery(folder.name)) return true;
        
        // 檢查子資料夾是否有符合條件的
        const settings = this.plugin.settings;
        const activeGrid = this.app.workspace.getActiveViewOfType(GridView);
        const showIgnoredItems = activeGrid?.showIgnoredItems ?? false;
        
        const childFolders = folder.children
            .filter((f): f is TFolder => f instanceof TFolder)
            .filter((f) => !isFolderIgnored(f, settings.ignoredFolders, settings.ignoredFolderPatterns, showIgnoredItems));
        
        return childFolders.some((child) => this.hasMatchingChildren(child));
    }

    // 渲染模式群組
    private renderModeGroups(contentEl: HTMLElement, currentMode: string) {
        const settings = this.plugin.settings;

        const customItems = this.getCustomModeItems(settings);
        this.renderModesGroup(contentEl, '__modes__custom', t?.('custom_modes') || 'Custom Modes', 'puzzle', customItems);

        const builtinItems = this.getBuiltinModeItems(settings);
        this.renderModesGroup(contentEl, '__modes__builtin', t?.('modes') || 'Modes', 'shapes', builtinItems);
    }

    // 獲取自定義模式項目
    private getCustomModeItems(settings: any) {
        const customModes = (settings?.customModes ?? []).filter((cm: any) => cm?.enabled !== false);

        return customModes
            .filter((cm: any) => {
                if (!this.isFiltering()) return true;
                const baseLabel = cm.displayName || cm.internalName || 'Custom';
                return this.matchesQuery(baseLabel);
            })
            .map((cm: any) => {
                const baseLabel = cm.displayName || cm.internalName || 'Custom';
                const internalName = cm.internalName || `custom-${baseLabel}`;
                const textIcon = cm.icon ? `${cm.icon} ` : '';
                return {
                    key: internalName,
                    label: `${textIcon}${baseLabel}`,
                    icon: '',
                    onClick: () => this.openMode(internalName)
                };
            });
    }

    // 獲取內建模式項目
    private getBuiltinModeItems(settings: any) {
        const builtInModes = this.getEnabledBuiltInModes(settings);

        return builtInModes
            .filter(m => !this.isFiltering() || this.matchesQuery(m.label) || this.matchesQuery(m.key))
            .map(m => {
                const emoji = this.BUILTIN_MODE_EMOJIS[m.key] || '';
                const label = emoji ? `${emoji} ${m.label}` : m.label;
                return { key: m.key, label, icon: '', onClick: () => this.openMode(m.key) };
            });
    }

    // 獲取已啟用的內建模式
    private getEnabledBuiltInModes(settings: any) {
        const builtInCandidates = [
            { key: 'bookmarks', label: t?.('bookmarks_mode') || 'Bookmarks', icon: 'bookmark', enabled: !!settings?.showBookmarksMode },
            { key: 'search', label: t?.('search_results') || 'Search', icon: 'search', enabled: !!settings?.showSearchMode },
            { key: 'backlinks', label: t?.('backlinks_mode') || 'Backlinks', icon: 'links-coming-in', enabled: !!settings?.showBacklinksMode },
            { key: 'outgoinglinks', label: t?.('outgoinglinks_mode') || 'Outgoing Links', icon: 'links-going-out', enabled: !!settings?.showOutgoinglinksMode },
            { key: 'all-files', label: t?.('all_files_mode') || 'All Files', icon: 'book-text', enabled: !!settings?.showAllFilesMode },
            { key: 'recent-files', label: t?.('recent_files_mode') || 'Recent Files', icon: 'calendar-days', enabled: !!settings?.showRecentFilesMode },
            { key: 'random-note', label: t?.('random_note_mode') || 'Random Note', icon: 'dice', enabled: !!settings?.showRandomNoteMode },
            { key: 'tasks', label: t?.('tasks_mode') || 'Tasks', icon: 'square-check-big', enabled: !!settings?.showTasksMode },
        ];
        return builtInCandidates.filter(m => m.enabled).map(({ key, label, icon }) => ({ key, label, icon }));
    }

    // 開啟指定模式
    private async openMode(mode: string) {
        const view = await this.plugin.activateView();
        if (view instanceof GridView) await view.setSource(mode);
    }

    // 恢復滾動位置
    private restoreScrollPosition(contentEl: HTMLElement, prevScrollTop: number) {
        contentEl.scrollTop = prevScrollTop;
        requestAnimationFrame(() => {
            contentEl.scrollTop = prevScrollTop;
        });
    }

    // 渲染模式群組
    private renderModesGroup(contentEl: HTMLElement, groupKey: string, title: string, iconName: string, items: Array<{ key?: string; label: string; icon: string; onClick: () => void }>) {
        if (items.length === 0) return;

        const nodeEl = contentEl.createDiv({ cls: 'ge-explorer-folder-node' });
        const header = nodeEl.createDiv({ cls: 'ge-explorer-folder-header' });
        const toggle = header.createSpan({ cls: 'ge-explorer-folder-toggle' });
        let expanded = this.isExpanded(groupKey);
        // 如果正在搜尋且有符合的項目，自動展開群組
        if (this.isFiltering() && items.length > 0) {
            expanded = true;
            this.setExpanded(groupKey, expanded);
        }

        setIcon(toggle, expanded ? 'chevron-down' : 'chevron-right');

        const icon = header.createSpan({ cls: 'ge-explorer-folder-icon' });
        setIcon(icon, iconName);
        const name = header.createSpan({ cls: 'ge-explorer-folder-name' });
        name.textContent = title;

        const children = nodeEl.createDiv({ cls: 'ge-explorer-folder-children' });
        if (!expanded) children.addClass('is-collapsed');

        header.addEventListener('click', () => {
            const newExpanded = !this.isExpanded(groupKey);
            this.setExpanded(groupKey, newExpanded);
            setIcon(toggle, newExpanded ? 'chevron-down' : 'chevron-right');
            children.toggleClass('is-collapsed', !newExpanded);
        });

        // 渲染子項目
        this.renderModeItems(children, items, groupKey);
    }

    // 渲染模式項目
    private renderModeItems(children: HTMLElement, items: Array<{ key?: string; label: string; icon: string; onClick: () => void }>, groupKey: string) {
        const { currentMode } = this.getCurrentGridState();

        items.forEach(({ key, label, icon, onClick }) => {
            const itemEl = children.createDiv({ cls: 'ge-explorer-folder-header ge-explorer-mode-item' });

            this.setupModeItemIcon(itemEl, icon, groupKey);
            this.setupModeItemLabel(itemEl, label);
            this.highlightActiveModeItem(itemEl, key, currentMode);
            this.setupModeItemClick(itemEl, key, currentMode, onClick);

            if (groupKey === '__modes__custom' && key) {
                this.setupCustomModeContextMenu(itemEl, key);
            }
        });
    }

    // 設置模式項目圖示
    private setupModeItemIcon(itemEl: HTMLElement, icon: string, groupKey: string) {
        const itemIcon = itemEl.createSpan({ cls: 'ge-explorer-folder-icon' });
        if (groupKey !== '__modes__custom' && icon) {
            setIcon(itemIcon, icon);
        }
    }

    // 設置模式項目標籤
    private setupModeItemLabel(itemEl: HTMLElement, label: string) {
        const itemName = itemEl.createSpan({ cls: 'ge-explorer-folder-name' });
        itemName.textContent = label;
    }

    // 高亮活躍的模式項目
    private highlightActiveModeItem(itemEl: HTMLElement, key: string | undefined, currentMode: string) {
        if (key && currentMode === key && currentMode !== 'folder') {
            itemEl.addClass('is-active');
        }
    }

    // 設置模式項目點擊事件
    private setupModeItemClick(itemEl: HTMLElement, key: string | undefined, currentMode: string, onClick: () => void) {
        itemEl.addEventListener('click', (evt) => {
            evt.stopPropagation();

            if ((evt.ctrlKey || evt.metaKey) && key) {
                this.openModeInNewView(key);
                return;
            }

            if (key && currentMode === key && currentMode !== 'folder') {
                return;
            }
            onClick();
        });
    }

    // 設置自定義模式右鍵選單
    private setupCustomModeContextMenu(itemEl: HTMLElement, key: string) {
        itemEl.addEventListener('contextmenu', (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            const menu = new Menu();
            menu.addItem((item) => {
                item.setTitle(t?.('edit_custom_mode') || 'Edit Custom Mode')
                    .setIcon('settings')
                    .onClick(() => {
                        const modeIndex = this.plugin.settings.customModes.findIndex((m: any) => m.internalName === key);
                        if (modeIndex === -1) return;
                        new CustomModeModal(this.app, this.plugin, this.plugin.settings.customModes[modeIndex], (result: any) => {
                            this.plugin.settings.customModes[modeIndex] = result;
                            void this.plugin.saveSettings();
                            this.scheduleRender();
                        }).open();
                    });
            });
            menu.showAtMouseEvent(evt as MouseEvent);
        });
    }

    // 渲染資料夾群組
    private renderFoldersGroup(contentEl: HTMLElement, currentMode: string, currentPath: string, showIgnoredItems: boolean) {
        // 如果正在搜尋，檢查是否有符合的資料夾
        if (this.isFiltering()) {
            const hasVisibleFolders = this.hasVisibleTopLevelFolders(showIgnoredItems);
            if (!hasVisibleFolders) {
                return;
            }
        }

        const foldersGroupKey = '__folders__root';
        const foldersNode = contentEl.createDiv({ cls: 'ge-explorer-folder-node' });

        const { foldersChildren } = this.createFoldersGroupHeader(foldersNode, foldersGroupKey, currentMode, currentPath, showIgnoredItems);

        // 若目前在資料夾模式，預先展開對應的父路徑，確保可見
        this.expandCurrentFolderPath(currentMode, currentPath);

        // 列出頂層資料夾
        this.renderTopLevelFolders(foldersChildren, showIgnoredItems);
    }

    // 開啟資料夾搜尋
    private async openFolderSearch(searchTerm: string): Promise<void> {
        const activeView = this.app.workspace.getActiveViewOfType(GridView);
        if (activeView) {
            await activeView.setSource('folder', '/', true, searchTerm);
            return;
        }

        const view = await this.plugin.activateView();
        if (view instanceof GridView) {
            await view.clearSelection();
            await view.setSource('', '', true, searchTerm);
        }
    }

    // 創建資料夾群組標頭
    private createFoldersGroupHeader(foldersNode: HTMLElement, foldersGroupKey: string, currentMode: string, currentPath: string, showIgnoredItems: boolean) {
        const foldersHeader = foldersNode.createDiv({ cls: 'ge-explorer-folder-header' });
        const foldersToggle = foldersHeader.createSpan({ cls: 'ge-explorer-folder-toggle' });

        // 檢查是否已經記錄過展開狀態，如果沒有則預設為收合狀態
        let foldersExpanded = this.isExpanded(foldersGroupKey);
        if (!this.expandedPaths.has(foldersGroupKey)) {
            // 如果正在搜尋且有符合的資料夾，自動展開根選項
            if (this.isFiltering() && this.hasVisibleTopLevelFolders(showIgnoredItems)) {
                foldersExpanded = true;
            } else {
                // 只有在第一次載入且沒有其他展開記錄時才預設展開
                // 避免在模式切換時自動展開
                const hasAnyExpandedPaths = this.expandedPaths.size > 0;
                foldersExpanded = !hasAnyExpandedPaths; // 如果有其他展開路徑，預設收合；否則預設展開
            }
            this.setExpanded(foldersGroupKey, foldersExpanded);
        } else if (this.isFiltering() && this.hasVisibleTopLevelFolders(showIgnoredItems)) {
            // 如果正在搜尋且有符合的資料夾，即使之前是收合狀態也要展開
            foldersExpanded = true;
            this.setExpanded(foldersGroupKey, foldersExpanded);
        }
        setIcon(foldersToggle, foldersExpanded ? 'chevron-down' : 'chevron-right');

        const foldersIcon = foldersHeader.createSpan({ cls: 'ge-explorer-folder-icon' });
        setIcon(foldersIcon, 'folder');
        const foldersName = foldersHeader.createSpan({ cls: 'ge-explorer-folder-name' });
        foldersName.textContent = t ? t('root') : 'Root';

        // 高亮 vault 根（當前為 folder 模式且路徑為根）
        const vaultRoot = this.app.vault.getRoot();
        const rootPath = (vaultRoot as any).path ?? '/';
        if (currentMode === 'folder' && (currentPath === rootPath || currentPath === '' || currentPath === '/')) {
            foldersHeader.addClass('is-active');
        }

        this.attachDropTarget(foldersHeader, rootPath);

        const foldersChildren = foldersNode.createDiv({ cls: 'ge-explorer-folder-children' });
        if (!foldersExpanded) foldersChildren.addClass('is-collapsed');

        foldersHeader.addEventListener('click', (evt) => {
            void (async () => {
                // 判斷點擊的是切換箭頭、資料夾名稱還是空白區域
                if ((evt.target as HTMLElement).closest('.ge-explorer-folder-toggle')) {
                    // 點擊箭頭：只展開/收合
                    const newExpanded = !this.isExpanded(foldersGroupKey);
                    this.setExpanded(foldersGroupKey, newExpanded);
                    setIcon(foldersToggle, newExpanded ? 'chevron-down' : 'chevron-right');
                    foldersChildren.toggleClass('is-collapsed', !newExpanded);
                } else if ((evt.target as HTMLElement).closest('.ge-explorer-folder-name')) {
                    // 點擊資料夾名稱：可能展開/收合，也可能開啟 GridView
                    // Ctrl/Meta + 點擊：在新的 GridView 分頁中開啟
                    if (evt.ctrlKey || evt.metaKey) {
                        this.openFolderInNewView(rootPath);
                        return;
                    }

                    const isActive = foldersHeader.hasClass('is-active');

                    // 如果已是選取狀態，處理展開/收合邏輯
                    if (isActive) {
                        const currentExpanded = this.isExpanded(foldersGroupKey);
                        const newExpanded = !currentExpanded;

                        // 切換展開狀態
                        setIcon(foldersToggle, newExpanded ? 'chevron-down' : 'chevron-right');
                        foldersChildren.toggleClass('is-collapsed', !newExpanded);
                        this.setExpanded(foldersGroupKey, newExpanded);
                        return;
                    }

                    // 開啟 Vault 根目錄
                    const root = this.app.vault.getRoot();
                    const view = await this.plugin.activateView();
                    if (view instanceof GridView) await view.setSource('folder', (root as any).path ?? '/');
                } else {
                    // 點擊空白區域：展開/收合
                    const newExpanded = !this.isExpanded(foldersGroupKey);
                    this.setExpanded(foldersGroupKey, newExpanded);
                    setIcon(foldersToggle, newExpanded ? 'chevron-down' : 'chevron-right');
                    foldersChildren.toggleClass('is-collapsed', !newExpanded);
                }
            })();
        });

        return { foldersHeader, foldersChildren };
    }

    // 展開當前資料夾路徑
    private expandCurrentFolderPath(currentMode: string, currentPath: string) {
        if (currentMode === 'folder' && currentPath) {
            const parts = currentPath.split('/').filter(Boolean);
            let acc = '';
            // 只展開父路徑，不展開當前資料夾本身
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                acc = acc ? `${acc}/${part}` : part;
                this.setExpanded(acc, true);
            }
        }
    }

    // 渲染頂層資料夾
    private renderTopLevelFolders(foldersChildren: HTMLElement, showIgnoredItems: boolean) {
        const root = this.app.vault.getRoot();
        const settings = this.plugin.settings;
        let topLevelFolders = root.children
            .filter((f): f is TFolder => f instanceof TFolder)
            .filter(f => !isFolderIgnored(f, settings.ignoredFolders, settings.ignoredFolderPatterns, showIgnoredItems));

        // 依搜尋字串篩選（顯示符合的節點與其祖先）
        if (this.isFiltering()) {
            topLevelFolders = topLevelFolders.filter((f) => this.shouldShowFolder(f));
        }

        topLevelFolders.sort((a, b) => a.name.localeCompare(b.name));

        for (const child of topLevelFolders) {
            // 在搜尋時，只展開有符合搜尋條件的子資料夾的資料夾
            // 而不是強制展開所有資料夾
            let expanded = this.isExpanded(child.path);
            if (this.isFiltering()) {
                // 檢查是否有符合搜尋條件的子項目
                const hasMatchingChildren = this.hasMatchingChildren(child);
                expanded = hasMatchingChildren || expanded;
            }
            
            // depth=2 -> 28px，與 .ge-explorer-mode-item 的 28px 縮排保持一致
            this.renderFolderNode(child, foldersChildren, expanded, 2);
        }
    }

    /**
     * 渲染單一資料夾節點（遞迴方法）
     * @param folder 要渲染的資料夾物件
     * @param parentEl 父容器元素
     * @param expanded 是否展開狀態
     * @param depth 縮排深度，用於視覺層級顯示
     */
    private renderFolderNode(folder: TFolder, parentEl: HTMLElement, expanded = false, depth = 0) {
        // 建立資料夾節點的主容器
        const nodeEl = parentEl.createDiv({ cls: 'ge-explorer-folder-node' });

        // 建立資料夾標頭（包含圖示、名稱、切換按鈕）
        const header = this.createFolderHeader(nodeEl, folder, expanded, depth);

        // 建立子資料夾的容器
        const childrenContainer = this.createFolderChildren(nodeEl, expanded);

        // 設定點擊和右鍵選單等互動功能
        this.setupFolderInteractions(header, folder, expanded, childrenContainer);

        // 遞迴渲染子資料夾
        this.renderChildFolders(folder, childrenContainer, depth);
    }

    // 創建資料夾標頭
    private createFolderHeader(nodeEl: HTMLElement, folder: TFolder, expanded: boolean, depth: number) {
        const header = nodeEl.createDiv({ cls: 'ge-explorer-folder-header' });
        header.style.paddingLeft = `${Math.max(0, depth) * 14}px`;

        const toggle = header.createSpan({ cls: 'ge-explorer-folder-toggle' });
        const icon = header.createSpan({ cls: 'ge-explorer-folder-icon' });
        const name = header.createSpan({ cls: 'ge-explorer-folder-name' });
        name.textContent = folder.name || '/';

        this.setupFolderIcon(folder, name, toggle, expanded);
        this.highlightActiveFolder(folder, header);
        this.attachDropTarget(header, folder.path);

        // 如果資料夾沒有可見的子目錄，添加 ge-no-children 類別
        if (!this.hasVisibleChildren(folder)) {
            header.addClass('ge-no-children');
        }

        return header;
    }

    // 設置資料夾圖示
    private setupFolderIcon(folder: TFolder, name: HTMLElement, toggle: HTMLElement, expanded: boolean) {
        // 根據同名筆記設置背景色與圖示
        const iconFromFrontmatter = this.getFolderIconFromFrontmatter(folder, name);

        // 沒有 frontmatter icon 時，使用自訂資料夾文字圖示
        if (!iconFromFrontmatter) {
            const customFolderIcon = this.plugin.settings?.customFolderIcon ?? '';
            if (customFolderIcon && name) {
                name.textContent = `${customFolderIcon} ${folder.name || '/'}`.trim();
            }
        }

        // 設置切換圖示
        this.setupToggleIcon(folder, toggle, expanded);
    }

    // 從 frontmatter 獲取資料夾圖示
    private getFolderIconFromFrontmatter(folder: TFolder, name: HTMLElement): boolean {
        try {
            const notePath = `${folder.path}/${folder.name}.md`;
            const noteFile = this.app.vault.getAbstractFileByPath(notePath);
            if (noteFile instanceof TFile) {
                const metadata = this.app.metadataCache.getFileCache(noteFile)?.frontmatter;
                const colorValue = (metadata as any)?.color as string | undefined;
                if (colorValue) {
                    name.parentElement?.addClass(`ge-folder-color-${colorValue}`);
                }
                const iconValue = (metadata as any)?.icon as string | undefined;
                if (iconValue && name) {
                    name.textContent = `${iconValue} ${folder.name || '/'}`;
                    return true;
                }
            }
        } catch (error) {
            console.warn('獲取資料夾 frontmatter 圖示時發生錯誤:', error);
        }
        return false;
    }

    // 設置切換圖示
    private setupToggleIcon(folder: TFolder, toggle: HTMLElement, expanded: boolean) {
        const settings = this.plugin.settings;
        const activeGrid = this.app.workspace.getActiveViewOfType(GridView);
        const showIgnoredItems = activeGrid?.showIgnoredItems ?? false;

        const hasVisibleChildren = folder.children
            .filter((f): f is TFolder => f instanceof TFolder)
            .some((f) => !isFolderIgnored(f, settings.ignoredFolders, settings.ignoredFolderPatterns, showIgnoredItems));

        if (!hasVisibleChildren) {
            toggle.innerHTML = '';
            toggle.addClass('ge-explorer-toggle-empty');
        } else {
            toggle.removeClass('ge-explorer-toggle-empty');
            setIcon(toggle, expanded ? 'chevron-down' : 'chevron-right');
        }
    }

    // 高亮活躍資料夾
    private highlightActiveFolder(folder: TFolder, header: HTMLElement) {
        const activeGrid = this.app.workspace.getActiveViewOfType(GridView);
        if (activeGrid?.sourceMode === 'folder' && activeGrid?.sourcePath === folder.path) {
            header.addClass('is-active');
        }
    }

    // 創建資料夾子容器
    private createFolderChildren(nodeEl: HTMLElement, expanded: boolean) {
        const childrenContainer = nodeEl.createDiv({ cls: 'ge-explorer-folder-children' });
        if (!expanded) childrenContainer.addClass('is-collapsed');
        return childrenContainer;
    }

    // 設置資料夾互動事件
    private setupFolderInteractions(header: HTMLElement, folder: TFolder, expanded: boolean, childrenContainer: HTMLElement) {
        header.addEventListener('click', (evt) => this.handleFolderClick(evt, folder, header, childrenContainer));
        header.addEventListener('contextmenu', (evt) => this.handleFolderContextMenu(evt, folder));
    }

    /**
     * 處理資料夾的點擊事件
     * 區分點擊切換箭頭、資料夾名稱和空白區域的不同行為
     * @param evt 點擊事件
     * @param folder 被點擊的資料夾
     * @param header 資料夾標頭元素
     * @param childrenContainer 子資料夾容器元素
     */
    private handleFolderClick(evt: Event, folder: TFolder, header: HTMLElement, childrenContainer: HTMLElement) {
        const toggle = header.querySelector('.ge-explorer-folder-toggle') as HTMLElement;

        // 判斷點擊的是切換箭頭、資料夾名稱還是空白區域
        if ((evt.target as HTMLElement).closest('.ge-explorer-folder-toggle')) {
            // 點擊箭頭：只展開/收合，不開啟 GridView
            this.handleToggleClick(folder, toggle, childrenContainer);
        } else if ((evt.target as HTMLElement).closest('.ge-explorer-folder-name')) {
            // 點擊資料夾名稱：可能展開/收合，也可能開啟 GridView
            this.handleFolderNameClick(evt as MouseEvent, folder, header, toggle, childrenContainer);
        } else {
            // 點擊空白區域：如果沒有子資料夾且未選取則開啟 GridView，已選取則無作用；有子資料夾則展開/收合
            const isActive = header.hasClass('is-active');
            if (!this.hasVisibleChildren(folder)) {
                if (!isActive) {
                    void this.openFolderInGrid(folder.path);
                }
                // 如果已選取且沒有子資料夾，則不做任何動作
            } else {
                this.handleToggleClick(folder, toggle, childrenContainer);
            }
        }
    }

    /**
     * 處理切換箭頭的點擊事件
     * 純粹的展開/收合功能，不會開啟 GridView
     * @param folder 被點擊的資料夾
     * @param toggle 切換箭頭元素
     * @param childrenContainer 子資料夾容器元素
     */
    // 處理切換箭頭點擊
    private handleToggleClick(folder: TFolder, toggle: HTMLElement, childrenContainer: HTMLElement) {
        // 如果資料夾沒有可見的子資料夾，顯示空白切換圖示
        if (!this.hasVisibleChildren(folder)) {
            toggle.innerHTML = '';
            toggle.addClass('ge-explorer-toggle-empty');
            return;
        }

        // 從實際狀態獲取當前展開狀態（避免使用可能過時的參數）
        const currentExpanded = this.isExpanded(folder.path);
        const newExpanded = !currentExpanded;

        // 更新切換箭頭的圖示和狀態
        toggle.removeClass('ge-explorer-toggle-empty');
        setIcon(toggle, newExpanded ? 'chevron-down' : 'chevron-right');

        // 切換子資料夾容器的顯示/隱藏
        childrenContainer.toggleClass('is-collapsed', !newExpanded);

        // 更新展開狀態記錄
        this.setExpanded(folder.path, newExpanded);
    }

    /**
     * 處理資料夾名稱的點擊事件
     * 簡化邏輯：只有已選取狀態下再次點擊才展開/收合，否則直接進入資料夾
     * @param evt 滑鼠點擊事件
     * @param folder 被點擊的資料夾
     * @param header 資料夾標頭元素
     * @param toggle 切換箭頭元素
     * @param childrenContainer 子資料夾容器元素
     */
    // 處理資料夾名稱點擊
    private handleFolderNameClick(evt: MouseEvent, folder: TFolder, header: HTMLElement, toggle: HTMLElement, childrenContainer: HTMLElement) {
        // Ctrl/Meta + 點擊：在新的 GridView 分頁中開啟
        if (evt.ctrlKey || evt.metaKey) {
            this.openFolderInNewView(folder.path);
            return;
        }

        const hasChildren = this.hasVisibleChildren(folder);
        const isActive = header.hasClass('is-active');

        // 如果已是選取狀態，處理展開/收合邏輯
        if (isActive && hasChildren) {
            const currentExpanded = this.isExpanded(folder.path);
            const newExpanded = !currentExpanded;

            // 切換展開狀態
            setIcon(toggle, newExpanded ? 'chevron-down' : 'chevron-right');
            childrenContainer.toggleClass('is-collapsed', !newExpanded);
            this.setExpanded(folder.path, newExpanded);
            return;
        }

        // 如果已是選取狀態但無子資料夾，不做任何動作
        if (isActive && !hasChildren) {
            return;
        }

        // 其他情況：直接開啟該資料夾的 GridView
        this.openFolderInGrid(folder.path);
    }

    // 渲染暫存區群組
    private renderStashGroup(contentEl: HTMLElement) {
        // 如果正在搜尋且沒有符合的暫存檔案，就不顯示暫存區群組
        if (this.isFiltering()) {
            const visibleFiles = this.getVisibleStashFiles();
            if (visibleFiles.length === 0) {
                return;
            }
        }

        const groupKey = '__stash__';
        const { nodeEl, header, children } = this.createStashGroupStructure(contentEl, groupKey);

        this.setupStashGroupInteractions(header, nodeEl, groupKey, children);
        this.cleanupStashFiles();
        this.renderStashItems(children);
    }

    // 創建暫存區群組結構
    private createStashGroupStructure(contentEl: HTMLElement, groupKey: string) {
        const nodeEl = contentEl.createDiv({ cls: 'ge-explorer-folder-node ge-explorer-stash-node' });
        const header = nodeEl.createDiv({ cls: 'ge-explorer-folder-header' });
        const toggle = header.createSpan({ cls: 'ge-explorer-folder-toggle' });
        let expanded = this.isExpanded(groupKey);
        // 如果正在搜尋且有符合的暫存檔案，自動展開群組
        if (this.isFiltering()) {
            const visibleFiles = this.getVisibleStashFiles();
            if (visibleFiles.length > 0) {
                expanded = true;
                this.setExpanded(groupKey, expanded);
            }
        }

        setIcon(toggle, expanded ? 'chevron-down' : 'chevron-right');

        const icon = header.createSpan({ cls: 'ge-explorer-folder-icon' });
        setIcon(icon, 'inbox');
        const name = header.createSpan({ cls: 'ge-explorer-folder-name' });
        name.textContent = t('stash');

        const children = nodeEl.createDiv({ cls: 'ge-explorer-folder-children' });
        if (!expanded) children.addClass('is-collapsed');

        return { nodeEl, header, children, toggle };
    }

    // 設置暫存區群組互動
    private setupStashGroupInteractions(header: HTMLElement, nodeEl: HTMLElement, groupKey: string, children: HTMLElement) {
        const toggle = header.querySelector('.ge-explorer-folder-toggle') as HTMLElement;

        header.addEventListener('click', () => {
            const newExpanded = !this.isExpanded(groupKey);
            this.setExpanded(groupKey, newExpanded);
            setIcon(toggle, newExpanded ? 'chevron-down' : 'chevron-right');
            children.toggleClass('is-collapsed', !newExpanded);
        });

        header.addEventListener('contextmenu', (evt) => {
            evt.preventDefault();
            const menu = new Menu();
            menu.addItem((item) => {
                item.setTitle(t('clear'))
                    .setIcon('trash')
                    .onClick(() => this.clearStash());
            });
            // 新增：將目前暫存區的檔案連結存成新的 Markdown 檔
            menu.addItem((item) => {
                item.setTitle(t('save_stash_as_markdown'))
                    .setIcon('file-plus')
                    .onClick(() => this.saveStashAsMarkdown());
            });
            menu.showAtMouseEvent(evt as MouseEvent);
        });

        this.setupStashDropTarget(nodeEl);
    }

    // 設置暫存區拖放目標
    private setupStashDropTarget(nodeEl: HTMLElement) {
        if (!Platform.isDesktop) return;
        
        let currentDropTarget: HTMLElement | null = null;
        let insertPosition: 'before' | 'after' | 'end' = 'end';
        let targetIndex = -1;
        
        nodeEl.addEventListener('dragover', (e: DragEvent) => {
            if (e.dataTransfer?.types?.includes('application/obsidian-ge-stash')) return;
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
            
            // 清除之前的插入指示器
            this.clearStashInsertIndicators(nodeEl);
            
            // 找到最接近滑鼠位置的暫存項目
            const stashItems = nodeEl.querySelectorAll('.ge-explorer-stash-item');
            const mouseY = e.clientY;
            
            let closestItem: HTMLElement | null = null;
            let closestDistance = Infinity;
            let insertBefore = false;
            
            stashItems.forEach((item, index) => {
                const rect = item.getBoundingClientRect();
                const itemCenterY = rect.top + rect.height / 2;
                const distance = Math.abs(mouseY - itemCenterY);
                
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestItem = item as HTMLElement;
                    insertBefore = mouseY < itemCenterY;
                    targetIndex = insertBefore ? index : index + 1;
                }
            });
            
            if (closestItem && closestDistance < 50) { // 50px 容忍範圍
                currentDropTarget = closestItem;
                insertPosition = insertBefore ? 'before' : 'after';
                
                // 顯示插入指示器
                if (insertBefore) {
                    (closestItem as HTMLElement).addClass('ge-stash-insert-before');
                } else {
                    (closestItem as HTMLElement).addClass('ge-stash-insert-after');
                }
            } else {
                // 沒有找到合適的項目，插入到最後
                currentDropTarget = null;
                insertPosition = 'end';
                targetIndex = stashItems.length;
                nodeEl.addClass('ge-dragover');
            }
        });

        nodeEl.addEventListener('dragleave', (e: DragEvent) => {
            // 檢查是否真的離開了暫存區域
            const rect = nodeEl.getBoundingClientRect();
            const x = e.clientX;
            const y = e.clientY;
            
            if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                this.clearStashInsertIndicators(nodeEl);
                nodeEl.removeClass('ge-dragover');
                currentDropTarget = null;
            }
        });

        nodeEl.addEventListener('drop', async (e: DragEvent) => {
            if (e.dataTransfer?.types?.includes('application/obsidian-ge-stash')) return;
            e.preventDefault();
            
            this.clearStashInsertIndicators(nodeEl);
            nodeEl.removeClass('ge-dragover');
            
            await this.handleStashDrop(e, targetIndex);
            
            currentDropTarget = null;
            insertPosition = 'end';
            targetIndex = -1;
        });
    }

    // 清除暫存區插入指示器
    private clearStashInsertIndicators(nodeEl: HTMLElement) {
        const items = nodeEl.querySelectorAll('.ge-explorer-stash-item');
        items.forEach(item => {
            (item as HTMLElement).removeClass('ge-stash-insert-before');
            (item as HTMLElement).removeClass('ge-stash-insert-after');
        });
    }

    // 清理無效的暫存檔案
    private cleanupStashFiles() {
        const before = this.stashFilePaths.length;
        this.stashFilePaths = this.stashFilePaths.filter((p) =>
            this.app.vault.getAbstractFileByPath(p) instanceof TFile
        );
        if (this.stashFilePaths.length !== before) {
            this.persistStashToSettings();
        }
    }

    // 渲染暫存項目
    private renderStashItems(children: HTMLElement) {
        // if (this.stashFilePaths.length === 0) {
            this.renderStashDropzone(children);
            //return;
        //}

        const visibleFiles = this.getVisibleStashFiles();
        visibleFiles.forEach(file => this.renderStashItem(children, file, visibleFiles));
    }

    // 渲染暫存拖放區
    private renderStashDropzone(children: HTMLElement) {
        const dropzone = children.createDiv({ cls: 'ge-explorer-folder-header ge-explorer-mode-item ge-explorer-stash-dropzone' });
        const dzIcon = dropzone.createSpan({ cls: 'ge-explorer-folder-icon' });
        setIcon(dzIcon, 'plus');
        const dzName = dropzone.createSpan({ cls: 'ge-explorer-folder-name' });
        dzName.textContent = t?.('drop_files_here') || 'Drop files here to stash';

        // 讓 dropzone 可點擊以選擇檔案加入
        // CSS 對 .ge-explorer-stash-dropzone 設了 pointer-events: none; 這裡強制開啟
        (dropzone as HTMLElement).style.pointerEvents = 'auto';
        (dropzone as HTMLElement).style.cursor = 'pointer';
        dropzone.setAttr('role', 'button');
        dropzone.setAttr('tabindex', '0');
        dropzone.addEventListener('click', (evt) => {
            evt.stopPropagation();
            this.openFileSuggestionForStash();
        });
    }

    // 打開檔案模糊搜尋並加入暫存區
    private openFileSuggestionForStash() {
        const app = this.app;
        const addFileToStash = (file: TFile) => this.addToStash([file.path]);
        class FileSuggest extends FuzzySuggestModal<TFile> {
            getItems(): TFile[] {
                return app.vault.getMarkdownFiles();
            }
            getItemText(file: TFile): string {
                return file.path;
            }
            onChooseItem(file: TFile): void {
                addFileToStash(file);
            }
        }
        new FileSuggest(this.app).open();
    }

    // 將目前暫存區的檔案連結存成新的 Markdown 檔並開啟
    private async saveStashAsMarkdown() {
        // 收集目前暫存區的所有檔案（忽略無效項）
        const files = this.stashFilePaths
            .map(p => this.app.vault.getAbstractFileByPath(p))
            .filter((f): f is TFile => f instanceof TFile);

        if (files.length === 0) {
            return; // 沒有內容就不建立
        }

        // 產生檔名：Stash YYYY-MM-DD HHmm.md
        const d = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const fileName = `Stash ${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}.md`;

        // 確保唯一檔名（於 Vault 根目錄）
        let baseName = fileName.replace(/\.md$/i, '');
        let candidate = `${baseName}.md`;
        let idx = 2;
        while (this.app.vault.getAbstractFileByPath(candidate)) {
            candidate = `${baseName} (${idx}).md`;
            idx++;
        }

        // 以即將建立的新檔（candidate）作為來源路徑，產生連結
        const sourcePath = candidate;
        const lines = files.map(f => this.app.fileManager.generateMarkdownLink(f, sourcePath));
        const content = lines.join('\n') + '\n';

        // 建立檔案並開啟
        const file = await this.app.vault.create(candidate, content);
        await this.app.workspace.getLeaf().openFile(file);
    }

    // 獲取可見的暫存檔案
    private getVisibleStashFiles(): TFile[] {
        const allFiles = this.stashFilePaths
            .map(p => this.app.vault.getAbstractFileByPath(p))
            .filter((f): f is TFile => f instanceof TFile);

        return this.isFiltering()
            ? allFiles.filter(f => this.matchesQuery(f.basename))
            : allFiles;
    }

    // 渲染暫存項目
    private renderStashItem(children: HTMLElement, file: TFile, visibleFiles: TFile[]) {
        const itemEl = children.createDiv({ cls: 'ge-explorer-folder-header ge-explorer-mode-item ge-explorer-stash-item' });

        this.setupStashItemIcon(itemEl, file);
        this.setupStashItemLabel(itemEl, file);
        this.setupStashItemClick(itemEl, file, visibleFiles);
        this.setupStashItemContextMenu(itemEl, file);
        this.setupStashItemDrag(itemEl, file);
        this.setupStashItemDrop(itemEl, file);
    }

    // 設置暫存項目圖示
    private setupStashItemIcon(itemEl: HTMLElement, file: TFile) {
        const itemIcon = itemEl.createSpan({ cls: 'ge-explorer-folder-icon' });
        const ext = file.extension.toLowerCase();

        if (isImageFile(file)) {
            setIcon(itemIcon, 'image');
            itemIcon.addClass('ge-img');
        } else if (isVideoFile(file)) {
            setIcon(itemIcon, 'play-circle');
            itemIcon.addClass('ge-video');
        } else if (isAudioFile(file)) {
            setIcon(itemIcon, 'music');
            itemIcon.addClass('ge-audio');
        } else if (ext === 'pdf') {
            setIcon(itemIcon, 'paperclip');
            itemIcon.addClass('ge-pdf');
        } else if (ext === 'canvas') {
            setIcon(itemIcon, 'layout-dashboard');
            itemIcon.addClass('ge-canvas');
        } else if (ext === 'base') {
            setIcon(itemIcon, 'layout-list');
            itemIcon.addClass('ge-base');
        } else if (ext === 'md' || ext === 'txt') {
            setIcon(itemIcon, 'file-text');
        } else {
            setIcon(itemIcon, 'file');
        }
    }

    // 設置暫存項目標籤
    private setupStashItemLabel(itemEl: HTMLElement, file: TFile) {
        const itemName = itemEl.createSpan({ cls: 'ge-explorer-folder-name' });
        itemName.textContent = file.basename;
    }

    // 設置暫存項目點擊事件
    private setupStashItemClick(itemEl: HTMLElement, file: TFile, visibleFiles: TFile[]) {
        itemEl.addEventListener('click', (evt) => {
            void (async () => {
                evt.stopPropagation();

                if (isAudioFile(file)) {
                    FloatingAudioPlayer.open(this.app, file);
                    return;
                }

                if (isImageFile(file) || isVideoFile(file)) {
                    const mediaFiles = visibleFiles.filter((f) => isImageFile(f) || isVideoFile(f));
                    new MediaModal(this.app, file, mediaFiles).open();
                    return;
                }

                // 先判斷是否為捷徑檔（frontmatter 內有 type 與非空 redirect）
                const fileCache = this.app.metadataCache.getFileCache(file);
                const fm = fileCache?.frontmatter;
                const isShortcut = !!(fm && fm.type && typeof fm.redirect === 'string' && fm.redirect.trim() !== '');

                if (!isShortcut) {
                    // 非捷徑：直接開啟檔案，避免不必要的 activateView
                    if (evt.ctrlKey || evt.metaKey) {
                        void this.app.workspace.getLeaf(true).openFile(file);
                    } else {
                        void this.app.workspace.getLeaf().openFile(file);
                    }
                    return;
                }

                // 捷徑檔：啟用 GridView 並嘗試以捷徑邏輯開啟
                const view = await this.plugin.activateView();
                if (view instanceof GridView) {
                    if (!(view as any).openShortcutFile || !(view as any).openShortcutFile(file)) {
                        void this.app.workspace.getLeaf().openFile(file);
                    }
                } else {
                    void this.app.workspace.getLeaf().openFile(file);
                }
            })();
        });
    }

    // 設置暫存項目右鍵選單
    private setupStashItemContextMenu(itemEl: HTMLElement, file: TFile) {
        itemEl.addEventListener('contextmenu', (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            const menu = new Menu();
            this.app.workspace.trigger('file-menu', menu, file);
            menu.addSeparator();
            menu.addItem((mi) => {
                mi.setTitle(t?.('remove') || 'Remove')
                    .setIcon('x')
                    .onClick(() => this.removeFromStash(file.path));
            });
            menu.showAtMouseEvent(evt as MouseEvent);
        });
    }

    // 設置暫存項目拖拽
    private setupStashItemDrag(itemEl: HTMLElement, file: TFile) {
        if (!Platform.isDesktop) return;
        itemEl.setAttr('draggable', 'true');
        itemEl.addEventListener('dragstart', (event: DragEvent) => {
            if (!event.dataTransfer) return;

            // 使用 Obsidian 產生 Markdown 連結
            let mdLink = this.app.fileManager.generateMarkdownLink(file, '');

            // 若為圖片檔案則改為嵌入語法 ![[...]]，但若已經有 '!' 就不要重複加
            if (isMediaFile(file)) {
                const trimmed = mdLink.trimStart();
                if (!trimmed.startsWith('!')) {
                    mdLink = '!' + mdLink;
                }
            }

            event.dataTransfer.setData('text/plain', mdLink);
            
            event.dataTransfer?.setData('application/obsidian-grid-explorer-files', JSON.stringify([file.path]));

            event.dataTransfer.setData('application/obsidian-ge-stash', file.path);
            event.dataTransfer.effectAllowed = 'all';

            this.createDragPreview(event, file.basename);
        });
    }

    // 創建拖拽預覽
    private createDragPreview(event: DragEvent, basename: string) {
        const dragImage = activeDocument.createElement('div');
        dragImage.className = 'ge-custom-drag-preview';
        dragImage.textContent = basename;
        activeDocument.body.appendChild(dragImage);
        event.dataTransfer?.setDragImage(dragImage, 20, 20);
        window.setTimeout(() => activeDocument.body.removeChild(dragImage), 0);
    }

    // 設置暫存項目拖放
    private setupStashItemDrop(itemEl: HTMLElement, file: TFile) {
        if (!Platform.isDesktop) return;
        itemEl.addEventListener('dragover', (event: DragEvent) => {
            const types = event.dataTransfer?.types || [];
            if (Array.from(types).includes('application/obsidian-ge-stash')) {
                event.preventDefault();
                const rect = itemEl.getBoundingClientRect();
                const before = (event.clientY - rect.top) < rect.height / 2;
                itemEl.toggleClass('ge-stash-insert-before', before);
                itemEl.toggleClass('ge-stash-insert-after', !before);
            }
        });

        itemEl.addEventListener('dragleave', () => {
            itemEl.removeClass('ge-stash-insert-before');
            itemEl.removeClass('ge-stash-insert-after');
        });

        itemEl.addEventListener('drop', (event: DragEvent) => {
            const sourcePath = event.dataTransfer?.getData('application/obsidian-ge-stash');
            if (!sourcePath || sourcePath === file.path) return;

            event.preventDefault();
            itemEl.removeClass('ge-stash-insert-before');
            itemEl.removeClass('ge-stash-insert-after');

            this.reorderStashItem(sourcePath, file.path, event, itemEl);
        });
    }

    // 重新排序暫存項目
    private reorderStashItem(sourcePath: string, targetPath: string, event: DragEvent, itemEl: HTMLElement) {
        const srcIndex = this.stashFilePaths.indexOf(sourcePath);
        const destIndex = this.stashFilePaths.indexOf(targetPath);
        if (srcIndex === -1 || destIndex === -1) return;

        const rect = itemEl.getBoundingClientRect();
        const before = (event.clientY - rect.top) < rect.height / 2;
        let insertIndex = before ? destIndex : destIndex + 1;

        const newList = [...this.stashFilePaths];
        newList.splice(srcIndex, 1);
        if (srcIndex < insertIndex) insertIndex -= 1;

        insertIndex = Math.max(0, Math.min(insertIndex, newList.length));
        newList.splice(insertIndex, 0, sourcePath);

        this.stashFilePaths = newList;
        this.app.workspace.requestSaveLayout();
        this.persistStashToSettings();
        this.scheduleRender();
    }


    // 處理暫存區拖放
    private async handleStashDrop(event: DragEvent, insertIndex?: number) {
        try {
            const dt = event.dataTransfer;
            if (!dt) return;

            // 處理 obsidian:// URI 格式（單檔/多檔）
            const obsidianPaths = await extractObsidianPathsFromDT(dt);
            if (obsidianPaths.length > 0) {
                const { currentPath } = this.getCurrentGridState();
                const srcPath = currentPath || '/';
                const resolved: string[] = [];
                for (let p of obsidianPaths) {
                    try {
                        if (!p) continue;
                        // 與一般文字處理一致：先嘗試絕對路徑，再用 linkpath 解析
                        let file = this.app.vault.getAbstractFileByPath(p);
                        if (!(file instanceof TFile)) {
                            const alt = (this.app.metadataCache as any).getFirstLinkpathDest?.(p, srcPath);
                            if (alt instanceof TFile) file = alt;
                        }
                        if (file instanceof TFile) resolved.push(file.path);
                    } catch (e) {
                        console.warn('解析 obsidian:// 路徑失敗，已略過', p, e);
                    }
                }
                if (resolved.length > 0) this.addToStash(resolved, insertIndex);
                return;
            }

            // 支援多行文字（每行可能是路徑或 [[WikiLink]]）
            const text = dt.getData('text/plain');
            if (text) {
                const { currentPath } = this.getCurrentGridState();
                const srcPath = currentPath || '/';

                const lines = text
                    .split(/\r?\n/)
                    .map((s: string) => s.trim())
                    .filter((v: string): v is string => v.length > 0);

                const resolvedPaths: string[] = [];
                for (let line of lines) {
                    try {
                        // 去除前置的驚嘆號（內嵌連結語法）
                        if (line.startsWith('!')) line = line.substring(1);

                        let resolved: TFile | null = null;
                        if (line.startsWith('[[') && line.endsWith(']]')) {
                            const inner = line.slice(2, -2);
                            const parsed = parseLinktext(inner);
                            const dest = (this.app.metadataCache as any).getFirstLinkpathDest?.(parsed.path, srcPath);
                            if (dest instanceof TFile) resolved = dest;
                        } else {
                            const direct = this.app.vault.getAbstractFileByPath(line);
                            if (direct instanceof TFile) {
                                resolved = direct;
                            } else {
                                const dest = (this.app.metadataCache as any).getFirstLinkpathDest?.(line, srcPath);
                                if (dest instanceof TFile) resolved = dest;
                            }
                        }

                        if (resolved instanceof TFile) {
                            resolvedPaths.push(resolved.path);
                        } else {
                            // 若無法解析成檔案，保留原字串，稍後由 addToStash 過濾
                            resolvedPaths.push(line);
                        }
                    } catch (err) {
                        console.error('解析拖放文字為檔案路徑時發生錯誤:', err);
                    }
                }

                if (resolvedPaths.length > 0) {
                    this.addToStash(resolvedPaths, insertIndex);
                }
            }
        } catch (error) {
            console.error('處理暫存區拖放時發生錯誤:', error);
        }
    }

    // 添加到暫存區
    private addToStash(paths: string[], insertIndex?: number) {
        // 過濾出有效的檔案路徑
        const validPaths: string[] = [];
        for (const raw of paths) {
            const p = typeof raw === 'string' ? raw : '';
            if (!p) continue;
            const file = this.app.vault.getAbstractFileByPath(p);
            if (file instanceof TFile && !this.stashFilePaths.includes(p)) {
                validPaths.push(p);
            }
        }
        
        if (validPaths.length === 0) return;
        
        // 如果指定了插入位置，在該位置插入
        if (insertIndex !== undefined && insertIndex >= 0) {
            const newList = [...this.stashFilePaths];
            const actualIndex = Math.min(insertIndex, newList.length);
            newList.splice(actualIndex, 0, ...validPaths);
            this.stashFilePaths = newList;
        } else {
            // 否則添加到末尾
            this.stashFilePaths = [...this.stashFilePaths, ...validPaths];
        }
        
        this.app.workspace.requestSaveLayout();
        this.persistStashToSettings();
        this.scheduleRender();
    }

    // 從暫存區移除
    private removeFromStash(path: string) {
        this.stashFilePaths = this.stashFilePaths.filter(p => p !== path);
        this.app.workspace.requestSaveLayout();
        this.persistStashToSettings();
        this.scheduleRender();
    }

    // 清空暫存區
    private clearStash() {
        this.stashFilePaths = [];
        this.app.workspace.requestSaveLayout();
        this.persistStashToSettings();
        this.scheduleRender();
    }

    // 檢查資料夾是否有可見子項目
    private hasVisibleChildren(folder: TFolder): boolean {
        const settings = this.plugin.settings;
        const activeGrid = this.app.workspace.getActiveViewOfType(GridView);
        const showIgnoredItems = activeGrid?.showIgnoredItems ?? false;

        return folder.children
            .filter((f): f is TFolder => f instanceof TFolder)
            .some((f) => !isFolderIgnored(f, settings.ignoredFolders, settings.ignoredFolderPatterns, showIgnoredItems));
    }

    // 在網格視圖中開啟資料夾
    private async openFolderInGrid(folderPath: string) {
        const view = await this.plugin.activateView();
        if (view instanceof GridView) {
            await view.setSource('folder', folderPath);
        }
    }

    /**
     * 處理資料夾的右鍵點擊事件
     * @param evt 點擊事件
     * @param folder 被點擊的資料夾
     */
    private handleFolderContextMenu(evt: Event, folder: TFolder) {
        evt.preventDefault();
        const menu = new Menu();

        this.addContextMenuItems(menu, folder);
        menu.showAtMouseEvent(evt as MouseEvent);
    }

    /**
     * 添加資料夾的右鍵選單項目
     * @param menu 右鍵選單
     * @param folder 資料夾
     */
    // 添加右鍵選單項目
    private addContextMenuItems(menu: Menu, folder: TFolder) {
        // 在新網格視圖開啟
        menu.addItem((item) => {
            item.setTitle(t('open_in_new_grid_view'))
                .setIcon('grid')
                .onClick(() => this.openFolderInNewView(folder.path));
        });
        menu.addSeparator();

        // 添加新增筆記相關選項
        this.addNewItemMenuItems(menu, folder);
        menu.addSeparator();

        this.addFolderNoteMenuItems(menu, folder);
        menu.addSeparator();
        this.addFolderManagementMenuItems(menu, folder);
    }

    /**
     * 添加新增項目的右鍵選單項目
     * @param menu 右鍵選單
     * @param folder 資料夾
     */
    private addNewItemMenuItems(menu: Menu, folder: TFolder) {
        // 新增筆記
        menu.addItem((item) => {
            item.setTitle(t('new_note'))
                .setIcon('square-pen')
                .onClick(async () => {
                    await createNewNote(this.app, folder.path);
                });
        });

        // 新增資料夾
        menu.addItem((item) => {
            item.setTitle(t('new_folder'))
                .setIcon('folder')
                .onClick(async () => {
                    await createNewFolder(this.app, folder.path, () => {
                        this.scheduleRender();
                    });
                });
        });

        // 新增畫布
        menu.addItem((item) => {
            item.setTitle(t('new_canvas'))
                .setIcon('layout-dashboard')
                .onClick(async () => {
                    await createNewCanvas(this.app, folder.path);
                });
        });

        // 新增 base
        menu.addItem((item) => {
            item.setTitle(t('new_base'))
                .setIcon('layout-dashboard')
                .onClick(async () => {
                    await createNewBase(this.app, folder.path);
                });
        });

        // 新增捷徑
        menu.addItem((item) => {
            item.setTitle(t('new_shortcut'))
                .setIcon('shuffle')
                .onClick(async () => {
                    const modal = new ShortcutSelectionModal(this.app, this.plugin, async (option) => {
                        await createShortcut(this.app, folder.path, option);
                    });
                    modal.open();
                });
        });
    }


    /**
     * 添加資料夾筆記的右鍵選單項目
     * @param menu 右鍵選單
     * @param folder 資料夾
     */
    // 添加資料夾筆記選單項目
    private addFolderNoteMenuItems(menu: Menu, folder: TFolder) {
        const notePath = `${folder.path}/${folder.name}.md`;
        const noteFile = this.app.vault.getAbstractFileByPath(notePath);

        if (noteFile instanceof TFile) {
            this.addExistingFolderNoteItems(menu, folder, noteFile);
        } else {
            this.addCreateFolderNoteItem(menu, folder);
        }
    }

    /**
     * 添加已存在的資料夾筆記的右鍵選單項目
     * @param menu 右鍵選單
     * @param folder 資料夾
     * @param noteFile 資料夾筆記文件
     */
    // 添加已存在資料夾筆記的選單項目
    private addExistingFolderNoteItems(menu: Menu, folder: TFolder, noteFile: TFile) {
        // 打開資料夾筆記
        menu.addItem((item) => {
            item.setTitle(t('open_folder_note'))
                .setIcon('panel-left-open')
                .onClick(async () => {
                    const view = await this.plugin.activateView();
                    if (view instanceof GridView) {
                        if (!view.openShortcutFile(noteFile)) {
                            void this.app.workspace.getLeaf().openFile(noteFile);
                        }
                    } else {
                        void this.app.workspace.getLeaf().openFile(noteFile);
                    }
                });
        });

        // 編輯資料夾筆記設定
        menu.addItem((item) => {
            item.setTitle(t('edit_folder_note_settings'))
                .setIcon('settings-2')
                .onClick(async () => {
                    const view = await this.plugin.activateView();
                    if (view instanceof GridView) {
                        showFolderNoteSettingsModal(this.app, this.plugin, folder, view);
                    }
                });
        });

        // 刪除資料夾筆記
        menu.addItem((item) => {
            item.setTitle(t('delete_folder_note'))
                .setIcon('folder-x')
                .onClick(() => {
                    void this.app.fileManager.trashFile(noteFile);
                });
        });
    }

    /**
     * 添加創建資料夾筆記的右鍵選單項目
     * @param menu 右鍵選單
     * @param folder 資料夾
     */
    // 添加創建資料夾筆記的選單項目
    private addCreateFolderNoteItem(menu: Menu, folder: TFolder) {
        menu.addItem((item) => {
            item.setTitle(t('create_folder_note'))
                .setIcon('file-cog')
                .onClick(async () => {
                    const view = await this.plugin.activateView();
                    if (view instanceof GridView) {
                        showFolderNoteSettingsModal(this.app, this.plugin, folder, view);
                    }
                });
        });
    }

    /**
     * 添加資料夾管理的右鍵選單項目
     * @param menu 右鍵選單
     * @param folder 資料夾
     */
    // 添加資料夾管理選單項目
    private addFolderManagementMenuItems(menu: Menu, folder: TFolder) {
        // 忽略/取消忽略資料夾
        const isIgnored = this.plugin.settings.ignoredFolders.includes(folder.path);
        menu.addItem((item) => {
            item.setTitle(isIgnored ? t('unignore_folder') : t('ignore_folder'))
                .setIcon(isIgnored ? 'folder-up' : 'folder-x')
                .onClick(async () => {
                    if (isIgnored) {
                        this.plugin.settings.ignoredFolders = this.plugin.settings.ignoredFolders.filter(p => p !== folder.path);
                    } else {
                        this.plugin.settings.ignoredFolders.push(folder.path);
                    }
                    await this.plugin.saveSettings();
                });
        });

        // 搬移資料夾
        menu.addItem((item) => {
            item.setTitle(t('move_folder'))
                .setIcon('folder-cog')
                .onClick(async () => {
                    const view = await this.plugin.activateView();
                    if (view instanceof GridView) {
                        new showFolderMoveModal(this.plugin, folder, view).open();
                    }
                });
        });

        // 重新命名資料夾
        menu.addItem((item) => {
            item.setTitle(t('rename_folder'))
                .setIcon('file-cog')
                .onClick(async () => {
                    const view = await this.plugin.activateView();
                    if (view instanceof GridView) {
                        showFolderRenameModal(this.app, this.plugin, folder, view);
                    }
                });
        });

        // 刪除資料夾
        menu.addItem((item) => {
            (item as any).setWarning(true);
            item.setTitle(t('delete_folder'))
                .setIcon('trash')
                .onClick(async () => {
                    await this.app.fileManager.trashFile(folder);
                });
        });
    }

    /**
     * 渲染子資料夾
     * @param folder 父資料夾
     * @param childrenContainer 子資料夾容器
     * @param depth 递归深度
     */
    // 渲染子資料夾
    private renderChildFolders(folder: TFolder, childrenContainer: HTMLElement, depth: number) {
        const settings = this.plugin.settings;
        const activeGrid = this.app.workspace.getActiveViewOfType(GridView);
        const showIgnoredItems = activeGrid?.showIgnoredItems ?? false;

        let childFolders = folder.children
            .filter((f): f is TFolder => f instanceof TFolder)
            .filter((f) => !isFolderIgnored(f, settings.ignoredFolders, settings.ignoredFolderPatterns, showIgnoredItems));

        if (this.isFiltering()) {
            childFolders = childFolders.filter((f) => this.shouldShowFolder(f));
        }

        childFolders.sort((a, b) => a.name.localeCompare(b.name));

        for (const child of childFolders) {
            const expanded = this.isFiltering() ? true : this.isExpanded(child.path);
            this.renderFolderNode(child, childrenContainer, expanded, depth + 1);
        }
    }

    /**
     * 判斷指定路徑的資料夾是否處於展開狀態
     * @param path 資料夾路徑
     * @returns 是否展開
     */
    // 檢查路徑是否已展開
    private isExpanded(path: string): boolean {
        return this.expandedPaths.has(path);
    }

    /**
     * 設定資料夾的展開狀態
     * 當狀態發生變化時，會觸發版面配置的保存
     * @param path 資料夾路徑
     * @param value 是否展開
     */
    // 設置路徑展開狀態
    private setExpanded(path: string, value: boolean) {
        // 記錄變更前的狀態
        const before = this.expandedPaths.has(path);

        // 更新展開狀態
        if (value) {
            this.expandedPaths.add(path);
        } else {
            this.expandedPaths.delete(path);
        }

        // 記錄變更後的狀態
        const after = this.expandedPaths.has(path);

        // 如果狀態確實發生變化，請求保存版面配置
        // 這樣下次開啟時可以恢復展開狀態
        if (before !== after) {
            this.app.workspace.requestSaveLayout();
        }
    }

    // 設置拖放目標
    private attachDropTarget(headerEl: HTMLElement, folderPath: string) {
        if (!Platform.isDesktop) return;

        headerEl.dataset.folderPath = folderPath;

        headerEl.addEventListener('dragover', this.handleDragOver.bind(this));
        headerEl.addEventListener('dragleave', this.handleDragLeave.bind(this));
        headerEl.addEventListener('drop', this.handleDrop.bind(this, folderPath));
    }

    // 處理拖拽懸停
    private handleDragOver(event: DragEvent) {
        event.preventDefault();
        event.dataTransfer!.dropEffect = 'move';
        // 使用 currentTarget 確保樣式加在 header 本身，而非內部子元素
        const header = event.currentTarget as HTMLElement;
        if (header) header.addClass('ge-dragover');
    }

    // 處理拖拽離開
    private handleDragLeave(event: DragEvent) {
        // 使用 currentTarget 確保從 header 本身移除樣式
        const header = event.currentTarget as HTMLElement;
        if (header) header.removeClass('ge-dragover');
    }

    // 處理拖放事件
    private async handleDrop(folderPath: string, evt: Event) {
        const event = evt as DragEvent;
        // 某些情況下事件非 DragEvent，需防禦處理
        if (typeof (event as any).preventDefault === 'function') {
            event.preventDefault();
        }
        // 確保從 header 本身移除樣式，而非子元素
        const header = event.currentTarget as HTMLElement | null;
        if (header && typeof (header as any).removeClass === 'function') {
            header.removeClass('ge-dragover');
        }

        // 無有效 dataTransfer 則忽略
        if (!event.dataTransfer) return;

        // 嘗試處理多檔案拖放
        if (await this.handleMultiFileDrop(event, folderPath)) return;
    }

    // 處理多檔案拖放
    private async handleMultiFileDrop(event: DragEvent, folderPath: string): Promise<boolean> {
        if (!event.dataTransfer) return false;

        // 以 text/plain 取得拖放內容，支援多行（多檔）與 wikilink 格式
        const filePath = event.dataTransfer.getData('text/plain');
        if (!filePath) return false;

        const srcPath = folderPath || '/';
        const lines = filePath
            .split(/\r?\n/)
            .map((s: string) => s.trim())
            .filter((v: string): v is string => v.length > 0);

        let handled = false;
        for (const line of lines) {
            try {
                let text = line;
                if (text.startsWith('!')) text = text.substring(1);

                let resolvedFile: TFile | null = null;
                if (text.startsWith('[[') && text.endsWith(']]')) {
                    const inner = text.slice(2, -2);
                    const parsed = parseLinktext(inner);
                    const dest = (this.app.metadataCache as any).getFirstLinkpathDest?.(parsed.path, srcPath);
                    if (dest instanceof TFile) resolvedFile = dest;
                } else {
                    const direct = this.app.vault.getAbstractFileByPath(text);
                    if (direct instanceof TFile) {
                        resolvedFile = direct;
                    } else {
                        const dest = (this.app.metadataCache as any).getFirstLinkpathDest?.(text, srcPath);
                        if (dest instanceof TFile) resolvedFile = dest;
                    }
                }

                if (resolvedFile instanceof TFile) {
                    const newPath = normalizePath(`${folderPath}/${resolvedFile.name}`);
                    if (resolvedFile.path !== newPath) {
                        await this.app.fileManager.renameFile(resolvedFile, newPath);
                    }
                    handled = true;
                }
            } catch (error) {
                console.error('An error occurred while moving one of the files (ExplorerView):', error);
                // 繼續處理其他檔案
            }
        }

        return handled;
    }

    /**
     * 刪除被移除節點及其子孫的展開記錄
     * 當資料夾被刪除時，清理相關的展開狀態，避免記憶體洩漏
     * @param prefix 被刪除的資料夾路徑前綴
     */
    private removeExpandedPrefix(prefix: string) {
        // 找出所有需要刪除的路徑（包含該路徑本身和所有子路徑）
        const pathsToDelete = Array.from(this.expandedPaths).filter(path =>
            path === prefix || path.startsWith(prefix + '/')
        );

        // 從展開記錄中移除這些路徑
        pathsToDelete.forEach(path => this.expandedPaths.delete(path));
    }

    /**
     * 重新命名時，更新展開記錄的路徑前綴
     * 當資料夾重新命名時，更新所有相關的展開狀態路徑
     * @param oldPrefix 舊的資料夾路徑前綴
     * @param newPrefix 新的資料夾路徑前綴
     */
    private renameExpandedPrefix(oldPrefix: string, newPrefix: string) {
        // 如果路徑沒有變化，直接返回
        if (oldPrefix === newPrefix) return;

        // 找出所有需要更新的路徑，並計算新路徑
        const pathsToUpdate = Array.from(this.expandedPaths)
            .filter(path => path === oldPrefix || path.startsWith(oldPrefix + '/'))
            .map(path => ({
                oldPath: path,
                // 如果是完全匹配，直接使用新前綴；否則替換前綴部分
                newPath: path === oldPrefix ? newPrefix : newPrefix + path.slice(oldPrefix.length)
            }));

        // 執行路徑更新：先刪除舊路徑，再添加新路徑
        pathsToUpdate.forEach(({ oldPath, newPath }) => {
            this.expandedPaths.delete(oldPath);
            this.expandedPaths.add(newPath);
        });
    }
}
