import { App, TFile, setIcon } from 'obsidian';

export class FloatingAudioPlayer {
    private app: App;
    private currentFile: TFile;
    private containerEl: HTMLElement;
    private audioEl: HTMLAudioElement;
    private titleEl: HTMLElement;
    private closeButtonEl: HTMLElement;
    private handleEl: HTMLElement;

    private isDragging = false;
    private offsetX = 0;
    private offsetY = 0;
    private isTouchEvent = false;

    // 使用靜態 Map 來追蹤已開啟的播放器實例 (以檔案路徑為 key)
    private static players: Map<string, FloatingAudioPlayer> = new Map();

    // --- Private Event Handlers (Bound) ---
    private boundHandleDragStartMouse: (e: MouseEvent) => void;
    private boundHandleDragStartTouch: (e: TouchEvent) => void;
    private boundHandleDragMoveMouse: (e: MouseEvent) => void;
    private boundHandleDragMoveTouch: (e: TouchEvent) => void;
    private boundHandleDragEndMouse: () => void;
    private boundHandleDragEndTouch: () => void;
    private boundClose: () => void;

    private constructor(app: App, file: TFile) {
        this.app = app;
        this.currentFile = file;

        // 綁定事件處理器
        this.boundHandleDragStartMouse = this.handleDragStartMouse.bind(this);
        this.boundHandleDragStartTouch = this.handleDragStartTouch.bind(this);
        this.boundHandleDragMoveMouse = this.handleDragMoveMouse.bind(this);
        this.boundHandleDragMoveTouch = this.handleDragMoveTouch.bind(this);
        this.boundHandleDragEndMouse = this.handleDragEndMouse.bind(this);
        this.boundHandleDragEndTouch = this.handleDragEndTouch.bind(this);
        this.boundClose = this.close.bind(this);

        this.buildUI();
        this.setupDragEvents();
    }

    // --- 靜態方法：開啟或取得播放器 ---
    public static open(app: App, file: TFile): FloatingAudioPlayer {
        // 檢查是否已有相同檔案的播放器
        if (FloatingAudioPlayer.players.has(file.path)) {
            const existingPlayer = FloatingAudioPlayer.players.get(file.path)!;
            existingPlayer.focus(); // 聚焦到現有播放器
            return existingPlayer;
        }

        // 檢查是否有其他播放器存在
        if (FloatingAudioPlayer.players.size > 0) {
            // 更新第一個找到的播放器
            const firstPlayer = FloatingAudioPlayer.players.values().next().value as FloatingAudioPlayer;
            firstPlayer.updatePlayer(file);
            firstPlayer.focus();
            return firstPlayer;
        }

        // 創建新的播放器
        const newPlayer = new FloatingAudioPlayer(app, file);
        FloatingAudioPlayer.players.set(file.path, newPlayer);
        newPlayer.show(); // 顯示並播放
        return newPlayer;
    }

    // --- Private UI 和事件設定方法 ---
    private buildUI(): void {
        this.containerEl = document.createElement('div');
        this.containerEl.className = 'ge-floating-audio-player';
        this.containerEl.setAttribute('data-file', this.currentFile.path);

        this.audioEl = document.createElement('audio');
        this.audioEl.controls = true;
        this.audioEl.src = this.app.vault.getResourcePath(this.currentFile);

        this.titleEl = document.createElement('div');
        this.titleEl.className = 'ge-audio-title';
        this.titleEl.textContent = this.currentFile.basename;

        this.closeButtonEl = document.createElement('div');
        this.closeButtonEl.className = 'ge-audio-close-button';
        setIcon(this.closeButtonEl, 'x');
        this.closeButtonEl.addEventListener('click', this.boundClose);

        this.handleEl = document.createElement('div');
        this.handleEl.className = 'ge-audio-handle';

        this.containerEl.appendChild(this.handleEl);
        this.containerEl.appendChild(this.titleEl);
        this.containerEl.appendChild(this.audioEl);
        this.containerEl.appendChild(this.closeButtonEl);
    }

    private setupDragEvents(): void {
        this.handleEl.addEventListener('mousedown', this.boundHandleDragStartMouse);
        this.handleEl.addEventListener('touchstart', this.boundHandleDragStartTouch, { passive: true });

        document.addEventListener('mousemove', this.boundHandleDragMoveMouse);
        document.addEventListener('touchmove', this.boundHandleDragMoveTouch, { passive: false });

        document.addEventListener('mouseup', this.boundHandleDragEndMouse);
        document.addEventListener('touchend', this.boundHandleDragEndTouch);
    }

    private removeDragEvents(): void {
        this.handleEl.removeEventListener('mousedown', this.boundHandleDragStartMouse);
        this.handleEl.removeEventListener('touchstart', this.boundHandleDragStartTouch);

        document.removeEventListener('mousemove', this.boundHandleDragMoveMouse);
        document.removeEventListener('touchmove', this.boundHandleDragMoveTouch);

        document.removeEventListener('mouseup', this.boundHandleDragEndMouse);
        document.removeEventListener('touchend', this.boundHandleDragEndTouch);
    }

    // --- Private 事件處理器 ---
    private handleDragStartMouse(e: MouseEvent): void {
        if (this.isTouchEvent) return;
        this.isDragging = true;
        this.offsetX = e.clientX - this.containerEl.getBoundingClientRect().left;
        this.offsetY = e.clientY - this.containerEl.getBoundingClientRect().top;
        this.containerEl.classList.add('ge-audio-dragging');
    }

    private handleDragStartTouch(e: TouchEvent): void {
        this.isTouchEvent = true;
        this.isDragging = true;
        const touch = e.touches[0];
        this.offsetX = touch.clientX - this.containerEl.getBoundingClientRect().left;
        this.offsetY = touch.clientY - this.containerEl.getBoundingClientRect().top;
        this.containerEl.classList.add('ge-audio-dragging');
    }

    private handleDragMoveMouse(e: MouseEvent): void {
        if (!this.isDragging || this.isTouchEvent) return;
        this.movePlayer(e.clientX, e.clientY);
    }

    private handleDragMoveTouch(e: TouchEvent): void {
        if (!this.isDragging) return;
        const touch = e.touches[0];
        this.movePlayer(touch.clientX, touch.clientY);
        e.preventDefault(); // 防止頁面滾動
    }

    private handleDragEndMouse(): void {
        if (this.isTouchEvent) return;
        this.isDragging = false;
        this.containerEl.classList.remove('ge-audio-dragging');
    }

    private handleDragEndTouch(): void {
        this.isDragging = false;
        this.isTouchEvent = false; // 重置觸控標記
        this.containerEl.classList.remove('ge-audio-dragging');
    }

    private movePlayer(clientX: number, clientY: number): void {
        const x = clientX - this.offsetX;
        const y = clientY - this.offsetY;
        this.containerEl.style.left = `${x}px`;
        this.containerEl.style.top = `${y}px`;
    }

    // --- Public 方法 ---
    public show(): void {
        document.body.appendChild(this.containerEl);

        // 設定初始位置（右下角）
        const rect = this.containerEl.getBoundingClientRect();
        this.containerEl.style.left = `${window.innerWidth - rect.width - 20}px`;
        this.containerEl.style.top = `${window.innerHeight - rect.height - 20}px`;

        this.audioEl.play();
    }

    public close(): void {
        this.removeDragEvents(); // 清理事件監聽器
        this.containerEl.remove(); // 從 DOM 移除
        FloatingAudioPlayer.players.delete(this.currentFile.path); // 從靜態 Map 移除
    }

    public focus(): void {
        this.containerEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // 可以考慮添加一些視覺提示，例如短暫閃爍邊框
        this.containerEl.style.transition = 'box-shadow 0.1s ease-in-out';
        this.containerEl.style.boxShadow = '0 0 10px 2px var(--interactive-accent)';
        setTimeout(() => {
            this.containerEl.style.boxShadow = '';
        }, 300);
    }

    // 更新播放器以播放新檔案
    public updatePlayer(newFile: TFile): void {
        // 從 Map 中移除舊的 key
        FloatingAudioPlayer.players.delete(this.currentFile.path);
        // 更新檔案引用和 Map 中的新 key
        this.currentFile = newFile;
        FloatingAudioPlayer.players.set(this.currentFile.path, this);

        // 更新 UI
        this.containerEl.setAttribute('data-file', this.currentFile.path);
        this.audioEl.src = this.app.vault.getResourcePath(this.currentFile);
        this.titleEl.textContent = this.currentFile.basename;
        this.audioEl.play();
    }
}
