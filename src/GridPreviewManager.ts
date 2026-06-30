import { TFile, Platform, setIcon, setTooltip, MarkdownRenderer, Component } from 'obsidian';
import JSZip from 'jszip';
import { GridView } from './GridView';
import { MediaModal, VirtualMediaFile } from './modal/mediaModal';
import { t } from './translations';

interface NoteViewContainerWithKeydownHandler extends HTMLElement {
    keydownHandler?: (e: KeyboardEvent) => void;
}

interface AppWithInternalPlugins {
    internalPlugins?: {
        plugins: {
            bookmarks?: {
                enabled?: boolean;
            };
        };
        getPluginById?: (id: string) => {
            instance?: {
                openGlobalSearch?: (query: string) => void;
            };
        } | undefined;
    };
}

export class GridPreviewManager {
    private view: GridView;
    private previewHistory: TFile[] = [];
    private previewHistoryIndex: number = -1;
    private previewComponent: Component | null = null;

    private preparePreviewComponent() {
        if (this.previewComponent) {
            this.previewComponent.unload();
            this.view.removeChild(this.previewComponent);
            this.previewComponent = null;
        }
        this.previewComponent = new Component();
        this.view.addChild(this.previewComponent);
        this.previewComponent.load();
    }

    constructor(view: GridView) {
        this.view = view;

        // 監聽檔案修改事件以即時更新預覽
        this.view.registerEvent(
            this.view.app.vault.on('modify', (file) => {
                if (file instanceof TFile && this.view.isShowingNote) {
                    const currentFile = this.getCurrentFile();
                    if (currentFile && file.path === currentFile.path) {
                        void this.updateCurrentPreview();
                    }
                }
            })
        );
    }

    // 預覽歷史記錄後退
    async navigatePreviewBack() {
        if (this.previewHistoryIndex > 0) {
            this.previewHistoryIndex--;
            const prevFile = this.previewHistory[this.previewHistoryIndex];
            await this.showNoteInGrid(prevFile, true);
        } else {
            if (this.view.isShowingZip) {
                this.hideZipInGrid();
            } else {
                this.hideNoteInGrid();
            }
        }
    }

    // 預覽歷史記錄前進
    async navigatePreviewForward() {
        if (this.previewHistoryIndex < this.previewHistory.length - 1) {
            this.previewHistoryIndex++;
            const nextFile = this.previewHistory[this.previewHistoryIndex];
            await this.showNoteInGrid(nextFile, true);
        }
    }

    // 註冊預覽視窗的行動裝置滑動手勢（包含上下拖曳關閉與左右滑動切換歷史記錄）
    private registerPreviewTouchEvents(
        container: HTMLElement,
        scrollContainer: HTMLElement,
        onClose: () => void
    ) {
        if (!Platform.isMobile) return;

        container.setCssProps({ touchAction: 'pan-y' });

        let startY = 0;
        let startX = 0;
        let currentY = 0;
        let currentX = 0;
        let isPullingUp = false;
        let isDragging = false;
        let isHorizontalDragging = false;
        let initialScrollTop = 0;
        let isAtTop = false;
        let isAtBottom = false;

        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length > 1) return;

            const target = e.target as HTMLElement;
            if (target.closest('input') || target.closest('textarea')) {
                return;
            }

            initialScrollTop = scrollContainer.scrollTop;
            isAtTop = initialScrollTop <= 0;
            isAtBottom = initialScrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 1;

            startY = e.touches[0].clientY;
            currentY = startY;
            startX = e.touches[0].clientX;
            currentX = startX;

            isDragging = false;
            isPullingUp = false;
            isHorizontalDragging = false;
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length > 1) return;

            currentY = e.touches[0].clientY;
            currentX = e.touches[0].clientX;
            const deltaY = currentY - startY;
            const deltaX = currentX - startX;

            // 決定滑動方向
            if (!isDragging && !isHorizontalDragging) {
                const threshold = 10;
                if (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold) {
                    if (Math.abs(deltaX) > Math.abs(deltaY)) {
                        // 左右滑動
                        const hasForwardHistory = this.previewHistoryIndex < this.previewHistory.length - 1;
                        if (deltaX < 0 && !hasForwardHistory) {
                            // 禁用該方向，不設為 dragging
                        } else {
                            isHorizontalDragging = true;
                            container.setCssProps({ transition: 'none' });
                        }
                    } else {
                        // 上下滑動 (原有拉動關閉功能)
                        if (isAtTop || isAtBottom) {
                            const pullDownStartThreshold = 24;
                            const pullUpStartThreshold = 36;
                            const canPullDown = isAtTop && deltaY > pullDownStartThreshold;
                            const canPullUp = isAtBottom && deltaY < -pullUpStartThreshold;

                            if (canPullDown || canPullUp) {
                                isDragging = true;
                                isPullingUp = canPullUp && deltaY < 0;
                                container.setCssProps({ transition: 'none' });
                            }
                        }
                    }
                }
            }

            // 只有在進入我們自己定義的拖曳狀態時，才攔截事件與阻止預設行為
            if (isHorizontalDragging || isDragging) {
                e.stopPropagation();
                if (e.cancelable) {
                    e.preventDefault();
                }
            }

            // 處理左右滑動視覺反饋
            if (isHorizontalDragging) {
                const hasForwardHistory = this.previewHistoryIndex < this.previewHistory.length - 1;
                let translateX = deltaX * 0.6;
                if (!hasForwardHistory && translateX < 0) {
                    translateX = 0;
                }

                if (translateX !== 0) {
                    container.setCssProps({ transform: `translateX(${translateX}px)` });
                }
            }

            // 處理上下滑動視覺反饋
            if (isDragging) {
                const resistance = 0.5;
                const translateY = deltaY * resistance;
                container.setCssProps({ transform: `translateY(${translateY}px)` });
            }
        };

        const handleTouchEnd = (e: TouchEvent) => {
            if (isHorizontalDragging || isDragging) {
                e.stopPropagation();
            }

            const deltaX = currentX - startX;
            const deltaY = currentY - startY;

            if (isHorizontalDragging) {
                isHorizontalDragging = false;
                const swipeThreshold = 80;

                const hasForwardHistory = this.previewHistoryIndex < this.previewHistory.length - 1;
                const isValidSwipe = !(deltaX < 0 && !hasForwardHistory);

                if (isValidSwipe && Math.abs(deltaX) > swipeThreshold) {
                    if (deltaX > 0) {
                        void this.navigatePreviewBack();
                    } else {
                        void this.navigatePreviewForward();
                    }
                    container.setCssProps({
                        transform: '',
                        transition: '',
                    });
                } else {
                    container.setCssProps({
                        transition: 'transform 0.3s ease-out',
                        transform: 'translateX(0)',
                    });
                    window.setTimeout(() => {
                        container.setCssProps({
                            transform: '',
                            transition: '',
                        });
                    }, 300);
                }
            } else if (isDragging) {
                isDragging = false;

                const closeThreshold = isPullingUp ? 170 : 110;
                if ((!isPullingUp && deltaY > closeThreshold) || (isPullingUp && deltaY < -closeThreshold)) {
                    const targetY = isPullingUp ? '-100vh' : '100vh';
                    container.setCssProps({
                        transition: 'transform 0.2s ease-out',
                        transform: `translateY(${targetY})`,
                    });
                    window.setTimeout(() => {
                        onClose();
                        container.setCssProps({
                            transform: '',
                            transition: '',
                        });
                    }, 200);
                } else {
                    container.setCssProps({
                        transition: 'transform 0.3s ease-out',
                        transform: 'translateY(0)',
                    });
                    window.setTimeout(() => {
                        container.setCssProps({
                            transform: '',
                            transition: '',
                        });
                    }, 300);
                }
            }
        };

        container.addEventListener('touchstart', handleTouchStart, { capture: true, passive: false });
        container.addEventListener('touchmove', handleTouchMove, { capture: true, passive: false });
        container.addEventListener('touchend', handleTouchEnd, { capture: true });
    }

    // 在網格視圖中直接顯示筆記
    async showNoteInGrid(file: TFile, isHistoryNavigation = false) {
        if (file.extension === 'zip') {
            return this.showZipInGrid(file, isHistoryNavigation);
        }

        // 更新歷史紀錄
        if (!this.view.isShowingNote) {
            // 從外部全新開啟
            this.previewHistory = [file];
            this.previewHistoryIndex = 0;
        } else if (!isHistoryNavigation) {
            // 在內部點擊連結跳轉
            this.previewHistory = this.previewHistory.slice(0, this.previewHistoryIndex + 1);
            this.previewHistory.push(file);
            this.previewHistoryIndex = this.previewHistory.length - 1;
        }

        // 關閉之前的筆記顯示
        if (this.view.isShowingNote) {
            this.hideNoteInGrid(false); // 傳入 false 避免清空我們剛更新的歷史
        }
        // 關閉之前的 ZIP 顯示
        if (this.view.isShowingZip) {
            this.hideZipInGrid(false);
        }

        const gridContainer = this.view.containerEl.querySelector('.ge-grid-container');
        if (!gridContainer) return;

        // 創建筆記顯示容器
        this.view.noteViewContainer = this.view.containerEl.createDiv('ge-note-view-container');
        const noteViewContainer = this.view.noteViewContainer;

        // 頂部列 (左右區塊)
        const topBar = noteViewContainer.createDiv('ge-note-top-bar');
        const leftBar = topBar.createDiv('ge-note-top-left');

        // 返回與前進按鈕
        const backButton = leftBar.createEl('button', { cls: 'clickable-icon ge-note-nav-button ge-note-back-button' });
        setIcon(backButton, 'arrow-left');
        backButton.disabled = false;
        backButton.addEventListener('click', () => {
            if (this.previewHistoryIndex > 0) {
                this.previewHistoryIndex--;
                const prevFile = this.previewHistory[this.previewHistoryIndex];
                void this.showNoteInGrid(prevFile, true);
            } else {
                this.hideNoteInGrid();
            }
        });

        const forwardButton = leftBar.createEl('button', { cls: 'clickable-icon ge-note-nav-button ge-note-forward-button' });
        setIcon(forwardButton, 'arrow-right');
        forwardButton.disabled = this.previewHistoryIndex >= this.previewHistory.length - 1;
        forwardButton.addEventListener('click', () => {
            if (this.previewHistoryIndex < this.previewHistory.length - 1) {
                this.previewHistoryIndex++;
                const nextFile = this.previewHistory[this.previewHistoryIndex];
                void this.showNoteInGrid(nextFile, true);
            }
        });

        // 筆記標題 (置中)
        const noteTitle = topBar.createDiv('ge-note-title');
        noteTitle.textContent = file.basename;
        if (Platform.isDesktop) {
            setTooltip(noteTitle, file.basename);
        }



        const rightBar = topBar.createDiv('ge-note-top-right');

        // 編輯按鈕
        const editButton = rightBar.createEl('button', { cls: 'clickable-icon ge-note-edit-button' });
        setIcon(editButton, 'pencil');
        editButton.addEventListener('click', () => {
            void this.view.getLeafByMode(file).openFile(file);
        });


        // Metadata 切換按鈕
        const infoButton = rightBar.createEl('button', { cls: 'clickable-icon ge-note-info-button' });
        setIcon(infoButton, 'info');

        // 關閉按鈕
        const closeButton = rightBar.createEl('button', { cls: 'clickable-icon ge-note-close-button' });
        setIcon(closeButton, 'x');
        closeButton.addEventListener('click', () => {
            this.hideNoteInGrid();
        });

        // 捲動內容容器
        const scrollContainer = noteViewContainer.createDiv('ge-note-scroll-container');

        // 假設在視圖側邊欄則把字型調小
        const isInSidebar = this.view.leaf.getRoot() === this.view.app.workspace.leftSplit ||
            this.view.leaf.getRoot() === this.view.app.workspace.rightSplit;
        if (isInSidebar) {
            scrollContainer.addClass('ge-note-sidebar-scroll-container');
        }

        // 創建筆記內容容器
        const noteContent = scrollContainer.createDiv('ge-note-content-container');
        if (isInSidebar) {
            noteContent.addClass('ge-note-sidebar-content-container');
        }

        // 在移動端添加滾動監聽，根據滾動方向控制導航欄顯示/隱藏
        this.preparePreviewComponent();

        if (Platform.isPhone) {
            let lastScrollTop = 0;
            let accumulateScroll = 0;
            const handleScroll = () => {
                const mobileNavbar = activeDocument.querySelector('.mobile-navbar') as HTMLElement;
                if (!mobileNavbar) return;

                const currentScrollTop = scrollContainer.scrollTop;
                const delta = currentScrollTop - lastScrollTop;

                if (delta > 0) {
                    // 往上捲（滾動位置增加）
                    if (accumulateScroll < 0) accumulateScroll = 0;
                    accumulateScroll += delta;
                    if (accumulateScroll > 50 && currentScrollTop > 50) {
                        if (!activeDocument.body.classList.contains('is-floating-nav')) {
                            mobileNavbar.setCssProps({ transform: 'translateY(100%)' });
                        } else {
                            mobileNavbar.setCssProps({ transform: 'translateY(200%)' });
                        }
                        mobileNavbar.setCssProps({ transition: 'transform 0.3s ease-out' });
                    }
                } else if (delta < 0) {
                    // 往下捲（滾動位置減少）
                    if (accumulateScroll > 0) accumulateScroll = 0;
                    accumulateScroll += delta;
                    if (accumulateScroll < -50 || currentScrollTop <= 0) {
                        mobileNavbar.setCssProps({
                            transform: 'translateY(0)',
                            transition: 'transform 0.3s ease-in',
                        });
                    }
                }

                lastScrollTop = currentScrollTop;
            };

            this.previewComponent!.registerDomEvent(scrollContainer, 'scroll', handleScroll);

            // 監聽分頁切換事件，當離開當前視圖時恢復導航欄
            const handleActiveLeafChange = () => {
                const activeView = this.view.app.workspace.getActiveViewOfType(GridView);
                // 如果當前活動視圖不是這個 GridView 實例，或者不在顯示筆記狀態
                if (activeView !== this.view || !this.view.isShowingNote) {
                    const navbar = activeDocument.querySelector('.mobile-navbar') as HTMLElement;
                    if (navbar) {
                        navbar.setCssProps({
                            transform: 'translateY(0)',
                            transition: 'transform 0.3s ease-in',
                        });
                    }
                }
            };

            // 註冊事件監聽器
            this.previewComponent!.registerEvent(
                this.view.app.workspace.on('active-leaf-change', handleActiveLeafChange)
            );
        }

        // 取得 Metadata (Frontmatter)
        const fileCache = this.view.app.metadataCache.getFileCache(file);
        const frontmatter = fileCache?.frontmatter;

        if (frontmatter) {
            // 檢查是否除了 position 以外還有其他屬性
            const keys = Object.keys(frontmatter).filter(k => k !== 'position');
            if (keys.length > 0) {
                const metadataContainer = noteContent.createDiv('ge-note-metadata-container');

                // 綁定切換事件
                infoButton.addEventListener('click', () => {
                    metadataContainer.classList.toggle('is-visible');
                    scrollContainer.scrollTo(0, 0);
                });

                const metadataContent = metadataContainer.createDiv('ge-note-metadata-content');
                for (const key of keys) {
                    const item = metadataContent.createDiv('ge-note-metadata-item');
                    item.createSpan({ cls: 'ge-note-metadata-key', text: `${key}: ` });
                    const value: unknown = frontmatter[key] as unknown;
                    const valueSpan = item.createSpan({ cls: 'ge-note-metadata-value' });

                    const values = Array.isArray(value) ? value : [value];
                    values.forEach((val, index) => {
                        const valStr = String(val);
                        // 處理內部連結 [[link]] 或 [[link|alias]]
                        const wikilinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
                        // 處理 URL
                        const urlRegex = /(https?:\/\/[^\s]+)/g;
                        // 處理 Tag
                        const tagRegex = /#([^\s#]+)/g;

                        if (wikilinkRegex.test(valStr)) {
                            wikilinkRegex.lastIndex = 0;
                            let lastIndex = 0;
                            let match;
                            while ((match = wikilinkRegex.exec(valStr)) !== null) {
                                // 插入匹配前的文字
                                if (match.index > lastIndex) {
                                    valueSpan.createSpan({ text: valStr.substring(lastIndex, match.index) });
                                }
                                const linkPath = match[1];
                                const linkAlias = match[2] || linkPath;
                                const linkEl = valueSpan.createEl('a', {
                                    cls: 'internal-link',
                                    text: linkAlias,
                                    attr: { 'data-href': linkPath }
                                });
                                linkEl.addEventListener('click', (e) => {
                                    e.preventDefault();
                                    const linkedFile = this.view.app.metadataCache.getFirstLinkpathDest(linkPath, file.path);
                                    if (linkedFile) {
                                        if (e.ctrlKey || e.metaKey) {
                                            void this.view.getLeafByMode(linkedFile).openFile(linkedFile);
                                        } else {
                                            void this.showNoteInGrid(linkedFile);
                                        }
                                    }
                                });
                                lastIndex = wikilinkRegex.lastIndex;
                            }
                            if (lastIndex < valStr.length) {
                                valueSpan.createSpan({ text: valStr.substring(lastIndex) });
                            }
                        } else if (urlRegex.test(valStr)) {
                            urlRegex.lastIndex = 0;
                            let lastIndex = 0;
                            let match;
                            while ((match = urlRegex.exec(valStr)) !== null) {
                                if (match.index > lastIndex) {
                                    valueSpan.createSpan({ text: valStr.substring(lastIndex, match.index) });
                                }
                                const url = match[1];
                                valueSpan.createEl('a', {
                                    cls: 'external-link',
                                    text: url,
                                    attr: { 'href': url, 'target': '_blank', 'rel': 'noopener' }
                                });
                                lastIndex = urlRegex.lastIndex;
                            }
                            if (lastIndex < valStr.length) {
                                valueSpan.createSpan({ text: valStr.substring(lastIndex) });
                            }
                        } else if (key.toLowerCase() === 'tags' || key.toLowerCase() === 'tag' || tagRegex.test(valStr)) {
                            if ((key.toLowerCase() === 'tags' || key.toLowerCase() === 'tag') && !valStr.startsWith('#')) {
                                const tagEl = valueSpan.createEl('a', {
                                    cls: 'tag',
                                    text: '#' + valStr,
                                    attr: { 'href': '#' + valStr }
                                });
                                tagEl.addEventListener('click', (e) => {
                                    e.preventDefault();
                                    (this.view.app as AppWithInternalPlugins).internalPlugins?.getPluginById?.('global-search')?.instance?.openGlobalSearch?.('tag:#' + valStr);
                                });
                            } else {
                                tagRegex.lastIndex = 0;
                                let lastIndex = 0;
                                let match;
                                while ((match = tagRegex.exec(valStr)) !== null) {
                                    if (match.index > lastIndex) {
                                        valueSpan.createSpan({ text: valStr.substring(lastIndex, match.index) });
                                    }
                                    const tagName = match[1];
                                    const tagEl = valueSpan.createEl('a', {
                                        cls: 'tag',
                                        text: '#' + tagName,
                                        attr: { 'href': '#' + tagName }
                                    });
                                    tagEl.addEventListener('click', (e) => {
                                        e.preventDefault();
                                        (this.view.app as AppWithInternalPlugins).internalPlugins?.getPluginById?.('global-search')?.instance?.openGlobalSearch?.('tag:#' + tagName);
                                    });
                                    lastIndex = tagRegex.lastIndex;
                                }
                                if (lastIndex < valStr.length) {
                                    valueSpan.createSpan({ text: valStr.substring(lastIndex) });
                                }
                            }
                        } else {
                            valueSpan.createSpan({ text: valStr });
                        }

                        if (index < values.length - 1) {
                            const isTag = key.toLowerCase() === 'tags' || key.toLowerCase() === 'tag';
                            valueSpan.createSpan({ text: isTag ? ' ' : ', ' });
                        }
                    });
                }
            }
        }

        // 創建筆記內容區域
        const noteContentArea = noteContent.createDiv('ge-note-content');

        // 建立筆記內第一行標題
        const vaultWithConfig = this.view.app.vault as unknown as { config?: { showInlineTitle?: boolean } };
        const showInlineTitle = vaultWithConfig.config?.showInlineTitle ?? true;
        if (showInlineTitle) {
            noteContentArea.createEl('h1', {
                cls: 'ge-note-internal-title',
                text: file.basename
            });
        }



        try {
            // 讀取筆記內容
            const content = await this.view.app.vault.read(file);

            // 使用 Obsidian 的 MarkdownRenderer 渲染內容
            await MarkdownRenderer.render(
                this.view.app,
                content,
                noteContentArea,
                file.path,
                this.previewComponent!
            );

            // 加上自訂屬性 data-source-path
            noteContentArea
                .querySelectorAll<HTMLImageElement>('img')
                .forEach((img) => (img.dataset.sourcePath = file.path));

            // 處理內部連結點擊
            const handleLinkClick = (e: MouseEvent) => {
                const target = e.target as HTMLElement;
                const link = target.closest('a.internal-link');
                if (link) {
                    e.preventDefault();
                    e.stopPropagation();

                    const href = link.getAttribute('href');
                    if (href) {
                        const linkText = link.getAttribute('data-href') || href;
                        const linkedFile = this.view.app.metadataCache.getFirstLinkpathDest(linkText, file.path);
                        if (linkedFile) {
                            if (e.ctrlKey || e.metaKey) {
                                void this.view.getLeafByMode(linkedFile).openFile(linkedFile);
                            } else {
                                void this.showNoteInGrid(linkedFile);
                            }
                        }
                    }
                }
            };

            // 使用 registerDomEvent 註冊事件
            this.previewComponent!.registerDomEvent(noteContentArea, 'click', handleLinkClick);
        } catch (error) {
            noteContentArea.textContent = '無法載入筆記內容';
            console.error('Error loading note content:', error);
        }

        // 渲染反向連結與出站連結區塊
        await this.renderLinksSection(file, noteContent);


        // 註冊行動裝置滑動手勢
        this.registerPreviewTouchEvents(noteViewContainer, scrollContainer, () => this.hideNoteInGrid());

        // 設定狀態
        this.view.isShowingNote = true;
        this.view.previewedFile = file;
        // 廣播事件，讓其他 GridView（例如側邊欄的反向連結模式）可以跟著更新
        this.view.app.workspace.trigger('ge-preview-file-change', file, this.view);
    }

    // 隱藏筆記顯示
    hideNoteInGrid(clearHistory = true) {
        if (!this.view.isShowingNote) return;

        // 顯示移動端導航欄 (僅在行動裝置上)
        if (Platform.isPhone) {
            const mobileNavbar = activeDocument.querySelector('.mobile-navbar') as HTMLElement;
            if (mobileNavbar) {
                mobileNavbar.setCssProps({
                    transform: 'translateY(0)',
                    transition: 'transform 0.3s ease-in',
                });
            }
        }

        if (this.previewComponent) {
            this.previewComponent.unload();
            this.view.removeChild(this.previewComponent);
            this.previewComponent = null;
        }

        if (this.view.noteViewContainer) {
            this.view.noteViewContainer.remove();
            this.view.noteViewContainer = null;
        }

        this.view.isShowingNote = false;
        this.view.previewedFile = null;
        this.view.app.workspace.trigger('ge-preview-file-change', null, this.view);

        if (clearHistory) {
            this.previewHistory = [];
            this.previewHistoryIndex = -1;
        }
    }


    // 在網格視圖中直接顯示 ZIP 圖片網格
    async showZipInGrid(file: TFile, isHistoryNavigation = false) {
        // 更新歷史紀錄
        if (!this.view.isShowingNote && !this.view.isShowingZip) {
            // 從外部全新開啟
            this.previewHistory = [file];
            this.previewHistoryIndex = 0;
        } else if (!isHistoryNavigation) {
            // 在內部點擊連結跳轉
            this.previewHistory = this.previewHistory.slice(0, this.previewHistoryIndex + 1);
            this.previewHistory.push(file);
            this.previewHistoryIndex = this.previewHistory.length - 1;
        }

        // 關閉之前的 ZIP 顯示
        if (this.view.isShowingZip) {
            this.hideZipInGrid(false);
        }
        // 關閉之前的筆記顯示
        if (this.view.isShowingNote) {
            this.hideNoteInGrid(false);
        }

        const gridContainer = this.view.containerEl.querySelector('.ge-grid-container');
        if (!gridContainer) return;

        // 創建 ZIP 顯示容器
        this.view.zipViewContainer = this.view.containerEl.createDiv('ge-zip-view-container');
        const zipViewContainer = this.view.zipViewContainer;

        // 頂部列 (左右區塊)
        const topBar = zipViewContainer.createDiv('ge-zip-top-bar');
        const leftBar = topBar.createDiv('ge-zip-top-left');

        // 返回與前進按鈕
        const backButton = leftBar.createEl('button', { cls: 'clickable-icon ge-note-nav-button ge-note-back-button' });
        setIcon(backButton, 'arrow-left');
        backButton.disabled = false;
        backButton.addEventListener('click', () => {
            if (this.previewHistoryIndex > 0) {
                this.previewHistoryIndex--;
                const prevFile = this.previewHistory[this.previewHistoryIndex];
                void this.showNoteInGrid(prevFile, true);
            } else {
                this.hideZipInGrid();
            }
        });

        const forwardButton = leftBar.createEl('button', { cls: 'clickable-icon ge-note-nav-button ge-note-forward-button' });
        setIcon(forwardButton, 'arrow-right');
        forwardButton.disabled = this.previewHistoryIndex >= this.previewHistory.length - 1;
        forwardButton.addEventListener('click', () => {
            if (this.previewHistoryIndex < this.previewHistory.length - 1) {
                this.previewHistoryIndex++;
                const nextFile = this.previewHistory[this.previewHistoryIndex];
                void this.showNoteInGrid(nextFile, true);
            }
        });

        // ZIP 標題
        const zipTitle = topBar.createDiv('ge-zip-title');
        zipTitle.textContent = file.basename;
        if (Platform.isDesktop) {
            setTooltip(zipTitle, file.basename);
        }

        const rightBar = topBar.createDiv('ge-zip-top-right');

        // 開啟按鈕 (在分頁中開啟 ZIP 檔案)
        const openButton = rightBar.createEl('button', { cls: 'clickable-icon ge-zip-open-button' });
        setIcon(openButton, 'folder-archive');
        openButton.setAttribute('aria-label', t('zip_open_file'));
        if (Platform.isDesktop) {
            setTooltip(openButton, t('zip_open_file'));
        }
        openButton.addEventListener('click', () => {
            void this.view.getLeafByMode(file).openFile(file);
        });

        // 關閉按鈕
        const closeButton = rightBar.createEl('button', { cls: 'clickable-icon ge-zip-close-button' });
        setIcon(closeButton, 'x');
        closeButton.setAttribute('aria-label', t('zip_close_view'));
        if (Platform.isDesktop) {
            setTooltip(closeButton, t('zip_close_view'));
        }
        closeButton.addEventListener('click', () => {
            this.hideZipInGrid();
        });

        // 捲動內容容器
        const scrollContainer = zipViewContainer.createDiv('ge-zip-scroll-container');

        // 假設在視圖側邊欄則把字型調小
        const isInSidebar = this.view.leaf.getRoot() === this.view.app.workspace.leftSplit ||
            this.view.leaf.getRoot() === this.view.app.workspace.rightSplit;
        if (isInSidebar) {
            scrollContainer.addClass('ge-zip-sidebar-scroll-container');
        }

        // 創建圖片網格容器
        const zipContent = scrollContainer.createDiv('ge-zip-content-container');
        if (isInSidebar) {
            zipContent.addClass('ge-zip-sidebar-content-container');
        }
        const zipGridEl = zipContent.createDiv('zip-viewer-grid');

        this.preparePreviewComponent();

        // 在移動端添加滾動監聽，控制導航欄
        if (Platform.isPhone) {
            let lastScrollTop = 0;
            let accumulateScroll = 0;
            const handleScroll = () => {
                const mobileNavbar = activeDocument.querySelector('.mobile-navbar') as HTMLElement;
                if (!mobileNavbar) return;

                const currentScrollTop = scrollContainer.scrollTop;
                const delta = currentScrollTop - lastScrollTop;

                if (delta > 0) {
                    if (accumulateScroll < 0) accumulateScroll = 0;
                    accumulateScroll += delta;
                    if (accumulateScroll > 50 && currentScrollTop > 50) {
                        if (!activeDocument.body.classList.contains('is-floating-nav')) {
                            mobileNavbar.setCssProps({ transform: 'translateY(100%)' });
                        } else {
                            mobileNavbar.setCssProps({ transform: 'translateY(200%)' });
                        }
                        mobileNavbar.setCssProps({ transition: 'transform 0.3s ease-out' });
                    }
                } else if (delta < 0) {
                    if (accumulateScroll > 0) accumulateScroll = 0;
                    accumulateScroll += delta;
                    if (accumulateScroll < -50 || currentScrollTop <= 0) {
                        mobileNavbar.setCssProps({
                            transform: 'translateY(0)',
                            transition: 'transform 0.3s ease-in',
                        });
                    }
                }
                lastScrollTop = currentScrollTop;
            };

            this.previewComponent!.registerDomEvent(scrollContainer, 'scroll', handleScroll);

            const handleActiveLeafChange = () => {
                const activeView = this.view.app.workspace.getActiveViewOfType(GridView);
                if (activeView !== this.view || !this.view.isShowingZip) {
                    const navbar = activeDocument.querySelector('.mobile-navbar') as HTMLElement;
                    if (navbar) {
                        navbar.setCssProps({
                            transform: 'translateY(0)',
                            transition: 'transform 0.3s ease-in',
                        });
                    }
                }
            };

            this.previewComponent!.registerEvent(
                this.view.app.workspace.on('active-leaf-change', handleActiveLeafChange)
            );
        }

        // 載入與解析 ZIP 檔案
        const loadingEl = zipContent.createDiv({ cls: 'ge-zip-loading', text: t('zip_loading') });

        try {
            const arrayBuffer = await this.view.app.vault.readBinary(file);
            const zip = await JSZip.loadAsync(arrayBuffer);
            this.view.activeZip = zip;

            const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'];
            this.view.zipImageFiles = Object.keys(zip.files)
                .filter(filename => {
                    const lower = filename.toLowerCase();
                    return !zip.files[filename].dir &&
                        imageExtensions.some(ext => lower.endsWith(ext)) &&
                        !lower.includes('__macosx');
                })
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

            loadingEl.remove();

            if (this.view.zipImageFiles.length === 0) {
                zipContent.createDiv({ cls: 'ge-zip-empty', text: t('zip_no_images') });
                this.view.isShowingZip = true;
                return;
            }

            // 更新標題以顯示圖片張數
            zipTitle.textContent = file.basename;

            // 建立網格項目
            this.view.zipObserver = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const img = entry.target as HTMLImageElement;
                        const item = img.closest('.zip-viewer-grid-item');
                        if (!item) return;

                        const indexStr = item.getAttribute('data-index');
                        if (indexStr === null) return;
                        const index = parseInt(indexStr, 10);

                        if (this.view.zipObserver) {
                            this.view.zipObserver.unobserve(img);
                        }

                        if (this.view.zipThumbnailUrls.has(index)) {
                            img.src = this.view.zipThumbnailUrls.get(index)!;
                            img.addClass('lazy-loaded');
                            return;
                        }

                        if (!this.view.activeZip) return;
                        const filename = this.view.zipImageFiles[index];
                        void (async () => {
                            try {
                                const fileObject = this.view.activeZip!.files[filename];
                                const blob = await fileObject.async("blob");
                                const url = URL.createObjectURL(blob);
                                this.view.zipThumbnailUrls.set(index, url);

                                img.src = url;
                                img.addClass('lazy-loaded');
                            } catch (err) {
                                console.error(`Error loading ZIP preview for index ${index}:`, err);
                            }
                        })();
                    }
                });
            }, {
                root: scrollContainer,
                rootMargin: '100px',
                threshold: 0.01
            });

            this.view.zipImageFiles.forEach((filename, index) => {
                const displayName = filename.split('/').pop() || filename;

                const item = zipGridEl.createDiv({ cls: 'zip-viewer-grid-item' });
                item.setAttribute('data-index', index.toString());
                item.setAttribute('data-file-path', filename);

                const imgWrapper = item.createDiv({ cls: 'zip-viewer-grid-item-img-wrapper' });
                const img = imgWrapper.createEl('img');

                const label = item.createDiv({ cls: 'zip-viewer-grid-item-label' });
                label.setText(displayName);

                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openZipMediaModal(index, zipGridEl);
                });

                if (this.view.zipObserver) {
                    this.view.zipObserver.observe(img);
                }
            });

            this.selectZipItem(0, zipGridEl);

        } catch (error) {
            loadingEl.textContent = t('zip_load_error');
            console.error('Error loading ZIP content in grid:', error);
        }

        // 註冊行動裝置滑動手勢
        this.registerPreviewTouchEvents(zipViewContainer, scrollContainer, () => this.hideZipInGrid());

        // 設定狀態
        this.view.isShowingZip = true;

        // 註冊鍵盤事件監聽器
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (target && (
                target.isContentEditable ||
                target.closest('input, textarea, select, [contenteditable="true"]')
            )) {
                return;
            }

            if (this.view.zipImageFiles.length === 0) return;

            // 如果有 Modal 視窗，則不處理（讓 Modal 自己處理）
            if (activeDocument.querySelector('.modal-container')) return;

            let newIndex = this.view.zipCurrentIndex;

            // 如果還沒有選中項目（zipCurrentIndex === -1）且按下了方向鍵，選中第一個項目
            if (this.view.zipCurrentIndex === -1 &&
                ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
                this.selectZipItem(0, zipGridEl);
                e.preventDefault();
                return;
            }

            const gridItems = Array.from(zipGridEl.querySelectorAll<HTMLElement>('.zip-viewer-grid-item'));

            switch (e.key) {
                case 'ArrowRight':
                    newIndex = Math.min(this.view.zipImageFiles.length - 1, this.view.zipCurrentIndex + 1);
                    e.preventDefault();
                    break;
                case 'ArrowLeft':
                    newIndex = Math.max(0, this.view.zipCurrentIndex - 1);
                    e.preventDefault();
                    break;
                case 'ArrowDown':
                    if (this.view.zipCurrentIndex >= 0 && gridItems.length > 0) {
                        const currentItem = gridItems[this.view.zipCurrentIndex];
                        const currentRect = currentItem.getBoundingClientRect();
                        const currentCenterX = currentRect.left + currentRect.width / 2;
                        const currentBottom = currentRect.bottom;

                        let closestItem = -1;
                        let minDistance = Number.MAX_VALUE;
                        let minVerticalDistance = Number.MAX_VALUE;

                        for (let i = 0; i < gridItems.length; i++) {
                            if (i === this.view.zipCurrentIndex) continue;

                            const itemRect = gridItems[i].getBoundingClientRect();
                            const itemCenterX = itemRect.left + itemRect.width / 2;
                            const itemTop = itemRect.top;

                            if (itemTop <= currentBottom) continue;

                            const horizontalDistance = Math.abs(itemCenterX - currentCenterX);
                            const verticalDistance = itemTop - currentBottom;

                            if (verticalDistance < minVerticalDistance ||
                                (verticalDistance === minVerticalDistance && horizontalDistance < minDistance)) {
                                minVerticalDistance = verticalDistance;
                                minDistance = horizontalDistance;
                                closestItem = i;
                            }
                        }

                        if (closestItem !== -1) {
                            newIndex = closestItem;
                        } else {
                            newIndex = gridItems.length - 1;
                        }
                    } else {
                        newIndex = 0;
                    }
                    e.preventDefault();
                    break;
                case 'ArrowUp':
                    if (this.view.zipCurrentIndex >= 0 && gridItems.length > 0) {
                        const currentItem = gridItems[this.view.zipCurrentIndex];
                        const currentRect = currentItem.getBoundingClientRect();
                        const currentCenterX = currentRect.left + currentRect.width / 2;
                        const currentTop = currentRect.top;

                        let closestItem = -1;
                        let minDistance = Number.MAX_VALUE;
                        let minVerticalDistance = Number.MAX_VALUE;

                        for (let i = 0; i < gridItems.length; i++) {
                            if (i === this.view.zipCurrentIndex) continue;

                            const itemRect = gridItems[i].getBoundingClientRect();
                            const itemCenterX = itemRect.left + itemRect.width / 2;
                            const itemBottom = itemRect.bottom;

                            if (itemBottom >= currentTop) continue;

                            const horizontalDistance = Math.abs(itemCenterX - currentCenterX);
                            const verticalDistance = currentTop - itemBottom;

                            if (verticalDistance < minVerticalDistance ||
                                (verticalDistance === minVerticalDistance && horizontalDistance < minDistance)) {
                                minVerticalDistance = verticalDistance;
                                minDistance = horizontalDistance;
                                closestItem = i;
                            }
                        }

                        if (closestItem !== -1) {
                            newIndex = closestItem;
                        } else {
                            newIndex = 0;
                        }
                    } else {
                        newIndex = 0;
                    }
                    e.preventDefault();
                    break;
                case 'Home':
                    newIndex = 0;
                    e.preventDefault();
                    break;
                case 'End':
                    newIndex = this.view.zipImageFiles.length - 1;
                    e.preventDefault();
                    break;
                case 'Enter':
                    if (this.view.zipCurrentIndex >= 0 && this.view.zipCurrentIndex < this.view.zipImageFiles.length) {
                        this.openZipMediaModal(this.view.zipCurrentIndex, zipGridEl);
                    }
                    e.preventDefault();
                    break;
            }

            if (newIndex !== this.view.zipCurrentIndex) {
                this.selectZipItem(newIndex, zipGridEl);
            }
        };

        activeDocument.addEventListener('keydown', handleKeyDown);

        // 儲存事件監聽器以便後續移除
        (zipViewContainer as NoteViewContainerWithKeydownHandler).keydownHandler = handleKeyDown;
    }

    // 開啟 ZIP 內部圖片的 MediaModal
    openZipMediaModal(index: number, gridEl: HTMLElement) {
        if (!this.view.activeZip) return;

        // 建立虛擬 Media 檔案列表
        const virtualMediaFiles: VirtualMediaFile[] = this.view.zipImageFiles.map(filename => {
            return {
                name: filename.split('/').pop() || filename,
                path: filename,
                isVirtual: true,
                getBlobUrl: async () => {
                    if (!this.view.activeZip) throw new Error("Zip is not loaded");
                    const fileObject = this.view.activeZip.files[filename];
                    const blob = await fileObject.async("blob");
                    return URL.createObjectURL(blob);
                }
            };
        });

        const activeVirtualFile = virtualMediaFiles[index];

        const focusTarget = {
            gridItems: Array.from(gridEl.querySelectorAll<HTMLElement>('.zip-viewer-grid-item')),
            hasKeyboardFocus: true,
            selectItem: (idx: number) => {
                this.selectZipItem(idx, gridEl);
                if (this.view.zipViewContainer) {
                    this.view.zipViewContainer.focus();
                }
            }
        };

        const modal = new MediaModal(this.view.app, activeVirtualFile, virtualMediaFiles, focusTarget);
        modal.open();
    }

    // 隱藏 ZIP 顯示
    hideZipInGrid(clearHistory = true) {
        if (!this.view.isShowingZip) return;

        if (this.previewComponent) {
            this.previewComponent.unload();
            this.view.removeChild(this.previewComponent);
            this.previewComponent = null;
        }

        // 顯示移動端導航欄 (僅在行動裝置上)
        if (Platform.isPhone) {
            const mobileNavbar = activeDocument.querySelector('.mobile-navbar') as HTMLElement;
            if (mobileNavbar) {
                mobileNavbar.setCssProps({
                    transform: 'translateY(0)',
                    transition: 'transform 0.3s ease-in',
                });
            }
        }

        if (this.view.zipObserver) {
            this.view.zipObserver.disconnect();
            this.view.zipObserver = null;
        }

        this.view.zipThumbnailUrls.forEach(url => {
            URL.revokeObjectURL(url);
        });
        this.view.zipThumbnailUrls.clear();
        this.view.zipImageFiles = [];
        this.view.activeZip = null;
        this.view.zipCurrentIndex = -1;

        if (this.view.zipViewContainer) {
            const keydownHandler = (this.view.zipViewContainer as NoteViewContainerWithKeydownHandler).keydownHandler;
            if (keydownHandler) {
                activeDocument.removeEventListener('keydown', keydownHandler);
            }

            this.view.zipViewContainer.remove();
            this.view.zipViewContainer = null;
        }

        this.view.isShowingZip = false;

        if (clearHistory) {
            this.previewHistory = [];
            this.previewHistoryIndex = -1;
        }
    }

    selectZipItem(idx: number, gridEl: HTMLElement) {
        if (idx < 0 || idx >= this.view.zipImageFiles.length) return;
        this.view.zipCurrentIndex = idx;
        const items = gridEl.querySelectorAll('.zip-viewer-grid-item');
        items.forEach((item, itemIdx) => {
            if (itemIdx === idx) {
                item.addClass('current');
                item.scrollIntoView({ block: 'center', behavior: 'smooth' });
            } else {
                item.removeClass('current');
            }
        });
    }

    private async renderLinksSection(file: TFile, parentEl: HTMLElement) {
        const app = this.view.app;
        const resolvedLinks = app.metadataCache.resolvedLinks;

        // 1. 獲取反向連結 (Backlinks)
        const backlinks = new Set<TFile>();
        for (const [sourcePath, links] of Object.entries(resolvedLinks)) {
            if (Object.keys(links).includes(file.path)) {
                const sourceFile = app.vault.getAbstractFileByPath(sourcePath);
                if (sourceFile instanceof TFile) {
                    backlinks.add(sourceFile);
                }
            }
        }

        // 如果沒有反向連結，就不需要渲染此區塊
        if (backlinks.size === 0) {
            return;
        }

        const linksContainer = parentEl.createDiv('ge-note-links-section');

        // 渲染反向連結
        if (backlinks.size > 0) {
            const backlinkHeader = linksContainer.createDiv('ge-note-links-header');
            backlinkHeader.createEl('span', { text: `🔗 ${t('backlinks')} (${backlinks.size})` });
            const backlinkList = linksContainer.createDiv('ge-note-links-list');

            Array.from(backlinks).forEach((linkFile) => {
                const item = backlinkList.createEl('a', {
                    cls: 'ge-note-link-item',
                    text: linkFile.basename,
                });
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                        void this.showNoteInGrid(linkFile);
                });
            });
        }
    }

    public getCurrentFile(): TFile | null {
        if (this.previewHistoryIndex >= 0 && this.previewHistoryIndex < this.previewHistory.length) {
            return this.previewHistory[this.previewHistoryIndex];
        }
        return null;
    }

    public async updateCurrentPreview() {
        const file = this.getCurrentFile();
        if (!file || !this.view.noteViewContainer) return;

        const scrollContainer = this.view.noteViewContainer.querySelector('.ge-note-scroll-container');
        const noteContent = this.view.noteViewContainer.querySelector('.ge-note-content-container');
        const noteContentArea = this.view.noteViewContainer.querySelector('.ge-note-content');

        if (!scrollContainer || !noteContent || !noteContentArea) return;

        const savedScrollTop = scrollContainer.scrollTop;

        try {
            // 1. 清空舊的內容區域
            noteContentArea.empty();

            // 2. 重新建立筆記內第一行標題
            noteContentArea.createEl('h1', {
                cls: 'ge-note-internal-title',
                text: file.basename
            });

            this.preparePreviewComponent();

            // 3. 讀取與渲染
            const content = await this.view.app.vault.read(file);
            await MarkdownRenderer.render(
                this.view.app,
                content,
                noteContentArea as HTMLElement,
                file.path,
                this.previewComponent!
            );

            // 4. 加上圖片的 data-source-path
            noteContentArea
                .querySelectorAll<HTMLImageElement>('img')
                .forEach((img) => (img.dataset.sourcePath = file.path));

            // 5. 重新渲染 backlinks
            const oldLinks = noteContent.querySelector('.ge-note-links-section');
            if (oldLinks) {
                oldLinks.remove();
            }
            await this.renderLinksSection(file, noteContent as HTMLElement);

            // 6. 還原滾動位置
            scrollContainer.scrollTop = savedScrollTop;
        } catch (error) {
            console.error('Error updating current preview note:', error);
        }
    }
}



