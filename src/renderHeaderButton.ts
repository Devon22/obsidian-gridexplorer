import { Menu, setIcon, TFile, Notice } from 'obsidian';
import { GridView } from './GridView';
import { EXPLORER_VIEW_TYPE } from './ExplorerView';
import { showFolderSelectionModal } from './modal/folderSelectionModal';
import { showSearchModal } from './modal/searchModal';
import { ShortcutSelectionModal } from './modal/shortcutSelectionModal';
import { createNewNote, createNewFolder, createNewCanvas, createNewBase, createShortcut as createShortcutUtil } from './createItemUtils';
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
                searchCurrentLocationOnly: gridView.searchCurrentLocationOnly,
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
                lastSource.searchCurrentLocationOnly ?? false,
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
                searchCurrentLocationOnly: gridView.searchCurrentLocationOnly,
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
                nextSource.searchCurrentLocationOnly ?? false,
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
                        if (!sourceInfo.searchCurrentLocationOnly) {
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
                                    searchCurrentLocationOnly: gridView.searchCurrentLocationOnly,
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
                                    sourceInfo.searchCurrentLocationOnly ?? false,
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
                        if (!sourceInfo.searchCurrentLocationOnly) {
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
                                    searchCurrentLocationOnly: gridView.searchCurrentLocationOnly,
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
                                    sourceInfo.searchCurrentLocationOnly ?? false,
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
                    await createNewNote(gridView.app, gridView.sourcePath);
                });
        });
        // 新增資料夾
        menu.addItem((item) => {
            item.setTitle(t('new_folder'))
            .setIcon('folder')
            .onClick(async () => {
                await createNewFolder(gridView.app, gridView.sourcePath, () => {
                    requestAnimationFrame(() => {
                        gridView.render();
                    });
                });
            });
        });
        // 新增畫布
        menu.addItem((item) => {
            item.setTitle(t('new_canvas'))
            .setIcon('layout-dashboard')
            .onClick(async () => {
                await createNewCanvas(gridView.app, gridView.sourcePath);
            });
        });
        // 新增 base
        menu.addItem((item) => {
            item.setTitle(t('new_base'))
            .setIcon('layout-dashboard')
            .onClick(async () => {
                await createNewBase(gridView.app, gridView.sourcePath);
            });
        });
        // 新增捷徑
        menu.addItem((item) => {
            item.setTitle(t('new_shortcut'))
            .setIcon('shuffle')
            .onClick(async () => {
                const modal = new ShortcutSelectionModal(gridView.app, gridView.plugin, async (option) => {
                    await createShortcutUtil(gridView.app, gridView.sourcePath, option);
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
        searchTextContainer.setAttribute('aria-label', gridView.searchQuery);

        // 創建搜尋文字
        const searchText = searchTextContainer.createEl('span', { cls: 'ge-search-text', text: gridView.searchQuery });
        // 讓搜尋文字可點選
        searchText.style.cursor = 'pointer';
        searchText.addEventListener('click', () => {
            showSearchModal(gridView.app, gridView, gridView.searchQuery, searchText);
        });

        // 先保存開啟 Modal 時的原始狀態
        const originalSearchQuery = gridView.searchQuery;
        const originalsearchCurrentLocationOnly = gridView.searchCurrentLocationOnly;
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
                originalsearchCurrentLocationOnly,
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

    // 開啟瀏覽器
    menu.addItem((item) => {
        item
            .setTitle(t('open_explorer'))
            .setIcon('folder-tree')
            .onClick(() => {
                const existingLeaves = gridView.app.workspace.getLeavesOfType(EXPLORER_VIEW_TYPE);
                if (existingLeaves.length > 0) {
                    gridView.app.workspace.revealLeaf(existingLeaves[0]);
                    return;
                }
                let leaf = gridView.app.workspace.getLeftLeaf(false);
                if (!leaf) leaf = gridView.app.workspace.getLeftLeaf(true);
                if (!leaf) leaf = gridView.app.workspace.getLeaf('tab');
                leaf.setViewState({ type: EXPLORER_VIEW_TYPE, active: true });
                gridView.app.workspace.revealLeaf(leaf);
            });
    });

    // 顯示設定選項
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
