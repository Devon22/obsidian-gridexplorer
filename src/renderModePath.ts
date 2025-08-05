import { TFolder, TFile, Menu, Platform, setIcon, normalizePath, setTooltip } from 'obsidian';
import { GridView } from './GridView';
import { isFolderIgnored } from './fileUtils';
import { showFolderNoteSettingsModal } from './modal/folderNoteSettingsModal';
import { showFolderRenameModal } from './modal/folderRenameModal';
import { showFolderMoveModal } from './modal/folderMoveModal';
import { CustomModeModal } from './modal/customModeModal';
import { t } from './translations';

export function renderModePath(gridView: GridView) {

    // 創建模式名稱和排序按鈕的容器
    const modeHeaderContainer = gridView.containerEl.createDiv('ge-mode-header-container');
        
    // 左側：模式名稱
    const modenameContainer = modeHeaderContainer.createDiv('ge-modename-content');
    
    // 右側：排序按鈕
    const rightActions = modeHeaderContainer.createDiv('ge-right-actions');
    
    // 添加排序按鈕
    if (gridView.sourceMode !== 'bookmarks' && 
        gridView.sourceMode !== 'recent-files' && 
        gridView.sourceMode !== 'random-note') {
        const sortButton = rightActions.createEl('a', { 
            cls: 'ge-sort-button',
            attr: { 
                'aria-label': t('sorting'),
                'href': '#'
            }
        });
        setIcon(sortButton, 'arrow-up-narrow-wide');

        sortButton.addEventListener('click', (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
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
                        .setChecked((gridView.folderSortType || gridView.sortType) === option.value)
                        .onClick(() => {
                            gridView.sortType = option.value;
                            gridView.folderSortType = '';
                            gridView.app.workspace.requestSaveLayout();
                            gridView.render();
                        });
                });
            });
            menu.showAtMouseEvent(evt);
        });
    }

    // 為區域添加點擊事件，點擊後網格容器捲動到最頂部
    modenameContainer.addEventListener('click', (event: MouseEvent) => {
        // 只有當點擊的是頂部按鈕區域本身（而不是其中的按鈕）時才觸發捲動
        if (event.target === modenameContainer) {
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

    // 顯示目前資料夾及完整路徑
    if (gridView.sourceMode === 'folder' &&
        (gridView.searchQuery === '' || (gridView.searchQuery && !gridView.searchAllFiles))) {

        // 分割路徑
        const pathParts = gridView.sourcePath.split('/').filter(part => part.trim() !== '');

        // 建立路徑項目的資料結構
        interface PathItem {
            name: string;
            path: string;
            isLast: boolean;
        }

        const paths: PathItem[] = [];
        let pathAccumulator = '';

        // 添加根目錄
        paths.push({
            name: t('root'),
            path: '/',
            isLast: pathParts.length === 0
        });

        // 建立所有路徑
        pathParts.forEach((part, index) => {
            pathAccumulator = pathAccumulator ? `${pathAccumulator}/${part}` : part;
            paths.push({
                name: part,
                path: pathAccumulator,
                isLast: index === pathParts.length - 1
            });
        });

        // 創建一個容器來測量寬度
        const pathContainer = modenameContainer.createDiv({ cls: 'ge-path-container' });
        const customFolderIcon = gridView.plugin.settings.customFolderIcon;

        // 計算可用寬度
        const pathElements: HTMLElement[] = [];

        // 建立所有路徑元素
        paths.forEach((path, index) => {
            const isLast = index === paths.length - 1;
            let pathEl;

            if (isLast) {
                if (path.path === '/' && gridView.plugin.settings.showFolder) {
                    // 當顯示資料夾開啟且是根目錄時，使用 span 元素
                    pathEl = modenameContainer.createEl('span', {
                        text: `${customFolderIcon} ${path.name}`.trim(),
                        cls: 'ge-mode-title'
                    });
                } else {
                    // 其他情況使用 a 元素
                    pathEl = modenameContainer.createEl('a', {
                        text: `${customFolderIcon} ${path.name}`.trim(),
                        cls: 'ge-current-folder'
                    });
                }
            } else {
                // 上層資料夾使用 a 元素（可點擊）
                pathEl = modenameContainer.createEl('a', {
                    text: path.name,
                    cls: 'ge-parent-folder-link'
                });
            }

            setTooltip(pathEl, path.name);
            pathElements.push(pathEl);
        });

        // 添加路徑元素
        for (let i = 0; i < pathElements.length; i++) {
            const el = pathElements[i];
            pathContainer.appendChild(el);

            // 為路徑元素添加點擊事件
            if (el.className === 'ge-parent-folder-link') {
                const pathIndex = i; // 直接使用索引，因為不再有分隔符
                if (pathIndex < paths.length) {
                    const path = paths[pathIndex];
                    el.addEventListener('click', async (event) => {
                        event.preventDefault();
                        event.stopPropagation();

                        if (!gridView.plugin.settings.showFolder) {
                            // 與右鍵相同的選單 (子資料夾與層級導航)
                            const menu = new Menu();

                            // 1. 當前資料夾
                            menu.addItem((item) => {
                                item.setTitle(`${customFolderIcon} ${path.name}`)
                                    .onClick(() => {
                                        gridView.setSource('folder', path.path);
                                        gridView.clearSelection();
                                    });
                            });

                            // 2. 子資料夾
                            const currentFolder = gridView.app.vault.getAbstractFileByPath(path.path);
                            if (currentFolder && currentFolder instanceof TFolder) {
                                const subFolders = currentFolder.children
                                    .filter(child => child instanceof TFolder && !isFolderIgnored(
                                        child as TFolder,
                                        gridView.plugin.settings.ignoredFolders,
                                        gridView.plugin.settings.ignoredFolderPatterns,
                                        gridView.showIgnoredFolders
                                    ))
                                    .sort((a: any, b: any) => a.name.localeCompare(b.name));

                                if (subFolders.length > 0) {
                                    menu.addSeparator();
                                    menu.addItem((item) =>
                                        item.setTitle(t('sub_folders'))
                                            .setIcon('folder-symlink')
                                            .setDisabled(true)
                                    );

                                    subFolders.forEach((folder: any) => {
                                        menu.addItem((item) => {
                                            item.setTitle(`${customFolderIcon} ${folder.name}`)
                                                .setIcon('corner-down-right')
                                                .onClick(() => {
                                                    gridView.setSource('folder', folder.path);
                                                    gridView.clearSelection();
                                                });
                                        });
                                    });
                                }
                            }

                            menu.showAtMouseEvent(event as MouseEvent);
                        } else {
                            gridView.setSource('folder', path.path);
                            gridView.clearSelection();
                        }
                    });

                    // 為最後一個路徑以外的路徑添加拖曳功能
                    if (!path.isLast && Platform.isDesktop) {
                        // 為路徑元素添加拖曳目標功能
                        el.addEventListener('dragover', (event) => {
                            event.preventDefault();
                            event.dataTransfer!.dropEffect = 'move';
                            el.addClass('ge-dragover');
                        });

                        el.addEventListener('dragleave', () => {
                            el.removeClass('ge-dragover');
                        });

                        el.addEventListener('drop', async (event) => {
                            event.preventDefault();
                            el.removeClass('ge-dragover');

                            if (!path.path) return;

                            const folder = gridView.app.vault.getAbstractFileByPath(path.path);
                            if (!(folder instanceof TFolder)) return;

                            const filesData = event.dataTransfer?.getData('application/obsidian-grid-explorer-files');
                            if (filesData) {
                                try {
                                    const filePaths = JSON.parse(filesData);
                                    for (const filePath of filePaths) {
                                        const file = gridView.app.vault.getAbstractFileByPath(filePath);
                                        if (file instanceof TFile) {
                                            const newPath = normalizePath(`${path.path}/${file.name}`);
                                            await gridView.app.fileManager.renameFile(file, newPath);
                                        }
                                    }
                                } catch (error) {
                                    console.error('An error occurred while moving multiple files to folder:', error);
                                }
                                return;
                            }

                            const filePath = event.dataTransfer?.getData('text/plain');
                            if (!filePath) return;

                            const cleanedFilePath = filePath.replace(/!?\[\[(.*?)\]\]/, '$1');
                            const file = gridView.app.vault.getAbstractFileByPath(cleanedFilePath);

                            if (file instanceof TFile) {
                                try {
                                    const newPath = normalizePath(`${path.path}/${file.name}`);
                                    await gridView.app.fileManager.renameFile(file, newPath);
                                    gridView.render();
                                } catch (error) {
                                    console.error('An error occurred while moving the file to folder:', error);
                                }
                            }
                        });
                    }
                }
            }

            if (el.className === 'ge-current-folder') {
                el.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    const folder = gridView.app.vault.getAbstractFileByPath(gridView.sourcePath); // 當前資料夾
                    const folderName = gridView.sourcePath.split('/').pop() || '';
                    const parentFolder = folder?.parent; // 上層資料夾

                    const menu = new Menu();

                    // 為當前資料夾加入子資料夾清單
                    // 如果 showFolder = true，則只有根目錄加入子資料夾清單
                    // 如果 showFolder = false，則當前資料夾（含根目錄）都加入子資料夾清單
                    let current: TFolder | null = null;
                    if (!gridView.plugin.settings.showFolder) {
                        // 顯示當前資料夾的子資料夾
                        current = folder instanceof TFolder ? folder : null;
                        if (gridView.sourcePath === '/') {
                            current = gridView.app.vault.getRoot();
                        }
                    } else {
                        // 只顯示根目錄的子資料夾
                        if (gridView.sourcePath === '/') {
                            current = gridView.app.vault.getRoot();
                        } else {
                            // 如果不是根目錄，則不顯示子資料夾
                            current = null;
                        }
                    }

                    if (current) {
                        const subFolders = current.children
                            .filter(child => child instanceof TFolder && !isFolderIgnored(
                                child as TFolder,
                                gridView.plugin.settings.ignoredFolders,
                                gridView.plugin.settings.ignoredFolderPatterns,
                                gridView.showIgnoredFolders
                            )) as TFolder[];

                        if (subFolders.length > 0) {
                            menu.addSeparator();
                            menu.addItem((item) =>
                                item.setTitle(t('sub_folders'))
                                    .setIcon('folder-symlink')
                                    .setDisabled(true)
                            );

                            subFolders.sort((a, b) => a.name.localeCompare(b.name)).forEach(sf => {
                                menu.addItem((item) => {
                                    item.setTitle(`${customFolderIcon} ${sf.name}`)
                                        .setIcon('corner-down-right')
                                        .onClick(() => {
                                            gridView.setSource('folder', sf.path);
                                            gridView.clearSelection();
                                        });
                                });
                            });
                        }
                    }

                    const notePath = `${gridView.sourcePath}/${folderName}.md`;
                    const noteFile = gridView.app.vault.getAbstractFileByPath(notePath);

                    menu.addSeparator();

                    if (noteFile instanceof TFile) {
                        // 打開資料夾筆記選項
                        menu.addItem((item) => {
                            item
                                .setTitle(t('open_folder_note'))
                                .setIcon('panel-left-open')
                                .onClick(() => {
                                    gridView.app.workspace.getLeaf().openFile(noteFile);
                                });
                        });
                        // 編輯資料夾筆記設定選項
                        menu.addItem((item) => {
                            item
                                .setTitle(t('edit_folder_note_settings'))
                                .setIcon('settings-2')
                                .onClick(() => {
                                    if (folder instanceof TFolder) {
                                        showFolderNoteSettingsModal(gridView.app, gridView.plugin, folder, gridView);
                                    }
                                });
                        });
                        // 刪除資料夾筆記選項
                        menu.addItem((item) => {
                            item
                                .setTitle(t('delete_folder_note'))
                                .setIcon('folder-x')
                                .onClick(() => {
                                    gridView.app.fileManager.trashFile(noteFile as TFile);
                                });
                        });
                    } else {
                        // 建立 Folder note
                        if (gridView.sourcePath !== '/') {
                            menu.addItem((item) => {
                                item
                                    .setTitle(t('create_folder_note'))
                                    .setIcon('file-cog')
                                    .onClick(() => {
                                        if (folder instanceof TFolder) {
                                            showFolderNoteSettingsModal(gridView.app, gridView.plugin, folder, gridView);
                                        }
                                    });
                            });
                        }
                    }

                    if (!gridView.plugin.settings.showFolder && gridView.sourcePath !== '/') {
                        menu.addSeparator();
                        if (folder) {
                            if (!gridView.plugin.settings.ignoredFolders.includes(folder.path)) {
                                //加入"忽略此資料夾"選項
                                menu.addItem((item) => {
                                    item
                                        .setTitle(t('ignore_folder'))
                                        .setIcon('folder-x')
                                        .onClick(() => {
                                            gridView.plugin.settings.ignoredFolders.push(folder.path);
                                            gridView.plugin.saveSettings();
                                            requestAnimationFrame(() => {
                                                // 回上層資料夾
                                                gridView.setSource('folder', parentFolder?.path || '/');
                                            });
                                        });
                                });
                            } else {
                                //加入"取消忽略此資料夾"選項
                                menu.addItem((item) => {
                                    item
                                        .setTitle(t('unignore_folder'))
                                        .setIcon('folder-up')
                                        .onClick(() => {
                                            gridView.plugin.settings.ignoredFolders = gridView.plugin.settings.ignoredFolders.filter((path) => path !== folder.path);
                                            gridView.plugin.saveSettings();
                                            requestAnimationFrame(() => {
                                                // 回上層資料夾
                                                gridView.setSource('folder', parentFolder?.path || '/');
                                            });
                                        });
                                });
                            }
                            // 搬移資料夾
                            menu.addItem((item) => {
                                item
                                    .setTitle(t('move_folder'))
                                    .setIcon('folder-cog')
                                    .onClick(() => {
                                        if (folder instanceof TFolder) {
                                            new showFolderMoveModal(gridView.plugin, folder, gridView).open();
                                        }
                                    });
                            });
                            // 重新命名資料夾
                            menu.addItem((item) => {
                                item
                                    .setTitle(t('rename_folder'))
                                    .setIcon('file-cog')
                                    .onClick(() => {
                                        if (folder instanceof TFolder) {
                                            showFolderRenameModal(gridView.app, gridView.plugin, folder, gridView);
                                        }
                                    });
                            });
                            // 刪除資料夾
                            menu.addItem((item) => {
                                (item as any).setWarning(true);
                                item
                                    .setTitle(t('delete_folder'))
                                    .setIcon('trash')
                                    .onClick(async () => {
                                        if (folder instanceof TFolder) {
                                            await gridView.app.fileManager.trashFile(folder);
                                            requestAnimationFrame(() => {
                                                // 回上層資料夾
                                                gridView.setSource('folder', parentFolder?.path || '/');
                                            });
                                        }
                                    });
                            });
                        }
                    }

                    menu.showAtMouseEvent(event);
                });
            }
        }
    } else if (!(gridView.searchQuery !== '' && gridView.searchAllFiles)) {
        // 顯示目前模式名稱

        let modeName = '';
        let modeIcon = '';

        // 根據目前模式設定對應的圖示和名稱
        switch (gridView.sourceMode) {
            case 'bookmarks':
                modeIcon = '📑';
                modeName = t('bookmarks_mode');
                break;
            case 'search':
                modeIcon = '🔍';
                modeName = t('search_results');
                const searchLeaf = (gridView.app as any).workspace.getLeavesOfType('search')[0];
                if (searchLeaf) {
                    const searchView: any = searchLeaf.view;
                    const searchInputEl: HTMLInputElement | null = searchView.searchComponent ? searchView.searchComponent.inputEl : null;
                    const currentQuery = searchInputEl?.value.trim();
                    if (currentQuery && currentQuery.length > 0) {
                        modeName += `: ${currentQuery}`;
                    } else if (gridView.searchQuery) {
                        modeName += `: ${gridView.searchQuery}`;
                    }
                }
                break;
            case 'backlinks':
                modeIcon = '🔗';
                modeName = t('backlinks_mode');
                const activeFile = gridView.app.workspace.getActiveFile();
                if (activeFile) {
                    modeName += `: ${activeFile.basename}`;
                }
                break;
            case 'outgoinglinks':
                modeIcon = '🔗';
                modeName = t('outgoinglinks_mode');
                const currentFile = gridView.app.workspace.getActiveFile();
                if (currentFile) {
                    modeName += `: ${currentFile.basename}`;
                }
                break;
            case 'recent-files':
                modeIcon = '📅';
                modeName = t('recent_files_mode');
                break;
            case 'all-files':
                modeIcon = '📔';
                modeName = t('all_files_mode');
                break;
            case 'random-note':
                modeIcon = '🎲';
                modeName = t('random_note_mode');
                break;
            case 'tasks':
                modeIcon = '☑️';
                modeName = t('tasks_mode');
                break;
            default:
                if (gridView.sourceMode.startsWith('custom-')) {
                    const mode = gridView.plugin.settings.customModes.find(m => m.internalName === gridView.sourceMode);
                    modeIcon = mode ? mode.icon : '🧩';
                    modeName = mode ? mode.displayName : t('custom_mode');
                } else { // folder mode
                    modeIcon = '📁';
                    if (gridView.sourcePath && gridView.sourcePath !== '/') {
                        modeName = gridView.sourcePath.split('/').pop() || gridView.sourcePath;
                    } else {
                        modeName = t('root');
                    }
                }
        }

        // 顯示模式名稱 (若為自訂模式則提供點擊選單以快速切換)
        let modeTitleEl: HTMLElement;
        if (gridView.sourceMode.startsWith('custom-')) {
            // 使用可點擊的 <a> 元素
            modeTitleEl = modenameContainer.createEl('a', {
                text: `${modeIcon} ${modeName}`.trim(),
                cls: 'ge-mode-title'
            });

            // 點擊時顯示所有自訂模式選單
            modeTitleEl.addEventListener('click', (evt) => {
                const menu = new Menu();
                gridView.plugin.settings.customModes
                    .filter(m => m.enabled ?? true) // 僅顯示啟用的自訂模式
                    .forEach((m) => {
                        menu.addItem(item => {
                            item.setTitle(`${m.icon || '🧩'} ${m.displayName}`)
                                .setChecked(m.internalName === gridView.sourceMode)
                                .onClick(() => {
                                    // 切換至選取的自訂模式並重新渲染
                                    gridView.setSource(m.internalName);
                                });
                        });
                    });
                menu.showAtMouseEvent(evt);
            });
        } else {
            // 其他模式維持原本的 span
            modeTitleEl = modenameContainer.createEl('span', {
                text: `${modeIcon} ${modeName}`.trim(),
                cls: 'ge-mode-title'
            });
        }

        switch (gridView.sourceMode) {
            case 'random-note':
            case 'recent-files':
            case 'all-files':
                if (gridView.plugin.settings.showMediaFiles && gridView.searchQuery === '') {
                    // "顯示類型"選項
                    const showTypeName = gridView.randomNoteIncludeMedia ? t('random_note_include_media_files') : t('random_note_notes_only');
                    const showTypeSpan = modenameContainer.createEl('a', { text: showTypeName, cls: 'ge-sub-option' });
                    showTypeSpan.addEventListener('click', (evt) => {
                        const menu = new Menu();
                        menu.addItem((item) => {
                            item.setTitle(t('random_note_notes_only'))
                                .setIcon('file-text')
                                .setChecked(!gridView.randomNoteIncludeMedia)
                                .onClick(() => {
                                    gridView.randomNoteIncludeMedia = false;
                                    gridView.render();
                                });
                        });
                        menu.addItem((item) => {
                            item.setTitle(t('random_note_include_media_files'))
                                .setIcon('file-image')
                                .setChecked(gridView.randomNoteIncludeMedia)
                                .onClick(() => {
                                    gridView.randomNoteIncludeMedia = true;
                                    gridView.render();
                                });
                        });
                        menu.showAtMouseEvent(evt);
                    });
                }
                break;
            case 'tasks':
                const taskFilterSpan = modenameContainer.createEl('a', { text: t(`${gridView.taskFilter}`), cls: 'ge-sub-option' });
                taskFilterSpan.addEventListener('click', (evt) => {
                    const menu = new Menu();
                    menu.addItem((item) => {
                        item.setTitle(t('uncompleted'))
                            .setChecked(gridView.taskFilter === 'uncompleted')
                            .setIcon('square')
                            .onClick(() => {
                                gridView.taskFilter = 'uncompleted';
                                gridView.render();
                            });
                    });
                    menu.addItem((item) => {
                        item.setTitle(t('completed'))
                            .setChecked(gridView.taskFilter === 'completed')
                            .setIcon('square-check-big')
                            .onClick(() => {
                                gridView.taskFilter = 'completed';
                                gridView.render();
                            });
                    });
                    menu.addItem((item) => {
                        item.setTitle(t('all'))
                            .setChecked(gridView.taskFilter === 'all')
                            .setIcon('square-asterisk')
                            .onClick(() => {
                                gridView.taskFilter = 'all';
                                gridView.render();
                            });
                    });
                    menu.addSeparator();
                    menu.showAtMouseEvent(evt);
                });
                break;
            default:
                if (gridView.sourceMode.startsWith('custom-')) {
                    // 把 modenameContainer 加上所有自訂模式選項的選單

                    // 取得當前自訂模式
                    const mode = gridView.plugin.settings.customModes.find(m => m.internalName === gridView.sourceMode);
                    if (mode) {
                        const hasOptions = mode.options && mode.options.length > 0;

                        if (hasOptions && mode.options) {
                            if (gridView.customOptionIndex >= mode.options.length || gridView.customOptionIndex < -1) {
                                gridView.customOptionIndex = -1;
                            }

                            let subName: string | undefined;
                            if (gridView.customOptionIndex === -1) {
                                subName = (mode as any).name?.trim() || t('default');
                            } else if (gridView.customOptionIndex >= 0 && gridView.customOptionIndex < mode.options.length) {
                                const opt = mode.options[gridView.customOptionIndex];
                                subName = opt.name?.trim() || `${t('option')} ${gridView.customOptionIndex + 1}`;
                            }

                            const subSpan = modenameContainer.createEl('a', { text: subName ?? '-', cls: 'ge-sub-option' });
                            subSpan.addEventListener('click', (evt) => {
                                const menu = new Menu();
                                // 預設選項
                                const defaultName = (mode as any).name?.trim() || t('default');
                                menu.addItem(item => {
                                    item.setTitle(defaultName)
                                        .setIcon('puzzle')
                                        .setChecked(gridView.customOptionIndex === -1)
                                        .onClick(() => {
                                            gridView.customOptionIndex = -1;
                                            gridView.render();
                                        });
                                });
                                mode.options!.forEach((opt, idx) => {
                                    menu.addItem(item => {
                                        item.setTitle(opt.name?.trim() || t('option') + ' ' + (idx + 1))
                                            .setIcon('puzzle')
                                            .setChecked(idx === gridView.customOptionIndex)
                                            .onClick(() => {
                                                gridView.customOptionIndex = idx;
                                                gridView.render();
                                            });
                                    });
                                });
                                menu.showAtMouseEvent(evt);
                            });
                        }

                        // 總是顯示設定齒輪圖示
                        const gearIcon = modenameContainer.createEl('a', { cls: 'ge-settings-gear' });
                        setIcon(gearIcon, 'settings');
                        gearIcon.addEventListener('click', () => {
                            const modeIndex = gridView.plugin.settings.customModes.findIndex(m => m.internalName === mode.internalName);
                            if (modeIndex === -1) return;
                            new CustomModeModal(gridView.app, gridView.plugin, gridView.plugin.settings.customModes[modeIndex], (result) => {
                                gridView.plugin.settings.customModes[modeIndex] = result;
                                gridView.plugin.saveSettings();
                                gridView.render();
                            }).open();
                        });
                    }
                }
                break;
        }
    } else if (gridView.searchQuery !== '' && gridView.searchAllFiles) {
        // 顯示全域搜尋名稱
        modenameContainer.createEl('span', {
            text: `🔍 ${t('global_search')}`,
            cls: 'ge-mode-title'
        });
    }
}
