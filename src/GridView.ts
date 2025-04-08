import { WorkspaceLeaf, ItemView, TFolder, TFile, Menu, Notice, Platform } from 'obsidian';
import { setIcon, getFrontMatterInfo } from 'obsidian';
import { showFolderSelectionModal } from './FolderSelectionModal';
import { findFirstImageInNote } from './mediaUtils';
import { MediaModal } from './MediaModal';
import { showFolderNoteSettingsModal } from './FolderNoteSettingsModal';
import { showNoteColorSettingsModal } from './NoteColorSettingsModal';
import { showFolderRenameModal } from './FolderRenameModal';
import { showSearchModal } from './SearchModal';
import { FileWatcher } from './FileWatcher';
import { t } from './translations';
import GridExplorerPlugin from '../main';
import { isDocumentFile, isMediaFile, isImageFile, isVideoFile, isAudioFile } from './fileUtils';

// 定義網格視圖
export class GridView extends ItemView {
    plugin: GridExplorerPlugin;
    sourceMode: string; // 模式選擇
    sourcePath: string; // 用於資料夾模式的路徑
    sortType: string; // 排序模式
    folderSortType: string; // 資料夾排序模式
    searchQuery: string; // 搜尋關鍵字
    searchAllFiles: boolean; // 是否搜尋所有筆記
    randomNoteIncludeMedia: boolean; // 隨機筆記是否包含圖片和影片
    selectedItemIndex: number = -1; // 當前選中的項目索引
    selectedItems: Set<number> = new Set(); // 存儲多選的項目索引
    gridItems: HTMLElement[] = []; // 存儲所有網格項目的引用
    hasKeyboardFocus: boolean = false; // 是否有鍵盤焦點
    keyboardNavigationEnabled: boolean = true; // 是否啟用鍵盤導航
    fileWatcher: FileWatcher;
    recentSources: string[] = []; // 歷史記錄
    
    constructor(leaf: WorkspaceLeaf, plugin: GridExplorerPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.containerEl.addClass('ge-grid-view-container');
        this.sourceMode = ''; // 模式選擇
        this.sourcePath = ''; // 用於資料夾模式的路徑
        this.sortType = this.plugin.settings.defaultSortType; // 使用設定中的預設排序模式
        this.folderSortType = ''; // 資料夾排序模式
        this.searchQuery = ''; // 搜尋關鍵字
        this.searchAllFiles = true; // 是否搜尋所有筆記
        this.randomNoteIncludeMedia = false; // 隨機筆記是否包含圖片和影片
        
        // 根據設定決定是否註冊檔案變更監聽器
        if (this.plugin.settings.enableFileWatcher) {
            this.fileWatcher = new FileWatcher(plugin, this);
            this.fileWatcher.registerFileWatcher();
        }

        // 註冊鍵盤事件處理
        this.registerDomEvent(document, 'keydown', (event: KeyboardEvent) => {
            // 只有當 GridView 是活動視圖時才處理鍵盤事件
            if (this.app.workspace.getActiveViewOfType(GridView) === this) {
                this.handleKeyDown(event);
            }
        });
    }

    getViewType() {
        return 'grid-view';
    }

    getIcon() {
        if (this.sourceMode === 'bookmarks') {
            return 'bookmark';
        } else if (this.sourceMode === 'search') {
            return 'search';
        } else if (this.sourceMode === 'backlinks') {
            return 'paperclip';
        } else if (this.sourceMode === 'random-note') {
            return 'dice';
        } else if (this.sourceMode === 'recent-files') {
            return 'calendar-days';
        } else if (this.sourceMode === 'all-files') {
            return 'book-text';
        } else if (this.sourceMode === 'folder') {
            return 'folder';
        } else {
            return 'grid';
        }
    }

    getDisplayText() {
        if (this.sourceMode === '') {
            return t('grid_view_title');
        } else if (this.sourceMode === 'bookmarks') {
            return t('bookmarks_mode');
        } else if (this.sourceMode === 'search') {
            return t('search_results');
        } else if (this.sourceMode === 'backlinks') {
            return t('backlinks_mode');
        } else if (this.sourceMode === 'random-note') {
            return t('random_note_mode');
        } else if (this.sourceMode === 'recent-files') {
            return t('recent_files_mode');
        } else if (this.sourceMode === 'all-files') {
            return t('all_files_mode');
        } else if (this.sourceMode === 'folder') {
            return this.sourcePath;
        } else {
            return '';
        }
    }

    async setSource(mode: string, path = '', resetScroll = false, recordHistory = true) {

        // 記錄之前的狀態到歷史記錄中（如果有）
        if (this.sourceMode && recordHistory) {
            const previousState = JSON.stringify({ mode: this.sourceMode, path: this.sourcePath });
            this.recentSources.unshift(previousState);
            // 限制歷史記錄數量為10個
            if (this.recentSources.length > 10) {
                this.recentSources = this.recentSources.slice(0, 10);
            }
        }

        this.folderSortType = '';
        if(mode === 'folder') {
            // 檢查是否有與資料夾同名的 md 檔案
            const folderName = path.split('/').pop() || '';
            const mdFilePath = `${path}/${folderName}.md`;
            const mdFile = this.app.vault.getAbstractFileByPath(mdFilePath);
            if (mdFile instanceof TFile) {
                const metadata = this.app.metadataCache.getFileCache(mdFile)?.frontmatter;
                this.folderSortType = metadata?.sort;
            }
        }

        this.sourceMode = mode;
        this.sourcePath = path;
        this.render(resetScroll);
        // 通知 Obsidian 保存視圖狀態
        this.app.workspace.requestSaveLayout();
    }

    async getFiles(): Promise<TFile[]> {
        if (this.sourceMode === 'folder' && this.sourcePath) {
            // 獲取指定資料夾內的所有 Markdown、圖片和影片檔案
            const folder = this.app.vault.getAbstractFileByPath(this.sourcePath);
            if (folder instanceof TFolder) {
                // 只取得當前資料夾中的支援檔案，不包含子資料夾
                const files = folder.children.filter((file): file is TFile => {
                    if (!(file instanceof TFile)) return false;
                    
                    // 如果是 Markdown 檔案，直接包含
                    if (isDocumentFile(file) ||
                        (this.plugin.settings.showMediaFiles && isMediaFile(file))) {
                        return true;
                    }
                    
                    return false;
                });
                
                return this.sortFiles(files);
            }
            return [];
        } else if (this.sourceMode === 'search') {
            // 搜尋模式：使用 Obsidian 的搜尋功能
            const globalSearchPlugin = (this.app as any).internalPlugins.getPluginById('global-search');
            if (globalSearchPlugin?.instance) {
                const searchLeaf = (this.app as any).workspace.getLeavesOfType('search')[0];
                if (searchLeaf && searchLeaf.view && searchLeaf.view.dom) {
                    const resultDomLookup = searchLeaf.view.dom.resultDomLookup;
                    if (resultDomLookup) {
                        const files = Array.from(resultDomLookup.keys())
                        .filter((file): file is TFile => file instanceof TFile);
                        return this.sortFiles(files);
                    }
                }
            }
            return [];
        } else if (this.sourceMode === 'backlinks') {

            if(this.searchQuery !== '') {
                return [];
            }
            
            // 反向連結模式：找出所有引用當前筆記的檔案
            const activeFile = this.app.workspace.getActiveFile();
            if (!activeFile) {
                return [];
            }

            const backlinks = new Set();
            // 使用 resolvedLinks 來找出反向連結
            const resolvedLinks = this.app.metadataCache.resolvedLinks;
            for (const [sourcePath, links] of Object.entries(resolvedLinks)) {
                if (Object.keys(links).includes(activeFile.path)) {
                    const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath) as TFile;
                    if (sourceFile) {
                            backlinks.add(sourceFile);
                        }
                    }
                }

            return this.sortFiles(Array.from(backlinks) as TFile[]);
        } else if(this.sourceMode === 'bookmarks') {
            // 書籤模式
            const bookmarksPlugin = (this.app as any).internalPlugins.plugins.bookmarks;
            if (!bookmarksPlugin?.enabled) {
                return [];
            }

            const bookmarks = bookmarksPlugin.instance.items;
            const bookmarkedFiles = new Set();
            
            const processBookmarkItem = (item: any) => {
                if (item.type === 'file') {
                    const file = this.app.vault.getAbstractFileByPath(item.path);
                    if (file instanceof TFile) {
                        // 根據設定決定是否包含媒體檔案
                        if (isDocumentFile(file) ||
                            (this.plugin.settings.showMediaFiles && isMediaFile(file))) {
                            bookmarkedFiles.add(file);
                        }
                    }
                } else if (item.type === 'group' && item.items) {
                    item.items.forEach(processBookmarkItem);
                }
            };
            
            bookmarks.forEach(processBookmarkItem);
            return Array.from(bookmarkedFiles) as TFile[];
        } else if (this.sourceMode === 'all-files') {
            // 所有筆記模式
            const recentFiles = this.app.vault.getFiles().filter(file => {
                // 根據設定決定是否包含媒體檔案
                if (isDocumentFile(file) ||
                    (this.plugin.settings.showMediaFiles && this.randomNoteIncludeMedia && isMediaFile(file))) {
                    return true;
                }
                return false;
            });
            return this.sortFiles(recentFiles);
        } else if (this.sourceMode === 'recent-files') {
            // 最近檔案模式
            const recentFiles = this.app.vault.getFiles().filter(file => {
                // 根據設定決定是否包含媒體檔案
                if (isDocumentFile(file) ||
                    (this.plugin.settings.showMediaFiles && this.randomNoteIncludeMedia && isMediaFile(file))) {
                    return true;
                }
                return false;
            });
            //臨時的排序類型
            const sortType = this.sortType;
            this.sortType = 'mtime-desc';
            const sortedFiles = this.sortFiles(recentFiles);
            this.sortType = sortType;
            return sortedFiles;
        } else if (this.sourceMode === 'random-note') {
            // 隨機筆記模式，從所有筆記中隨機選取10筆
            const recentFiles = this.app.vault.getFiles().filter(file => {
                // 根據設定決定是否包含媒體檔案
                if (isDocumentFile(file) ||
                    (this.plugin.settings.showMediaFiles && this.randomNoteIncludeMedia && isMediaFile(file))) {
                    return true;
                }
                return false;
            }).sort(() => Math.random() - 0.5);
            return recentFiles;
        } else {
            return [];
        }
    }

    //排序檔案
    sortFiles(files: TFile[]) {
        const sortType = this.folderSortType ? this.folderSortType : this.sortType;

        // 檢查排序類型是否為非日期相關
        const isNonDateSort = ['name-asc', 'name-desc', 'random'].includes(sortType);

        // 檢查是否有任何日期欄位的設定
        const hasModifiedField = !!this.plugin.settings.modifiedDateField;
        const hasCreatedField = !!this.plugin.settings.createdDateField;
        const hasAnyDateField = hasModifiedField || hasCreatedField;
        
        // 符合以下任一條件就使用簡單排序：
        // 1. 非日期排序類型 (name-asc, name-desc, random)
        // 2. 沒有設定任何日期欄位
        const shouldUseSimpleSort = isNonDateSort || !hasAnyDateField;
        if (shouldUseSimpleSort) {
            if (sortType === 'name-asc') {
                return files.sort((a, b) => a.basename.localeCompare(b.basename));
            } else if (sortType === 'name-desc') {
                return files.sort((a, b) => b.basename.localeCompare(a.basename));
            } else if (sortType === 'mtime-desc') {
                return files.sort((a, b) => b.stat.mtime - a.stat.mtime);
            } else if (sortType === 'mtime-asc') {
                return files.sort((a, b) => a.stat.mtime - b.stat.mtime);
            } else if (sortType === 'ctime-desc') {
                return files.sort((a, b) => b.stat.ctime - a.stat.ctime);
            } else if (sortType === 'ctime-asc') {
                return files.sort((a, b) => a.stat.ctime - b.stat.ctime);
            } else if (sortType === 'random') {
                return files.sort(() => Math.random() - 0.5);
            } else {
                return files;
            }
        }

        // 處理需要讀取metadata的日期排序情況
        // 只有在以下條件都成立時才會執行：
        // 1. 是日期排序類型 (mtime-desc, mtime-asc, ctime-desc, ctime-asc)
        // 2. 至少設定了一個日期欄位 (modifiedDateField 或 createdDateField)
        const filesWithDates = files.map(file => {
            // 只對 .md 檔案讀取 metadata
            const shouldReadMetadata = file.extension === 'md';
            const metadata = shouldReadMetadata ? this.app.metadataCache.getFileCache(file) : null;
            
            return {
                file,
                mDate: (() => {
                    if (metadata?.frontmatter) {
                        const fieldName = this.plugin.settings.modifiedDateField;
                        const dateStr = metadata.frontmatter[fieldName];
                        if (dateStr) {
                            const date = new Date(dateStr);
                            if (!isNaN(date.getTime())) {
                                return date.getTime();
                            }
                        }
                    }
                    return file.stat.mtime;
                })(),
                cDate: (() => {
                    if (metadata?.frontmatter) {
                        const fieldName = this.plugin.settings.createdDateField;
                        const dateStr = metadata.frontmatter[fieldName];
                        if (dateStr) {
                            const date = new Date(dateStr);
                            if (!isNaN(date.getTime())) {
                                return date.getTime();
                            }
                        }
                    }
                    return file.stat.ctime;
                })()
            };
        });

        if (sortType === 'mtime-desc') {
            return filesWithDates.sort((a, b) => b.mDate - a.mDate).map(item => item.file);
        } else if (sortType === 'mtime-asc') {
            return filesWithDates.sort((a, b) => a.mDate - b.mDate).map(item => item.file);
        } else if (sortType === 'ctime-desc') {
            return filesWithDates.sort((a, b) => b.cDate - a.cDate).map(item => item.file);
        } else if (sortType === 'ctime-asc') {
            return filesWithDates.sort((a, b) => a.cDate - b.cDate).map(item => item.file);
        } else {
            return files;
        }
    }

    //忽略檔案
    ignoredFiles(files: TFile[]) {
        return files.filter(file => {
            // 檢查是否在忽略的資料夾中
            const isInIgnoredFolder = this.plugin.settings.ignoredFolders.some(folder => 
                file.path.startsWith(`${folder}/`)
            );
            
            if (isInIgnoredFolder) {
                return false;
            }
            
            // 檢查資料夾是否符合忽略的模式
            if (this.plugin.settings.ignoredFolderPatterns && this.plugin.settings.ignoredFolderPatterns.length > 0) {
                const matchesIgnoredPattern = this.plugin.settings.ignoredFolderPatterns.some(pattern => {
                    try {
                        // 嘗試將模式作為正則表達式處理
                        // 如果模式包含特殊字符，使用正則表達式處理
                        if (/[\^\$\*\+\?\(\)\[\]\{\}\|\\]/.test(pattern)) {
                            const regex = new RegExp(pattern); 
                            // 檢查檔案路徑是否符合正則表達式
                            return regex.test(file.path);
                        } else {
                            // 如果模式不包含特殊字符，直接檢查檔案路徑
                            return file.path.toLowerCase().includes(pattern.toLowerCase())
                        }
                    } catch (error) {
                        // 如果正則表達式無效，直接檢查檔案路徑
                        return file.path.toLowerCase().includes(pattern.toLowerCase())
                    }
                });
                // 如果符合任何忽略模式，則忽略此檔案
                return !matchesIgnoredPattern;
            }
            
            return true;
        });
    }

    async render(resetScroll = false) {
        // 儲存當前捲動位置
        const scrollContainer = this.containerEl.children[1] as HTMLElement;
        const scrollTop = resetScroll ? 0 : (scrollContainer ? scrollContainer.scrollTop : 0);

        // 保存選中項目的檔案路徑（如果有）
        let selectedFilePath: string | null = null;
        if (this.selectedItemIndex >= 0 && this.selectedItemIndex < this.gridItems.length) {
            const selectedItem = this.gridItems[this.selectedItemIndex];
            selectedFilePath = selectedItem.dataset.filePath || null;
        }

        // 清空整個容器
        this.containerEl.empty();

        // 創建頂部按鈕區域
        const headerButtonsDiv = this.containerEl.createDiv('ge-header-buttons');

        // 為頂部按鈕區域添加點擊事件，點擊後網格容器捲動到最頂部
        headerButtonsDiv.addEventListener('click', (event: MouseEvent) => {
            // 只有當點擊的是頂部按鈕區域本身（而不是其中的按鈕）時才觸發捲動
            if (event.target === headerButtonsDiv) {
                event.preventDefault();
                // 取得網格容器（應該是在 grid_render 後建立的第二個子元素）
                const gridContainer = this.containerEl.querySelector('.ge-grid-container');
                if (gridContainer) {
                    gridContainer.scrollTo({
                        top: 0,
                        behavior: 'smooth'
                    });
                }
            }
        });
            
        // 為頂部按鈕區域添加右鍵選單事件
        headerButtonsDiv.addEventListener('contextmenu', (event: MouseEvent) => {
            // 只有當點擊的是頂部按鈕區域本身（而不是其中的按鈕）時才觸發捲動
            if (event.target === headerButtonsDiv) {
                event.preventDefault();
                const menu = new Menu();
                menu.addItem((item) => {
                    item
                        .setTitle(t('open_new_grid_view'))
                        .setIcon('grid')
                        .onClick(() => {
                            const { workspace } = this.app;
                            let leaf = null;
                            workspace.getLeavesOfType('grid-view');
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
                            if (!leaf) {
                                // 如果無法獲取指定位置的 leaf，則回退到新分頁
                                leaf = workspace.getLeaf('tab');
                            }
                            leaf.setViewState({ type: 'grid-view', active: true });
                            // 設定資料來源
                            if (leaf.view instanceof GridView) {
                                leaf.view.setSource('folder', '/');
                            }
                            // 確保視圖是活躍的
                            workspace.revealLeaf(leaf);
                        });
                });
                menu.addItem((item) => {
                    item
                        .setTitle(t('open_settings'))
                        .setIcon('settings')
                        .onClick(() => {
                            // 打開插件設定頁面
                            (this.app as any).setting.open();
                            (this.app as any).setting.openTabById(this.plugin.manifest.id);
                        });
                });
                menu.showAtMouseEvent(event);
            }
        });

        // 添加新增筆記按鈕
        const newNoteButton = headerButtonsDiv.createEl('button', { attr: { 'aria-label': t('new_note') } });
        newNoteButton.addEventListener('click', async () => {                
            let newFileName = `${t('untitled')}.md`;
            let newFilePath = !this.sourcePath || this.sourcePath === '/' ? newFileName : `${this.sourcePath}/${newFileName}`;

            // 檢查檔案是否已存在，如果存在則遞增編號
            let counter = 1;
            while (this.app.vault.getAbstractFileByPath(newFilePath)) {
                newFileName = `${t('untitled')} ${counter}.md`;
                newFilePath = !this.sourcePath || this.sourcePath === '/' ? newFileName : `${this.sourcePath}/${newFileName}`;
                counter++;
            }

            try {
                // 建立新筆記
                const newFile = await this.app.vault.create(newFilePath, '');
                // 開啟新筆記
                await this.app.workspace.getLeaf().openFile(newFile);
            } catch (error) {
                console.error('An error occurred while creating a new note:', error);
            }
        });
        setIcon(newNoteButton, 'square-pen');

        newNoteButton.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            const menu = new Menu();
            // 新增筆記
            menu.addItem((item) => {
                item
                    .setTitle(t('new_note'))
                    .setIcon('square-pen')
                    .onClick(async () => {
                        let newFileName = `${t('untitled')}.md`;
                        let newFilePath = !this.sourcePath || this.sourcePath === '/' ? newFileName : `${this.sourcePath}/${newFileName}`;

                        // 檢查檔案是否已存在，如果存在則遞增編號
                        let counter = 1;
                        while (this.app.vault.getAbstractFileByPath(newFilePath)) {
                            newFileName = `${t('untitled')} ${counter}.md`;
                            newFilePath = !this.sourcePath || this.sourcePath === '/' ? newFileName : `${this.sourcePath}/${newFileName}`;
                            counter++;
                        }

                        try {
                            // 建立新筆記
                            const newFile = await this.app.vault.create(newFilePath, '');
                            // 開啟新筆記
                            await this.app.workspace.getLeaf().openFile(newFile);
                        } catch (error) {
                            console.error('An error occurred while creating a new note:', error);
                        }
                    });
            });
            // 新增資料夾
            menu.addItem((item) => {
                item.setTitle(t('new_folder'))
                .setIcon('folder')
                .onClick(async () => {
                    let newFolderName = `${t('untitled')}`;
                    let newFolderPath = !this.sourcePath || this.sourcePath === '/' ? newFolderName : `${this.sourcePath}/${newFolderName}`;
                    
                    // 檢查資料夾是否已存在，如果存在則遞增編號
                    let counter = 1;
                    while (this.app.vault.getAbstractFileByPath(newFolderPath)) {
                        newFolderName = `${t('untitled')} ${counter}`;
                        newFolderPath = !this.sourcePath || this.sourcePath === '/' ? newFolderName : `${this.sourcePath}/${newFolderName}`;
                        counter++;
                    }
                    
                    try {
                        // 建立新資料夾
                        await this.app.vault.createFolder(newFolderPath);
                        this.render(false);
                    } catch (error) {
                        console.error('An error occurred while creating a new folder:', error);
                    }
                });
            });
            menu.showAtMouseEvent(event);
        });

        // 添加回上層按鈕（僅在資料夾模式且不在根目錄時顯示）
        if (this.sourceMode === 'folder' && this.sourcePath !== '/' && this.searchQuery === '') {
            const upButton = headerButtonsDiv.createEl('button', { attr: { 'aria-label': t('go_up') } });
            upButton.addEventListener('click', () => {
                const parentPath = this.sourcePath.split('/').slice(0, -1).join('/') || '/';
                this.setSource('folder', parentPath, true);
                this.clearSelection();
            });
            setIcon(upButton, 'arrow-up');

            if(Platform.isDesktop) {
                // 為上層按鈕添加拖曳目標功能
                upButton.addEventListener('dragover', (event) => {
                    // 防止預設行為以允許放置
                    event.preventDefault();
                    // 設定拖曳效果為移動
                    event.dataTransfer!.dropEffect = 'move';
                    // 顯示可放置的視覺提示
                    upButton.addClass('ge-dragover');
                });
                
                upButton.addEventListener('dragleave', () => {
                    // 移除視覺提示
                    upButton.removeClass('ge-dragover');
                });
                
                upButton.addEventListener('drop', async (event) => {
                    // 防止預設行為
                    event.preventDefault();
                    // 移除視覺提示
                    upButton.removeClass('ge-dragover');
                    
                    // 獲取上一層資料夾路徑
                    const parentPath = this.sourcePath.split('/').slice(0, -1).join('/') || '/';
                    if (!parentPath) return;
                    
                    // 獲取資料夾物件
                    const folder = this.app.vault.getAbstractFileByPath(parentPath);
                    if (!(folder instanceof TFolder)) return;
                    
                    // 檢查是否有多個檔案被拖曳
                    const filesData = event.dataTransfer?.getData('application/obsidian-grid-explorer-files');
                    if (filesData) {
                        try {
                            // 解析檔案路徑列表
                            const filePaths = JSON.parse(filesData);
                            
                            // 移動所有檔案
                            for (const filePath of filePaths) {
                                const file = this.app.vault.getAbstractFileByPath(filePath);
                                if (file instanceof TFile) {
                                    // 計算新的檔案路徑
                                    const newPath = `${parentPath}/${file.name}`;
                                    // 移動檔案
                                    await this.app.fileManager.renameFile(file, newPath);
                                }
                            }
                            
                            // 重新渲染視圖
                            this.render();
                        } catch (error) {
                            console.error('An error occurred while moving multiple files to parent folder:', error);
                        }
                        return;
                    }
                    
                    // 如果沒有多個檔案資料，嘗試獲取單個檔案路徑（向後兼容）
                    const filePath = event.dataTransfer?.getData('text/plain');
                    if (!filePath) return;
                    
                    const cleanedFilePath = filePath.replace(/!?\[\[(.*?)\]\]/, '$1');
                    
                    // 獲取檔案物件
                    const file = this.app.vault.getAbstractFileByPath(cleanedFilePath);
                    
                    if (file instanceof TFile) {
                        try {
                            // 計算新的檔案路徑
                            const newPath = `${parentPath}/${file.name}`;
                            // 移動檔案
                            await this.app.fileManager.renameFile(file, newPath);
                            // 重新渲染視圖
                            this.render();
                        } catch (error) {
                            console.error('An error occurred while moving the file to parent folder:', error);
                        }
                    }
                });
            }
        }

        // 添加重新選擇資料夾按鈕
        const reselectButton = headerButtonsDiv.createEl('button', { attr: { 'aria-label': t('reselect') }  });
        reselectButton.addEventListener('click', () => {
            showFolderSelectionModal(this.app, this.plugin, this);
        });
        setIcon(reselectButton, "grid");

        // 添加右鍵選單支援
        reselectButton.addEventListener('contextmenu', (event) => {
            // 只有在有歷史記錄時才顯示右鍵選單
            if (this.recentSources.length > 0) {
                event.preventDefault();
                
                const menu = new Menu();
                
                // 添加歷史記錄
                this.recentSources.forEach((sourceInfoStr, index) => {
                    try {
                        const sourceInfo = JSON.parse(sourceInfoStr);
                        const { mode, path } = sourceInfo;
                        
                        // 根據模式顯示圖示和文字
                        let displayText = '';
                        let icon = '';
                        
                        switch (mode) {
                            case 'folder':
                                displayText = path || '/';
                                icon = 'folder';
                                break;
                            case 'bookmarks':
                                displayText = t('bookmarks_mode');
                                icon = 'bookmark';
                                break;
                            case 'search':
                                displayText = t('search_results');
                                icon = 'search';
                                break;
                            case 'backlinks':
                                displayText = t('backlinks_mode');
                                icon = 'paperclip';
                                break;
                            case 'recent-files':
                                displayText = t('recent_files_mode');
                                icon = 'calendar-days';
                                break;
                            case 'all-files':
                                displayText = t('all_files_mode');
                                icon = 'book-text';
                                break;
                            case 'random-note':
                                displayText = t('random_note_mode');
                                icon = 'dice';
                                break;
                            default:
                                displayText = mode;
                                icon = 'grid';
                        }
                        
                        // 添加歷史記錄到選單
                        menu.addItem((item) => {
                            item
                                .setTitle(`${displayText}`)
                                .setIcon(`${icon}`)
                                .onClick(() => {
                                    // 找出當前點擊的紀錄索引
                                    const clickedIndex = this.recentSources.findIndex(source => {
                                        const parsed = JSON.parse(source);
                                        return parsed.mode === mode && parsed.path === path;
                                    });
                                    
                                    // 如果找到點擊的紀錄，清除它之上的紀錄
                                    if (clickedIndex !== -1) {
                                        this.recentSources = this.recentSources.slice(clickedIndex + 1);
                                    }

                                    this.setSource(mode, path, true, false);
                                });
                        });
                    } catch (error) {
                        console.error('Failed to parse source info:', error);
                    }
                });
                
                // 顯示歷史選單
                menu.showAtMouseEvent(event);
            }
        });

        // 添加重新整理按鈕
        const refreshButton = headerButtonsDiv.createEl('button', { attr: { 'aria-label': t('refresh') }  });
        refreshButton.addEventListener('click', () => {
            if (this.sortType === 'random') {
                this.clearSelection();
            }
            this.render();
        });
        setIcon(refreshButton, 'refresh-ccw');

        // 添加排序按鈕
        if (this.sourceMode !== 'bookmarks' && this.sourceMode !== 'recent-files' && this.sourceMode !== 'random-note') {
            const sortButton = headerButtonsDiv.createEl('button', { attr: { 'aria-label': t('sorting') }  });
            sortButton.addEventListener('click', (evt) => {
                const menu = new Menu();
                const sortOptions = [
                    { value: 'name-asc', label: t('sort_name_asc'), icon: 'a-arrow-up' },
                    { value: 'name-desc', label: t('sort_name_desc'), icon: 'a-arrow-down' },
                    { value: 'mtime-desc', label: t('sort_mtime_desc'), icon: 'clock' },
                    { value: 'mtime-asc', label: t('sort_mtime_asc'), icon: 'clock' },
                    { value: 'ctime-desc', label: t('sort_ctime_desc'), icon: 'calendar' },
                    { value: 'ctime-asc', label: t('sort_ctime_asc'), icon: 'calendar' },
                    { value: 'random', label: t('sort_random'), icon: 'dice' },
                ];

                sortOptions.forEach(option => {
                    menu.addItem((item) => {
                        item
                            .setTitle(option.label)
                            .setIcon(option.icon)
                            .setChecked((this.folderSortType || this.sortType) === option.value)
                            .onClick(() => {
                                this.sortType = option.value;
                                this.folderSortType = '';
                                this.render();
                                // 通知 Obsidian 保存視圖狀態
                                this.app.workspace.requestSaveLayout();
                            });
                    });
                });
                menu.showAtMouseEvent(evt);
            });
            setIcon(sortButton, 'arrow-up-narrow-wide');
        }

        if (this.sourceMode !== 'random-note') {
            // 添加搜尋按鈕
            const searchButtonContainer = headerButtonsDiv.createDiv('ge-search-button-container');
            const searchButton = searchButtonContainer.createEl('button', {
                cls: 'search-button',
                attr: { 'aria-label': t('search') }
            });
            setIcon(searchButton, 'search');
            searchButton.addEventListener('click', () => {
                this.showSearchModal();
            });

            // 如果有搜尋關鍵字，顯示搜尋文字和取消按鈕
            if (this.searchQuery) {
                searchButton.style.display = 'none';
                const searchTextContainer = searchButtonContainer.createDiv('ge-search-text-container');

                // 創建搜尋文字
                const searchText = searchTextContainer.createEl('span', { cls: 'ge-search-text', text: this.searchQuery });
                // 讓搜尋文字可點選
                searchText.style.cursor = 'pointer';
                searchText.addEventListener('click', () => {
                    this.showSearchModal(this.searchQuery);
                });

                // 創建取消按鈕
                const clearButton = searchTextContainer.createDiv('ge-clear-button');
                setIcon(clearButton, 'x');
                clearButton.addEventListener('click', (e) => {
                    e.stopPropagation();  // 防止觸發搜尋文字的點擊事件
                    this.searchQuery = '';
                    this.searchAllFiles = true;
                    this.clearSelection();
                    this.render();
                    // 通知 Obsidian 保存視圖狀態
                    this.app.workspace.requestSaveLayout();
                });
            }
        }

        if ((this.sourceMode === 'all-files' || this.sourceMode === 'recent-files' || this.sourceMode === 'random-note') && 
            this.plugin.settings.showMediaFiles && this.searchQuery === '') {
            // 建立隨機筆記是否包含圖片和影片的設定按鈕
            const randomNoteSettingsButton = headerButtonsDiv.createEl('button', {
                attr: { 'aria-label': this.randomNoteIncludeMedia ? t('random_note_include_media_files') : t('random_note_notes_only') } 
            });
            this.randomNoteIncludeMedia ? setIcon(randomNoteSettingsButton, 'file-image') : setIcon(randomNoteSettingsButton, 'file-text');

            // 建立下拉選單
            const menu = new Menu();
            menu.addItem((item) => {
                item.setTitle(t('random_note_notes_only'))
                    .setIcon('file-text')
                    .setChecked(!this.randomNoteIncludeMedia)
                    .onClick(() => {
                        this.randomNoteIncludeMedia = false;
                        randomNoteSettingsButton.textContent = t('random_note_notes_only');
                        setIcon(randomNoteSettingsButton, 'file-text');
                        this.render();
                    });
            });
            menu.addItem((item) => {
                item.setTitle(t('random_note_include_media_files'))
                    .setIcon('file-image')
                    .setChecked(this.randomNoteIncludeMedia)
                    .onClick(() => {
                        this.randomNoteIncludeMedia = true;
                        randomNoteSettingsButton.textContent = t('random_note_include_media_files');
                        setIcon(randomNoteSettingsButton, 'file-image')
                        this.render();
                    });
            });

            // 點擊按鈕時顯示下拉選單
            randomNoteSettingsButton.addEventListener('click', (event) => {
                menu.showAtMouseEvent(event);
            });
        }

        // 創建資料夾夾名稱區域
        // headerButtonsDiv.createDiv('ge-foldername-content');

        // 創建內容區域
        const contentEl = this.containerEl.createDiv('view-content');

        // 重新渲染內容
        await this.grid_render();
        (this.leaf as any).updateHeader();

        // 恢復捲動位置
        if (scrollContainer && !resetScroll) {
            contentEl.scrollTop = scrollTop;
        }

        // 如果有之前選中的檔案路徑，嘗試恢復選中狀態
        if (selectedFilePath && this.hasKeyboardFocus) {
            const newIndex = this.gridItems.findIndex(item => item.dataset.filePath === selectedFilePath);
            if (newIndex >= 0) {
                this.selectItem(newIndex);
            }
        }
    }

    async grid_render() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('ge-grid-container');
        container.style.setProperty('--grid-item-width', this.plugin.settings.gridItemWidth + 'px');
        if (this.plugin.settings.gridItemHeight === 0) {
            container.style.setProperty('--grid-item-height', '100%');
        } else {
            container.style.setProperty('--grid-item-height', this.plugin.settings.gridItemHeight + 'px');
        }
        container.style.setProperty('--image-area-width', this.plugin.settings.imageAreaWidth + 'px');
        container.style.setProperty('--image-area-height', this.plugin.settings.imageAreaHeight + 'px');
        container.style.setProperty('--title-font-size', this.plugin.settings.titleFontSize + 'em');
        
        // 添加點擊空白處取消選中的事件處理器
        container.addEventListener('click', (event) => {
            // 只有當點擊的是容器本身，而不是其子元素時才清除選中
            if (event.target === container) {
                this.clearSelection();
                this.hasKeyboardFocus = false;
            }
        });
        
        // 重置網格項目數組
        this.gridItems = [];

        // 如果是書籤模式且書籤插件未啟用，顯示提示
        if (this.sourceMode === 'bookmarks' && !(this.app as any).internalPlugins.plugins.bookmarks?.enabled) {
            new Notice(t('bookmarks_plugin_disabled'));
            return;
        }

        // 如果是反向連結模式，但沒有活動中的檔案
        if (this.sourceMode === 'backlinks' && !this.app.workspace.getActiveFile()) {
            new Notice(t('no_backlinks'));
            return;
        }

        // 如果是資料夾模式且沒有搜尋結果，顯示目前資料夾名稱
        // if (this.sourceMode === 'folder' && this.searchQuery === '' && this.sourcePath !== '/') {
        //     const folderName = this.sourcePath.split('/').pop();
        //     const folderNameContainer = this.containerEl.querySelector('.ge-foldername-content') as HTMLElement;
        //     if (folderNameContainer) {
        //         folderNameContainer.createEl('span', { text: `📁 ${folderName}` });
        //     }
        // } else {
        //     const folderNameContainer = this.containerEl.querySelector('.ge-foldername-content') as HTMLElement;
        //     if (folderNameContainer) {
        //         folderNameContainer.empty();
        //         folderNameContainer.style.display = 'none';
        //     }
        // }

        // 如果啟用了顯示"回上層資料夾"選項
        if (this.sourceMode === 'folder' && this.searchQuery === '' && 
            this.plugin.settings.showParentFolderItem && this.sourcePath !== '/') {
            // 創建"回上層資料夾"
            const parentFolderEl = container.createDiv('ge-grid-item ge-folder-item');
            this.gridItems.push(parentFolderEl); // 添加到網格項目數組
            // 獲取父資料夾路徑
            const parentPath = this.sourcePath.split('/').slice(0, -1).join('/') || '/';
            // 設置資料夾路徑屬性
            parentFolderEl.dataset.folderPath = parentPath;
            
            const contentArea = parentFolderEl.createDiv('ge-content-area');
            const titleContainer = contentArea.createDiv('ge-title-container');
            titleContainer.createEl('span', { cls: 'ge-title', text: `📁 ..` });
            
            // 回上層資料夾事件
            parentFolderEl.addEventListener('click', () => {
                this.setSource('folder', parentPath, true);
                this.clearSelection();
            });
        }

        // 如果是資料夾模式，先顯示所有子資料夾
        if (this.sourceMode === 'folder' && this.searchQuery === '') {
            const currentFolder = this.app.vault.getAbstractFileByPath(this.sourcePath || '/');
            if (currentFolder instanceof TFolder) {
                const subfolders = currentFolder.children
                    .filter(child => {
                        if (!(child instanceof TFolder)) return false;
                        
                        // 檢查資料夾是否在忽略清單中
                        const isInIgnoredFolders = this.plugin.settings.ignoredFolders.some(folder => 
                            child.path === folder || child.path.startsWith(folder + '/')
                        );
                        
                        if (isInIgnoredFolders) {
                            return false;
                        }
                        
                        // 檢查資料夾是否符合忽略的模式
                        if (this.plugin.settings.ignoredFolderPatterns && this.plugin.settings.ignoredFolderPatterns.length > 0) {
                            const matchesIgnoredPattern = this.plugin.settings.ignoredFolderPatterns.some(pattern => {
                                try {
                                    // 嘗試將模式作為正則表達式處理
                                    // 如果模式包含特殊字符，使用正則表達式處理
                                    if (/[\^\$\*\+\?\(\)\[\]\{\}\|\\]/.test(pattern)) {
                                        const regex = new RegExp(pattern); 
                                        return regex.test(child.path);
                                    } else {
                                        // 檢查資料夾名稱是否包含模式字串（不區分大小寫）
                                        return child.name.toLowerCase().includes(pattern.toLowerCase());
                                    }
                                } catch (error) {
                                    // 如果正則表達式無效，直接檢查資料夾名稱
                                    return child.name.toLowerCase().includes(pattern.toLowerCase());
                                }
                            });
                            
                            if (matchesIgnoredPattern) {
                                return false;
                            }
                        }

                        return true;
                    })
                    .sort((a, b) => a.name.localeCompare(b.name));
                for (const folder of subfolders) {
                    const folderEl = container.createDiv('ge-grid-item ge-folder-item');
                    this.gridItems.push(folderEl); // 添加到網格項目數組
                    
                    // 設置資料夾路徑屬性，用於拖曳功能
                    folderEl.dataset.folderPath = folder.path;
                    
                    const contentArea = folderEl.createDiv('ge-content-area');
                    const titleContainer = contentArea.createDiv('ge-title-container');
                    titleContainer.createEl('span', { cls: 'ge-title', text: `📁 ${folder.name}` });
                    
                    // 檢查同名筆記是否存在
                    const notePath = `${folder.path}/${folder.name}.md`;
                    const noteFile = this.app.vault.getAbstractFileByPath(notePath);
                    
                    if (noteFile instanceof TFile) {
                        // 使用 span 代替 button，只顯示圖示
                        const noteIcon = titleContainer.createEl('span', {
                            cls: 'ge-note-button'
                        });
                        setIcon(noteIcon, 'panel-left-open');
                        
                        // 點擊圖示時開啟同名筆記
                        noteIcon.addEventListener('click', (e) => {
                            e.stopPropagation(); // 防止觸發資料夾的點擊事件
                            this.app.workspace.getLeaf().openFile(noteFile);
                        });

                        // 根據同名筆記設置背景色
                        const metadata = this.app.metadataCache.getFileCache(noteFile)?.frontmatter;
                        const colorValue = metadata?.color;
                        if (colorValue) {
                            // 設置背景色、框線色和文字顏色
                            folderEl.setAttribute('style', `
                                background-color: rgba(var(--color-${colorValue}-rgb), 0.2);
                                border-color: rgba(var(--color-${colorValue}-rgb), 0.5);
                            `);
                        }
                    }
                    
                    // 點擊時進入子資料夾
                    folderEl.addEventListener('click', () => {
                        this.setSource('folder', folder.path, true);
                        this.clearSelection();
                    });

                    // 添加右鍵選單
                    folderEl.addEventListener('contextmenu', (event) => {
                        event.preventDefault();
                        const menu = new Menu();
                        
                        // 檢查同名筆記是否存在
                        const notePath = `${folder.path}/${folder.name}.md`;
                        let noteFile = this.app.vault.getAbstractFileByPath(notePath);
                        if (noteFile instanceof TFile) {
                            menu.addItem((item) => {
                                item
                                    .setTitle(t('open_folder_note'))
                                    .setIcon('panel-left-open')
                                    .onClick(() => {
                                        this.app.workspace.getLeaf().openFile(noteFile);
                                    });
                            });
                            menu.addItem((item) => {
                                item
                                    .setTitle(t('edit_folder_note_settings'))
                                    .setIcon('settings-2')
                                    .onClick(() => {
                                        if (folder instanceof TFolder) {
                                            showFolderNoteSettingsModal(this.app, this.plugin, folder);
                                        }
                                    });
                            });
                            //刪除資料夾筆記
                            menu.addItem((item) => {
                                item
                                    .setTitle(t('delete_folder_note'))
                                    .setIcon('folder-x')
                                    .onClick(() => {
                                        this.app.fileManager.trashFile(noteFile as TFile);
                                        // 重新渲染視圖
                                        setTimeout(() => {
                                            this.render();
                                        }, 100);
                                    });
                            });
                        } else {
                            //建立Folder note
                            menu.addItem((item) => {
                                item
                                    .setTitle(t('create_folder_note'))
                                    .setIcon('file-cog')
                                    .onClick(() => {
                                        if (folder instanceof TFolder) {
                                            showFolderNoteSettingsModal(this.app, this.plugin, folder);
                                        }
                                    });
                            });
                        }
                        //加入"忽略此資料夾"選項
                        menu.addItem((item) => {
                            item
                                .setTitle(t('ignore_folder'))
                                .setIcon('x')
                                .onClick(() => {
                                    this.plugin.settings.ignoredFolders.push(folder.path);
                                    this.plugin.saveSettings();
                                });
                        });
                        // 重新命名資料夾
                        menu.addItem((item) => {
                            item
                                .setTitle(t('rename_folder'))
                                .setIcon('file-cog')
                                .onClick(() => {
                                    if (folder instanceof TFolder) {
                                        showFolderRenameModal(this.app, this.plugin, folder, this);
                                    }
                                });
                        });
                        //刪除資料夾
                        menu.addItem((item) => {
                            (item as any).setWarning(true);
                            item
                                .setTitle(t('delete_folder'))
                                .setIcon('trash')
                                .onClick(async () => {
                                    if (folder instanceof TFolder) {
                                        await this.app.fileManager.trashFile(folder);
                                        // 重新渲染視圖
                                        setTimeout(() => {
                                            this.render();
                                        }, 100);
                                    }
                                });
                        });
                        menu.showAtMouseEvent(event);
                    });
                }
            }
        }

        let files: TFile[] = [];
        if (this.searchQuery && this.sourceMode !== 'random-note') {
            // 顯示搜尋中的提示
            const loadingDiv = container.createDiv('ge-loading-indicator');
            loadingDiv.setText(t('searching'));
            
            // 取得 vault 中所有支援的檔案
            let allFiles: TFile[] = [];
            if (this.searchAllFiles) {
                allFiles = this.app.vault.getFiles();
            } else {
                allFiles = await this.getFiles();
            }

            // 根據設定過濾檔案
            const filteredFiles = allFiles.filter(file => {
                // 文件檔案始終包含
                if (isDocumentFile(file)) {
                    return true;
                }
                // 媒體檔案根據 searchMediaFiles 設定決定是否包含
                if (isMediaFile(file)) {
                    return this.plugin.settings.searchMediaFiles;
                }
                return false;
            });
            
            // 根據搜尋關鍵字進行過濾（不分大小寫）
            const lowerCaseSearchQuery = this.searchQuery.toLowerCase();
            // 使用 Promise.all 來非同步地讀取所有檔案內容
            await Promise.all(
                filteredFiles.map(async file => {
                    const fileName = file.name.toLowerCase();
                    if (fileName.includes(lowerCaseSearchQuery)) {
                        files.push(file);
                    } else if (file.extension === 'md') {
                        // 只對 Markdown 檔案進行內容搜尋
                        const content = (await this.app.vault.cachedRead(file)).toLowerCase();
                        if (content.includes(lowerCaseSearchQuery)) {
                            files.push(file);
                        }
                    }
                })
            );
            // 根據設定的排序方式排序檔案
            files = this.sortFiles(files);
            
            // 移除搜尋中的提示
            loadingDiv.remove();
        } else {
            // 獲取檔案列表並根據搜尋關鍵字過濾
            files = await this.getFiles();
        }

        //忽略檔案
        files = this.ignoredFiles(files)

        //最近檔案模式，只取前30筆
        if (this.sourceMode === 'recent-files') {
            files = files.slice(0, 30);
        }

        // 隨機筆記模式，只取前10筆
        if (this.sourceMode === 'random-note') {
            files = files.slice(0, 10);
        }

        // 如果沒有檔案，顯示提示訊息
        if (files.length === 0) {
            const noFilesDiv = container.createDiv('ge-no-files');
            noFilesDiv.setText(t('no_files'));
            if (this.plugin.statusBarItem) {
                this.plugin.statusBarItem.setText('');
            }
            return;
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
                            
                            let contentWithoutFrontmatter = '';
                            if (summaryLength < 500) {
                                contentWithoutFrontmatter = content.substring(frontMatterInfo.contentStart).slice(0, 500);
                            } else {
                                contentWithoutFrontmatter = content.substring(frontMatterInfo.contentStart).slice(0, summaryLength + summaryLength);
                            }
                            let contentWithoutMediaLinks = contentWithoutFrontmatter.replace(/```[\s\S]*?```\n|<!--[\s\S]*?-->|!?(?:\[[^\]]*\]\([^)]+\)|\[\[[^\]]+\]\])/g, '');
                            contentWithoutMediaLinks = contentWithoutMediaLinks.replace(/```[\s\S]*$/,'').trim();

                            //把開頭的標題整行刪除
                            if (contentWithoutMediaLinks.startsWith('# ') || contentWithoutMediaLinks.startsWith('## ') || contentWithoutMediaLinks.startsWith('### ')) {
                                contentWithoutMediaLinks = contentWithoutMediaLinks.split('\n').slice(1).join('\n');
                            }
                            
                            // 只取前 summaryLength 個字符作為預覽
                            const preview = contentWithoutMediaLinks.slice(0, summaryLength) + (contentWithoutMediaLinks.length > summaryLength ? '...' : '');
                            // 創建預覽內容
                            const pEl = contentArea.createEl('p', { text: preview.trim() });

                            if (frontMatterInfo.exists) {
                                const metadata = this.app.metadataCache.getFileCache(file)?.frontmatter;
                                const colorValue = metadata?.color;
                                if (colorValue) {
                                    // 設置背景色、框線色和文字顏色
                                    fileEl.setAttribute('style', `
                                        background-color: rgba(var(--color-${colorValue}-rgb), 0.2);
                                        border-color: rgba(var(--color-${colorValue}-rgb), 0.5);
                                    `);
                                    // 設置預覽內容文字顏色
                                    pEl.style.color = `rgba(var(--color-${colorValue}-rgb), 0.7)`;
                                }
                            }

                            imageUrl = await findFirstImageInNote(this.app, content);
                        } else {
                            // 其他檔案顯示副檔名
                            contentArea.createEl('p', { text: file.extension.toUpperCase() });
                        }   
                        contentArea.setAttribute('data-loaded', 'true');
                    }
                    
                    // 載入圖片預覽
                    const imageArea = fileEl.querySelector('.ge-image-area');
                    if (imageArea && !imageArea.hasAttribute('data-loaded')) {
                        // 根據檔案類型處理
                        if (isImageFile(file)) {
                            // 直接顯示圖片
                            const img = imageArea.createEl('img');
                            img.src = this.app.vault.getResourcePath(file);
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
        for (const file of files) {
            const fileEl = container.createDiv('ge-grid-item');
            this.gridItems.push(fileEl); // 添加到網格項目數組
            fileEl.dataset.filePath = file.path;
            
            // 創建左側內容區，包含圖示和標題
            const contentArea = fileEl.createDiv('ge-content-area');
            
            // 創建標題容器
            const titleContainer = contentArea.createDiv('ge-title-container');
            const extension = file.extension.toLowerCase();

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
            } else if (extension === 'md' || extension === 'txt') {
                const iconContainer = titleContainer.createDiv('ge-icon-container');
                setIcon(iconContainer, 'file-text');
            } else {
                const iconContainer = titleContainer.createDiv('ge-icon-container');
                setIcon(iconContainer, 'file');
            }
            
            // 創建標題（立即載入）
            const titleEl = titleContainer.createEl('span', { cls: 'ge-title', text: file.basename });
            titleEl.setAttribute('title', file.basename);
            
            // 創建圖片區域，但先不載入圖片
            fileEl.createDiv('ge-image-area');
            
            // 開始觀察這個元素
            observer.observe(fileEl);
            
            // 點擊時開啟檔案
            fileEl.addEventListener('click', (event) => {
                // 獲取項目索引
                const index = this.gridItems.indexOf(fileEl);
                if (index < 0) return;

                // 處理多選邏輯
                if (event.ctrlKey || event.metaKey) {
                    // Ctrl/Cmd 鍵：切換選中狀態
                    this.selectItem(index, true);
                    this.hasKeyboardFocus = true;
                    event.preventDefault();
                    return;
                } else if (event.shiftKey) {
                //if (event.shiftKey) {
                    // Shift 鍵：範圍選擇
                    this.handleRangeSelection(index);
                    this.hasKeyboardFocus = true;
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
                            this.openAudioFile(file);
                        } else {
                            this.openMediaFile(file, files);
                        }
                    } else {
                        // 開啟文件檔案
                        if (event.ctrlKey || event.metaKey) {
                            this.app.workspace.getLeaf(true).openFile(file);
                        } else {
                            this.app.workspace.getLeaf().openFile(file);
                        }
                    }
                }
            });
            
            // 處理滑鼠中鍵點擊
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

            if(Platform.isDesktop) {
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
                    
                    // 添加拖曳資料
                    if (selectedFiles.length > 1) {
                        // 如果多個檔案被選中，使用 files-menu
                        const fileList = selectedFiles.map(f => {
                            const isMedia = isMediaFile(f);
                            return isMedia ? `![[${f.path}]]` : `[[${f.path}]]`;
                        }).join('\n');
                        event.dataTransfer?.setData('text/plain', fileList);
                        
                        // 添加檔案路徑列表
                        event.dataTransfer?.setData('application/obsidian-grid-explorer-files', 
                            JSON.stringify(selectedFiles.map(f => f.path)));
                    } else {
                        // 如果只有單個檔案被選中，使用檔案路徑
                        const isMedia = isMediaFile(file);
                        const mdLink = isMedia
                            ? `![[${file.path}]]` // 媒體檔案使用 ![[]] 格式
                            : `[[${file.path}]]`;  // 一般檔案使用 [[]] 格式

                        // 添加拖曳資料
                        event.dataTransfer?.setData('text/plain', mdLink);
                        
                        // 添加檔案路徑列表
                        event.dataTransfer?.setData('application/obsidian-grid-explorer-files', 
                            JSON.stringify([file.path]));
                    }
                    
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
                                .setTitle(t('set_note_color'))
                                .setIcon('palette')
                                .onClick(() => {
                                    showNoteColorSettingsModal(this.app, this.plugin, selectedFiles);
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
                        .setIcon('external-link')
                        .setSection?.("open")
                        .onClick(() => {
                            if (selectedFiles.length > 1) {
                                // 如果多個檔案被選中，開啟所有文件檔案
                                const documentFiles = selectedFiles.filter(f => isDocumentFile(f));
                                for (const docFile of documentFiles) {
                                    this.app.workspace.getLeaf(true).openFile(docFile);
                                }
                            } else {
                                this.app.workspace.getLeaf(true).openFile(file);
                            }
                        });
                });

                // 刪除選項
                menu.addItem((item) => {
                    (item as any).setWarning(true);
                    item
                        .setTitle(t('delete_note'))
                        .setIcon('trash')
                        .onClick(async () => {
                            if (selectedFiles.length > 1) {
                                // 刪除多個檔案
                                for (const f of selectedFiles) {
                                    await this.app.fileManager.trashFile(f);
                                }
                                // 清除選中狀態
                                this.clearSelection();
                            } else {
                                // 刪除單個檔案
                                await this.app.fileManager.trashFile(file);
                            }
                        });
                });
                menu.showAtMouseEvent(event);
            });
        }

        if(Platform.isDesktop) {
            // 為資料夾項目添加拖曳目標功能
            const folderItems = this.containerEl.querySelectorAll('.ge-folder-item');
            folderItems.forEach(folderItem => {
                folderItem.addEventListener('dragover', (event) => {
                    // 防止預設行為以允許放置
                    event.preventDefault();
                    // 設定拖曳效果為移動
                    (event as any).dataTransfer!.dropEffect = 'move';
                    // 顯示可放置的視覺提示
                    folderItem.addClass('ge-dragover');
                });
                
                folderItem.addEventListener('dragleave', () => {
                    // 移除視覺提示
                    folderItem.removeClass('ge-dragover');
                });
                
                folderItem.addEventListener('drop', async (event) => {
                    // 防止預設行為
                    event.preventDefault();
                    // 移除視覺提示
                    folderItem.removeClass('ge-dragover');
                    
                    // 獲取拖曳的檔案路徑列表
                    const filesDataString = (event as any).dataTransfer?.getData('application/obsidian-grid-explorer-files');
                    if (filesDataString) {
                        try {
                            // 解析檔案路徑列表
                            const filePaths = JSON.parse(filesDataString);
                            
                            // 獲取目標資料夾路徑
                            const folderPath = (folderItem as any).dataset.folderPath;
                            if (!folderPath) return;
                            
                            // 獲取資料夾物件
                            const folder = this.app.vault.getAbstractFileByPath(folderPath);
                            if (!(folder instanceof TFolder)) return;
                            
                            // 移動檔案
                            for (const path of filePaths) {
                                const file = this.app.vault.getAbstractFileByPath(path);
                                if (file instanceof TFile) {
                                    try {
                                    // 計算新的檔案路徑
                                        const newPath = `${folderPath}/${file.name}`;
                                    // 移動檔案
                                    await this.app.fileManager.renameFile(file, newPath);
                                    } catch (error) {
                                        console.error(`An error occurred while moving the file ${file.path}:`, error);
                                    }
                                }
                            }
                            
                            // 重新渲染視圖
                            this.render();
                            return;
                        } catch (error) {
                            console.error('Error parsing dragged files data:', error);
                        }
                    }

                    // 如果沒有檔案路徑列表，則使用檔案路徑
                    const filePath = (event as any).dataTransfer?.getData('text/plain');
                    if (!filePath) return;
                    
                    const cleanedFilePath = filePath.replace(/!?\[\[(.*?)\]\]/, '$1');
                    
                    // 獲取目標資料夾路徑
                    const folderPath = (folderItem as any).dataset.folderPath;
                    if (!folderPath) return;
                    
                    // 獲取檔案和資料夾物件
                    const file = this.app.vault.getAbstractFileByPath(cleanedFilePath);
                    const folder = this.app.vault.getAbstractFileByPath(folderPath);
                    
                    if (file instanceof TFile && folder instanceof TFolder) {
                        try {
                            // 計算新的檔案路徑
                            const newPath = `${folderPath}/${file.name}`;
                            // 移動檔案
                            await this.app.fileManager.renameFile(file, newPath);
                            // 重新渲染視圖
                            this.render();
                        } catch (error) {
                            console.error('An error occurred while moving the file:', error);
                        }
                    }
                });
            });
        }

        if (this.plugin.statusBarItem) {
            this.plugin.statusBarItem.setText(`${files.length} ${t('files')}`);
        }
    }

    // 處理鍵盤導航
    handleKeyDown(event: KeyboardEvent) {
        // 如果鍵盤導航被禁用或沒有項目，直接返回
        if (!this.keyboardNavigationEnabled || this.gridItems.length === 0) return;

        // 計算每行的項目數量（根據容器寬度和項目寬度計算）
        const container = this.containerEl.children[1] as HTMLElement;
        const containerWidth = container.clientWidth;
        const itemWidth = this.plugin.settings.gridItemWidth + 20; // 項目寬度加上間距
        const itemsPerRow = Math.max(1, Math.floor(containerWidth / itemWidth));
        
        let newIndex = this.selectedItemIndex;

        // 如果還沒有選中項目且按下了方向鍵，選中第一個項目
        if (this.selectedItemIndex === -1 && 
            ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            this.hasKeyboardFocus = true;
            this.selectItem(0);
            event.preventDefault();
            return;
        }

        switch (event.key) {
            case 'ArrowRight':
                if (event.altKey) {
                    // 如果有選中的項目，模擬點擊
                    if (this.selectedItemIndex >= 0 && this.selectedItemIndex < this.gridItems.length) {
                        this.gridItems[this.selectedItemIndex].click();
                    }
                }  
                newIndex = Math.min(this.gridItems.length - 1, this.selectedItemIndex + 1);
                this.hasKeyboardFocus = true;
                event.preventDefault();
                break;
            case 'ArrowLeft':
                if (event.altKey) {
                    // 如果按下 Alt + 左鍵，且是資料夾模式且不是根目錄
                    if (this.sourceMode === 'folder' && this.sourcePath && this.sourcePath !== '/') {
                        // 獲取上一層資料夾路徑
                        const parentPath = this.sourcePath.split('/').slice(0, -1).join('/') || '/';
                        this.setSource('folder', parentPath, true);
                        this.clearSelection();
                        event.preventDefault();
                    }
                    break;
                }
                newIndex = Math.max(0, this.selectedItemIndex - 1);
                this.hasKeyboardFocus = true;
                event.preventDefault();
                break;
            case 'ArrowDown':
                newIndex = Math.min(this.gridItems.length - 1, this.selectedItemIndex + itemsPerRow);
                this.hasKeyboardFocus = true;
                event.preventDefault();
                break;
            case 'ArrowUp':
                if (event.altKey) {
                    // 如果按下 Alt + 左鍵，且是資料夾模式且不是根目錄
                    if (this.sourceMode === 'folder' && this.sourcePath && this.sourcePath !== '/') {
                        // 獲取上一層資料夾路徑
                        const parentPath = this.sourcePath.split('/').slice(0, -1).join('/') || '/';
                        this.setSource('folder', parentPath, true);
                        this.clearSelection();
                        event.preventDefault();
                    }
                    break;
                }
                newIndex = Math.max(0, this.selectedItemIndex - itemsPerRow);
                this.hasKeyboardFocus = true;
                event.preventDefault();
                break;
            case 'Home':
                newIndex = 0;
                this.hasKeyboardFocus = true;
                event.preventDefault();
                break;
            case 'End':
                newIndex = this.gridItems.length - 1;
                this.hasKeyboardFocus = true;
                event.preventDefault();
                break;
            case 'Enter':
                // 如果有選中的項目，模擬點擊
                if (this.selectedItemIndex >= 0 && this.selectedItemIndex < this.gridItems.length) {
                    this.gridItems[this.selectedItemIndex].click();
                }
                this.clearSelection();
                event.preventDefault();
                break;
            case 'Backspace':
                // 如果是資料夾模式且不是根目錄，返回上一層資料夾
                if (this.sourceMode === 'folder' && this.sourcePath && this.sourcePath !== '/') {
                    // 獲取上一層資料夾路徑
                    const parentPath = this.sourcePath.split('/').slice(0, -1).join('/') || '/';
                    this.setSource('folder', parentPath, true);
                    this.clearSelection();
                    event.preventDefault();
                }
                break;
            case 'Escape':
                // 清除選中狀態
                if (this.selectedItemIndex >= 0) {
                    this.hasKeyboardFocus = false;
                    this.clearSelection();
                    event.preventDefault();
                }
                break;
        }

        // 如果索引有變化，選中新項目
        if (newIndex !== this.selectedItemIndex) {
            this.selectItem(newIndex);
        }
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
            selectedItem.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
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
            : this.getFiles().then(allFiles => allFiles.filter(f => isMediaFile(f)));
        
        getMediaFilesPromise.then(filteredMediaFiles => {
            // 找到當前檔案在媒體檔案列表中的索引
            const currentIndex = filteredMediaFiles.findIndex(f => f.path === file.path);
            if (currentIndex === -1) return;

            // 使用 MediaModal 開啟媒體檔案，並傳入 this 作為 gridView 參數
            const mediaModal = new MediaModal(this.app, file, filteredMediaFiles, this);
            mediaModal.open();
        });
    }
    
    // 開啟音樂檔案
    openAudioFile(file: TFile) {
        // 檢查是否已有相同檔案的播放器
        const existingPlayer = document.querySelector(`.ge-floating-audio-player[data-file="${file.path}"]`);
        
        // 查詢所有已經存在的音樂播放器
        const existingPlayers = document.querySelectorAll('.ge-floating-audio-player');
        
        if (existingPlayer) {
            // 如果已有相同檔案播放器，則聚焦到該播放器
            existingPlayer.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        } else if (existingPlayers.length > 0) {
            // 如果有其他音樂播放器，則聚焦到第一個播放器並更新它
            const firstPlayer = existingPlayers[0] as HTMLElement;
            
            // 聚焦到播放器
            firstPlayer.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // 更新播放器的檔案屬性
            firstPlayer.setAttribute('data-file', file.path);
            
            // 更新音訊來源
            const audioElement = firstPlayer.querySelector('audio');
            if (audioElement) {
                audioElement.src = this.app.vault.getResourcePath(file);
                audioElement.play();
            }
            
            // 更新標題
            const titleElement = firstPlayer.querySelector('.ge-audio-title');
            if (titleElement) {
                titleElement.textContent = file.basename;
            }
            
            return;
        }
        
        // 創建音樂播放器容器
        const audioPlayerContainer = document.createElement('div');
        audioPlayerContainer.className = 'ge-floating-audio-player';
        audioPlayerContainer.setAttribute('data-file', file.path);
        
        // 創建音樂元素
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = this.app.vault.getResourcePath(file);
        
        // 創建標題元素
        const titleElement = document.createElement('div');
        titleElement.className = 'ge-audio-title';
        titleElement.textContent = file.basename;
        
        // 創建關閉按鈕
        const closeButton = document.createElement('div');
        closeButton.className = 'ge-audio-close-button';
        setIcon(closeButton, 'x');
        closeButton.addEventListener('click', () => {
            // 移除音樂播放器
            audioPlayerContainer.remove();
        });
        
        // 創建拖曳控制元素
        const handleElement = document.createElement('div');
        handleElement.className = 'ge-audio-handle';
        
        // 將元素添加到容器中
        audioPlayerContainer.appendChild(handleElement);
        audioPlayerContainer.appendChild(titleElement);
        audioPlayerContainer.appendChild(audio);
        audioPlayerContainer.appendChild(closeButton);
        
        // 設定拖曳事件
        let isDragging = false;
        let offsetX = 0;
        let offsetY = 0;
        let isTouchEvent = false;
        
        handleElement.addEventListener('mousedown', (e) => {
            if (isTouchEvent) return; // 如果是觸控事件觸發的，則忽略滑鼠事件
            isDragging = true;
            offsetX = e.clientX - audioPlayerContainer.getBoundingClientRect().left;
            offsetY = e.clientY - audioPlayerContainer.getBoundingClientRect().top;
            audioPlayerContainer.classList.add('ge-audio-dragging');
        });
        
        handleElement.addEventListener('touchstart', (e) => {
            isTouchEvent = true;
            isDragging = true;
            const touch = e.touches[0];
            offsetX = touch.clientX - audioPlayerContainer.getBoundingClientRect().left;
            offsetY = touch.clientY - audioPlayerContainer.getBoundingClientRect().top;
            audioPlayerContainer.classList.add('ge-audio-dragging');
        }, { passive: true });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging || isTouchEvent) return;
            
            const x = e.clientX - offsetX;
            const y = e.clientY - offsetY;
            
            audioPlayerContainer.style.left = `${x}px`;
            audioPlayerContainer.style.top = `${y}px`;
        });
        
        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            
            const touch = e.touches[0];
            const x = touch.clientX - offsetX;
            const y = touch.clientY - offsetY;
            
            audioPlayerContainer.style.left = `${x}px`;
            audioPlayerContainer.style.top = `${y}px`;
            
            // 防止頁面滾動
            e.preventDefault();
        }, { passive: false });
        
        document.addEventListener('mouseup', () => {
            if (isTouchEvent) return;
            isDragging = false;
            audioPlayerContainer.classList.remove('ge-audio-dragging');
        });
        
        document.addEventListener('touchend', () => {
            isDragging = false;
            isTouchEvent = false;
            audioPlayerContainer.classList.remove('ge-audio-dragging');
        });

        // 將音樂播放器添加到文檔中
        document.body.appendChild(audioPlayerContainer);
        
        // 設定初始位置
        const rect = audioPlayerContainer.getBoundingClientRect();
        audioPlayerContainer.style.left = `${window.innerWidth - rect.width - 20}px`;
        audioPlayerContainer.style.top = `${window.innerHeight - rect.height - 20}px`;
        
        // 播放音樂
        audio.play();
    }

    // 顯示搜尋 modal
    showSearchModal(defaultQuery = '') {
        showSearchModal(this.app, this, defaultQuery);
    }

    // 保存視圖狀態
    getState() {
        return {
            type: 'grid-view',
            state: {
                sourceMode: this.sourceMode,
                sourcePath: this.sourcePath,
                sortType: this.sortType,
                folderSortType: this.folderSortType,
                searchQuery: this.searchQuery,
                searchAllFiles: this.searchAllFiles,
                randomNoteIncludeMedia: this.randomNoteIncludeMedia
            }
        };
    }

    // 讀取視圖狀態
    async setState(state: any): Promise<void> {  
        if (state.state) {
            this.sourceMode = state.state.sourceMode || '';
            this.sourcePath = state.state.sourcePath || null;
            this.sortType = state.state.sortType || 'mtime-desc';
            this.folderSortType = state.state.folderSortType || '';
            this.searchQuery = state.state.searchQuery || '';
            this.searchAllFiles = state.state.searchAllFiles ?? true;
            this.randomNoteIncludeMedia = state.state.randomNoteIncludeMedia ?? false;
            this.render();
        }
    }

    // 禁用鍵盤導航
    disableKeyboardNavigation() {
        this.keyboardNavigationEnabled = false;
    }

    // 啟用鍵盤導航
    enableKeyboardNavigation() {
        this.keyboardNavigationEnabled = true;
    }
}