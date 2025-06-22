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

        // 建立標籤建議容器
        const tagSuggestionContainer = contentEl.createDiv('ge-tag-suggestions');
        tagSuggestionContainer.style.display = 'none';

        // 取得並快取所有標籤 (移除 # 前綴)
        const allTagsArr: string[] = Object.keys(((this.app.metadataCache as any).getTags?.() || {})).map((t) => t.substring(1));

        let tagSuggestions: string[] = [];
        let selectedSuggestionIndex = -1;

        const updateTagSuggestions = () => {
            const match = searchInput.value.substring(0, searchInput.selectionStart || 0).match(/#([^#\s]*)$/);
            if (!match) {
                tagSuggestionContainer.style.display = 'none';
                tagSuggestionContainer.empty();
                selectedSuggestionIndex = -1;
                return;
            }
            const query = match[1].toLowerCase();
            tagSuggestions = allTagsArr.filter((t) => t.toLowerCase().startsWith(query)).slice(0, 10);

            if (tagSuggestions.length === 0) {
                tagSuggestionContainer.style.display = 'none';
                selectedSuggestionIndex = -1;
                return;
            }

            tagSuggestionContainer.empty();
            tagSuggestions.forEach((tag, idx) => {
                const item = tagSuggestionContainer.createDiv('ge-tag-suggestion-item');
                item.textContent = `#${tag}`;
                if (idx === selectedSuggestionIndex) item.addClass('is-selected');
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    applySuggestion(idx);
                });
            });
            tagSuggestionContainer.style.display = 'block';
        };

        const applySuggestion = (index: number) => {
            if (index < 0 || index >= tagSuggestions.length) return;
            const value = searchInput.value;
            const cursor = searchInput.selectionStart || 0;
            const beforeMatch = value.substring(0, cursor).replace(/#([^#\\s]*)$/, `#${tagSuggestions[index]} `);
            const afterCursor = value.substring(cursor);
            searchInput.value = beforeMatch + afterCursor;
            const newCursorPos = beforeMatch.length;
            searchInput.setSelectionRange(newCursorPos, newCursorPos);
            tagSuggestionContainer.style.display = 'none';
            tagSuggestionContainer.empty();
            selectedSuggestionIndex = -1;
            clearButton.style.display = searchInput.value ? 'flex' : 'none';
        };

        // 監聽輸入框變化來控制清空按鈕的顯示並更新標籤建議
        searchInput.addEventListener('input', () => {
            clearButton.style.display = searchInput.value ? 'flex' : 'none';
            updateTagSuggestions();
        });

        // 處理上下鍵及 Enter 選擇建議
        searchInput.addEventListener('keydown', (e) => {
            if (tagSuggestionContainer.style.display === 'none') return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedSuggestionIndex = (selectedSuggestionIndex + 1) % tagSuggestions.length;
                updateTagSuggestions();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedSuggestionIndex = (selectedSuggestionIndex - 1 + tagSuggestions.length) % tagSuggestions.length;
                updateTagSuggestions();
            } else if (e.key === 'Enter') {
                if (selectedSuggestionIndex >= 0) {
                    e.preventDefault();
                    applySuggestion(selectedSuggestionIndex);
                }
            }
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
        // 隨機筆記模式下，搜尋範圍設定不顯示
        if (this.gridView.sourceMode === 'random-note') {
            searchScopeContainer.style.display = 'none';
            searchScopeCheckbox.checked = false;
        }

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
        // 如果設定中的顯示媒體檔案為false，或在反向連結模式下，則隱藏搜尋媒體檔案設定
        if (!this.gridView.plugin.settings.showMediaFiles || this.gridView.sourceMode === 'backlinks') {
            searchMediaFilesContainer.style.display = 'none';
            searchMediaFilesCheckbox.checked = false;
            this.gridView.searchMediaFiles = false;
        }

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
    }
}

// 顯示搜尋 modal
export function showSearchModal(app:App, gridView: GridView, defaultQuery = '') {
    new SearchModal(app, gridView, defaultQuery).open();
}
