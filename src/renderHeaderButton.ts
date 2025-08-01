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

    // 添加回上一步按鈕
    const backButton = headerButtonsDiv.createEl('button', { attr: { 'aria-label': t('back') } });
    setIcon(backButton, 'arrow-left');
    backButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        
        if (gridView.searchQuery !== '') {
            gridView.searchQuery = '';
            gridView.app.workspace.requestSaveLayout();
            gridView.render();
            return;
        }
        
        // 如果有歷史記錄
        if (gridView.recentSources.length > 0) {
            // 取得最近一筆歷史記錄
            const lastSource = JSON.parse(gridView.recentSources[0]);
            gridView.recentSources.shift(); // 從歷史記錄中移除
            
            // 設定來源（不記錄到歷史）
            gridView.setSource(
                lastSource.mode, 
                lastSource.path || '', 
                true,  // 重設捲動位置
                false  // 不記錄到歷史
            );
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
                    
                    // 添加歷史記錄到選單
                    menu.addItem((item) => {
                        item
                            .setTitle(`${displayText}`)
                            .setIcon(`${icon}`)
                            .onClick(() => {
                                // 找出當前點擊的紀錄索引
                                const clickedIndex = gridView.recentSources.findIndex(source => {
                                    const parsed = JSON.parse(source);
                                    return parsed.mode === mode && parsed.path === path;
                                });
                                
                                // 如果找到點擊的紀錄，清除它之上的紀錄
                                if (clickedIndex !== -1) {
                                    gridView.recentSources = gridView.recentSources.slice(clickedIndex + 1);
                                }

                                gridView.setSource(mode, path, true, false);
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
                    gridView.render(false);
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

        // 創建取消按鈕
        const clearButton = searchTextContainer.createDiv('ge-clear-button');
        setIcon(clearButton, 'x');
        clearButton.addEventListener('click', (e) => {
            e.stopPropagation();  // 防止觸發搜尋文字的點擊事件
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

// 創建捷徑檔案
async function createShortcut(gridView: GridView, option: { type: 'mode' | 'folder' | 'file'; value: string; display: string; }) {
    try {
        // 生成不重複的檔案名稱
        let counter = 0;
        let shortcutName = `${option.display}`;
        let newPath = `${shortcutName}.md`;
        while (gridView.app.vault.getAbstractFileByPath(newPath)) {
            counter++;
            shortcutName = `${option.display} ${counter}`;
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
            }
        });

        new Notice(`${t('shortcut_created')}: ${shortcutName}`);

    } catch (error) {
        console.error('Create shortcut error', error);
        new Notice(t('Failed to create shortcut'));
    }
}