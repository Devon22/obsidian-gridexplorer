import { WorkspaceLeaf, ItemView, TFolder, TFile, Menu, Notice, Platform } from 'obsidian';
import { setIcon, getFrontMatterInfo } from 'obsidian';
import { showFolderSelectionModal } from './FolderSelectionModal';
import { findFirstImageInNote } from './mediaUtils';
import { MediaModal } from './MediaModal';
import { showSearchModal } from './SearchModal';
import { FileWatcher } from './FileWatcher';
import { t } from './translations';
import GridExplorerPlugin from '../main';

// 定義網格視圖
export class GridView extends ItemView {
    plugin: GridExplorerPlugin;
    sourceMode: string;
    sourcePath: string;
    sortType: string;
    searchQuery: string;
    searchAllFiles: boolean;
    searchType: string;
    selectedItemIndex: number = -1; // 當前選中的項目索引
    gridItems: HTMLElement[] = []; // 存儲所有網格項目的引用
    hasKeyboardFocus: boolean = false; // 是否有鍵盤焦點
    keyboardNavigationEnabled: boolean = true; // 是否啟用鍵盤導航
    fileWatcher: FileWatcher;

    constructor(leaf: WorkspaceLeaf, plugin: GridExplorerPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.containerEl.addClass('ge-grid-view-container');
        this.sourceMode = ''; // 預設為書籤模式
        this.sourcePath = ''; // 用於資料夾模式的路徑
        this.sortType = this.plugin.settings.defaultSortType; // 使用設定中的預設排序模式
        this.searchQuery = ''; // 搜尋關鍵字
        this.searchAllFiles = true;
        
        // 根據設定決定是否註冊檔案變更監聽器
        if (this.plugin.settings.enableFileWatcher) {
            this.fileWatcher = new FileWatcher(plugin, this);
            this.fileWatcher.registerFileWatcher();
        }

        // 註冊鍵盤事件處理
        this.registerDomEvent(document, 'keydown', (event: KeyboardEvent) => {
            // 只有當 GridView 是活動視圖時才處理鍵盤事件
            const activeLeaf = this.app.workspace.activeLeaf;
            if (activeLeaf && activeLeaf.view === this) {
                this.handleKeyDown(event);
            }
        });
    }

    getViewType() {
        return 'grid-view';
    }

    getIcon() {
        return 'grid';
    }

    getDisplayText() {
        if (this.sourceMode === '') {
            return t('grid_view_title');
        } else if (this.sourceMode === 'bookmarks') {
            return t('bookmarks_mode');
        } else if (this.sourceMode === 'folder') {
            return this.sourcePath;
        } else if (this.sourceMode === 'search') {
            return t('search_results');
        } else if (this.sourceMode === 'backlinks') {
            return t('backlinks_mode');
        } else if (this.sourceMode === 'all-notes') {
            return t('all_notes_mode');
        } else {
            return '';
        }
    }

    setSource(mode: string, path = '') {
        this.sourceMode = mode;
        this.sourcePath = path;
        this.render();
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
                    if (file.extension === 'md' || file.extension === 'pdf' || file.extension === 'canvas') return true;
                    
                    // 如果是媒體檔案，根據設定決定是否包含
                    if (this.plugin.settings.showMediaFiles && this.isMediaFile(file)) {
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

            return this.sortFiles(this.ignoredFiles(Array.from(backlinks) as TFile[]));
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
                        if (file.extension === 'md' || file.extension === 'pdf' || file.extension === 'canvas' ||
                            (this.plugin.settings.showMediaFiles && this.isMediaFile(file))) {
                            bookmarkedFiles.add(file);
                        }
                    }
                } else if (item.type === 'group' && item.items) {
                    item.items.forEach(processBookmarkItem);
                }
            };
            
            bookmarks.forEach(processBookmarkItem);
            return Array.from(bookmarkedFiles) as TFile[];
        } else if (this.sourceMode === 'all-notes') {
            // 所有筆記模式
            const allFiles = this.app.vault.getFiles();
            
            // 根據設定過濾檔案
            const filteredFiles = allFiles.filter(file => {
                // 如果是 Markdown 檔案，直接包含
                if (file.extension === 'md' || file.extension === 'pdf' || file.extension === 'canvas') return true;
                
                // 如果是媒體檔案，根據設定決定是否包含
                if (this.plugin.settings.showMediaFiles && this.isMediaFile(file)) {
                    return true;
                }
                
                return false;
            });
            
            return this.sortFiles(filteredFiles);
        } else {
            return [];
        }
    }

    //排序檔案
    sortFiles(files: TFile[]) {
        if (this.sortType === 'name-asc') {
            return files.sort((a, b) => a.basename.localeCompare(b.basename));
        } else if (this.sortType === 'name-desc') {
            return files.sort((a, b) => b.basename.localeCompare(a.basename));
        } else if (this.sortType === 'mtime-desc') {
            return files.sort((a, b) => b.stat.mtime - a.stat.mtime);
        } else if (this.sortType === 'mtime-asc') {
            return files.sort((a, b) => a.stat.mtime - b.stat.mtime);
        } else if (this.sortType === 'ctime-desc') {
            return files.sort((a, b) => b.stat.ctime - a.stat.ctime);
        } else if (this.sortType === 'ctime-asc') {
            return files.sort((a, b) => a.stat.ctime - b.stat.ctime);
        } else if (this.sortType === 'random') {
            return files.sort(() => Math.random() - 0.5);
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
            
            // 檢查是否符合忽略的資料夾模式
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

    // 判斷是否為媒體檔案
    isMediaFile(file: TFile): boolean {
        const mediaExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mov', 'avi', 'mkv'];
        return mediaExtensions.includes(file.extension.toLowerCase());
    }

    async render() {
        // 儲存當前捲動位置
        const scrollContainer = this.containerEl.children[1] as HTMLElement;
        const scrollTop = scrollContainer ? scrollContainer.scrollTop : 0;

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

        // 為頂部按鈕區域添加右鍵選單事件
        headerButtonsDiv.addEventListener('contextmenu', (event: MouseEvent) => {
            event.preventDefault();
            const menu = new Menu();
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
        });

        // 添加新增筆記按鈕
        if (this.sourceMode === 'folder' && this.searchQuery === '') {
            const newNoteButton = headerButtonsDiv.createEl('button', { attr: { 'aria-label': t('new_note') } });
            newNoteButton.addEventListener('click', async () => {
                // 取得目前時間作為檔名的一部分
                let newFileName = `${t('untitled')}.md`;
                let newFilePath = this.sourcePath === '/' 
                    ? newFileName 
                    : `${this.sourcePath}/${newFileName}`;

                // 檢查檔案是否已存在，如果存在則遞增編號
                let counter = 1;
                while (this.app.vault.getAbstractFileByPath(newFilePath)) {
                    newFileName = `${t('untitled')} ${counter}.md`;
                    newFilePath = this.sourcePath === '/'
                        ? newFileName
                        : `${this.sourcePath}/${newFileName}`;
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
        }

        // 添加回上層按鈕（僅在資料夾模式且不在根目錄時顯示）
        if (this.sourceMode === 'folder' && this.sourcePath !== '/' && this.searchQuery === '') {
            const upButton = headerButtonsDiv.createEl('button', { attr: { 'aria-label': t('go_up') } });
            upButton.addEventListener('click', () => {
                const parentPath = this.sourcePath.split('/').slice(0, -1).join('/') || '/';
                this.setSource('folder', parentPath);
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
                    
                    // 獲取拖曳的檔案路徑
                    const filePath = (event as any).dataTransfer?.getData('text/plain');
                    if (!filePath) return;
                    
                    const cleanedFilePath = filePath.replace(/!?\[\[(.*?)\]\]/, '$1');
                    
                    // 獲取上一層資料夾路徑
                    const parentPath = this.sourcePath.split('/').slice(0, -1).join('/') || '/';
                    if (!parentPath) return;
                    
                    // 獲取檔案和資料夾物件
                    const file = this.app.vault.getAbstractFileByPath(cleanedFilePath);
                    const folder = this.app.vault.getAbstractFileByPath(parentPath);
                    
                    if (file instanceof TFile && folder instanceof TFolder) {
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
        const reselectButton = headerButtonsDiv.createEl('button', { attr: { 'aria-label': t('reselect_folder') }  });
        reselectButton.addEventListener('click', () => {
            showFolderSelectionModal(this.app, this.plugin, this);
        });
        setIcon(reselectButton, "folder");

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
        if (this.sourceMode !== 'bookmarks') {
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
                            .setChecked(this.sortType === option.value)
                            .onClick(() => {
                                this.sortType = option.value;
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

        // 添加搜尋按鈕
        const searchButtonContainer = headerButtonsDiv.createDiv('ge-search-button-container');
        
        // 搜尋按鈕
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

        // 創建內容區域
        const contentEl = this.containerEl.createDiv('view-content');

        // 重新渲染內容
        await this.grid_render();
        (this.leaf as any).updateHeader();

        // 恢復捲動位置
        if (scrollContainer) {
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

        // 如果是資料夾模式，且不是在搜索状态，且设置中启用了显示"返回上级文件夹"选项，且不是根目录
        if (this.sourceMode === 'folder' && this.searchQuery === '' && 
            this.plugin.settings.showParentFolderItem && this.sourcePath !== '/') {
            // 创建"返回上级文件夹"项目
            const parentFolderEl = container.createDiv('ge-grid-item ge-folder-item ge-parent-folder-item');
            this.gridItems.push(parentFolderEl); // 添加到網格項目數組
            
            // 获取父文件夹路径
            const parentPath = this.sourcePath.split('/').slice(0, -1).join('/') || '/';
            
            // 设置文件夹路径属性
            parentFolderEl.dataset.folderPath = parentPath;
            
            const contentArea = parentFolderEl.createDiv('ge-content-area');
            const titleContainer = contentArea.createDiv('ge-title-container');
            const titleEl = titleContainer.createEl('span', { cls: 'ge-title', text: `⤴️ ${t('parent_folder')}` });
            
            // 点击事件 - 返回上级文件夹
            parentFolderEl.addEventListener('click', () => {
                this.setSource('folder', parentPath);
                this.clearSelection();
            });
            
            // 添加拖拽目标功能
            if(Platform.isDesktop) {
                parentFolderEl.addEventListener('dragover', (event) => {
                    event.preventDefault();
                    event.dataTransfer!.dropEffect = 'move';
                    parentFolderEl.addClass('ge-dragover');
                });
                
                parentFolderEl.addEventListener('dragleave', () => {
                    parentFolderEl.removeClass('ge-dragover');
                });
                
                parentFolderEl.addEventListener('drop', async (event) => {
                    event.preventDefault();
                    parentFolderEl.removeClass('ge-dragover');
                    
                    const filePath = (event as any).dataTransfer?.getData('text/plain');
                    if (!filePath) return;
                    
                    const cleanedFilePath = filePath.replace(/!?\[\[(.*?)\]\]/, '$1');
                    
                    const file = this.app.vault.getAbstractFileByPath(cleanedFilePath);
                    const folder = this.app.vault.getAbstractFileByPath(parentPath);
                    
                    if (file instanceof TFile && folder instanceof TFolder) {
                        try {
                            const newPath = `${parentPath}/${file.name}`;
                            await this.app.fileManager.renameFile(file, newPath);
                            this.render();
                        } catch (error) {
                            console.error('An error occurred while moving the file to parent folder:', error);
                        }
                    }
                });
            }
        }

        // 如果是資料夾模式，先顯示所有子資料夾
        if (this.sourceMode === 'folder' && this.searchQuery === '') {
            const currentFolder = this.app.vault.getAbstractFileByPath(this.sourcePath || '/');
            if (currentFolder instanceof TFolder) {
                const subfolders = currentFolder.children
                    .filter(child => {
                        if (!(child instanceof TFolder)) return false;
                        
                        // 檢查資料夾是否在忽略清單中
                        const isInIgnoredFolders = this.plugin.settings.ignoredFolders.some(
                            ignoredPath => child.path === ignoredPath || child.path.startsWith(ignoredPath + '/')
                        );
                        
                        if (isInIgnoredFolders) {
                            return false;
                        }
                        
                        // 檢查資料夾是否符合忽略的模式
                        if (this.plugin.settings.ignoredFolderPatterns && this.plugin.settings.ignoredFolderPatterns.length > 0) {
                            const matchesIgnoredPattern = this.plugin.settings.ignoredFolderPatterns.some(pattern => {
                                try {
                                    // 嘗試將模式作為正則表達式處理
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
                    const titleEl = titleContainer.createEl('span', { cls: 'ge-title', text: `📁 ${folder.name}` });
                    
                    // 檢查同名筆記是否存在
                    const notePath = `${folder.path}/${folder.name}.md`;
                    const noteFile = this.app.vault.getAbstractFileByPath(notePath);
                    
                    if (noteFile instanceof TFile) {
                        // 使用 span 代替 button，只顯示圖示
                        const noteIcon = titleContainer.createEl('span', {
                            cls: 'ge-note-button'
                        });
                        setIcon(noteIcon, 'ellipsis-vertical');
                        
                        // 點擊圖示時開啟同名筆記
                        noteIcon.addEventListener('click', (e) => {
                            e.stopPropagation(); // 防止觸發資料夾的點擊事件
                            this.app.workspace.getLeaf(false).openFile(noteFile);
                        });
                    }
                    
                    // 點擊時進入子資料夾
                    folderEl.addEventListener('click', () => {
                        this.setSource('folder', folder.path);
                        this.clearSelection();
                    });
                }
            }
        }

        let files: TFile[] = [];
        if (this.searchQuery) {
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
                // 非媒體檔案（Markdown、PDF、Canvas）始終包含
                if (['md', 'pdf', 'canvas'].includes(file.extension.toLowerCase())) {
                    return true;
                }
                // 媒體檔案根據 searchMediaFiles 設定決定是否包含
                if (this.isMediaFile(file)) {
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
                            let contentWithoutMediaLinks = contentWithoutFrontmatter.replace(/```[\s\S]*?```|<!--[\s\S]*?-->|!?(?:\[[^\]]*\]\([^)]+\)|\[\[[^\]]+\]\])/g, '').trim();

                            //把開頭的標題整行刪除
                            if (contentWithoutMediaLinks.startsWith('# ') || contentWithoutMediaLinks.startsWith('## ') || contentWithoutMediaLinks.startsWith('### ')) {
                                contentWithoutMediaLinks = contentWithoutMediaLinks.split('\n').slice(1).join('\n');
                            }
                            
                            // 只取前 summaryLength 個字符作為預覽
                            const preview = contentWithoutMediaLinks.slice(0, summaryLength) + (contentWithoutMediaLinks.length > summaryLength ? '...' : '');
                            
                            // 創建預覽內容
                            const contentEl = contentArea.createEl('p', { text: preview.trim() });

                            imageUrl = await findFirstImageInNote(this.app, content);
                        } else {
                            // 其他檔案顯示副檔名
                            const contentEl = contentArea.createEl('p', { text: file.extension.toUpperCase() });
                        }   
                        contentArea.setAttribute('data-loaded', 'true');
                    }
                    
                    // 載入圖片預覽
                    const imageArea = fileEl.querySelector('.ge-image-area');
                    if (imageArea && !imageArea.hasAttribute('data-loaded')) {
                        // 根據檔案類型處理
                        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
                        const videoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
                        if (imageExtensions.includes(file.extension.toLowerCase())) {
                            // 直接顯示圖片
                            const img = imageArea.createEl('img');
                            img.src = this.app.vault.getResourcePath(file);
                            imageArea.setAttribute('data-loaded', 'true');
                        } else if (videoExtensions.includes(file.extension.toLowerCase())) {
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

            // 添加檔案類型圖示
            const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
            const videoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
            
            if (imageExtensions.includes(file.extension.toLowerCase())) {
                const iconContainer = titleContainer.createDiv('ge-icon-container ge-img');
                setIcon(iconContainer, 'image');
            } else if (videoExtensions.includes(file.extension.toLowerCase())) {
                const iconContainer = titleContainer.createDiv('ge-icon-container ge-video');
                setIcon(iconContainer, 'play-circle');
            } else if (file.extension === 'pdf') {
                const iconContainer = titleContainer.createDiv('ge-icon-container ge-pdf');
                setIcon(iconContainer, 'paperclip');
            } else if (file.extension === 'canvas') {
                const iconContainer = titleContainer.createDiv('ge-icon-container ge-canvas');
                setIcon(iconContainer, 'layout-dashboard');
            } else {
                const iconContainer = titleContainer.createDiv('ge-icon-container');
                setIcon(iconContainer, 'file-text');
            }
            
            // 創建標題（立即載入）
            const titleEl = titleContainer.createEl('span', { cls: 'ge-title', text: file.basename });
            titleEl.setAttribute('title', file.basename);
            
            // 創建圖片區域，但先不載入圖片
            const imageArea = fileEl.createDiv('ge-image-area');
            
            // 開始觀察這個元素
            observer.observe(fileEl);
            
            // 點擊時開啟檔案
            fileEl.addEventListener('click', (event) => {
                // 更新選中項目
                const index = this.gridItems.indexOf(fileEl);
                if (index >= 0) {
                    this.selectItem(index);
                    this.hasKeyboardFocus = true;
                }

                // 根據檔案類型處理點擊事件
                if (this.isMediaFile(file)) {
                    // 開啟媒體檔案
                    this.openMediaFile(file, files);
                } else {
                    // 開啟 Markdown 檔案、PDF 檔案和 Canvas 檔案
                    if (event.ctrlKey) {
                        this.app.workspace.getLeaf(true).openFile(file);
                    } else {
                        this.app.workspace.getLeaf().openFile(file);
                    }
                }
            });
            
            if(Platform.isDesktop) {
                // 添加拖曳功能
                fileEl.setAttribute('draggable', 'true');
                fileEl.addEventListener('dragstart', (event) => {
                    const isMedia = this.isMediaFile(file);
                    const mdLink = isMedia
                        ? `![[${file.path}]]` // 媒體檔案使用 ![[]] 格式
                        : `[[${file.path}]]`;  // 一般檔案使用 [[]] 格式

                    // 設定拖曳資料
                    event.dataTransfer?.setData('text/plain', mdLink);
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
                
                this.app.workspace.trigger("file-menu", menu, file);

                // 新增在新分頁開啟選項
                menu.addItem((item) => {
                    item
                        .setTitle(t('open_in_new_tab'))
                        .setIcon('external-link')
                        .onClick(() => {
                            this.app.workspace.getLeaf(true).openFile(file);
                        });
                });

                // 刪除選項
                menu.addItem((item) => {
                    item
                        .setTitle(t('delete_note'))
                        .setIcon('trash')
                        .onClick(async () => {
                            await this.app.fileManager.trashFile(file);
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
                    
                    // 獲取拖曳的檔案路徑
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

        // 如果有選中的項目，恢復選中狀態
        if (this.selectedItemIndex >= 0 && this.selectedItemIndex < this.gridItems.length && this.hasKeyboardFocus) {
            this.selectItem(this.selectedItemIndex);
        } else if (this.gridItems.length > 0) {
            // 如果沒有選中項目但有項目可選，選中第一個
            this.selectItem(-1);
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
                        this.setSource('folder', parentPath);
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
                        this.setSource('folder', parentPath);
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
                    this.setSource('folder', parentPath);
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
    }

    // 選中指定索引的項目
    selectItem(index: number) {
        // 清除所有項目的選中狀態
        this.gridItems.forEach(item => {
            item.removeClass('ge-selected-item');
        });

        // 確保索引在有效範圍內
        if (index >= 0 && index < this.gridItems.length) {
            this.selectedItemIndex = index;
            const selectedItem = this.gridItems[index];
            selectedItem.addClass('ge-selected-item');
            
            // 確保選中的項目在視圖中可見
            selectedItem.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
        }
    }

    // 開啟媒體檔案
    openMediaFile(file: TFile, mediaFiles?: TFile[]) {
        // 如果沒有傳入媒體檔案列表，則獲取
        const getMediaFilesPromise = mediaFiles 
            ? Promise.resolve(mediaFiles.filter(f => this.isMediaFile(f)))
            : this.getFiles().then(allFiles => allFiles.filter(f => this.isMediaFile(f)));
        
        getMediaFilesPromise.then(filteredMediaFiles => {
            // 找到當前檔案在媒體檔案列表中的索引
            const currentIndex = filteredMediaFiles.findIndex(f => f.path === file.path);
            if (currentIndex === -1) return;
            
            // 使用 MediaModal 開啟媒體檔案，並傳入 this 作為 gridView 參數
            const mediaModal = new MediaModal(this.app, file, filteredMediaFiles, this);
            mediaModal.open();
        });
    }

    // 顯示搜尋 modal
    showSearchModal(defaultQuery = '') {
        showSearchModal(this.app,this, defaultQuery);
    }

    // 保存視圖狀態
    getState() {
        return {
            type: 'grid-view',
            state: {
                sourceMode: this.sourceMode,
                sourcePath: this.sourcePath,
                sortType: this.sortType,
                searchQuery: this.searchQuery,
                searchAllFiles: this.searchAllFiles
            }
        };
    }

    // 讀取視圖狀態
    async setState(state: any): Promise<void> {  
        if (state.state) {
            this.sourceMode = state.state.sourceMode || '';
            this.sourcePath = state.state.sourcePath || null;
            this.sortType = state.state.sortType || 'mtime-desc';
            this.searchQuery = state.state.searchQuery || '';
            this.searchAllFiles = state.state.searchAllFiles ?? true;
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