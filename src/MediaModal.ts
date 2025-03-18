import { App, Modal, TFile, setIcon } from 'obsidian';

export class MediaModal extends Modal {
    private file: TFile;
    private mediaFiles: TFile[];
    private currentIndex: number;
    private currentMediaElement: HTMLElement | null = null;
    private isZoomed = false;
    private handleWheel: ((event: WheelEvent) => void) | null = null;
    private gridView: any; // 儲存 GridView 實例的引用

    constructor(app: App, file: TFile, mediaFiles: TFile[], gridView?: any) {
        super(app);
        this.file = file;
        this.mediaFiles = mediaFiles;
        this.currentIndex = this.mediaFiles.findIndex(f => f.path === file.path);
        this.gridView = gridView; // 保存 GridView 實例
        
        // 設置 modal 樣式
        this.modalEl.addClass('ge-media-modal');
    }

    onOpen() {
        const { contentEl } = this;
        
        // 如果有 GridView 實例，禁用其鍵盤導航
        if (this.gridView) {
            this.gridView.disableKeyboardNavigation();
        }
        
        // 設置 modal 樣式為全螢幕
        contentEl.empty();
        contentEl.style.width = '100%';
        contentEl.style.height = '100%';
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
        
        // 顯示當前媒體檔案
        this.showMediaAtIndex(this.currentIndex);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        
        // 如果存在之前的滾輪事件處理程序，先移除它
        if (this.handleWheel) {
            const mediaView = contentEl.querySelector('.ge-media-view');
            if (mediaView) {
                mediaView.removeEventListener('wheel', this.handleWheel);
            }
            this.handleWheel = null;
        }
        
        // 如果有 GridView 實例，重新啟用其鍵盤導航並跳轉到當前選中的項目
        if (this.gridView) {
            this.gridView.enableKeyboardNavigation();
            
            // 找到當前媒體檔案在 GridView 中的索引
            const currentFile = this.mediaFiles[this.currentIndex];
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
        
        const mediaFile = this.mediaFiles[index];
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        const videoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
        
        if (imageExtensions.includes(mediaFile.extension.toLowerCase())) {
            // 創建圖片元素
            const img = document.createElement('img');
            img.className = 'ge-fullscreen-image';
            img.style.display = 'none'; // 先隱藏新圖片
            img.src = this.app.vault.getResourcePath(mediaFile);
            
            // 等待新圖片載入完成
            img.onload = () => {
                // 移除舊的媒體元素
                if (this.currentMediaElement) {
                    this.currentMediaElement.remove();
                }
                this.currentMediaElement = img;
                // 設置圖片樣式，預設滿屏顯示
                this.resetImageStyles(img);
                // 顯示新圖片
                img.style.display = '';
            };
            
            mediaContainer.appendChild(img);
            
            // 圖片點擊事件（放大/縮小）
            img.addEventListener('click', (event) => {
                event.stopPropagation();
                this.toggleImageZoom(img);
            });
            
        } else if (videoExtensions.includes(mediaFile.extension.toLowerCase())) {
            // 對於影片，維持原有的處理方式
            if (this.currentMediaElement) {
                this.currentMediaElement.remove();
            }
            const video = document.createElement('video');
            video.className = 'ge-fullscreen-video';
            video.controls = true;
            video.autoplay = true;
            video.src = this.app.vault.getResourcePath(mediaFile);
            mediaContainer.appendChild(video);
            this.currentMediaElement = video;
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
        const mediaView = this.contentEl.querySelector('.ge-media-view');
        if (!mediaView) return;
        
        img.style.width = 'auto';
        img.style.height = 'auto';
        img.style.maxWidth = '100vw';
        img.style.maxHeight = '100vh';
        img.style.position = 'absolute';
        img.style.left = '50%';
        img.style.top = '50%';
        img.style.transform = 'translate(-50%, -50%)';
        img.style.cursor = 'zoom-in';
        
        (mediaView as HTMLElement).style.overflowX = 'hidden';
        (mediaView as HTMLElement).style.overflowY = 'hidden';
        
        // 等待圖片載入完成後調整大小
        img.onload = () => {
            if (mediaView.clientWidth > mediaView.clientHeight) {
                if (img.naturalHeight < mediaView.clientHeight) {
                    img.style.height = '100%';
                }
            } else {
                if (img.naturalWidth < mediaView.clientWidth) {
                    img.style.width = '100%';
                }
            }
        };
        
        // 如果圖片已經載入，立即調整大小
        if (img.complete) {
            if (mediaView.clientWidth > mediaView.clientHeight) {
                if (img.naturalHeight < mediaView.clientHeight) {
                    img.style.height = '100%';
                }
            } else {
                if (img.naturalWidth < mediaView.clientWidth) {
                    img.style.width = '100%';
                }
            }
        }
    }

    // 切換圖片縮放
    toggleImageZoom(img: HTMLImageElement) {
        const mediaView = this.contentEl.querySelector('.ge-media-view');
        if (!mediaView) return;
        
        if (!this.isZoomed) { // 放大
            if (mediaView.clientWidth > mediaView.clientHeight) {
                if (img.naturalHeight < mediaView.clientHeight) {
                    img.style.maxWidth = 'none';
                }
            } else {
                if (img.naturalWidth < mediaView.clientWidth) {
                    img.style.maxHeight = 'none';
                }
            }

            if (img.offsetWidth < mediaView.clientWidth) {
                img.style.width = '100vw';
                img.style.height = 'auto';
                (mediaView as HTMLElement).style.overflowX = 'hidden';
                (mediaView as HTMLElement).style.overflowY = 'scroll';
            } else {
                img.style.width = 'auto';
                img.style.height = '100vh';
                (mediaView as HTMLElement).style.overflowX = 'scroll';
                (mediaView as HTMLElement).style.overflowY = 'hidden';

                // 將事件處理程序存儲在變數中
                this.handleWheel = (event) => {
                    event.preventDefault();
                    (mediaView as HTMLElement).scrollLeft += event.deltaY;
                };
                mediaView.addEventListener('wheel', this.handleWheel);
            }
            
            img.style.maxWidth = 'none';
            img.style.maxHeight = 'none';
            img.style.position = 'relative';
            img.style.left = '0';
            img.style.top = '0';
            img.style.margin = 'auto';
            img.style.transform = 'none';
            img.style.cursor = 'zoom-out';
            this.isZoomed = true;
        } else { // 縮小
            // 如果存在之前的滾輪事件處理程序，先移除它
            if (this.handleWheel) {
                mediaView.removeEventListener('wheel', this.handleWheel);
                this.handleWheel = null;
            }
            
            this.resetImageStyles(img);
            this.isZoomed = false;
        }
    }
}
