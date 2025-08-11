import { ItemView, WorkspaceLeaf, TFolder, TFile, Menu, setIcon, EventRef, Platform, normalizePath } from 'obsidian';
import GridExplorerPlugin from './main';
import { GridView } from './GridView';
import { CustomModeModal } from './modal/customModeModal';
import { showFolderNoteSettingsModal } from './modal/folderNoteSettingsModal';
import { showFolderRenameModal } from './modal/folderRenameModal';
import { showFolderMoveModal } from './modal/folderMoveModal';
import { isFolderIgnored } from './fileUtils';
import { t } from './translations';

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

    // 內建模式的 emoji 對應表，用於在樹狀圖中顯示圖示
    private readonly BUILTIN_MODE_EMOJIS: Record<string, string> = {
        'bookmarks': '📑',      // 書籤模式
        'search': '🔍',         // 搜尋模式
        'backlinks': '🔗',      // 反向連結模式
        'outgoinglinks': '🔗',  // 外向連結模式
        'recent-files': '📅',   // 最近檔案模式
        'all-files': '📔',      // 所有檔案模式
        'random-note': '🎲',    // 隨機筆記模式
        'tasks': '☑️',          // 任務模式
    };

    constructor(leaf: WorkspaceLeaf, plugin: GridExplorerPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.containerEl.addClass('ge-explorer-view-container');
    }

    /**
     * 排程延遲渲染，避免短時間內多次觸發重繪
     * 使用防抖技術，100ms 內的多次呼叫只會執行最後一次
     */
    private scheduleRender() {
        // 如果已有計時器在執行，先清除它
        if (this.renderTimer !== null) {
            window.clearTimeout(this.renderTimer);
        }

        // 設定新的計時器，100ms 後執行渲染
        this.renderTimer = window.setTimeout(() => {
            this.renderTimer = null;
            // 安全檢查：確保視圖容器仍然存在且連接到 DOM
            if (this.containerEl?.isConnected) {
                this.render();
            }
        }, 100);
    }

    getViewType(): string {
        return EXPLORER_VIEW_TYPE;
    }

    getDisplayText(): string {
        return t('explorer') || 'Explorer';
    }

    getIcon(): string {
        return 'folder-tree';
    }

    // 保存視圖狀態：記住展開的資料夾
    getState(): Record<string, unknown> {
        const base = super.getState();
        return {
            ...base,
            expandedPaths: Array.from(this.expandedPaths),
            searchQuery: this.searchQuery,
        } as Record<string, unknown>;
    }

    // 還原視圖狀態：恢復展開的資料夾
    async setState(state: any, result?: any): Promise<void> {
        await super.setState(state, result);
        if (state && Array.isArray(state.expandedPaths)) {
            this.expandedPaths = new Set(
                state.expandedPaths.filter((p: unknown) => typeof p === 'string')
            );
        } else {
            this.expandedPaths.clear();
        }
        // 恢復搜尋字串
        if (state && typeof state.searchQuery === 'string') {
            this.searchQuery = state.searchQuery;
        } else {
            this.searchQuery = '';
        }
        this.scheduleRender();
    }

    async onOpen(): Promise<void> {
        this.render();
        this.registerEventListeners();
    }

    /**
     * 註冊所有需要的事件監聽器
     * 當檔案系統或 GridView 狀態變更時，自動更新樹狀圖
     */
    private registerEventListeners() {
        const { vault, workspace } = this.app;
        const schedule = () => this.scheduleRender();

        // 檔案系統事件監聽
        this.eventRefs.push(
            // 檔案/資料夾建立時重新渲染
            vault.on('create', schedule),

            // 檔案/資料夾刪除時，清理展開狀態並重新渲染
            vault.on('delete', (file: any) => {
                const path = file?.path as string | undefined;
                if (path) this.removeExpandedPrefix(path);
                schedule();
            }),

            // 檔案/資料夾重新命名時，更新展開狀態的路徑並重新渲染
            vault.on('rename', (file: any, oldPath: string) => {
                const newPath = (file?.path as string) || '';
                if (oldPath && newPath) this.renameExpandedPrefix(oldPath, newPath);
                schedule();
            })
        );

        // GridView 來源變更事件監聽
        // 當 GridView 切換到不同模式或路徑時，更新樹狀圖的高亮顯示
        this.registerCustomEvent('ge-grid-source-changed', (payload: any) => {
            this.lastMode = payload?.mode ?? this.lastMode;
            this.lastPath = payload?.path ?? this.lastPath;
            schedule();
        });

        // 資料夾同名筆記設定變更事件監聽
        // 當資料夾筆記的設定（如顏色、圖示）變更時重新渲染
        this.registerCustomEvent('grid-explorer:folder-note-updated', schedule);
    }

    /**
     * 註冊自訂事件監聽器
     * 由於自訂事件可能不存在，需要安全地處理註冊過程
     * @param eventName 事件名稱
     * @param callback 回調函數
     */
    private registerCustomEvent(eventName: string, callback: (...args: any[]) => void) {
        try {
            // 嘗試註冊事件，某些事件可能在特定版本中不存在
            const ref = (this.app.workspace as any).on?.(eventName, callback);
            if (ref) this.eventRefs.push(ref);
        } catch (error) {
            // 如果註冊失敗，記錄警告但不中斷程式執行
            console.warn(`無法註冊事件 ${eventName}:`, error);
        }
    }

    async onClose(): Promise<void> {
        // 移除事件監聽並清理計時器
        const { vault, workspace } = this.app;
        for (const ref of this.eventRefs) {
            try { vault.offref(ref); } catch { }
            try { workspace.offref(ref); } catch { }
        }
        this.eventRefs = [];
        if (this.renderTimer !== null) {
            window.clearTimeout(this.renderTimer);
            this.renderTimer = null;
        }
    }

    // 對外提供重新渲染的介面（供設定變更時呼叫）
    public refresh() {
        this.scheduleRender();
    }

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
        workspace.revealLeaf(leaf);
    }

    /**
     * 主要的渲染方法，重新繪製整個樹狀圖
     * 包含模式群組和資料夾群組
     */
    private render() {
        const { contentEl } = this;

        // 儲存當前的捲動位置，避免重繪後跳回頂部造成使用者困擾
        const prevScrollTop = contentEl.scrollTop;

        // 清空容器內容，準備重新渲染
        contentEl.empty();

        // 建立頂部搜尋輸入區塊（參考 NAV-SEARCH-STYLES.md）
        const searchContainer = contentEl.createDiv({ cls: 'ge-explorer-search-container' });
        const inputEl = searchContainer.createEl('input', { type: 'text' }) as HTMLInputElement;
        inputEl.addClass('ge-explorer-search-input');
        inputEl.placeholder = t ? (t('search') || 'Search') : 'Search';
        inputEl.value = this.searchQuery;

        const clearBtn = searchContainer.createEl('button', { cls: 'ge-explorer-search-clear clickable-icon' });
        setIcon(clearBtn, 'x');
        if (this.searchQuery.trim()) clearBtn.addClass('show');

        // 供鍵盤導覽轉移焦點之用
        let searchOptionEl: HTMLDivElement | null = null;

        // IME 組字事件：開始/結束
        inputEl.addEventListener('compositionstart', () => {
            this.isComposing = true;
        });
        inputEl.addEventListener('compositionend', () => {
            this.isComposing = false;
            this.searchQuery = inputEl.value;
            clearBtn.toggleClass('show', !!this.searchQuery.trim());
            this.keepSearchFocus = true;
            this.scheduleRender();
        });

        inputEl.addEventListener('input', () => {
            this.searchQuery = inputEl.value;
            clearBtn.toggleClass('show', !!this.searchQuery.trim());
            // 組字中不觸發重繪，避免打斷中文輸入
            if (!this.isComposing) {
                this.keepSearchFocus = true;
                this.scheduleRender();
            }
        });

        inputEl.addEventListener('keydown', (evt: KeyboardEvent) => {
            // 組字中交由 IME 處理，避免攔截 Esc 等鍵
            if (this.isComposing) return;
            if (evt.key === 'ArrowDown') {
                // 轉移焦點到「搜尋選項」
                if (searchOptionEl) {
                    evt.preventDefault();
                    searchOptionEl.focus();
                }
                return;
            }
            if (evt.key === 'Escape') {
                this.searchQuery = '';
                inputEl.value = '';
                clearBtn.removeClass('show');
                this.scheduleRender();
                // 保持焦點在輸入框，便於連續操作
                setTimeout(() => inputEl.focus(), 0);
            }
        });

        clearBtn.addEventListener('click', () => {
            this.searchQuery = '';
            inputEl.value = '';
            clearBtn.removeClass('show');
            this.scheduleRender();
            setTimeout(() => inputEl.focus(), 0);
        });

        // 獲取當前 GridView 的狀態資訊
        const { currentMode, currentPath, showIgnoredFolders } = this.getCurrentGridState();

        // 在有搜尋字串時，於最上方顯示一個搜尋選項（功能與 FolderSelectionModal 相同）
        const trimmed = this.searchQuery.trim();
        if (trimmed.length > 0) {
            const searchItem = contentEl.createDiv({
                cls: 'ge-explorer-folder-header ge-explorer-mode-item ge-explorer-search-option'
            });
            // 讓搜尋選項可被鍵盤聚焦與操作
            searchItem.setAttr('tabindex', '0');
            searchItem.setAttr('role', 'button');
            searchOptionEl = searchItem;
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
                    inputEl.focus();
                } else if (evt.key === 'Escape') {
                    evt.preventDefault();
                    this.searchQuery = '';
                    inputEl.value = '';
                    clearBtn.removeClass('show');
                    this.scheduleRender();
                    setTimeout(() => inputEl.focus(), 0);
                }
            });
        }

        // 渲染模式群組（自訂模式和內建模式）
        this.renderModeGroups(contentEl, currentMode);

        // 渲染資料夾群組（檔案系統樹狀結構）
        this.renderFoldersGroup(contentEl, currentMode, currentPath, showIgnoredFolders);

        // 在重新渲染後，根據旗標回到搜尋框並將游標移到最後
        if (this.keepSearchFocus) {
            setTimeout(() => {
                inputEl.focus();
                try {
                    const len = inputEl.value.length;
                    inputEl.setSelectionRange(len, len);
                } catch {}
            }, 0);
            this.keepSearchFocus = false;
        }

        // 還原之前的捲動位置，保持使用者的瀏覽位置
        this.restoreScrollPosition(contentEl, prevScrollTop);
    }

    /**
     * 獲取當前 GridView 的狀態資訊
     * 如果沒有活躍的 GridView，則使用快取的最後已知狀態
     * @returns 包含模式、路徑和顯示設定的狀態物件
     */
    private getCurrentGridState() {
        // 嘗試獲取當前活躍的 GridView
        const activeGrid = this.app.workspace.getActiveViewOfType(GridView);

        // 如果有活躍的 GridView，更新快取的狀態
        if (activeGrid) {
            this.lastMode = activeGrid.sourceMode;
            this.lastPath = activeGrid.sourcePath;
        }

        // 返回當前狀態，優先使用活躍 GridView 的狀態，否則使用快取
        return {
            currentMode: (activeGrid?.sourceMode ?? this.lastMode) ?? '',
            currentPath: (activeGrid?.sourcePath ?? this.lastPath) ?? '',
            showIgnoredFolders: activeGrid?.showIgnoredFolders ?? false
        };
    }

    // 是否處於篩選狀態
    private isFiltering(): boolean {
        return !!this.searchQuery?.trim();
    }

    // 便利方法：大小寫不敏感包含比對
    private matchesQuery(text?: string): boolean {
        const q = (this.searchQuery || '').trim().toLowerCase();
        if (!q) return true;
        return (text || '').toLowerCase().includes(q);
    }

    // 判斷資料夾或其子孫是否符合搜尋條件（同時考慮忽略規則）
    private shouldShowFolder(folder: TFolder): boolean {
        if (!this.isFiltering()) return true;
        if (this.matchesQuery(folder.name)) return true;

        const settings = this.plugin.settings;
        const activeGrid = this.app.workspace.getActiveViewOfType(GridView);
        const showIgnoredFolders = activeGrid?.showIgnoredFolders ?? false;

        const childFolders = folder.children
            .filter((f): f is TFolder => f instanceof TFolder)
            .filter((f) => !isFolderIgnored(f, settings.ignoredFolders, settings.ignoredFolderPatterns, showIgnoredFolders));

        return childFolders.some((child) => this.shouldShowFolder(child));
    }

    /**
     * 渲染模式群組區塊（自訂模式和內建模式）
     * @param contentEl 父容器元素
     * @param currentMode 當前選中的模式，用於高亮顯示
     */
    private renderModeGroups(contentEl: HTMLElement, currentMode: string) {
        const settings = this.plugin.settings;

        // === 自訂模式群組 ===
        // 過濾出已啟用的自訂模式
        const customModes = (settings?.customModes ?? []).filter((cm: any) => cm?.enabled !== false);

        // 將自訂模式轉換為渲染項目
        const customItems = customModes
            .filter((cm: any) => {
                if (!this.isFiltering()) return true;
                const baseLabel = cm.displayName || cm.internalName || 'Custom';
                // 只比對顯示名稱，不比對 internalName
                return this.matchesQuery(baseLabel);
            })
            .map((cm: any) => {
                const baseLabel = cm.displayName || cm.internalName || 'Custom';
                const internalName = cm.internalName || `custom-${baseLabel}`;
                const textIcon = cm.icon ? `${cm.icon} ` : ''; // 文字圖示前綴
                return {
                    key: internalName,
                    label: `${textIcon}${baseLabel}`,
                    icon: '', // 自訂模式不使用 setIcon，而是用文字前綴
                    onClick: () => this.openMode(internalName)
                };
            });

        // 渲染自訂模式群組
        this.renderModesGroup(contentEl, '__modes__custom', t ? t('custom_modes') : 'Custom Modes', 'puzzle', customItems);

        // === 內建模式群組 ===
        // 獲取已啟用的內建模式
        const builtInModes = this.getEnabledBuiltInModes(settings);

        // 將內建模式轉換為渲染項目，添加 emoji 前綴
        const builtinItems = builtInModes
            .filter(m => !this.isFiltering() || this.matchesQuery(m.label) || this.matchesQuery(m.key))
            .map(m => {
                const emoji = this.BUILTIN_MODE_EMOJIS[m.key] || '';
                const label = emoji ? `${emoji} ${m.label}` : m.label;
                return { key: m.key, label, icon: '', onClick: () => this.openMode(m.key) };
            });

        // 渲染內建模式群組
        this.renderModesGroup(contentEl, '__modes__builtin', t ? t('modes') : 'Modes', 'shapes', builtinItems);
    }

    private getEnabledBuiltInModes(settings: any) {
        const builtInCandidates = [
            { key: 'bookmarks', label: t ? t('bookmarks_mode') : 'Bookmarks', icon: 'bookmark', enabled: !!settings?.showBookmarksMode },
            { key: 'search', label: t ? t('search_results') : 'Search', icon: 'search', enabled: !!settings?.showSearchMode },
            { key: 'backlinks', label: t ? t('backlinks_mode') : 'Backlinks', icon: 'links-coming-in', enabled: !!settings?.showBacklinksMode },
            { key: 'outgoinglinks', label: t ? t('outgoinglinks_mode') : 'Outgoing Links', icon: 'links-going-out', enabled: !!settings?.showOutgoinglinksMode },
            { key: 'all-files', label: t ? t('all_files_mode') : 'All Files', icon: 'book-text', enabled: !!settings?.showAllFilesMode },
            { key: 'recent-files', label: t ? t('recent_files_mode') : 'Recent Files', icon: 'calendar-days', enabled: !!settings?.showRecentFilesMode },
            { key: 'random-note', label: t ? t('random_note_mode') : 'Random Note', icon: 'dice', enabled: !!settings?.showRandomNoteMode },
            { key: 'tasks', label: t ? t('tasks_mode') : 'Tasks', icon: 'square-check-big', enabled: !!settings?.showTasksMode },
        ];
        return builtInCandidates.filter(m => m.enabled).map(({ key, label, icon }) => ({ key, label, icon }));
    }

    private async openMode(mode: string) {
        const view = await this.plugin.activateView();
        if (view instanceof GridView) await view.setSource(mode);
    }

    private restoreScrollPosition(contentEl: HTMLElement, prevScrollTop: number) {
        contentEl.scrollTop = prevScrollTop;
        requestAnimationFrame(() => {
            contentEl.scrollTop = prevScrollTop;
        });
    }

    private renderModesGroup(contentEl: HTMLElement, groupKey: string, title: string, iconName: string, items: Array<{ key?: string; label: string; icon: string; onClick: () => void }>) {
        if (items.length === 0) return;

        const nodeEl = contentEl.createDiv({ cls: 'ge-explorer-folder-node' });
        const header = nodeEl.createDiv({ cls: 'ge-explorer-folder-header' });
        const toggle = header.createSpan({ cls: 'ge-explorer-folder-toggle' });
        const expanded = this.isExpanded(groupKey);

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

    private renderModeItems(children: HTMLElement, items: Array<{ key?: string; label: string; icon: string; onClick: () => void }>, groupKey: string) {
        const { currentMode } = this.getCurrentGridState();

        items.forEach(({ key, label, icon, onClick }) => {
            const itemEl = children.createDiv({ cls: 'ge-explorer-folder-header ge-explorer-mode-item' });
            const itemIcon = itemEl.createSpan({ cls: 'ge-explorer-folder-icon' });

            // 自訂模式群組不使用 setIcon，讓文字前綴 icon 生效
            if (groupKey !== '__modes__custom' && icon) {
                setIcon(itemIcon, icon);
            }

            const itemName = itemEl.createSpan({ cls: 'ge-explorer-folder-name' });
            itemName.textContent = label;

            // 高亮目前模式（非 folder 模式）
            if (key && currentMode === key && currentMode !== 'folder') {
                itemEl.addClass('is-active');
            }

            itemEl.addEventListener('click', (evt) => {
                evt.stopPropagation();
                // 若已是當前模式，避免重複開啟
                if (key && currentMode === key && currentMode !== 'folder') {
                    return;
                }
                onClick();
            });

            // 自訂模式：加入右鍵選單，提供開啟自訂模式設定的功能
            if (groupKey === '__modes__custom' && key) {
                itemEl.addEventListener('contextmenu', (evt) => {
                    evt.preventDefault();
                    evt.stopPropagation();
                    const menu = new Menu();
                    menu.addItem((item) => {
                        item.setTitle(t('edit_custom_mode'))
                            .setIcon('settings')
                            .onClick(() => {
                                const modeIndex = this.plugin.settings.customModes.findIndex((m: any) => m.internalName === key);
                                if (modeIndex === -1) return;
                                new CustomModeModal(this.app, this.plugin, this.plugin.settings.customModes[modeIndex], (result: any) => {
                                    this.plugin.settings.customModes[modeIndex] = result;
                                    this.plugin.saveSettings();
                                    this.scheduleRender();
                                }).open();
                            });
                    });
                    menu.showAtMouseEvent(evt as MouseEvent);
                });
            }
        });
    }

    private renderFoldersGroup(contentEl: HTMLElement, currentMode: string, currentPath: string, showIgnoredFolders: boolean) {
        const foldersGroupKey = '__folders__root';
        const foldersNode = contentEl.createDiv({ cls: 'ge-explorer-folder-node' });

        const { foldersChildren } = this.createFoldersGroupHeader(foldersNode, foldersGroupKey, currentMode, currentPath);

        // 若目前在資料夾模式，預先展開對應的父路徑，確保可見
        this.expandCurrentFolderPath(currentMode, currentPath);

        // 列出頂層資料夾
        this.renderTopLevelFolders(foldersChildren, showIgnoredFolders);
    }

    /**
     * 以目前搜尋字串切換到 Folder 模式並套用搜尋（與 FolderSelectionModal 的行為一致）
     */
    private async openFolderSearch(searchTerm: string): Promise<void> {
        const activeView = this.app.workspace.getActiveViewOfType(GridView);
        if (activeView) {
            await activeView.setSource('folder', '/', true, searchTerm);
            return;
        }
        const view = await this.plugin.activateView();
        if (view instanceof GridView) {
            await view.setSource('', '', true, searchTerm);
        }
    }

    private createFoldersGroupHeader(foldersNode: HTMLElement, foldersGroupKey: string, currentMode: string, currentPath: string) {
        const foldersHeader = foldersNode.createDiv({ cls: 'ge-explorer-folder-header' });
        const foldersToggle = foldersHeader.createSpan({ cls: 'ge-explorer-folder-toggle' });

        let foldersExpanded = this.isExpanded(foldersGroupKey);
        if (!this.expandedPaths.has(foldersGroupKey)) {
            foldersExpanded = true; // 預設第一次載入展開
            this.setExpanded(foldersGroupKey, true);
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

        foldersHeader.addEventListener('click', async (evt) => {
            if ((evt.target as HTMLElement).closest('.ge-explorer-folder-toggle')) {
                const newExpanded = !this.isExpanded(foldersGroupKey);
                this.setExpanded(foldersGroupKey, newExpanded);
                setIcon(foldersToggle, newExpanded ? 'chevron-down' : 'chevron-right');
                foldersChildren.toggleClass('is-collapsed', !newExpanded);
            } else {
                // 點選 Folder 根選項：如果已經是選取狀態則不做任何動作
                if (foldersHeader.hasClass('is-active')) {
                    return;
                }

                // 開啟 Vault 根目錄
                const root = this.app.vault.getRoot();
                const view = await this.plugin.activateView();
                if (view instanceof GridView) await view.setSource('folder', (root as any).path ?? '/');
            }
        });

        return { foldersHeader, foldersChildren };
    }

    private expandCurrentFolderPath(currentMode: string, currentPath: string) {
        if (currentMode === 'folder' && currentPath) {
            const parts = currentPath.split('/').filter(Boolean);
            let acc = '';
            for (const part of parts) {
                acc = acc ? `${acc}/${part}` : part;
                this.setExpanded(acc, true);
            }
        }
    }

    private renderTopLevelFolders(foldersChildren: HTMLElement, showIgnoredFolders: boolean) {
        const root = this.app.vault.getRoot();
        const settings = this.plugin.settings;
        let topLevelFolders = root.children
            .filter((f): f is TFolder => f instanceof TFolder)
            .filter(f => !isFolderIgnored(f, settings.ignoredFolders, settings.ignoredFolderPatterns, showIgnoredFolders));

        // 依搜尋字串篩選（顯示符合的節點與其祖先）
        if (this.isFiltering()) {
            topLevelFolders = topLevelFolders.filter((f) => this.shouldShowFolder(f));
        }

        topLevelFolders.sort((a, b) => a.name.localeCompare(b.name));

        for (const child of topLevelFolders) {
            // depth=2 -> 28px，與 .ge-explorer-mode-item 的 28px 縮排保持一致
            const expanded = this.isFiltering() ? true : this.isExpanded(child.path);
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

        return header;
    }

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

    private setupToggleIcon(folder: TFolder, toggle: HTMLElement, expanded: boolean) {
        const settings = this.plugin.settings;
        const activeGrid = this.app.workspace.getActiveViewOfType(GridView);
        const showIgnoredFolders = activeGrid?.showIgnoredFolders ?? false;

        const hasVisibleChildren = folder.children
            .filter((f): f is TFolder => f instanceof TFolder)
            .some((f) => !isFolderIgnored(f, settings.ignoredFolders, settings.ignoredFolderPatterns, showIgnoredFolders));

        if (!hasVisibleChildren) {
            toggle.innerHTML = '';
            toggle.addClass('ge-explorer-toggle-empty');
        } else {
            toggle.removeClass('ge-explorer-toggle-empty');
            setIcon(toggle, expanded ? 'chevron-down' : 'chevron-right');
        }
    }

    private highlightActiveFolder(folder: TFolder, header: HTMLElement) {
        const activeGrid = this.app.workspace.getActiveViewOfType(GridView);
        if (activeGrid?.sourceMode === 'folder' && activeGrid?.sourcePath === folder.path) {
            header.addClass('is-active');
        }
    }

    private createFolderChildren(nodeEl: HTMLElement, expanded: boolean) {
        const childrenContainer = nodeEl.createDiv({ cls: 'ge-explorer-folder-children' });
        if (!expanded) childrenContainer.addClass('is-collapsed');
        return childrenContainer;
    }

    private setupFolderInteractions(header: HTMLElement, folder: TFolder, expanded: boolean, childrenContainer: HTMLElement) {
        header.addEventListener('click', (evt) => this.handleFolderClick(evt, folder, header, childrenContainer));
        header.addEventListener('contextmenu', (evt) => this.handleFolderContextMenu(evt, folder));
    }

    /**
     * 處理資料夾的點擊事件
     * 區分點擊切換箭頭和點擊資料夾名稱的不同行為
     * @param evt 點擊事件
     * @param folder 被點擊的資料夾
     * @param header 資料夾標頭元素
     * @param childrenContainer 子資料夾容器元素
     */
    private handleFolderClick(evt: Event, folder: TFolder, header: HTMLElement, childrenContainer: HTMLElement) {
        const toggle = header.querySelector('.ge-explorer-folder-toggle') as HTMLElement;

        // 判斷點擊的是切換箭頭還是資料夾名稱
        if ((evt.target as HTMLElement).closest('.ge-explorer-folder-toggle')) {
            // 點擊箭頭：只展開/收合，不開啟 GridView
            this.handleToggleClick(folder, toggle, childrenContainer);
        } else {
            // 點擊資料夾名稱：可能展開/收合，也可能開啟 GridView
            this.handleFolderNameClick(evt as MouseEvent, folder, header, toggle, childrenContainer);
        }
    }

    /**
     * 處理切換箭頭的點擊事件
     * 純粹的展開/收合功能，不會開啟 GridView
     * @param folder 被點擊的資料夾
     * @param toggle 切換箭頭元素
     * @param childrenContainer 子資料夾容器元素
     */
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
     * 複雜的邏輯：可能展開/收合，也可能開啟 GridView
     * @param evt 滑鼠點擊事件
     * @param folder 被點擊的資料夾
     * @param header 資料夾標頭元素
     * @param toggle 切換箭頭元素
     * @param childrenContainer 子資料夾容器元素
     */
    private handleFolderNameClick(evt: MouseEvent, folder: TFolder, header: HTMLElement, toggle: HTMLElement, childrenContainer: HTMLElement) {
        // Ctrl/Meta + 點擊：在新的 GridView 分頁中開啟
        if (evt.ctrlKey || evt.metaKey) {
            this.openFolderInNewView(folder.path);
            return;
        }

        const hasChildren = this.hasVisibleChildren(folder);
        // 從實際狀態獲取當前展開狀態（避免使用可能過時的參數）
        const currentExpanded = this.isExpanded(folder.path);

        // 特殊情況：無子資料夾且已是選取節點，不做任何動作
        if (!hasChildren && header.hasClass('is-active')) {
            return;
        }

        // 如果有子資料夾，處理展開/收合邏輯
        if (hasChildren) {
            if (!currentExpanded) {
                // 情況1：未展開 -> 展開子目錄
                setIcon(toggle, 'chevron-down');
                childrenContainer.toggleClass('is-collapsed', false);
                this.setExpanded(folder.path, true);

                // 如果已是選取節點，只展開不開啟 GridView
                if (header.hasClass('is-active')) {
                    return;
                }
            } else if (header.hasClass('is-active')) {
                // 情況2：已展開且為選取節點 -> 收合子目錄，不開啟 GridView
                setIcon(toggle, 'chevron-right');
                childrenContainer.toggleClass('is-collapsed', true);
                this.setExpanded(folder.path, false);
                return;
            }
            // 情況3：已展開但非選取節點 -> 繼續執行開啟 GridView
        }

        // 開啟該資料夾的 GridView
        this.openFolderInGrid(folder.path);
    }

    /**
     * 檢查資料夾是否包含可見的子資料夾
     * @param folder 資料夾
     * @returns 如果有可見的子資料夾，返回 true；否則返回 false
     */
    private hasVisibleChildren(folder: TFolder): boolean {
        const settings = this.plugin.settings;
        const activeGrid = this.app.workspace.getActiveViewOfType(GridView);
        const showIgnoredFolders = activeGrid?.showIgnoredFolders ?? false;

        return folder.children
            .filter((f): f is TFolder => f instanceof TFolder)
            .some((f) => !isFolderIgnored(f, settings.ignoredFolders, settings.ignoredFolderPatterns, showIgnoredFolders));
    }

    /**
     * 開啟該資料夾的 GridView
     * @param folderPath 資料夾路徑
     */
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
    private addContextMenuItems(menu: Menu, folder: TFolder) {
        // 在新網格視圖開啟
        menu.addItem((item) => {
            item.setTitle(t('open_in_new_grid_view'))
                .setIcon('grid')
                .onClick(() => this.openFolderInNewView(folder.path));
        });
        menu.addSeparator();

        this.addFolderNoteMenuItems(menu, folder);
        menu.addSeparator();
        this.addFolderManagementMenuItems(menu, folder);
    }

    /**
     * 添加資料夾筆記的右鍵選單項目
     * @param menu 右鍵選單
     * @param folder 資料夾
     */
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
    private addExistingFolderNoteItems(menu: Menu, folder: TFolder, noteFile: TFile) {
        // 打開資料夾筆記
        menu.addItem((item) => {
            item.setTitle(t('open_folder_note'))
                .setIcon('panel-left-open')
                .onClick(async () => {
                    const view = await this.plugin.activateView();
                    if (view instanceof GridView) {
                        if (!view.openShortcutFile(noteFile)) {
                            this.app.workspace.getLeaf().openFile(noteFile);
                        }
                    } else {
                        this.app.workspace.getLeaf().openFile(noteFile);
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
                    this.app.fileManager.trashFile(noteFile);
                });
        });
    }

    /**
     * 添加創建資料夾筆記的右鍵選單項目
     * @param menu 右鍵選單
     * @param folder 資料夾
     */
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
    private renderChildFolders(folder: TFolder, childrenContainer: HTMLElement, depth: number) {
        const settings = this.plugin.settings;
        const activeGrid = this.app.workspace.getActiveViewOfType(GridView);
        const showIgnoredFolders = activeGrid?.showIgnoredFolders ?? false;

        let childFolders = folder.children
            .filter((f): f is TFolder => f instanceof TFolder)
            .filter((f) => !isFolderIgnored(f, settings.ignoredFolders, settings.ignoredFolderPatterns, showIgnoredFolders));

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
    private isExpanded(path: string): boolean {
        return this.expandedPaths.has(path);
    }

    /**
     * 設定資料夾的展開狀態
     * 當狀態發生變化時，會觸發版面配置的保存
     * @param path 資料夾路徑
     * @param value 是否展開
     */
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

    // 將 header 設為可接受拖放檔案的目標
    private attachDropTarget(headerEl: HTMLElement, folderPath: string) {
        if (!Platform.isDesktop) return;

        headerEl.dataset.folderPath = folderPath;

        headerEl.addEventListener('dragover', this.handleDragOver.bind(this));
        headerEl.addEventListener('dragleave', this.handleDragLeave.bind(this));
        headerEl.addEventListener('drop', this.handleDrop.bind(this, folderPath));
    }

    private handleDragOver(event: DragEvent) {
        event.preventDefault();
        event.dataTransfer!.dropEffect = 'move';
        (event.target as HTMLElement).addClass('ge-dragover');
    }

    private handleDragLeave(event: DragEvent) {
        (event.target as HTMLElement).removeClass('ge-dragover');
    }

    private async handleDrop(folderPath: string, event: DragEvent) {
        event.preventDefault();
        (event.target as HTMLElement).removeClass('ge-dragover');

        // 嘗試處理多檔案拖放
        if (await this.handleMultiFileDrop(event, folderPath)) return;

        // 處理單一檔案拖放
        await this.handleSingleFileDrop(event, folderPath);
    }

    private async handleMultiFileDrop(event: DragEvent, folderPath: string): Promise<boolean> {
        const filesDataString = event.dataTransfer?.getData('application/obsidian-grid-explorer-files');
        if (!filesDataString) return false;

        try {
            const filePaths: string[] = JSON.parse(filesDataString);
            const destFolder = this.app.vault.getAbstractFileByPath(folderPath);
            if (!(destFolder instanceof TFolder)) return false;

            for (const path of filePaths) {
                await this.moveFileToFolder(path, folderPath);
            }
            return true;
        } catch (error) {
            console.error('處理多檔案拖放時發生錯誤:', error);
            return false;
        }
    }

    private async handleSingleFileDrop(event: DragEvent, folderPath: string) {
        const filePath = event.dataTransfer?.getData('text/plain');
        if (!filePath) return;

        // 清理 wikilink 格式
        const cleanedFilePath = filePath.replace(/!*\[\[(.*?)\]\]/, '$1');
        await this.moveFileToFolder(cleanedFilePath, folderPath);
    }

    private async moveFileToFolder(filePath: string, folderPath: string) {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;

        try {
            const newPath = normalizePath(`${folderPath}/${file.name}`);
            await this.app.fileManager.renameFile(file, newPath);
        } catch (error) {
            console.error(`搬移檔案 ${file.path} 時發生錯誤:`, error);
        }
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
