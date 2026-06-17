import { App, Modal, TFile, Menu, setIcon, Platform } from 'obsidian';
import { isImageFile, isVideoFile, isAudioFile } from '../utils/fileUtils';

export interface VirtualMediaFile {
    name: string;
    path: string;
    isVirtual: true;
    getBlobUrl: () => Promise<string>;
}

export type MediaFile = TFile | VirtualMediaFile;

export function isImage(file: MediaFile): boolean {
    if ('isVirtual' in file && file.isVirtual) {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg'].includes(ext);
    }
    if (file instanceof TFile) {
        return isImageFile(file);
    }
    return false;
}

export function isVideo(file: MediaFile): boolean {
    if ('isVirtual' in file && file.isVirtual) {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        return ['mp4', 'webm', 'mov', 'avi', 'mkv', 'ogv'].includes(ext);
    }
    if (file instanceof TFile) {
        return isVideoFile(file);
    }
    return false;
}

export function isAudio(file: MediaFile): boolean {
    if ('isVirtual' in file && file.isVirtual) {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        return ['flac', 'm4a', 'mp3', 'ogg', 'wav', '3gp'].includes(ext);
    }
    if (file instanceof TFile) {
        return isAudioFile(file);
    }
    return false;
}

interface GridViewFocusTarget {
    gridItems: HTMLElement[];
    hasKeyboardFocus: boolean;
    selectItem(index: number): void;
}

export class MediaModal extends Modal {
    private file: MediaFile;
    private mediaFiles: MediaFile[];
    private currentIndex: number;
    private currentMediaElement: HTMLElement | null = null;
    private isZoomed = false;
    private handleWheel: EventListener | null = null;
    private gridView?: GridViewFocusTarget; // 儲存 GridView 實例的引用

    // 觸控拖曳相關屬性
    private touchStartX = 0;
    private touchStartY = 0;
    private touchStartTime = 0;
    private isDragging = false;
    private minSwipeDistance = 50; // 最小滑動距離
    private maxSwipeTime = 300; // 最大滑動時間（毫秒）

    constructor(app: App, file: MediaFile, mediaFiles: MediaFile[], gridView?: GridViewFocusTarget) {
        super(app);
        this.file = file;
        this.mediaFiles = mediaFiles;
        this.currentIndex = this.mediaFiles.findIndex(f => f.path === file.path);
        this.gridView = gridView; // 保存 GridView 實例

        // 設置 modal 樣式
        this.modalEl.addClass('ge-media-modal');
    }

    onOpen() {
        const appWithPlugins = this.app as {
            plugins?: {
                plugins?: Record<string, { activeMediaModal?: unknown }>;
            };
        };
        const plugin = appWithPlugins.plugins?.plugins?.['obsidian-gridexplorer'];
        if (plugin) {
            plugin.activeMediaModal = this;
        }

        const { contentEl } = this;

        // 設置 modal 樣式為全螢幕
        contentEl.empty();
        contentEl.addClass('ge-media-modal-content');

        // 創建媒體顯示區域
        const mediaView = contentEl.createDiv('ge-media-view');

        // 創建關閉按鈕
        const closeButton = contentEl.createDiv('ge-media-close-button');
        setIcon(closeButton, 'x');
        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.close();
        });

        // 創建左右切換按鈕區域
        const prevArea = contentEl.createDiv('ge-media-prev-area');
        const nextArea = contentEl.createDiv('ge-media-next-area');

        // 創建媒體元素容器
        const mediaContainer = mediaView.createDiv('ge-media-container');

        // 點擊背景關閉媒體檢視器
        mediaContainer.addEventListener('click', (e) => {
            // 確保點擊的是背景，而不是媒體內容或其他控制元素
            if (e.target === mediaContainer) {
                this.close();
            }
        });

        // 註冊左右區域點擊事件
        prevArea.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showPrevMedia();
        });

        nextArea.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showNextMedia();
        });

        // 註冊滑鼠滾輪事件
        contentEl.addEventListener('wheel', (e) => {
            // 只有在非縮放狀態下才使用滾輪切換圖片
            if (!this.isZoomed) {
                e.preventDefault();
                if (e.deltaY > 0) {
                    this.showNextMedia();
                } else {
                    this.showPrevMedia();
                }
            }
        });

        // 註冊鍵盤快捷鍵
        this.scope.register(null, 'ArrowLeft', () => {
            this.showPrevMedia();
            return false;
        });

        this.scope.register(null, 'ArrowRight', () => {
            this.showNextMedia();
            return false;
        });

        this.scope.register(null, 'Home', () => {
            this.showMediaAtIndex(0);
            return false;
        });

        this.scope.register(null, 'End', () => {
            this.showMediaAtIndex(this.mediaFiles.length - 1);
            return false;
        });

        this.scope.register(null, 'PageUp', () => {
            const prevIndex = Math.max(0, this.currentIndex - 5);
            this.showMediaAtIndex(prevIndex);
            return false;
        });

        this.scope.register(null, 'PageDown', () => {
            const nextIndex = Math.min(this.mediaFiles.length - 1, this.currentIndex + 5);
            this.showMediaAtIndex(nextIndex);
            return false;
        });

        // 註冊觸控事件（行動裝置拖曳翻頁）
        this.registerTouchEvents(this.contentEl);

        // 註冊右鍵選單事件
        this.contentEl.addEventListener('contextmenu', (e) => {
            const currentFile = this.mediaFiles[this.currentIndex];
            if (currentFile) {
                this.onMediaContextMenu(e, currentFile);
            }
        });

        // 顯示當前媒體檔案
        this.showMediaAtIndex(this.currentIndex);
    }

    onClose() {
        const appWithPlugins = this.app as {
            plugins?: {
                plugins?: Record<string, { activeMediaModal?: unknown }>;
            };
        };
        const plugin = appWithPlugins.plugins?.plugins?.['obsidian-gridexplorer'];
        if (plugin && plugin.activeMediaModal === this) {
            plugin.activeMediaModal = null;
        }

        const { contentEl } = this;
        contentEl.empty();

        // 如果存在之前的滾輪事件處理程序，先移除它
        if (this.handleWheel) {
            const mediaView = contentEl.querySelector<HTMLElement>('.ge-media-view');
            if (mediaView) {
                mediaView.removeEventListener('wheel', this.handleWheel);
            }
            this.handleWheel = null;
        }

        // 如果有 GridView 實例，跳轉到當前選中的項目
        if (this.gridView) {
            // 找到當前媒體檔案在 GridView 中的索引
            const currentFile = this.mediaFiles[this.currentIndex];
            if (!currentFile) return;
            const gridItemIndex = this.gridView.gridItems.findIndex((item: HTMLElement) =>
                item.dataset.filePath === currentFile.path
            );

            // 如果找到了對應的項目，選中它並設置鍵盤焦點
            if (gridItemIndex >= 0) {
                this.gridView.hasKeyboardFocus = true;
                this.gridView.selectItem(gridItemIndex);
            }
        }
    }

    // 顯示指定索引的媒體檔案
    showMediaAtIndex(index: number) {
        if (index < 0 || index >= this.mediaFiles.length) return;

        const { contentEl } = this;
        const mediaContainer = contentEl.querySelector('.ge-media-container');
        if (!mediaContainer) return;

        // 更新當前顯示的索引
        this.currentIndex = index;

        // 如果存在之前的滾輪事件處理程序，先移除它
        if (this.handleWheel) {
            const mediaView = contentEl.querySelector('.ge-media-view');
            if (mediaView) {
                mediaView.removeEventListener('wheel', this.handleWheel);
            }
            this.handleWheel = null;
        }

        this.isZoomed = false;
        this.contentEl.removeClass('is-zoomed');

        const mediaFile = this.mediaFiles[index];

        if (isImage(mediaFile)) {
            // 創建圖片元素
            const img = activeDocument.createElement('img');
            img.className = 'ge-fullscreen-image';
            img.addClass('ge-hidden'); // 先隱藏新圖片

            // 等待新圖片載入完成
            img.onload = () => {
                // 移除舊 of 媒體元素
                if (this.currentMediaElement) {
                    this.currentMediaElement.remove();
                }
                this.currentMediaElement = img;
                // 設置圖片樣式，預設滿屏顯示
                this.resetImageStyles(img);
                // 顯示新圖片
                img.removeClass('ge-hidden');
            };

            if ('isVirtual' in mediaFile && mediaFile.isVirtual) {
                mediaFile.getBlobUrl().then(url => {
                    img.src = url;
                }).catch(err => console.error("Error loading virtual image:", err));
            } else if (mediaFile instanceof TFile) {
                img.src = this.app.vault.getResourcePath(mediaFile);
            }

            mediaContainer.appendChild(img);

            // 取得與更新圖片初始大小並綁定手勢事件
            let initialWidth = 0;
            let initialHeight = 0;
            let currentScale = 1;
            let isPinching = false;
            let pinchStartDistance = 0;
            let pinchStartScale = 1;
            let pinchStartCenterX = 0;
            let pinchStartCenterY = 0;
            let pinchStartScrollLeft = 0;
            let pinchStartScrollTop = 0;
            let lastTapTime = 0;

            let pinchRatioX = 0.5;
            let pinchRatioY = 0.5;

            const initImageDimensions = () => {
                initialWidth = img.offsetWidth || img.clientWidth;
                initialHeight = img.offsetHeight || img.clientHeight;
                currentScale = 1;
            };

            img.onload = () => {
                // 移除舊 of 媒體元素
                if (this.currentMediaElement) {
                    this.currentMediaElement.remove();
                }
                this.currentMediaElement = img;
                // 設置圖片樣式，預設滿屏顯示
                this.resetImageStyles(img);
                // 顯示新圖片
                img.removeClass('ge-hidden');
                initImageDimensions();
            };

            if (img.complete) {
                initImageDimensions();
            }

            // 行動裝置手勢支援 (Double Tap & Pinch Zoom)
            img.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    // 行動裝置雙擊 (Double Tap) 偵測
                    const now = Date.now();
                    if (now - lastTapTime < 300) {
                        e.preventDefault();
                        e.stopPropagation();
                        this.toggleImageZoom(img);
                        lastTapTime = 0;
                        return;
                    }
                    lastTapTime = now;
                } else if (e.touches.length === 2) {
                    // 雙指捏合縮放 (Pinch Zoom) 開始
                    e.preventDefault();
                    isPinching = true;
                    const t1 = e.touches[0];
                    const t2 = e.touches[1];
                    pinchStartDistance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
                    pinchStartCenterX = (t1.clientX + t2.clientX) / 2;
                    pinchStartCenterY = (t1.clientY + t2.clientY) / 2;
                    
                    if (initialWidth > 0) {
                        pinchStartScale = img.offsetWidth / initialWidth;
                    } else {
                        pinchStartScale = 1;
                    }

                    const mediaView = this.contentEl.querySelector<HTMLElement>('.ge-media-view');
                    if (mediaView) {
                        pinchStartScrollLeft = mediaView.scrollLeft;
                        pinchStartScrollTop = mediaView.scrollTop;

                        const viewRect = mediaView.getBoundingClientRect();
                        const relativeCenterX = pinchStartCenterX - viewRect.left;
                        const relativeCenterY = pinchStartCenterY - viewRect.top;

                        const startWidth = img.offsetWidth || initialWidth;
                        const startHeight = img.offsetHeight || initialHeight;

                        const imgRect = img.getBoundingClientRect();
                        const imgLeftInView = imgRect.left - viewRect.left + pinchStartScrollLeft;
                        const imgTopInView = imgRect.top - viewRect.top + pinchStartScrollTop;

                        pinchRatioX = startWidth > 0 ? (pinchStartScrollLeft + relativeCenterX - imgLeftInView) / startWidth : 0.5;
                        pinchRatioY = startHeight > 0 ? (pinchStartScrollTop + relativeCenterY - imgTopInView) / startHeight : 0.5;
                    }
                }
            }, { passive: false });

            img.addEventListener('touchmove', (e) => {
                if (isPinching && e.touches.length === 2) {
                    e.preventDefault();
                    const t1 = e.touches[0];
                    const t2 = e.touches[1];
                    const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
                    if (pinchStartDistance === 0) return;
                    
                    const centerScale = dist / pinchStartDistance;
                    let newScale = pinchStartScale * centerScale;

                    // 最大放大至原始尺寸의 4 倍
                    if (newScale > 4) newScale = 4;

                    currentScale = newScale;

                    const mediaView = this.contentEl.querySelector<HTMLElement>('.ge-media-view');
                    if (mediaView && initialWidth > 0 && initialHeight > 0) {
                        if (newScale > 1) {
                            this.isZoomed = true;
                            this.contentEl.addClass('is-zoomed');

                            mediaView.setCssStyles({
                                overflowX: 'scroll',
                                overflowY: 'scroll',
                            });

                            const newWidth = initialWidth * newScale;
                            const newHeight = initialHeight * newScale;

                            img.setCssStyles({
                                width: `${newWidth}px`,
                                height: `${newHeight}px`,
                                maxWidth: 'none',
                                maxHeight: 'none',
                                position: 'relative',
                                left: '0',
                                top: '0',
                                margin: 'auto',
                                transform: 'none',
                                cursor: 'zoom-out',
                            });

                            // 以雙指位置為中心縮放與拖曳
                            const viewRect = mediaView.getBoundingClientRect();
                            const currentCenterX = (t1.clientX + t2.clientX) / 2;
                            const currentCenterY = (t1.clientY + t2.clientY) / 2;
                            
                            const relativeCurrentCenterX = currentCenterX - viewRect.left;
                            const relativeCurrentCenterY = currentCenterY - viewRect.top;

                            const imgLeftInView = newWidth < viewRect.width ? (viewRect.width - newWidth) / 2 : 0;
                            const imgTopInView = newHeight < viewRect.height ? (viewRect.height - newHeight) / 2 : 0;

                            mediaView.scrollLeft = (pinchRatioX * newWidth) - relativeCurrentCenterX + imgLeftInView;
                            mediaView.scrollTop = (pinchRatioY * newHeight) - relativeCurrentCenterY + imgTopInView;
                        } else {
                            // 自動復原：縮小至小於或等於初始大小，自動重置為預設填滿模式
                            this.resetImageStyles(img);
                            this.isZoomed = false;
                            this.contentEl.removeClass('is-zoomed');
                            currentScale = 1;
                        }
                    }
                }
            }, { passive: false });

            img.addEventListener('touchend', (e) => {
                if (isPinching) {
                    if (e.touches.length < 2) {
                        isPinching = false;
                        if (currentScale <= 1) {
                            this.resetImageStyles(img);
                            this.isZoomed = false;
                            this.contentEl.removeClass('is-zoomed');
                            currentScale = 1;
                        }
                    }
                }
            });

            // 桌面端點擊事件（放大/縮小）
            if (!Platform.isMobile) {
                img.addEventListener('click', (event) => {
                    event.stopPropagation();
                    this.toggleImageZoom(img, event);
                });
            }

        } else if (isVideo(mediaFile) || isAudio(mediaFile)) {
            // 對於影片和音樂，維持原有的處理方式
            if (this.currentMediaElement) {
                this.currentMediaElement.remove();
            }
            const video = activeDocument.createElement('video');
            video.className = 'ge-fullscreen-video';
            video.controls = true;
            video.autoplay = true;

            if ('isVirtual' in mediaFile && mediaFile.isVirtual) {
                mediaFile.getBlobUrl().then(url => {
                    video.src = url;
                }).catch(err => console.error("Error loading virtual video/audio:", err));
            } else if (mediaFile instanceof TFile) {
                video.src = this.app.vault.getResourcePath(mediaFile);
            }

            mediaContainer.appendChild(video);
            this.currentMediaElement = video;
        }

        const oldFileNameElement = mediaContainer.querySelector('.ge-fullscreen-file-name');
        if (oldFileNameElement) {
            oldFileNameElement.remove();
        }

        if (isAudio(mediaFile)) {
            //顯示檔案名稱
            const fileName = mediaFile.name;
            const fileNameElement = activeDocument.createElement('div');
            fileNameElement.className = 'ge-fullscreen-file-name';
            fileNameElement.textContent = fileName;
            mediaContainer.appendChild(fileNameElement);
        }
    }

    // 顯示下一個媒體檔案
    showNextMedia() {
        const nextIndex = (this.currentIndex + 1) % this.mediaFiles.length;
        this.showMediaAtIndex(nextIndex);
    }

    // 顯示上一個媒體檔案
    showPrevMedia() {
        const prevIndex = (this.currentIndex - 1 + this.mediaFiles.length) % this.mediaFiles.length;
        this.showMediaAtIndex(prevIndex);
    }

    // 重設圖片樣式
    resetImageStyles(img: HTMLImageElement) {
        const mediaView = this.contentEl.querySelector<HTMLElement>('.ge-media-view');
        if (!mediaView) return;

        img.setCssStyles({
            width: 'auto',
            height: 'auto',
            maxWidth: '100vw',
            maxHeight: '100vh',
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            cursor: 'zoom-in',
        });

        mediaView.setCssStyles({
            overflowX: 'hidden',
            overflowY: 'hidden',
        });

        // 等待圖片載入完成後調整大小
        img.onload = () => {
            if (mediaView.clientWidth > mediaView.clientHeight) {
                if (img.naturalHeight < mediaView.clientHeight) {
                    img.setCssStyles({ height: '100%' });
                }
            } else {
                if (img.naturalWidth < mediaView.clientWidth) {
                    img.setCssStyles({ width: '100%' });
                }
            }
        };

        // 如果圖片已經載入，立即調整大小
        if (img.complete) {
            if (mediaView.clientWidth > mediaView.clientHeight) {
                if (img.naturalHeight < mediaView.clientHeight) {
                    img.setCssStyles({ height: '100%' });
                }
            } else {
                if (img.naturalWidth < mediaView.clientWidth) {
                    img.setCssStyles({ width: '100%' });
                }
            }
        }
    }

    // 切換圖片縮放
    toggleImageZoom(img: HTMLImageElement, event?: MouseEvent) {
        const mediaView = this.contentEl.querySelector<HTMLElement>('.ge-media-view');
        if (!mediaView) return;

        if (!this.isZoomed) { // 放大
            // 保存點擊位置相對於圖片的比例
            let clickX = 0.5;
            let clickY = 0.5;

            if (event) {
                const rect = img.getBoundingClientRect();
                clickX = (event.clientX - rect.left) / rect.width;
                clickY = (event.clientY - rect.top) / rect.height;
            }

            // 根據圖片與視窗的長寬比來決定放大模式
            const imageAspect = img.naturalWidth / img.naturalHeight;
            const screenAspect = mediaView.clientWidth / mediaView.clientHeight;

            // 如果圖片比視窗更"細長" (Aspect Ratio 較小)，則寬度填滿 (Fit Width)，垂直捲動
            // 如果圖片比視窗更"扁平" (Aspect Ratio 較大)，則高度填滿 (Fit Height)，水平捲動
            if (imageAspect < screenAspect) {
                img.setCssStyles({
                    width: '100vw',
                    height: 'auto',
                });
                mediaView.setCssStyles({
                    overflowX: 'hidden',
                    overflowY: 'scroll',
                });

                // 計算滾動位置
                window.requestAnimationFrame(() => {
                    const newHeight = img.offsetHeight;
                    const scrollY = Math.max(0, (newHeight * clickY) - (mediaView.clientHeight / 2));
                    mediaView.scrollTop = scrollY;
                });
            } else {
                img.setCssStyles({
                    width: 'auto',
                    height: '100vh',
                });
                mediaView.setCssStyles({
                    overflowX: 'scroll',
                    overflowY: 'hidden',
                });

                // 計算滾動位置
                window.requestAnimationFrame(() => {
                    const newWidth = img.offsetWidth;
                    const scrollX = Math.max(0, (newWidth * clickX) - (mediaView.clientWidth / 2));
                    mediaView.scrollLeft = scrollX;
                });

                // 將事件處理程序存儲在變數中
                this.handleWheel = (event) => {
                    const wheelEvent = event as WheelEvent;
                    wheelEvent.preventDefault();
                    mediaView.scrollLeft += wheelEvent.deltaY;
                };
                mediaView.addEventListener('wheel', this.handleWheel);
            }

            img.setCssStyles({
                maxWidth: 'none',
                maxHeight: 'none',
                position: 'relative',
                left: '0',
                top: '0',
                margin: 'auto',
                transform: 'none',
                cursor: 'zoom-out',
            });
            this.isZoomed = true;
            this.contentEl.addClass('is-zoomed');
        } else { // 縮小
            // 如果存在之前的滾輪事件處理程序，先移除它
            if (this.handleWheel) {
                mediaView.removeEventListener('wheel', this.handleWheel);
                this.handleWheel = null;
            }

            this.resetImageStyles(img);
            this.isZoomed = false;
            this.contentEl.removeClass('is-zoomed');
        }
    }

    // 處理媒體右鍵選單
    private onMediaContextMenu(event: MouseEvent, file: MediaFile) {
        event.preventDefault();
        const menu = new Menu();
        if (file instanceof TFile) {
            try {
                this.app.workspace.trigger('file-menu', menu, file, 'media-viewer');
            } catch (err) {
                console.error('Error triggering file-menu event:', err);
            }
        } else if ('isVirtual' in file && file.isVirtual) {
            // 觸發自定義事件，讓其他外掛專案可以針對虛擬檔案（如 zip 中的圖片）自定義右鍵選單
            try {
                this.app.workspace.trigger('gridexplorer:virtual-file-menu', menu, file, 'media-viewer');
            } catch (err) {
                console.error('Error triggering gridexplorer:virtual-file-menu event:', err);
            }
        }
        menu.showAtMouseEvent(event);
    }

    // 註冊觸控事件處理器（行動裝置拖曳翻頁）
    private registerTouchEvents(element: HTMLElement) {
        element.addEventListener('touchstart', (e) => {
            // 只有在非縮放狀態下才處理觸控事件
            if (this.isZoomed) return;

            // 排除控制項相關元素，避免干擾原生點擊功能
            const target = e.target as HTMLElement;
            if (target.closest('.ge-media-close-button')) {
                this.touchStartX = -1; // 標記為忽略
                return;
            }

            const touch = e.touches[0];
            this.touchStartX = touch.clientX;
            this.touchStartY = touch.clientY;
            this.touchStartTime = Date.now();
            this.isDragging = false;
        }, { passive: true });

        element.addEventListener('touchmove', (e) => {
            // 只有在非縮放狀態下且非忽略目標時才處理觸控事件
            if (this.isZoomed || this.touchStartX === -1) return;

            const touch = e.touches[0];
            const deltaX = Math.abs(touch.clientX - this.touchStartX);
            const deltaY = Math.abs(touch.clientY - this.touchStartY);

            // 如果水平移動距離大於垂直移動距離，則認為是水平拖曳
            // 如果垂直移動距離大於水平移動距離，則認為是垂直拖曳
            if ((deltaX > deltaY && deltaX > 10) || (deltaY > deltaX && deltaY > 10)) {
                this.isDragging = true;

                // 如果是在影片/音訊上，只有在明顯滑動時才阻止預設行為（避免干擾控制條點擊）
                const target = e.target as HTMLElement;
                if (target.tagName === 'VIDEO' || target.tagName === 'AUDIO') {
                    if (deltaX > 20 || deltaY > 20) {
                        e.preventDefault();
                    }
                } else {
                    e.preventDefault();
                }
            }
        }, { passive: false });

        element.addEventListener('touchend', (e) => {
            // 只有在非縮放狀態下且非忽略目標時才處理觸控事件
            if (this.isZoomed || this.touchStartX === -1) return;

            if (!this.isDragging) return;

            const touch = e.changedTouches[0];
            const deltaX = touch.clientX - this.touchStartX;
            const deltaY = touch.clientY - this.touchStartY;
            const deltaTime = Date.now() - this.touchStartTime;

            // 檢查是否符合滑動條件
            const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);
            const isVerticalSwipe = Math.abs(deltaY) > Math.abs(deltaX);
            const isValidDistance = Math.abs(deltaX) >= this.minSwipeDistance || Math.abs(deltaY) >= this.minSwipeDistance;
            const isValidTime = deltaTime <= this.maxSwipeTime;

            if (isValidDistance && isValidTime) {
                if (isHorizontalSwipe) {
                    if (deltaX > 0) {
                        // 向右滑動 - 顯示上一個媒體
                        this.showPrevMedia();
                    } else {
                        // 向左滑動 - 顯示下一個媒體
                        this.showNextMedia();
                    }
                } else if (isVerticalSwipe && deltaY > 0) {
                    // 向下滑動 - 關閉全螢幕
                    this.close();
                }
            }

            // 重置拖曳狀態
            this.isDragging = false;
        }, { passive: true });
    }

    public getActiveFile(): MediaFile {
        return this.mediaFiles[this.currentIndex];
    }
}
