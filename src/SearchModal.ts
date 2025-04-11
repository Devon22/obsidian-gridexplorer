import { App, Modal, Setting } from 'obsidian';
import { setIcon } from 'obsidian';
import { t } from './translations';
import { GridView } from './GridView';

export class SearchModal extends Modal {
    gridView: GridView;
    defaultQuery: string;
    constructor(app: App, gridView: GridView, defaultQuery: string) {
        super(app);
        this.gridView = gridView;
        this.defaultQuery = defaultQuery;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        new Setting(contentEl).setName(t('search')).setHeading();

        // 如果有 GridView 實例，禁用其鍵盤導航
        if (this.gridView) {
            this.gridView.disableKeyboardNavigation();
        }

        // 創建搜尋輸入框容器
        const searchContainer = contentEl.createDiv('ge-search-container');

        // 創建搜尋輸入框
        const searchInput = searchContainer.createEl('input', {
            type: 'text',
            value: this.defaultQuery,
            placeholder: t('search_placeholder')
        });

        // 創建清空按鈕
        const clearButton = searchContainer.createDiv('ge-search-clear-button'); //這裡不是用 ge-clear-button
        clearButton.style.display = this.defaultQuery ? 'flex' : 'none';
        setIcon(clearButton, 'x');

        // 監聽輸入框變化來控制清空按鈕的顯示
        searchInput.addEventListener('input', () => {
            clearButton.style.display = searchInput.value ? 'flex' : 'none';
        });

        // 清空按鈕點擊事件
        clearButton.addEventListener('click', () => {
            searchInput.value = '';
            clearButton.style.display = 'none';
            searchInput.focus();
        });

        const searchOptionsContainer = contentEl.createDiv('ge-search-options-container');

        // 創建搜尋範圍設定
        const searchScopeContainer = searchOptionsContainer.createDiv('ge-search-scope-container');
        const searchScopeCheckbox = searchScopeContainer.createEl('input', {
            type: 'checkbox',
            cls: 'ge-search-scope-checkbox'
        });
        searchScopeCheckbox.checked = !this.gridView.searchAllFiles;
        searchScopeContainer.createEl('span', {
            text: t('search_current_location_only'),
            cls: 'ge-search-scope-label'
        });

        // 創建搜尋媒體檔案設定
        const searchMediaFilesContainer = searchOptionsContainer.createDiv('ge-search-media-files-container');
        const searchMediaFilesCheckbox = searchMediaFilesContainer.createEl('input', {
            type: 'checkbox',
            cls: 'ge-search-media-files-checkbox'
        });
        searchMediaFilesCheckbox.checked = this.gridView.searchMediaFiles;
        searchMediaFilesContainer.createEl('span', {
            text: t('search_media_files'),
            cls: 'ge-search-media-files-label'
        });

        // 點擊容器時切換勾選框狀態
        searchScopeContainer.addEventListener('click', (e) => {
            if (e.target !== searchScopeCheckbox) {
                searchScopeCheckbox.checked = !searchScopeCheckbox.checked;
                this.gridView.searchAllFiles = !searchScopeCheckbox.checked;
            }
        });
        searchMediaFilesContainer.addEventListener('click', (e) => {
            if (e.target !== searchMediaFilesCheckbox) {
                searchMediaFilesCheckbox.checked = !searchMediaFilesCheckbox.checked;
                this.gridView.searchMediaFiles = !searchMediaFilesCheckbox.checked;
            }
        });

        // 勾選框變更時更新搜尋範圍
        searchScopeCheckbox.addEventListener('change', () => {
            this.gridView.searchAllFiles = !searchScopeCheckbox.checked;
        });

        searchMediaFilesCheckbox.addEventListener('change', () => {
            this.gridView.searchMediaFiles = !searchMediaFilesCheckbox.checked;
        });

        // 創建按鈕容器
        const buttonContainer = contentEl.createDiv('ge-button-container');

        // 創建搜尋按鈕
        const searchButton = buttonContainer.createEl('button', {
            text: t('search')
        });

        // 創建取消按鈕
        const cancelButton = buttonContainer.createEl('button', {
            text: t('cancel')
        });

        // 綁定搜尋事件
        const performSearch = () => {
            this.gridView.searchQuery = searchInput.value;
            this.gridView.searchAllFiles = !searchScopeCheckbox.checked;
            this.gridView.searchMediaFiles = searchMediaFilesCheckbox.checked;
            this.gridView.clearSelection();
            this.gridView.render(true);
            // 通知 Obsidian 保存視圖狀態
            this.gridView.app.workspace.requestSaveLayout();
            this.close();
        };

        searchButton.addEventListener('click', performSearch);
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSearch();
            }
        });

        cancelButton.addEventListener('click', () => {
            this.close();
        });

        // 自動聚焦到搜尋輸入框，並將游標移到最後
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();

        // 如果有 GridView 實例，重新啟用其鍵盤導航
        if (this.gridView) {
            this.gridView.enableKeyboardNavigation();
        }
    }
}

// 顯示搜尋 modal
export function showSearchModal(app:App, gridView: GridView, defaultQuery = '') {
    new SearchModal(app, gridView, defaultQuery).open();
}
