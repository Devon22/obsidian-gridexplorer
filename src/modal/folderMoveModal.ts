import { SuggestModal, TFolder, normalizePath, Notice } from 'obsidian';
import GridExplorerPlugin from '../main';
import { GridView } from '../GridView';

export class showFolderMoveModal extends SuggestModal<string> {
    private readonly allPaths: string[];

    constructor(
        private readonly plugin: GridExplorerPlugin,
        private readonly folder: TFolder,
        private readonly gridView: GridView
    ) {
        super(plugin.app);
        // 預先快取所有資料夾路徑以加速篩選
        this.allPaths = this.app.vault.getAllFolders().map(f => f.path).sort((a, b) => a.localeCompare(b));
        this.setPlaceholder('/');
        // 自動聚焦輸入框，讓使用者可以直接打字
        this.inputEl.focus();
    }

    getSuggestions(query: string): string[] {
        const lower = query.toLowerCase();
        const filtered = this.allPaths.filter(p => p.toLowerCase().includes(lower));
        if ('/'.includes(lower) && !filtered.includes('/')) {
            // 始終允許根目錄
            filtered.unshift('/');
        }
        return filtered;
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        el.setText(value);
    }

    async onChooseSuggestion(value: string): Promise<void> {
        try {
            const dest = value === '/' ? '' : value.replace(/\/$/, '');
            const newPath = normalizePath(dest ? `${dest}/${this.folder.name}` : this.folder.name);
            if (newPath === this.folder.path) return;

            await this.app.fileManager.renameFile(this.folder, newPath);
            // 給檔案系統一點時間處理，然後重新整理視圖
            setTimeout(() => {
                if (!this.plugin.settings.showFolder) {
                    this.gridView.setSource('folder', newPath || '/');
                } else {
                    this.gridView.render();
                }
            }, 100);
        } catch (err) {
            new Notice('Failed to move folder');
            console.error('Failed to move folder', err);
        }
    }
}
