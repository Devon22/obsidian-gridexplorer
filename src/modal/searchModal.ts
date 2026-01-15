import { App, Modal, Setting, setIcon } from 'obsidian';
import { GridView } from '../GridView';
import { t } from '../translations';

export class SearchModal extends Modal {
    gridView: GridView;
    defaultQuery: string;
    buttonElement: HTMLElement | undefined;
    constructor(app: App, gridView: GridView, defaultQuery: string, buttonElement?: HTMLElement) {
        super(app);
        this.gridView = gridView;
        this.defaultQuery = defaultQuery;
        this.buttonElement = buttonElement;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        // 如果有提供按鈕元素，則設置為 popup 樣式
        if (this.buttonElement) {
            this.modalEl.addClass('ge-popup-modal');
            this.positionAsPopup();
        }

        // 創建搜尋輸入框容器
        const searchContainer = contentEl.createDiv('ge-search-container');

        // 創建搜尋輸入框容器
        const searchInputWrapper = searchContainer.createDiv('ge-search-input-wrapper');
        
        // 創建標籤顯示區域
        const tagDisplayArea = searchInputWrapper.createDiv('ge-search-tag-display-area');
        
        // 創建搜尋輸入框
        const searchInput = searchInputWrapper.createEl('input', {
            type: 'text',
            value: this.defaultQuery,
            placeholder: t('search_placeholder'),
            cls: 'ge-search-input'
        });

        // 創建輸入框容器包裝層
        const inputContainer = searchInputWrapper.createDiv('ge-input-container');
        
        // 將輸入框移動到容器中
        inputContainer.appendChild(searchInput);
        
        // 創建清空按鈕
        const clearButton = inputContainer.createDiv('ge-search-clear-button'); //這裡不是用 ge-clear-button
        clearButton.style.display = this.defaultQuery ? 'flex' : 'none';
        setIcon(clearButton, 'x');

        // 建立標籤建議容器
        const tagSuggestionContainer = contentEl.createDiv('ge-search-tag-suggestions');
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
            const filteredTags = allTagsArr.filter((t) => t.toLowerCase().includes(query));
            
            // 排序：優先顯示前綴匹配的標籤，其次按字母順序排序
            tagSuggestions = filteredTags.sort((a, b) => {
                const aLower = a.toLowerCase();
                const bLower = b.toLowerCase();
                const aStartsWith = aLower.startsWith(query);
                const bStartsWith = bLower.startsWith(query);
                
                if (aStartsWith && !bStartsWith) return -1;
                if (!aStartsWith && bStartsWith) return 1;
                return aLower.localeCompare(bLower);
            }).slice(0, 10);

            if (tagSuggestions.length === 0) {
                tagSuggestionContainer.style.display = 'none';
                selectedSuggestionIndex = -1;
                return;
            }

            tagSuggestionContainer.empty();
            tagSuggestions.forEach((tag, idx) => {
                const item = tagSuggestionContainer.createDiv('ge-search-tag-suggestion-item');
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
            const value = searchInput.value.trim();
            const cursor = searchInput.selectionStart || 0;
            const beforeMatch = value.substring(0, cursor).replace(/#([^#\\s]*)$/, `#${tagSuggestions[index]} `);
            const afterCursor = value.substring(cursor);
            searchInput.value = beforeMatch + afterCursor;
            searchInput.value = searchInput.value.trim();
            const newCursorPos = beforeMatch.length;
            searchInput.setSelectionRange(newCursorPos, newCursorPos);
            tagSuggestionContainer.style.display = 'none';
            tagSuggestionContainer.empty();
            selectedSuggestionIndex = -1;
            clearButton.style.display = searchInput.value ? 'flex' : 'none';
            
            // 更新標籤按鈕顯示
            renderTagButtons();
        };

        // 監聽輸入框變化來控制清空按鈕的顯示並更新標籤建議
        searchInput.addEventListener('input', () => {
            clearButton.style.display = searchInput.value ? 'flex' : 'none';
            updateTagSuggestions();
            renderTagButtons();
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
            tagDisplayArea.empty();
            tagDisplayArea.style.display = 'none';
            searchInput.focus();
        });

        const searchOptionsContainer = contentEl.createDiv('ge-search-options-container');

        // 創建搜尋範圍設定
        const searchScopeContainer = searchOptionsContainer.createDiv('ge-search-scope-container');
        const searchScopeCheckbox = searchScopeContainer.createEl('input', {
            type: 'checkbox',
            cls: 'ge-search-scope-checkbox'
        });
        searchScopeCheckbox.checked = this.gridView.searchCurrentLocationOnly;
        searchScopeContainer.createEl('span', {
            text: t('search_current_location_only'),
            cls: 'ge-search-scope-label'
        });
        // 隨機筆記模式下，搜尋範圍設定不顯示
        if (this.gridView.sourceMode === 'random-note') {
            searchScopeContainer.style.display = 'none';
            searchScopeCheckbox.checked = false;
        }

        // 創建只搜尋檔案名稱設定
        const searchNameContainer = searchOptionsContainer.createDiv('ge-search-name-container');
        const searchNameCheckbox = searchNameContainer.createEl('input', {
            type: 'checkbox',
            cls: 'ge-search-name-checkbox'
        });
        searchNameCheckbox.checked = this.gridView.searchFilesNameOnly;
        searchNameContainer.createEl('span', {
            text: t('search_files_name_only'),
            cls: 'ge-search-name-label'
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
                this.gridView.searchCurrentLocationOnly = !searchScopeCheckbox.checked;
            }
        });
        searchNameContainer.addEventListener('click', (e) => {
            if (e.target !== searchNameCheckbox) {
                searchNameCheckbox.checked = !searchNameCheckbox.checked;
                this.gridView.searchFilesNameOnly = !searchNameCheckbox.checked;
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
            this.gridView.searchCurrentLocationOnly = !searchScopeCheckbox.checked;
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

        // 解析輸入內容並渲染成按鈕
        const renderTagButtons = () => {
            // 清空現有標籤顯示區域
            tagDisplayArea.empty();
            
            // 獲取輸入值
            const inputValue = searchInput.value.trim();
            
            // 如果輸入為空，隱藏標籤顯示區域
            if (!inputValue) {
                tagDisplayArea.style.display = 'none';
                return;
            }
            
            // 使用空格分割輸入內容
            const terms = inputValue.split(/\s+/);
            
            // 如果沒有分割出任何詞彙，隱藏標籤顯示區域
            if (terms.length === 0) {
                tagDisplayArea.style.display = 'none';
                return;
            }
            
            // 顯示標籤顯示區域
            tagDisplayArea.style.display = 'flex';
            
            // 分析輸入內容中各詞彙的位置
            let currentIndex = 0;
            const termPositions: {term: string, startIndex: number, endIndex: number}[] = [];
            
            terms.forEach(term => {
                if (!term) return; // 跳過空詞彙
                
                // 尋找該詞彙在原始輸入中的位置
                const startIndex = inputValue.indexOf(term, currentIndex);
                if (startIndex === -1) return; // 如果找不到，跳過
                
                const endIndex = startIndex + term.length;
                
                termPositions.push({
                    term: term,
                    startIndex: startIndex,
                    endIndex: endIndex
                });
                
                currentIndex = endIndex;
            });
            
            // 為每個詞彙創建按鈕
            termPositions.forEach(termInfo => {
                const tagButton = tagDisplayArea.createDiv('ge-search-tag-button');
                tagButton.textContent = termInfo.term;
                
                // 判斷是否為標籤，如果是則添加特殊樣式
                if (termInfo.term.startsWith('#')) {
                    tagButton.addClass('is-tag');
                }
                
                // 創建刪除按鈕
                const deleteButton = tagButton.createDiv('ge-search-tag-delete-button');
                setIcon(deleteButton, 'x');
                
                // 點擊刪除按鈕時從輸入框中移除該詞彙
                deleteButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const newValue = 
                        inputValue.substring(0, termInfo.startIndex) + 
                        inputValue.substring(termInfo.endIndex);
                    searchInput.value = newValue.trim();
                    
                    // 觸發輸入事件以更新UI
                    const inputEvent = new Event('input', { bubbles: true });
                    searchInput.dispatchEvent(inputEvent);
                    
                    // 聚焦回輸入框
                    searchInput.focus();
                });
            });
        };

        // 先保存開啟 Modal 時的原始狀態
        const originalSearchQuery = this.gridView.searchQuery;
        const originalsearchCurrentLocationOnly = this.gridView.searchCurrentLocationOnly;
        const originalSearchFilesNameOnly = this.gridView.searchFilesNameOnly;
        const originalSearchMediaFiles = this.gridView.searchMediaFiles;

        // 綁定搜尋事件
        const performSearch = () => {
            // 在執行新搜尋之前，將當前狀態寫入歷史
            this.gridView.pushHistory(
                this.gridView.sourceMode,
                this.gridView.sourcePath,
                originalSearchQuery,
                originalsearchCurrentLocationOnly,
                originalSearchFilesNameOnly,
                originalSearchMediaFiles,
            );
            this.gridView.searchQuery = searchInput.value;
            this.gridView.searchCurrentLocationOnly = searchScopeCheckbox.checked;
            this.gridView.searchFilesNameOnly = searchNameCheckbox.checked;
            this.gridView.searchMediaFiles = searchMediaFilesCheckbox.checked;
            this.gridView.clearSelection();
            this.gridView.app.workspace.requestSaveLayout();
            this.gridView.render();
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

        // 初始渲染標籤按鈕
        renderTagButtons();
        
        // 自動聚焦到搜尋輸入框，並將游標移到最後
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }

    private positionAsPopup() {
        if (!this.buttonElement) return;

        const modalEl = this.modalEl;
        const contentEl = this.contentEl;

        // 設置 modal 的基本樣式
        modalEl.addClass('ge-popup-modal-reset');

        // 添加 popup 內容樣式類別
        contentEl.addClass('ge-popup-content');

        // 計算按鈕位置
        const buttonRect = this.buttonElement.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // 設置初始位置（按鈕下方）
        let top = buttonRect.bottom + 4;
        let left = buttonRect.left + (buttonRect.width / 2) - 150; // 300px 寬度的一半

        // 檢查右側邊界
        if (left + 300 > viewportWidth) {
            left = viewportWidth - 300 - 10;
        }

        // 檢查左側邊界
        if (left < 10) {
            left = 10;
        }

        // 檢查下方空間，如果不夠則顯示在上方
        const estimatedHeight = 400; // 預估高度
        if (top + estimatedHeight > viewportHeight && buttonRect.top - estimatedHeight > 0) {
            top = buttonRect.top - estimatedHeight - 4;
        }

        // 應用位置
        modalEl.style.position = 'fixed';
        modalEl.style.top = `${top}px`;
        modalEl.style.left = `${left}px`;
        modalEl.style.transform = 'none';
    }
}

// 顯示搜尋 modal
export function showSearchModal(app:App, gridView: GridView, defaultQuery = '', buttonElement?: HTMLElement) {
    new SearchModal(app, gridView, defaultQuery, buttonElement).open();
}
