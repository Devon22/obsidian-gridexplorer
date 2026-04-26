import { App, Modal, Platform } from 'obsidian';
import GridExplorerPlugin from '../main';
import { GridView } from '../GridView';
import { t } from '../translations';
import { isFolderIgnored } from '../utils/fileUtils';

// 顯示資料夾選擇 modal
export function showFolderSelectionModal(app: App, plugin: GridExplorerPlugin, activeView?: GridView, buttonElement?: HTMLElement) {
    new FolderSelectionModal(app, plugin, activeView, buttonElement).open();
}

export class FolderSelectionModal extends Modal {
    plugin: GridExplorerPlugin;
    activeView: GridView | undefined;
    folderOptionsContainer: HTMLElement;
    folderOptions: HTMLElement[] = [];
    selectedIndex: number = -1; // 當前選中的選項索引
    searchInput: HTMLInputElement | undefined;
    buttonElement: HTMLElement | undefined;
    searchOption: HTMLElement | null = null; // 搜尋選項元素

    constructor(app: App, plugin: GridExplorerPlugin, activeView?: GridView, buttonElement?: HTMLElement) {
        super(app);
        this.plugin = plugin;
        this.activeView = activeView;
        this.buttonElement = buttonElement;
        this.folderOptionsContainer = document.createElement('div');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // 如果有按鈕元素，設置為 popup 樣式
        if (this.buttonElement) {
            this.modalEl.addClass('ge-popup-modal');
            this.positionAsPopup();
        }

        // 添加搜尋輸入框
        const searchContainer = contentEl.createEl('div', {
            cls: 'ge-folder-search-container'
        });
        this.searchInput = searchContainer.createEl('input', {
            cls: 'ge-folder-search-input',
            attr: {
                type: 'text',
                placeholder: t('filter_folders'),
                ...(Platform.isMobile && { tabindex: '1' })
            }
        });

        // 創建一個容器來存放所有資料夾選項
        this.folderOptionsContainer = contentEl.createEl('div', {
            cls: 'ge-folder-options-container',
            attr: Platform.isMobile ? { tabindex: '0' } : {}
        });

        // 搜尋輸入事件處理
        this.searchInput.addEventListener('input', () => {
            const searchTerm = this.searchInput?.value.toLowerCase() ?? '';
            this.filterFolderOptions(searchTerm);
            this.updateSearchOption(this.searchInput?.value.trim() ?? '');
        });

        // 鍵盤事件處理
        this.searchInput.addEventListener('keydown', this.handleKeyDown.bind(this));

        // 建立自訂模式選項（僅顯示啟用的）
        const enabledCustomModes = this.plugin.settings.customModes.filter(m => m.enabled ?? true);
        if (enabledCustomModes.length > 0) {
            enabledCustomModes.forEach(mode => {
                const customOption = this.folderOptionsContainer.createEl('div', {
                    cls: 'ge-grid-view-folder-option',
                    text: `${mode.icon} ${mode.displayName}`
                });

                customOption.addEventListener('click', async () => {
                    if (this.activeView) {
                        await this.activeView.setSource(mode.internalName);
                    } else {
                        const view = await this.plugin.activateView();
                        if (view instanceof GridView) {
                            await view.setSource(mode.internalName);
                        }
                    }
                    this.close();
                });
                this.folderOptions.push(customOption);
            });
        }

        // 建立書籤選項
        if (this.plugin.settings.showBookmarksMode) {
            const bookmarksPlugin = (this.app as any).internalPlugins.plugins.bookmarks;
            if (bookmarksPlugin?.enabled) {
                const bookmarkOption = this.folderOptionsContainer.createEl('div', {
                    cls: 'ge-grid-view-folder-option',
                    text: `📑 ${t('bookmarks_mode')}`
                });

                bookmarkOption.addEventListener('click', async () => {
                    if (this.activeView) {
                        await this.activeView.setSource('bookmarks');
                    } else {
                        const view = await this.plugin.activateView();
                        if (view instanceof GridView) {
                            await view.setSource('bookmarks');
                        }
                    }
                    this.close();
                });
                this.folderOptions.push(bookmarkOption);
            }
        }

        // 建立搜尋結果選項
        if (this.plugin.settings.showSearchMode) {
            const searchLeaf = (this.app as any).workspace.getLeavesOfType('search')[0];
            if (searchLeaf) {
                const searchView = searchLeaf.view;
                const searchInputEl = searchView.searchComponent ? searchView.searchComponent.inputEl : null;
                if (searchInputEl) {
                    if (searchInputEl.value.trim().length > 0) {
                        const searchOption = this.folderOptionsContainer.createEl('div', {
                            cls: 'ge-grid-view-folder-option',
                            text: `🔍 ${t('search_results')}: ${searchInputEl.value}`
                        });

                        searchOption.addEventListener('click', async () => {
                            if (this.activeView) {
                                await this.activeView.setSource('search');
                            } else {
                                const view = await this.plugin.activateView();
                                if (view instanceof GridView) {
                                    await view.setSource('search');
                                }
                            }
                            this.close();
                        });
                        this.folderOptions.push(searchOption);
                    }
                }
            }
        }

        // 建立反向連結選項
        if (this.plugin.settings.showBacklinksMode) {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile) {
                const activeFileName = activeFile ? `: ${activeFile.basename}` : '';
                const backlinksOption = this.folderOptionsContainer.createEl('div', {
                    cls: 'ge-grid-view-folder-option',
                    text: `🔗 ${t('backlinks_mode')}${activeFileName}`
                });

                backlinksOption.addEventListener('click', async () => {
                    if (this.activeView) {
                        await this.activeView.setSource('backlinks');
                    } else {
                        const view = await this.plugin.activateView();
                        if (view instanceof GridView) {
                            await view.setSource('backlinks');
                        }
                    }
                    this.close();
                });
                this.folderOptions.push(backlinksOption);
            }
        }

        // 建立外部連結選項
        if (this.plugin.settings.showOutgoinglinksMode) {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile) {
                const activeFileName = activeFile ? `: ${activeFile.basename}` : '';
                const outgoinglinksOption = this.folderOptionsContainer.createEl('div', {
                    cls: 'ge-grid-view-folder-option',
                    text: `🔗 ${t('outgoinglinks_mode')}${activeFileName}`
                });

                outgoinglinksOption.addEventListener('click', async () => {
                    if (this.activeView) {
                        await this.activeView.setSource('outgoinglinks');
                    } else {
                        const view = await this.plugin.activateView();
                        if (view instanceof GridView) {
                            await view.setSource('outgoinglinks');
                        }
                    }
                    this.close();
                });
                this.folderOptions.push(outgoinglinksOption);
            }
        }

        // 建立最近檔案選項
        if (this.plugin.settings.showRecentFilesMode) {
            const recentFilesOption = this.folderOptionsContainer.createEl('div', {
                cls: 'ge-grid-view-folder-option',
                text: `📅 ${t('recent_files_mode')}`
            });

            recentFilesOption.addEventListener('click', async () => {
                if (this.activeView) {
                    await this.activeView.setSource('recent-files');
                } else {
                    const view = await this.plugin.activateView();
                    if (view instanceof GridView) {
                        await view.setSource('recent-files');
                    }
                }
                this.close();
            });
            this.folderOptions.push(recentFilesOption);
        }

        // 建立所有筆記選項
        if (this.plugin.settings.showAllFilesMode) {
            const allFilesOption = this.folderOptionsContainer.createEl('div', {
                cls: 'ge-grid-view-folder-option',
                text: `📔 ${t('all_files_mode')}`
            });

            allFilesOption.addEventListener('click', async () => {
                if (this.activeView) {
                    await this.activeView.setSource('all-files');
                } else {
                    const view = await this.plugin.activateView();
                    if (view instanceof GridView) {
                        await view.setSource('all-files');
                    }
                }
                this.close();
            });
            this.folderOptions.push(allFilesOption);
        }

        // 建立隨機筆記選項
        if (this.plugin.settings.showRandomNoteMode) {
            const randomNoteOption = this.folderOptionsContainer.createEl('div', {
                cls: 'ge-grid-view-folder-option',
                text: `🎲 ${t('random_note_mode')}`
            });

            randomNoteOption.addEventListener('click', async () => {
                if (this.activeView) {
                    await this.activeView.setSource('random-note');
                } else {
                    const view = await this.plugin.activateView();
                    if (view instanceof GridView) {
                        await view.setSource('random-note');
                    }
                }
                this.close();
            });
            this.folderOptions.push(randomNoteOption);
        }

        // 建立任務選項
        if (this.plugin.settings.showTasksMode) {
            const tasksOption = this.folderOptionsContainer.createEl('div', {
                cls: 'ge-grid-view-folder-option',
                text: `☑️ ${t('tasks_mode')}`
            });

            tasksOption.addEventListener('click', async () => {
                if (this.activeView) {
                    await this.activeView.setSource('tasks');
                } else {
                    const view = await this.plugin.activateView();
                    if (view instanceof GridView) {
                        await view.setSource('tasks');
                    }
                }
                this.close();
            });
            this.folderOptions.push(tasksOption);
        }

        // 建立根目錄選項
        const customFolderIcon = this.plugin.settings.customFolderIcon;
        const rootFolderOption = this.folderOptionsContainer.createEl('div', {
            cls: 'ge-grid-view-folder-option',
            text: `${customFolderIcon} /`
        });

        rootFolderOption.addEventListener('click', async () => {
            if (this.activeView) {
                await this.activeView.setSource('folder', '/');
            } else {
                const view = await this.plugin.activateView();
                if (view instanceof GridView) {
                    await view.setSource('folder', '/');
                }
            }
            this.close();
        });
        this.folderOptions.push(rootFolderOption);

        // 取得所有資料夾（排除被忽略的資料夾）
        const folders = this.app.vault.getAllFolders()
            .filter(folder => {
                // 使用 isFolderIgnored 函數檢查是否應該忽略此資料夾
                return !isFolderIgnored(
                    folder,
                    this.plugin.settings.ignoredFolders,
                    this.plugin.settings.ignoredFolderPatterns,
                    false // 在選擇資料夾時不考慮 showIgnoredItems 設置
                );
            })
            .sort((a, b) => a.path.localeCompare(b.path));

        // 建立資料夾選項
        folders.forEach(folder => {
            // 計算資料夾層級
            const depth = (folder.path.match(/\//g) || []).length;
            const displayName = folder.path.split('/').pop() || '/';

            const folderOption = this.folderOptionsContainer.createEl('div', {
                cls: 'ge-grid-view-folder-option',
                attr: {
                    'data-depth': depth.toString(),
                    'data-path': folder.path
                }
            });

            // 產生 ascii tree 前綴
            const prefixSpan = document.createElement('span');
            prefixSpan.className = 'ge-folder-tree-prefix';
            prefixSpan.textContent = depth > 0 ? '   '.repeat(depth - 1) + '└ ' : '';
            folderOption.appendChild(prefixSpan);

            // 資料夾圖示與名稱
            const icon = document.createElement('span');
            icon.textContent = `${customFolderIcon} `;
            folderOption.appendChild(icon);

            const nameSpan = document.createElement('span');
            nameSpan.textContent = displayName;
            folderOption.appendChild(nameSpan);

            folderOption.addEventListener('click', async () => {
                if (this.activeView) {
                    await this.activeView.setSource('folder', folder.path);
                } else {
                    const view = await this.plugin.activateView();
                    if (view instanceof GridView) {
                        await view.setSource('folder', folder.path);
                    }
                }
                this.close();
            });
            this.folderOptions.push(folderOption);
        });

        // 為每個選項添加滑鼠事件
        this.folderOptions.forEach((option, index) => {
            option.addEventListener('mouseenter', () => {
                this.updateSelection(index);
            });
        });
    }

    // 更新搜尋選項
    updateSearchOption(searchTerm: string) {
        // 移除現有的搜尋選項
        if (this.searchOption) {
            this.searchOption.remove();
            const index = this.folderOptions.indexOf(this.searchOption);
            if (index > -1) {
                this.folderOptions.splice(index, 1);
            }
            this.searchOption = null;
        }

        // 如果有搜尋內容，添加搜尋選項
        if (searchTerm.length > 0) {
            this.searchOption = this.folderOptionsContainer.createEl('div', {
                cls: 'ge-grid-view-folder-option ge-search-option',
                text: `🔍 ${t('search_for')} "${searchTerm}"`
            });

            this.searchOption.addEventListener('click', async () => {
                if (this.activeView) {
                    await this.activeView.setSource('folder', '/', true, searchTerm);
                } else {
                    const view = await this.plugin.activateView();
                    if (view instanceof GridView) {
                        await view.setSource('folder', '/', true, searchTerm);
                    }
                }
                this.close();
            });

            this.searchOption.addEventListener('mouseenter', () => {
                const index = this.folderOptions.length;
                this.updateSelection(index);
            });

            // 將搜尋選項添加到選項列表的最後
            this.folderOptions.push(this.searchOption);
        }
    }

    // 處理鍵盤事件
    handleKeyDown(event: KeyboardEvent) {
        const visibleOptions = this.getVisibleOptions();

        if (visibleOptions.length === 0) return;

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.moveSelection(1, visibleOptions);
                break;
            case 'ArrowUp':
                event.preventDefault();
                this.moveSelection(-1, visibleOptions);
                break;
            case 'Enter':
                event.preventDefault();
                if (this.selectedIndex >= 0) {
                    const selectedOption = this.folderOptions[this.selectedIndex];
                    if (selectedOption && selectedOption.style.display !== 'none') {
                        requestAnimationFrame(() => {
                            selectedOption.click();
                        });
                    }
                }
                break;
            case 'Escape':
                this.close();
                break;
        }
    }

    // 移動選擇
    moveSelection(direction: number, visibleOptions: HTMLElement[]) {
        // 如果沒有選中項或當前選中項不可見，則從頭開始
        let currentVisibleIndex = -1;

        if (this.selectedIndex >= 0) {
            const selectedOption = this.folderOptions[this.selectedIndex];
            currentVisibleIndex = visibleOptions.indexOf(selectedOption);
        }

        // 計算新的可見索引
        let newVisibleIndex = currentVisibleIndex + direction;

        // 循環選擇
        if (newVisibleIndex < 0) {
            newVisibleIndex = visibleOptions.length - 1;
        } else if (newVisibleIndex >= visibleOptions.length) {
            newVisibleIndex = 0;
        }

        // 轉換為實際的選項索引
        if (newVisibleIndex >= 0 && newVisibleIndex < visibleOptions.length) {
            const newSelectedOption = visibleOptions[newVisibleIndex];
            const newIndex = this.folderOptions.indexOf(newSelectedOption);
            this.updateSelection(newIndex);

            // 確保選中項在視圖中可見
            newSelectedOption.scrollIntoView({ block: 'nearest' });
        }
    }

    // 更新選擇
    updateSelection(index: number) {
        // 清除之前的選擇
        if (this.selectedIndex >= 0 && this.selectedIndex < this.folderOptions.length) {
            this.folderOptions[this.selectedIndex].removeClass('ge-selected-option');
        }

        this.selectedIndex = index;

        // 設置新的選擇
        if (this.selectedIndex >= 0 && this.selectedIndex < this.folderOptions.length) {
            this.folderOptions[this.selectedIndex].addClass('ge-selected-option');
        }
    }

    // 獲取當前可見的選項
    getVisibleOptions(): HTMLElement[] {
        return this.folderOptions.filter(option =>
            option.style.display !== 'none'
        );
    }

    // 篩選資料夾選項
    filterFolderOptions(searchTerm: string) {
        let hasVisibleOptions = false;

        this.folderOptions.forEach(option => {
            // 跳過搜尋選項，它會單獨處理
            if (option === this.searchOption) {
                return;
            }

            // 根據搜尋狀態動態調整資料夾顯示文字
            const dataPath = option.getAttribute('data-path');
            if (dataPath) {
                // 這是一個資料夾選項
                const nameSpan = option.querySelector('span:last-child') as HTMLSpanElement | null;
                if (nameSpan) {
                    if (searchTerm !== '') {
                        // 顯示完整路徑
                        nameSpan.textContent = dataPath;
                    } else {
                        // 僅顯示資料夾名稱
                        nameSpan.textContent = dataPath.split('/').pop() || '/';
                    }
                }

                // 根據搜尋狀態調整前綴縮排（ascii tree）
                const prefixSpan = option.querySelector('.ge-folder-tree-prefix') as HTMLSpanElement | null;
                if (prefixSpan) {
                    if (searchTerm !== '') {
                        // 搜尋時移除縮排
                        prefixSpan.textContent = '';
                    } else {
                        // 恢復原始縮排
                        const depthAttr = option.getAttribute('data-depth');
                        const depth = depthAttr ? parseInt(depthAttr, 10) : 0;
                        prefixSpan.textContent = depth > 0 ? '   '.repeat(depth - 1) + '└ ' : '';
                    }
                }
            }

            const text = option.textContent?.toLowerCase() || '';
            const fullPath = option.getAttribute('data-path')?.toLowerCase() || '';
            if (searchTerm === '' || text.includes(searchTerm) || fullPath.includes(searchTerm)) {
                option.style.display = 'block';
                hasVisibleOptions = true;
            } else {
                option.style.display = 'none';
            }
        });

        // 重置選擇，並選中第一個可見選項（如果有）
        this.updateSelection(-1);

        if (hasVisibleOptions) {
            const visibleOptions = this.getVisibleOptions();
            if (visibleOptions.length > 0) {
                const firstVisibleIndex = this.folderOptions.indexOf(visibleOptions[0]);
                this.updateSelection(firstVisibleIndex);
            }
        }
    }

    // 將 modal 定位到按鈕下方，類似 Chrome popup 樣式
    positionAsPopup() {
        if (!this.buttonElement) return;

        const buttonRect = this.buttonElement.getBoundingClientRect();
        const modalEl = this.modalEl;
        const contentEl = this.contentEl;

        // 設置 modal 的基本樣式
        modalEl.addClass('ge-popup-modal-reset');

        // 添加 popup 內容樣式類別
        contentEl.addClass('ge-popup-content');

        // 計算位置
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // 預設位置：按鈕下方中心對齊
        let left = buttonRect.left + (buttonRect.width / 2) - 150; // 150 是 modal 寬度的一半
        let top = buttonRect.bottom + 8; // 8px 間距

        // 檢查右側邊界
        if (left + 300 > viewportWidth) {
            left = viewportWidth - 300 - 16;
        }

        // 檢查左側邊界
        if (left < 16) {
            left = 16;
        }

        // 檢查下方空間，如果不夠則顯示在上方
        if (top + 400 > viewportHeight && buttonRect.top - 400 > 0) {
            top = buttonRect.top - 8;
        }

        // 應用位置
        modalEl.style.left = `${left}px`;
        modalEl.style.top = `${top}px`;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
