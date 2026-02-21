import { Plugin, TFolder, TFile, App, Menu, WorkspaceLeaf } from 'obsidian';
import { GridView } from './GridView';
import { ExplorerView, EXPLORER_VIEW_TYPE } from './ExplorerView';
import { updateCustomDocumentExtensions, isMediaFile } from './utils/fileUtils';
import { showFolderSelectionModal } from './modal/folderSelectionModal';
import { showNoteSettingsModal } from './modal/noteSettingsModal';
import { GallerySettings, DEFAULT_SETTINGS, GridExplorerSettingTab } from './settings';
import { t } from './translations';

export default class GridExplorerPlugin extends Plugin {
    settings: GallerySettings;
    statusBarItem: HTMLElement;
    app: App;

    async onload() {
        await this.loadSettings();

        // 註冊視圖類型
        this.registerView(
            'grid-view',
            (leaf) => new GridView(leaf, this)
        );

        // 註冊資料夾樹狀視圖
        this.registerView(
            EXPLORER_VIEW_TYPE,
            (leaf) => new ExplorerView(leaf, this)
        );

        // 註冊設定頁面
        this.addSettingTab(new GridExplorerSettingTab(this.app, this));

        // 註冊開啟視圖指令
        this.addCommand({
            id: 'open-grid-view',
            name: t('open_grid_view'),
            callback: () => {
                showFolderSelectionModal(this.app, this);
            }
        });

        // 開啟瀏覽器視圖指令
        this.addCommand({
            id: 'open-explorer-view',
            name: t('open_explorer') || 'Open Explorer',
            callback: async () => {
                // 若已存在 ExplorerView，直接聚焦現有的 leaf
                const existingLeaves = this.app.workspace.getLeavesOfType(EXPLORER_VIEW_TYPE);
                if (existingLeaves.length > 0) {
                    this.app.workspace.revealLeaf(existingLeaves[0]);
                    return;
                }

                // 否則在左側側欄建立新的 leaf（不足時回退到新分頁）
                let leaf = this.app.workspace.getLeftLeaf(false);
                if (!leaf) leaf = this.app.workspace.getLeftLeaf(true);
                if (!leaf) leaf = this.app.workspace.getLeaf('tab');
                await leaf.setViewState({ type: EXPLORER_VIEW_TYPE, active: true });
                this.app.workspace.revealLeaf(leaf);
            }
        });

        // 註冊開啟當前筆記指令
        this.addCommand({
            id: 'view-current-note-in-grid-view',
            name: t('open_note_in_grid_view'),
            callback: () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    this.openNoteInFolder(activeFile);
                } else {
                    // 如果沒有當前筆記，則打開根目錄
                    this.openNoteInFolder(this.app.vault.getRoot());
                }
            }
        });

        // 註冊開啟反向連結指令
        this.addCommand({
            id: 'view-backlinks-in-grid-view',
            name: t('open_backlinks_in_grid_view'),
            callback: async () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    const view = await this.activateView();
                    if (view instanceof GridView) {
                        await view.setSource('backlinks');
                    }
                } else {
                    // 如果沒有當前筆記，則打開根目錄
                    this.openNoteInFolder(this.app.vault.getRoot());
                }
            }
        });

        // 註冊開啟外部連結指令
        this.addCommand({
            id: 'view-outgoinglinks-in-grid-view',
            name: t('open_outgoinglinks_in_grid_view'),
            callback: async () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    const view = await this.activateView();
                    if (view instanceof GridView) {
                        await view.setSource('outgoinglinks');
                    }
                } else {
                    // 如果沒有當前筆記，則打開根目錄
                    this.openNoteInFolder(this.app.vault.getRoot());
                }
            }
        });

        // 註冊開啟最近筆記指令
        this.addCommand({
            id: 'view-recent-files-in-grid-view',
            name: t('open_recent_files_in_grid_view'),
            callback: () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    this.openNoteInRecentFiles(activeFile);
                } else {
                    // 如果沒有當前筆記，則打開根目錄
                    this.openNoteInFolder(this.app.vault.getRoot());
                }
            }
        });

        // Open quick access folder command
        this.addCommand({
            id: 'open-quick-access-folder',
            name: t('open_quick_access_folder'),
            callback: async () => {
                let targetPath = this.settings.quickAccessCommandPath;
                if (!targetPath) {
                    targetPath = this.app.vault.getRoot().path;
                }

                const targetFile = this.app.vault.getAbstractFileByPath(targetPath);

                if (targetFile instanceof TFolder) {
                    this.openNoteInFolder(targetFile);
                } else {
                    this.openNoteInFolder(this.app.vault.getRoot());
                }
            }
        });

        // Open quick access mode command
        this.addCommand({
            id: 'open-quick-access-mode',
            name: t('open_quick_access_mode'),
            callback: async () => {
                const view = await this.activateView();
                if (view instanceof GridView) {
                    await view.setSource(this.settings.quickAccessModeType);
                }
            }
        });

        // 新增 Ribbon 圖示
        this.addRibbonIcon('grid', t('open_grid_view'), () => {
            showFolderSelectionModal(this.app, this);
        });

        // 註冊狀態列項目
        this.statusBarItem = this.addStatusBarItem();

        // 註冊資料夾的右鍵選單
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu: Menu, file) => {
                if (file instanceof TFolder) {
                    menu.addItem(item => {
                        item
                            .setTitle(t('open_in_grid_view'))
                            .setIcon('grid')
                            .setSection?.("open")
                            .onClick(() => {
                                this.openNoteInFolder(file);
                            });
                    });
                }
                if (file instanceof TFile) {
                    // 開啟筆記
                    menu.addItem(item => {
                        item.setTitle(t('open_in_grid_view'));
                        item.setIcon('grid');
                        item.setSection?.("open");
                        const ogSubmenu: Menu = (item as any).setSubmenu();
                        ogSubmenu.addItem((item) => {
                            item
                                .setTitle(t('show_note_in_grid_view'))
                                .setIcon('file-text')
                                .onClick(async () => {
                                    if (file.extension !== 'md') {
                                        return;
                                    }
                                    const activeView = this.app.workspace.getActiveViewOfType(GridView);
                                    const view = activeView ?? await this.activateView();
                                    if (view instanceof GridView) {
                                        if (!view.openShortcutFile(file)) {
                                            view.showNoteInGrid(file);
                                        }
                                    }
                                });
                        });
                        ogSubmenu.addSeparator();
                        ogSubmenu.addItem((item) => {
                            item
                                .setTitle(t('open_note_in_grid_view'))
                                .setIcon('folder')
                                .onClick(() => {
                                    this.openNoteInFolder(file);
                                });
                        });
                        ogSubmenu.addItem((item) => {
                            item
                                .setTitle(t('open_backlinks_in_grid_view'))
                                .setIcon('links-coming-in')
                                .onClick(async () => {
                                    this.app.workspace.getLeaf().openFile(file);
                                    const view = await this.activateView();
                                    if (view instanceof GridView) {
                                        await view.setSource('backlinks');
                                    }
                                });
                        });
                        ogSubmenu.addItem((item) => {
                            item
                                .setTitle(t('open_outgoinglinks_in_grid_view'))
                                .setIcon('links-going-out')
                                .onClick(async () => {
                                    this.app.workspace.getLeaf().openFile(file);
                                    const view = await this.activateView();
                                    if (view instanceof GridView) {
                                        await view.setSource('outgoinglinks');
                                    }
                                });
                        });
                        if (this.settings.showRecentFilesMode && file instanceof TFile) {
                            ogSubmenu.addItem((item) => {
                                item
                                    .setTitle(t('open_recent_files_in_grid_view'))
                                    .setIcon('calendar-days')
                                    .onClick(() => {
                                        this.openNoteInRecentFiles(file);
                                    });
                            });
                        }
                    });
                    // 搜尋選取的筆記名稱
                    const link = isMediaFile(file) ? file.name : this.app.fileManager.generateMarkdownLink(file, "");
                    const truncatedText = file.basename.length > 8 ? file.basename.substring(0, 8) + '...' : file.basename;
                    const displayText = isMediaFile(file) ? ` ${truncatedText}` : ` [[${truncatedText}]]`;
                    const menuItemTitle = t('search_selection_in_grid_view').replace('...', displayText); // 假設翻譯中有...代表要替換的部分，或者直接格式化
                    menu.addItem(item => {
                        item
                            .setTitle(menuItemTitle)
                            .setIcon('search')
                            .setSection?.("view")
                            .onClick(async () => {
                                // 取得或啟用 GridView
                                const view = await this.activateView();
                                if (view instanceof GridView) {
                                    await view.setSource('', '', true, link);
                                }
                            });
                    });
                    // 顯示筆記屬性
                    menu.addItem((item) => {
                        item
                            .setTitle(t('set_note_attribute'))
                            .setIcon('palette')
                            .onClick(() => {
                                showNoteSettingsModal(this.app, this, file);
                            });
                    });
                }
            })
        );

        // 註冊編輯器選單
        this.registerEvent(
            this.app.workspace.on('editor-menu', (menu: Menu, editor) => {
                if (editor.somethingSelected()) {
                    const selectedText = editor.getSelection();
                    // 截斷過長的文字，最多顯示 15 個字元
                    const truncatedText = selectedText.length > 15 ? selectedText.substring(0, 15) + '...' : selectedText;
                    const menuItemTitle = t('search_selection_in_grid_view').replace('...', `「${truncatedText}」`); // 假設翻譯中有...代表要替換的部分，或者直接格式化

                    menu.addItem(item => {
                        item
                            .setTitle(menuItemTitle)
                            .setIcon('search')
                            .setSection?.("view")
                            .onClick(async () => {
                                const selectedText = editor.getSelection();
                                // 取得或啟用 GridView
                                const view = await this.activateView();
                                if (view instanceof GridView) {
                                    await view.setSource('', '', true, selectedText);
                                }
                            });
                    });
                }
            })
        );

        // 註冊tag-wrangler右鍵選單
        this.registerEvent(
            (this.app.workspace as any).on('tag-wrangler:contextmenu', (menu: Menu, tagName: string) => {
                // 截斷過長的文字，最多顯示 15 個字元
                const truncatedText = tagName.length > 15 ? tagName.substring(0, 15) + '...' : tagName;
                const menuItemTitle = t('search_selection_in_grid_view').replace('...', `「#${truncatedText}」`); // 假設翻譯中有...代表要替換的部分，或者直接格式化

                menu.addItem(item => {
                    item
                        .setTitle(menuItemTitle)
                        .setIcon('search')
                        .setSection?.("view")
                        .onClick(async () => {
                            // 取得或啟用 GridView
                            const view = await this.activateView();
                            if (view instanceof GridView) {
                                await view.setSource('', '', true, `#${tagName}`);
                            }
                        });
                });
            })
        );

        // 攔截所有tag點擊事件
        this.registerDomEvent(document, 'click', async (evt: MouseEvent) => {
            // 如果未啟用攔截所有tag點擊事件，則跳過
            if (!this.settings.interceptAllTagClicks) return;
            // 只處理左鍵
            if (evt.button !== 0) return;

            // 若點擊的是屬性面板中 tag pill 的刪除按鈕或標籤面板中的展開圖示，直接跳過
            if ((evt.target as HTMLElement).closest('.multi-select-pill-remove-button, .tree-item-icon.collapse-icon')) return;

            // 從觸發點往上找，看是否碰到 tag 連結
            const el = (evt.target as HTMLElement).closest(
                'a.tag,        /* 預覽模式中的 #tag */\n' +
                '.tag-pane-tag, /* 標籤面板中的 tag */\n' +
                'span.cm-hashtag, /* 編輯器中的 tag */\n' +
                '.metadata-property[data-property-key="tags"] .multi-select-pill /* 屬性面板中的 tag */'
            ) as HTMLElement | null;
            if (!el) return;            // 不是 tag 點擊就跳過

            // 取出 tag 名稱（去掉前導 #）
            let tagName = '';
            if (el.matches('span.cm-hashtag')) {
                // 編輯器模式：可能被拆成多個 span，需組合
                const collect = [] as string[];
                let curr: HTMLElement | null = el;
                // 向左收集
                while (curr && curr.matches('span.cm-hashtag') && !curr.classList.contains('cm-formatting')) {
                    collect.unshift(curr.textContent ?? '');
                    curr = curr.previousElementSibling as HTMLElement | null;
                    if (curr && (!curr.matches('span.cm-hashtag') || curr.classList.contains('cm-formatting'))) break;
                }
                // 向右收集
                curr = el.nextElementSibling as HTMLElement | null;
                while (curr && curr.matches('span.cm-hashtag') && !curr.classList.contains('cm-formatting')) {
                    collect.push(curr.textContent ?? '');
                    curr = curr.nextElementSibling as HTMLElement | null;
                }
                tagName = collect.join('').trim();
            } else if (el.classList.contains('tag-pane-tag')) {
                // Tag Pane 中的元素，需避開計數器
                const inner = el.querySelector('.tag-pane-tag-text, .tree-item-inner-text') as HTMLElement | null;
                tagName = inner?.textContent?.trim() ?? '';
            } else if (el.matches('.metadata-property[data-property-key="tags"] .multi-select-pill')) {
                // Frontmatter/Properties view
                tagName = el.textContent?.trim() ?? '';
            } else {
                // 預覽模式中的連結 a.tag
                tagName = (el.getAttribute('data-tag') ?? el.textContent ?? '').trim();
            }
            tagName = tagName.replace(/^#/, '');
            if (!tagName) return;

            // 阻止 Obsidian 自己的處理（開搜尋窗）
            evt.preventDefault();
            evt.stopPropagation();

            // 叫出 GridView，並把搜尋字串設成這個 tag
            const view = await this.activateView();
            if (view instanceof GridView) {
                await view.setSource('', '', true, `#${tagName}`);
            }
        }, true); // 用 capture，可在其他 listener 前先吃到

        
        // 攔截Breadcrumb導航點擊事件
        this.registerDomEvent(document, 'click', async (evt: MouseEvent) => {
            // 如果未啟用攔截Breadcrumb導航點擊事件，則跳過
            if (!this.settings.interceptBreadcrumbClicks) return;

            //如果有按著Ctrl鍵，則跳過
            if (evt.ctrlKey || evt.metaKey) return;

            const target = evt.target as HTMLElement;
            const breadcrumbEl = target.closest('.view-header-breadcrumb');

            // 確保點擊的是標題列中的Breadcrumb
            if (!breadcrumbEl || !breadcrumbEl.parentElement?.classList.contains('view-header-title-parent')) {
                return;
            }

            evt.preventDefault();
            evt.stopPropagation();

            // 使用索引對映實際路徑，避免依賴顯示文字（可能被其他外掛修改）
            const parentEl = breadcrumbEl.parentElement;
            // 僅取麵包屑元素，建立清單以取得被點擊元素的索引
            const crumbs = Array.from(parentEl.querySelectorAll('.view-header-breadcrumb')) as HTMLElement[];
            const clickedIndex = crumbs.indexOf(breadcrumbEl as HTMLElement);
            if (clickedIndex < 0) return;

            // 嘗試取得目前活躍檔案
            let activeFile = this.app.workspace.getActiveFile();
            if (!activeFile) {
                // 若無活躍檔案，無法可靠對映麵包屑，結束處理
                return;
            }

            // 蒐集從根到當前檔案之父層的所有資料夾
            const folders: TFolder[] = [];
            let currFolder: TFolder | null = (activeFile instanceof TFile) ? activeFile.parent : (activeFile as unknown as TFolder);
            while (currFolder) {
                folders.push(currFolder);
                currFolder = currFolder.parent;
            }
            folders.reverse(); // 根 -> 最內層

            // 以「去除根目錄('/')」後的資料夾清單，直接用索引對應麵包屑
            const foldersWithoutRoot = folders.filter(f => f.path !== '/');
            const isClickingFileCrumb = (activeFile instanceof TFile) && (clickedIndex === crumbs.length - 1);

            let targetFolder: TFolder | undefined;
            if (isClickingFileCrumb) {
                // 點到檔名時，導向其父資料夾（foldersWithoutRoot 的最後一個；若不存在則退回根）
                targetFolder = foldersWithoutRoot[foldersWithoutRoot.length - 1] ?? folders[0];
            } else {
                // 其他情況，AAA/BBB 與 foldersWithoutRoot[0]/[1] 一一對應
                targetFolder = foldersWithoutRoot[clickedIndex] ?? folders[0];
            }

            if (!targetFolder) return;

            const folderPath = targetFolder.path;
            const view = await this.activateView();
            if (view instanceof GridView) {
                await view.setSource('folder', folderPath, true, '');
            }
        }, true); // 使用 capture 階段以確保優先處理
        

        // 設定 Canvas 拖曳處理
        this.setupCanvasDropHandlers();

        // Override new tab behavior (for useQuickAccessAsNewTabMode setting)
        const { workspace } = this.app;

        workspace.onLayoutReady(() => {
            // Create a WeakSet to store existing leaves to find new created leaves after plugin load.
            const existingLeaves = new WeakSet<WorkspaceLeaf>();
            workspace.iterateAllLeaves((leaf) => {
                existingLeaves.add(leaf);
            });

            // Registers layout-change event listener when the workspace layout changes, including new tabs being created.
            this.registerEvent(
                workspace.on("layout-change", () => {
                    this.checkForNewTab(existingLeaves);
                }),
            );

            // console.log('GridExplorer: Starting cache warming process.');
            // this.startWarmingCache();
        });
    }

    // startWarmingCache() {
    //     // 1. 取得所有 Markdown 檔案的列表
    //     const filesToWarm = this.app.vault.getMarkdownFiles();
    //     if (!filesToWarm || filesToWarm.length === 0) {
    //         console.log('GridExplorer: No markdown files to warm.');
    //         return;
    //     }

    //     // 建立一個檔案佇列 (Queue)
    //     let fileQueue = [...filesToWarm];
    //     console.log(`GridExplorer: Warming up cache for ${fileQueue.length} files.`);

    //     // 2. 定義處理單個檔案的函式
    //     // 我們會使用 app.vault.cachedRead 來讀取檔案內容，
    //     // 這個動作會觸發 Obsidian 的快取機制。
    //     const processFile = (file: TFile) => {
    //         try {
    //             // 核心操作：讀取檔案。我們不需要對回傳的 content 做任何事。
    //             this.app.vault.cachedRead(file);
    //             // console.log(`Warmed: ${file.path}`); // 可選：用於除錯
    //         } catch (e) {
    //             console.error(`GridExplorer: Failed to warm cache for ${file.path}:`, e);
    //         }
    //     };

    //     // 3. 使用 requestIdleCallback 來排程任務
    //     const scheduleNextBatch = (deadline: IdleDeadline) => {
    //         // deadline.timeRemaining() 會告訴我們還有多少閒置時間 (毫秒)
    //         // 只要還有閒置時間，並且佇列中還有檔案，我們就繼續處理。
    //         while (deadline.timeRemaining() > 0 && fileQueue.length > 0) {
    //             // 從佇列的前端取出一個檔案來處理
    //             const file = fileQueue.shift();
    //             if (file) {
    //                 processFile(file);
    //             }
    //         }

    //         // 如果佇列中還有檔案沒處理完，就排程下一次的 requestIdleCallback
    //         if (fileQueue.length > 0) {
    //             requestIdleCallback(scheduleNextBatch);
    //         } else {
    //             console.log('GridExplorer: Cache warming complete.');
    //         }
    //     };

    //     // 4. 啟動第一個閒置回呼
    //     requestIdleCallback(scheduleNextBatch);
    // }

    // 設定 Canvas 拖曳處理
    private setupCanvasDropHandlers() {
        const setup = () => {
            this.app.workspace.getLeavesOfType('canvas').forEach(leaf => {
                const canvasView = leaf.view as any;
                if (canvasView.gridExplorerDropHandler) {
                    return;
                }
                canvasView.gridExplorerDropHandler = true;

                const canvasEl = canvasView.containerEl;
                if (!canvasEl) return;
                
                const dragoverHandler = (evt: DragEvent) => {
                    // 只處理來自 Grid Explorer 的檔案拖曳，以顯示正確的游標
                    if (evt.dataTransfer?.types.includes('application/obsidian-grid-explorer-files')) {
                        evt.preventDefault();
                        evt.dataTransfer.dropEffect = 'copy';
                    }
                };

                const dropHandler = async (evt: DragEvent) => {
                    // 只處理來自 Grid Explorer 的拖曳事件
                    if (!evt.dataTransfer?.types.includes('application/obsidian-grid-explorer-files')) {
                        return; // 如果不是，則不做任何事，讓事件繼續傳遞給 Canvas 的預設處理器
                    }

                    // 來自 Grid Explorer 的拖曳，處理它並阻止預設行為
                    evt.preventDefault();
                    evt.stopPropagation();

                    // 嘗試解析多檔路徑
                    const data = evt.dataTransfer.getData('application/obsidian-grid-explorer-files');
                    let filePaths: string[] = [];
                    try {
                        const parsed = JSON.parse(data);
                        if (Array.isArray(parsed)) {
                            filePaths = parsed.filter((p: any) => typeof p === 'string');
                        } else if (typeof parsed === 'string') {
                            filePaths = [parsed];
                        }
                    } catch (e) {
                        console.error("GridExplorer: Failed to parse drop data from GridExplorer.", e);
                    }

                    // 如果無法取得檔案路徑，則中止操作
                    if (filePaths.length === 0) {
                        return;
                    }

                    const canvas = canvasView.canvas;
                    if (!canvas) {
                        return;
                    }

                    const pos = canvas.posFromEvt(evt);
                    let currentPos = { ...pos } as { x: number; y: number };

                    // 逐一建立節點，若多檔則位置做些微偏移
                    for (let i = 0; i < filePaths.length; i++) {
                        const filePath = filePaths[i];
                        const tfile = this.app.vault.getAbstractFileByPath(filePath);
                        if (!(tfile instanceof TFile)) {
                            console.warn('GridExplorer: Dropped item is not a TFile or could not be found.', filePath);
                            continue;
                        }

                        const newNode = canvas.createFileNode({
                            file: tfile,
                            pos: currentPos,
                            size: { width: 400, height: 400 }, // 預設大小
                            focus: filePaths.length === 1 || i === filePaths.length - 1, // 單檔或最後一個檔案才自動對焦
                        });
                        canvas.addNode(newNode);

                        // 如果有多個檔案，下一個節點位置向右下偏移
                        if (filePaths.length > 1) {
                            currentPos = { x: currentPos.x + 50, y: currentPos.y + 50 };
                        }
                    }

                    await canvas.requestSave();
                };

                this.registerDomEvent(canvasEl, 'dragover', dragoverHandler);
                this.registerDomEvent(canvasEl, 'drop', dropHandler, true); // 使用捕獲階段，以優先處理事件
            });
        };

        this.registerEvent(this.app.workspace.on('layout-change', setup));
        setup(); // 首次執行設定
    }

    // 打開最近文件
    async openNoteInRecentFiles(file: TFile) {
        const view = await this.activateView();
        if (view instanceof GridView) {
            view.targetFocusPath = file instanceof TFile ? file.path : null;
            await view.setSource('recent-files');
        }
    }

    // 打開筆記到資料夾模式
    async openNoteInFolder(file: TFile | TFolder = this.app.vault.getRoot()) {
        // 如果是文件，使用其父資料夾路徑
        const folderPath = file ? (file instanceof TFile ? file.parent?.path : file.path) : "/";
        const view = await this.activateView();
        if (view instanceof GridView) {
            view.targetFocusPath = file instanceof TFile ? file.path : null;
            await view.setSource('folder', folderPath);
        }
    }

    // 激活視圖
    async activateView() {
        const { workspace } = this.app;

        let leaf = null;
        const leaves = workspace.getLeavesOfType('grid-view');

        // 如果設定為重用現有的leaf且存在已開啟的 grid-view，則使用第一個
        if (this.settings.reuseExistingLeaf && leaves.length > 0) {
            leaf = leaves[0];
        } else {
            // 根據設定選擇開啟位置
            switch (this.settings.defaultOpenLocation) {
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
        }
        
        // 確保 leaf 不為 null
        if (!leaf) {
            // 如果無法獲取指定位置的 leaf，則回退到新分頁
            leaf = workspace.getLeaf('tab');
        }
        
        await leaf.setViewState({ type: 'grid-view', active: true });

        // 確保視圖是活躍的
        workspace.revealLeaf(leaf);
        return leaf.view;
    }

    // Function to check for new tabs and convert them to grid-view (for useQuickAccessAsNewTabMode setting)
    checkForNewTab(existingLeaves: WeakSet<WorkspaceLeaf>) {
        // Only proceed if the new tab override setting is not set to default
        if (this.settings.useQuickAccessAsNewTabMode === 'default') {
            return;
        }

        // Only proceed if the default open location is set to 'tab'
        if (this.settings.defaultOpenLocation !== 'tab') {
            return;
        }

        this.app.workspace.iterateAllLeaves((leaf) => {
            if (existingLeaves.has(leaf)) return;
            existingLeaves.add(leaf);
            if (!this.tabIsEmpty(leaf)) return;

            const gridViewLeaves = this.app.workspace.getLeavesOfType('grid-view');
            const openInFolder = this.settings.useQuickAccessAsNewTabMode === 'folder';
            const mode = openInFolder ? 'folder' : this.settings.quickAccessModeType;
            let path = '';

            if (openInFolder) {
                path = this.settings.quickAccessCommandPath || this.app.vault.getRoot().path;
                const targetFile = this.app.vault.getAbstractFileByPath(path);
                if (!(targetFile instanceof TFolder)) {
                    path = this.app.vault.getRoot().path;
                }
            }

            // Check if setting "reuseExistingLeaf" is enabled and if there are existing grid-view leaves
            if (this.settings.reuseExistingLeaf && gridViewLeaves.length > 0) {
                const leafToReuse = gridViewLeaves[0];
                const isSidebarLeaf = leafToReuse.getRoot() !== this.app.workspace.rootSplit;

                // If the only view is in the sidebar, ignore to prevent infinite loop
                if (!isSidebarLeaf) {
                    if (leafToReuse.view instanceof GridView) {
                        leafToReuse.view.setSource(mode, path);
                    }

                    this.app.workspace.revealLeaf(leafToReuse);

                    // Close the new empty tab
                    leaf.detach();

                    return;
                }
            }

            // Convert the new empty tab into a grid-view if all conditions are met
            leaf.setViewState({ type: 'grid-view', active: true }).then(() => {
                if (leaf.view instanceof GridView) {
                    leaf.view.setSource(mode, path);
                }
            });
        });
    }

    // Checks if a given WorkspaceLeaf is currently empty (is New Tab).
    tabIsEmpty(leaf: WorkspaceLeaf): boolean {
        return leaf.getViewState()?.type === "empty";
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        updateCustomDocumentExtensions(this.settings);
    }

    async saveSettings(update = true) {
        await this.saveData(this.settings);
        updateCustomDocumentExtensions(this.settings);

        if (update) {
            // 更新所有開啟的 GridView 實例
            const gridLeaves = this.app.workspace.getLeavesOfType('grid-view');
            gridLeaves.forEach(leaf => {
                if (leaf.view instanceof GridView) {
                    leaf.view.render();
                }
            });

            // 也刷新所有 ExplorerView（確保模式清單與設定開關同步）
            const explorerLeaves = this.app.workspace.getLeavesOfType(EXPLORER_VIEW_TYPE);
            explorerLeaves.forEach(leaf => {
                if (leaf.view instanceof ExplorerView) {
                    (leaf.view as ExplorerView).refresh();
                }
            });
        }
    }
}