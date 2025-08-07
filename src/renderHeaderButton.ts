import { Menu, setIcon, TFile, Notice } from 'obsidian';
import { GridView } from './GridView';
import { showFolderSelectionModal } from './modal/folderSelectionModal';
import { showSearchModal } from './modal/searchModal';
import { ShortcutSelectionModal } from './modal/shortcutSelectionModal';
import { t } from './translations';

export function renderHeaderButton(gridView: GridView) {

    // 創建頂部按鈕區域
    const headerButtonsDiv = gridView.containerEl.createDiv('ge-header-buttons');

    // 為頂部按鈕區域添加點擊事件，點擊後網格容器捲動到最頂部
    headerButtonsDiv.addEventListener('click', (event: MouseEvent) => {
        // 只有當點擊的是頂部按鈕區域本身（而不是其中的按鈕）時才觸發捲動
        if (event.target === headerButtonsDiv) {
            event.preventDefault();
            // 取得網格容器
            const gridContainer = gridView.containerEl.querySelector('.ge-grid-container');
            if (gridContainer) {
                gridContainer.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            }
        }
    });

    // 添加返回按鈕
    const backButton = headerButtonsDiv.createEl('button', { attr: { 'aria-label': t('back') } });
    setIcon(backButton, 'arrow-left');
    backButton.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        
        // 如果有歷史記錄
        if (gridView.recentSources.length > 0) {
            // 將當前狀態推入 futureSources 以便前進
            const currentKey = JSON.stringify({
                mode: gridView.sourceMode,
                path: gridView.sourcePath,
                searchQuery: gridView.searchQuery,
                searchAllFiles: gridView.searchAllFiles,
                searchFilesNameOnly: gridView.searchFilesNameOnly,
                searchMediaFiles: gridView.searchMediaFiles,
            });
            gridView.futureSources.unshift(currentKey);
            if (gridView.futureSources.length > 10) {
                gridView.futureSources.length = 10;
            }

            // 取得最近一筆歷史記錄
            const lastSource = JSON.parse(gridView.recentSources[0]);
            gridView.recentSources.shift(); // 從歷史記錄中移除
            
            // 設定來源及搜尋狀態（不記錄到歷史）
            await gridView.setSource(
                lastSource.mode,
                lastSource.path || '',
                false, // 不記錄到歷史
                lastSource.searchQuery || '',
                lastSource.searchAllFiles ?? true,
                lastSource.searchFilesNameOnly ?? false,
                lastSource.searchMediaFiles ?? false
            );

            // 更新按鈕狀態
            updateNavButtons();
        }
    });

    // 添加前進按鈕
    const forwardButton = headerButtonsDiv.createEl('button', { attr: { 'aria-label': t('forward') } });
    setIcon(forwardButton, 'arrow-right');
    forwardButton.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        // 如果有未來紀錄
        if (gridView.futureSources.length > 0) {
            // 將當前狀態推入 recentSources 以便返回
            const currentKey = JSON.stringify({
                mode: gridView.sourceMode,
                path: gridView.sourcePath,
                searchQuery: gridView.searchQuery,
                searchAllFiles: gridView.searchAllFiles,
                searchFilesNameOnly: gridView.searchFilesNameOnly,
                searchMediaFiles: gridView.searchMediaFiles,
            });
            gridView.recentSources.unshift(currentKey);
            if (gridView.recentSources.length > 10) {
                gridView.recentSources.length = 10;
            }

            // 取得下一筆未來紀錄
            const nextSource = JSON.parse(gridView.futureSources[0]);
            gridView.futureSources.shift(); // 從未來紀錄中移除

            // 設定來源及搜尋狀態（不記錄到歷史）
            await gridView.setSource(
                nextSource.mode,
                nextSource.path || '',
                false, // 不記錄到歷史
                nextSource.searchQuery || '',
                nextSource.searchAllFiles ?? true,
                nextSource.searchFilesNameOnly ?? false,
                nextSource.searchMediaFiles ?? false
            );

            // 更新按鈕狀態
            updateNavButtons();
        }
    });

    // 添加右鍵選單支援
    backButton.addEventListener('contextmenu', (event) => {
        // 只有在有歷史記錄時才顯示右鍵選單
        if (gridView.recentSources.length > 0) {
            event.preventDefault();
            
            const menu = new Menu();

            // 添加歷史記錄
            gridView.recentSources.forEach((sourceInfoStr, index) => {
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
                            icon = 'links-coming-in';
                            break;
                        case 'outgoinglinks':
                            displayText = t('outgoinglinks_mode');
                            icon = 'links-going-out';
                            break;
                        case 'all-files':
                            displayText = t('all_files_mode');
                            icon = 'book-text';
                            break;
                        case 'recent-files':
                            displayText = t('recent_files_mode');
                            icon = 'calendar-days';
                            break;
                        case 'random-note':
                            displayText = t('random_note_mode');
                            icon = 'dice';
                            break;
                        case 'tasks':
                            displayText = t('tasks_mode');
                            icon = 'square-check-big';
                            break;
                        default:
                            if (mode.startsWith('custom-')) {
                                const customMode = gridView.plugin.settings.customModes.find(m => m.internalName === mode);
                                displayText = customMode ? customMode.displayName : t('custom_mode');
                                icon = 'puzzle';
                            } else {
                                displayText = mode;
                                icon = 'grid';
                            }
                    }

                    // 處理搜尋顯示文字
                    if (sourceInfo.searchQuery) {
                        if (sourceInfo.searchAllFiles) {
                            // 全域搜尋僅顯示搜尋字串
                            displayText = '"' + (sourceInfo.searchQuery || t('search_results')) + '"';
                        } else {
                            // 其他情況附加搜尋字串
                            displayText += `: "${sourceInfo.searchQuery}"`;
                        }
                    }
                    
                    // 添加歷史記錄到選單
                    menu.addItem((item) => {
                        item
                            .setTitle(`${displayText}`)
                            .setIcon(`${icon}`)
                            .onClick(async () => {
                                // 將目前狀態與較新的歷史推入 futureSources
                                const currentKey = JSON.stringify({
                                    mode: gridView.sourceMode,
                                    path: gridView.sourcePath,
                                    searchQuery: gridView.searchQuery,
                                    searchAllFiles: gridView.searchAllFiles,
                                    searchFilesNameOnly: gridView.searchFilesNameOnly,
                                    searchMediaFiles: gridView.searchMediaFiles,
                                });

                                // 直接使用當前迴圈索引（允許重複項）
                                const clickedIndex = index;

                                if (clickedIndex !== -1) {
                                    const newerHistory = gridView.recentSources.slice(0, clickedIndex);
                                    const forwardStack = [...newerHistory].reverse();
                                gridView.futureSources = [...forwardStack, currentKey, ...gridView.futureSources];
                                    if (gridView.futureSources.length > 10) {
                                        gridView.futureSources.length = 10;
                                    }
                                    gridView.recentSources = gridView.recentSources.slice(clickedIndex + 1);
                                }

                                // 設定來源及搜尋狀態（不記錄到歷史）
                                await gridView.setSource(
                                    mode,
                                    path,
                                    false, // 不記錄到歷史
                                    sourceInfo.searchQuery || '',
                                    sourceInfo.searchAllFiles ?? true,
                                    sourceInfo.searchFilesNameOnly ?? false,
                                    sourceInfo.searchMediaFiles ?? false
                                );

                                // 更新按鈕狀態
                                updateNavButtons();
                            });
                    });
                } catch (error) {
                    console.error('Failed to parse source info:', error);
                }
            });
            menu.showAtMouseEvent(event);
        }
    });
        
    // 添加右鍵選單支援
    forwardButton.addEventListener('contextmenu', (event) => {
        // 只有在有歷史記錄或未來記錄時才顯示右鍵選單
        if (gridView.futureSources.length > 0) {
            event.preventDefault();

            const menu = new Menu();
            
            // 添加未來記錄
            gridView.futureSources.forEach((sourceInfoStr, index) => {
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
                            icon = 'links-coming-in';
                            break;
                        case 'outgoinglinks':
                            displayText = t('outgoinglinks_mode');
                            icon = 'links-going-out';
                            break;
                        case 'all-files':
                            displayText = t('all_files_mode');
                            icon = 'book-text';
                            break;
                        case 'recent-files':
                            displayText = t('recent_files_mode');
                            icon = 'calendar-days';
                            break;
                        case 'random-note':
                            displayText = t('random_note_mode');
                            icon = 'dice';
                            break;
                        case 'tasks':
                            displayText = t('tasks_mode');
                            icon = 'square-check-big';
                            break;
                        default:
                            if (mode.startsWith('custom-')) {
                                const customMode = gridView.plugin.settings.customModes.find(m => m.internalName === mode);
                                displayText = customMode ? customMode.displayName : t('custom_mode');
                                icon = 'puzzle';
                            } else {
                                displayText = mode;
                                icon = 'grid';
                            }
                    }

                    // 處理搜尋顯示文字
                    if (sourceInfo.searchQuery) {
                        if (sourceInfo.searchAllFiles) {
                            displayText = '"' + (sourceInfo.searchQuery || t('search_results')) + '"';
                        } else {
                            displayText += `: \"${sourceInfo.searchQuery}\"`;
                        }
                    }

                    menu.addItem((item) => {
                        item
                            .setTitle(`${displayText}`)
                            .setIcon(`${icon}`)
                            .onClick(async () => {
                                // 將目前狀態與較舊的 future 項目移至 recentSources
                                const currentKey = JSON.stringify({
                                    mode: gridView.sourceMode,
                                    path: gridView.sourcePath,
                                    searchQuery: gridView.searchQuery,
                                    searchAllFiles: gridView.searchAllFiles,
                                    searchFilesNameOnly: gridView.searchFilesNameOnly,
                                    searchMediaFiles: gridView.searchMediaFiles,
                                });

                                const clickedIndex = index;

                                let olderFuture: string[] = [];
                                if (clickedIndex !== -1) {
                                    olderFuture = gridView.futureSources.slice(0, clickedIndex);
                                    gridView.futureSources = gridView.futureSources.slice(clickedIndex + 1);
                                }
                                const backStack = [...olderFuture].reverse();
                                gridView.recentSources = [...backStack, currentKey, ...gridView.recentSources];
                                if (gridView.recentSources.length > 10) {
                                    gridView.recentSources.length = 10;
                                }

                                await gridView.setSource(
                                    mode,
                                    path,
                                    false,
                                    sourceInfo.searchQuery || '',
                                    sourceInfo.searchAllFiles ?? true,
                                    sourceInfo.searchFilesNameOnly ?? false,
                                    sourceInfo.searchMediaFiles ?? false
                                );

                                // 更新按鈕狀態
                                updateNavButtons();
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

    // 更新返回／前進按鈕啟用狀態
    const updateNavButtons = () => {
        backButton.disabled = gridView.recentSources.length === 0;
        forwardButton.disabled = gridView.futureSources.length === 0;
    };

    // 初始狀態
    updateNavButtons();

    // 添加新增筆記按鈕
    const newNoteButton = headerButtonsDiv.createEl('button', { attr: { 'aria-label': t('new_note') } });
    setIcon(newNoteButton, 'square-pen');
    newNoteButton.addEventListener('click', (event) => {                
        event.preventDefault();
        const menu = new Menu();
        // 新增筆記
        menu.addItem((item) => {
            item
                .setTitle(t('new_note'))
                .setIcon('square-pen')
                .onClick(async () => {
                    let newFileName = `${t('untitled')}.md`;
                    let newFilePath = !gridView.sourcePath || gridView.sourcePath === '/' ? newFileName : `${gridView.sourcePath}/${newFileName}`;

                    // 檢查檔案是否已存在，如果存在則遞增編號
                    let counter = 1;
                    while (gridView.app.vault.getAbstractFileByPath(newFilePath)) {
                        newFileName = `${t('untitled')} ${counter}.md`;
                        newFilePath = !gridView.sourcePath || gridView.sourcePath === '/' ? newFileName : `${gridView.sourcePath}/${newFileName}`;
                        counter++;
                    }

                    try {
                        // 建立新筆記
                        const newFile = await gridView.app.vault.create(newFilePath, '');
                        // 開啟新筆記
                        await gridView.app.workspace.getLeaf().openFile(newFile);
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
                let newFolderPath = !gridView.sourcePath || gridView.sourcePath === '/' ? newFolderName : `${gridView.sourcePath}/${newFolderName}`;
                
                // 檢查資料夾是否已存在，如果存在則遞增編號
                let counter = 1;
                while (gridView.app.vault.getAbstractFileByPath(newFolderPath)) {
                    newFolderName = `${t('untitled')} ${counter}`;
                    newFolderPath = !gridView.sourcePath || gridView.sourcePath === '/' ? newFolderName : `${gridView.sourcePath}/${newFolderName}`;
                    counter++;
                }
                
                try {
                    // 建立新資料夾
                    await gridView.app.vault.createFolder(newFolderPath);
                    // 重新渲染視圖
                    requestAnimationFrame(() => {
                        gridView.render();
                    });
                } catch (error) {
                    console.error('An error occurred while creating a new folder:', error);
                }
            });
        });
        // 新增畫布
        menu.addItem((item) => {
            item.setTitle(t('new_canvas'))
            .setIcon('layout-dashboard')
            .onClick(async () => {
                let newFileName = `${t('untitled')}.canvas`;
                    let newFilePath = !gridView.sourcePath || gridView.sourcePath === '/' ? newFileName : `${gridView.sourcePath}/${newFileName}`;

                    // 檢查檔案是否已存在，如果存在則遞增編號
                    let counter = 1;
                    while (gridView.app.vault.getAbstractFileByPath(newFilePath)) {
                        newFileName = `${t('untitled')} ${counter}.canvas`;
                        newFilePath = !gridView.sourcePath || gridView.sourcePath === '/' ? newFileName : `${gridView.sourcePath}/${newFileName}`;
                        counter++;
                    }

                    try {
                        // 建立新筆記
                        const newFile = await gridView.app.vault.create(newFilePath, '');
                        // 開啟新筆記
                        await gridView.app.workspace.getLeaf().openFile(newFile);
                    } catch (error) {
                        console.error('An error occurred while creating a new canvas:', error);
                    }
            });
        });
        // 新增捷徑
        menu.addItem((item) => {
            item.setTitle(t('new_shortcut'))
            .setIcon('shuffle')
            .onClick(async () => {
                const modal = new ShortcutSelectionModal(gridView.app, gridView.plugin, async (option) => {
                    await createShortcut(gridView, option);
                });
                modal.open();
            });
        });
        menu.showAtMouseEvent(event);
    });

    // 添加重新選擇資料夾按鈕
    const reselectButton = headerButtonsDiv.createEl('button', { attr: { 'aria-label': t('reselect') }  });
    reselectButton.addEventListener('click', () => {
        showFolderSelectionModal(gridView.app, gridView.plugin, gridView, reselectButton);
    });
    setIcon(reselectButton, "grid");

    // 添加重新整理按鈕
    const refreshButton = headerButtonsDiv.createEl('button', { attr: { 'aria-label': t('refresh') }  });
    refreshButton.addEventListener('click', () => {
        if (gridView.sortType === 'random') {
            gridView.clearSelection();
        }
        gridView.render();
    });
    setIcon(refreshButton, 'refresh-ccw');

    // 添加搜尋按鈕
    const searchButtonContainer = headerButtonsDiv.createDiv('ge-search-button-container');
    const searchButton = searchButtonContainer.createEl('button', {
        cls: 'search-button',
        attr: { 'aria-label': t('search') }
    });
    setIcon(searchButton, 'search');
    searchButton.addEventListener('click', () => {
        showSearchModal(gridView.app, gridView, '', searchButton);
    });

    // 如果有搜尋關鍵字，顯示搜尋文字和取消按鈕
    if (gridView.searchQuery) {
        searchButton.style.display = 'none';
        const searchTextContainer = searchButtonContainer.createDiv('ge-search-text-container');

        // 創建搜尋文字
        const searchText = searchTextContainer.createEl('span', { cls: 'ge-search-text', text: gridView.searchQuery });
        // 讓搜尋文字可點選
        searchText.style.cursor = 'pointer';
        searchText.addEventListener('click', () => {
            showSearchModal(gridView.app, gridView, gridView.searchQuery, searchText);
        });

        // 先保存開啟 Modal 時的原始狀態
        const originalSearchQuery = gridView.searchQuery;
        const originalSearchAllFiles = gridView.searchAllFiles;
        const originalSearchFilesNameOnly = gridView.searchFilesNameOnly;
        const originalSearchMediaFiles = gridView.searchMediaFiles;

        // 創建取消按鈕
        const clearButton = searchTextContainer.createDiv('ge-clear-button');
        setIcon(clearButton, 'x');
        clearButton.addEventListener('click', (e) => {
            e.stopPropagation();  // 防止觸發搜尋文字的點擊事件
            gridView.pushHistory(
                gridView.sourceMode,
                gridView.sourcePath,
                originalSearchQuery,
                originalSearchAllFiles,
                originalSearchFilesNameOnly,
                originalSearchMediaFiles,
            );
            gridView.searchQuery = '';
            gridView.clearSelection();
            gridView.app.workspace.requestSaveLayout();
            gridView.render();
        });
    }

    // 更多選項按鈕
    const menu = new Menu();
    menu.addItem((item) => {
        item
            .setTitle(t('open_new_grid_view'))
            .setIcon('grid')
            .onClick(() => {
                const { workspace } = gridView.app;
                let leaf = null;
                workspace.getLeavesOfType('grid-view');
                switch (gridView.plugin.settings.defaultOpenLocation) {
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
    menu.addSeparator();

    // 直向卡片切換
    menu.addItem((item) => {
        item.setTitle(t('vertical_card'))
            .setIcon('layout')
            .setChecked(gridView.baseCardLayout === 'vertical')
            .onClick(() => {
                gridView.baseCardLayout = gridView.baseCardLayout === 'vertical' ? 'horizontal' : 'vertical';
                gridView.cardLayout = gridView.baseCardLayout;
                gridView.app.workspace.requestSaveLayout();
                gridView.render();
            });
    });
    // 最小化模式選項
    menu.addItem((item) => {
        item
            .setTitle(t('min_mode'))
            .setIcon('minimize-2')
            .setChecked(gridView.minMode)
            .onClick(() => {
                gridView.minMode = !gridView.minMode;
                gridView.app.workspace.requestSaveLayout();
                gridView.render();
            });
    });
    // 顯示日期分隔器
    if (gridView.plugin.settings.dateDividerMode !== 'none') {
        menu.addItem((item) => {
            item
                .setTitle(t('show_date_dividers'))
                .setIcon('calendar')
                .setChecked(gridView.showDateDividers)
                .onClick(() => {
                    gridView.showDateDividers = !gridView.showDateDividers;
                    gridView.app.workspace.requestSaveLayout();
                    gridView.render();
                });
        });
    }
    // 顯示筆記標籤
    menu.addItem((item) => {
        item
            .setTitle(t('show_note_tags'))
            .setIcon('tag')
            .setChecked(gridView.showNoteTags)
            .onClick(() => {
                gridView.showNoteTags = !gridView.showNoteTags;
                gridView.app.workspace.requestSaveLayout();
                gridView.render();
            });
    });
    // 顯示忽略資料夾選項
    menu.addItem((item) => {
        item
            .setTitle(t('show_ignored_folders'))
            .setIcon('folder-open-dot')
            .setChecked(gridView.showIgnoredFolders)
            .onClick(() => {
                gridView.showIgnoredFolders = !gridView.showIgnoredFolders;
                gridView.app.workspace.requestSaveLayout();
                gridView.render();
            });
    });
    menu.addSeparator();
    menu.addItem((item) => {
        item
            .setTitle(t('open_settings'))
            .setIcon('settings')
            .onClick(() => {
                // 打開插件設定頁面
                (gridView.app as any).setting.open();
                (gridView.app as any).setting.openTabById(gridView.plugin.manifest.id);
            });
    });
    
    if (gridView.searchQuery === '') {
        const moreOptionsButton = headerButtonsDiv.createEl('button', { attr: { 'aria-label': t('more_options') } });
        setIcon(moreOptionsButton, 'ellipsis-vertical');
        moreOptionsButton.addEventListener('click', (event) => {
            menu.showAtMouseEvent(event);
        });
    } 

    headerButtonsDiv.addEventListener('contextmenu', (event) => {
        if (event.target === headerButtonsDiv) {
            event.preventDefault();
            menu.showAtMouseEvent(event);
        }
    });
}

// 將 URI 轉換為合適的檔名
function generateFilenameFromUri(uri: string): string {
    try {
        // 處理 obsidian:// 協議
        if (uri.startsWith('obsidian://')) {
            const match = uri.match(/obsidian:\/\/([^?]+)/);
            let vaultName = '';
            
            // 嘗試提取 vault 參數
            const vaultMatch = uri.match(/[?&]vault=([^&]+)/);
            if (vaultMatch) {
                vaultName = decodeURIComponent(vaultMatch[1]);
                // 清理 vault 名稱，移除不適合檔名的字符
                vaultName = vaultName.replace(/[<>:"/\\|?*]/g, '_');
            }
            
            if (match) {
                const action = match[1];
                const vaultSuffix = vaultName ? ` (${vaultName})` : '';
                
                // 根據不同的 obsidian 動作生成檔名
                switch (action) {
                    case 'open':
                        return `🌐 Obsidian Open${vaultSuffix}`;
                    case 'new':
                        return `🌐 Obsidian New${vaultSuffix}`;
                    case 'search':
                        return `🌐 Obsidian Search${vaultSuffix}`;
                    case 'hook-get-address':
                        return `🌐 Obsidian Hook${vaultSuffix}`;
                    default:
                        return `🌐 Obsidian ${action}${vaultSuffix}`;
                }
            }
            return vaultName ? `🌐 Obsidian Link (${vaultName})` : '🌐 Obsidian Link';
        }
        
        // 處理 file:// 協議
        if (uri.startsWith('file://')) {
            const filename = uri.split('/').pop() || 'Local File';
            return `🌐 ${filename}`;
        }
        
        // 處理 http/https 協議
        if (uri.startsWith('http://') || uri.startsWith('https://')) {
            const url = new URL(uri);
            let domain = url.hostname;
            
            // 移除 www. 前綴
            if (domain.startsWith('www.')) {
                domain = domain.substring(4);
            }
            
            // 如果有路徑，嘗試提取有意義的部分
            if (url.pathname && url.pathname !== '/') {
                const pathParts = url.pathname.split('/').filter(part => part.length > 0);
                if (pathParts.length > 0) {
                    const lastPart = pathParts[pathParts.length - 1];
                    // 如果最後一部分看起來像檔名或有意義的標識符
                    if (lastPart.length < 50 && !lastPart.includes('?')) {
                        return `🌐 ${domain} - ${lastPart}`;
                    }
                }
            }
            
            return `🌐 ${domain}`;
        }
        
        // 其他協議的處理
        const protocolMatch = uri.match(/^([^:]+):/);
        if (protocolMatch) {
            const protocol = protocolMatch[1].toUpperCase();
            return `🌐 ${protocol} Link`;
        }
        
        // 如果不是標準 URI，直接使用前 30 個字符
        const cleanUri = uri.replace(/[<>:"/\\|?*]/g, '_').substring(0, 30);
        return `🌐 ${cleanUri}`;
        
    } catch (error) {
        // 如果解析失敗，使用安全的預設名稱
        const cleanUri = uri.replace(/[<>:"/\\|?*]/g, '_').substring(0, 30);
        return `🌐 ${cleanUri}`;
    }
}

// 創建捷徑檔案
async function createShortcut(
    gridView: GridView, 
    option: { 
        type: 'mode' | 'folder' | 'file' | 'search' | 'uri'; 
        value: string; 
        display: string;
        searchOptions?: {
            searchLocationFiles: boolean;
            searchFilesNameOnly: boolean;
            searchMediaFiles: boolean;
        };
    }) {
    try {
        // 生成不重複的檔案名稱
        let counter = 0;
        let shortcutName: string;
        
        // 對於 URI 類型，使用特殊的檔名生成邏輯
        if (option.type === 'uri') {
            shortcutName = generateFilenameFromUri(option.value);
        } else {
            shortcutName = `${option.display}`;
        }
        
        let newPath = `${shortcutName}.md`;
        while (gridView.app.vault.getAbstractFileByPath(newPath)) {
            counter++;
            const baseName = option.type === 'uri' ? generateFilenameFromUri(option.value) : option.display;
            shortcutName = `${baseName} ${counter}`;
            newPath = `${shortcutName}.md`;
        }

        // 創建新檔案
        const newFile = await gridView.app.vault.create(newPath, '');

        // 使用 processFrontMatter 來更新 frontmatter
        await gridView.app.fileManager.processFrontMatter(newFile, (frontmatter: any) => {                
            if (option.type === 'mode') {
                frontmatter.type = 'mode';
                frontmatter.redirect = option.value;
            } else if (option.type === 'folder') {
                frontmatter.type = 'folder';
                frontmatter.redirect = option.value;
            } else if (option.type === 'file') {
                const link = gridView.app.fileManager.generateMarkdownLink(
                    gridView.app.vault.getAbstractFileByPath(option.value) as TFile, 
                    ""
                );
                frontmatter.type = "file";
                frontmatter.redirect = link;
            } else if (option.type === 'search') {
                frontmatter.type = 'search';
                frontmatter.redirect = option.value;
                // 添加搜尋選項到 frontmatter
                if (option.searchOptions) {
                    frontmatter.searchLocationFiles = option.searchOptions.searchLocationFiles;
                    frontmatter.searchFilesNameOnly = option.searchOptions.searchFilesNameOnly;
                    frontmatter.searchMediaFiles = option.searchOptions.searchMediaFiles;
                }
            } else if (option.type === 'uri') {
                frontmatter.type = 'uri';
                frontmatter.redirect = option.value;
            }
        });

        new Notice(`${t('shortcut_created')}: ${shortcutName}`);

    } catch (error) {
        console.error('Create shortcut error', error);
        new Notice(t('failed_to_create_shortcut'));
    }
}