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

        let searchTerms = this.defaultQuery.trim().split(/\s+/).filter(t => t.length > 0);
        let currentInputIndex = searchTerms.length;

        // 創建搜尋輸入框容器
        const searchContainer = contentEl.createDiv('ge-search-container');
        const searchInputWrapper = searchContainer.createDiv('ge-search-input-wrapper');
        
        // 創建輸入框容器包裝層 (合併顯示)
        const inputContainer = searchInputWrapper.createDiv('ge-search-bar');
        
        const flushInput = (appendRemaining = false) => {
            const val = searchInput.value;
            const parts = val.split(/\s+/);
            const completeParts = appendRemaining ? parts.filter(p => p.length > 0) : parts.slice(0, -1).filter(p => p.length > 0);
            const remaining = appendRemaining ? '' : parts[parts.length - 1];
            
            if (completeParts.length > 0) {
                searchTerms.splice(currentInputIndex, 0, ...completeParts);
                currentInputIndex += completeParts.length;
                searchInput.value = remaining;
                return true;
            } else {
                searchInput.value = remaining;
                return false;
            }
        };

        // 點擊容器時聚焦輸入框
        inputContainer.addEventListener('click', (e) => {
            if (e.target === inputContainer) {
                if (currentInputIndex !== searchTerms.length) {
                    flushInput(true);
                    currentInputIndex = searchTerms.length;
                    searchInput.value = '';
                    renderTagButtons();
                }
                searchInput.focus();
            }
        });
        
        // 創建搜尋輸入框
        const searchInput = inputContainer.createEl('input', {
            type: 'text',
            value: '',
            placeholder: searchTerms.length === 0 ? t('search_placeholder') : '',
            cls: 'ge-search-input'
        });
        
        // 創建清空按鈕
        const clearButton = inputContainer.createDiv('ge-search-clear-button');
        clearButton.style.display = searchTerms.length > 0 ? 'flex' : 'none';
        setIcon(clearButton, 'x');

        const updateClearButton = () => {
            const hasContent = searchTerms.length > 0 || searchInput.value.trim().length > 0;
            clearButton.style.display = hasContent ? 'flex' : 'none';
        };

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
            const newTerm = `#${tagSuggestions[index]}`;
            
            const value = searchInput.value;
            const cursor = searchInput.selectionStart || 0;
            const beforeMatch = value.substring(0, cursor).replace(/#([^#\s]*)$/, '');
            const afterCursor = value.substring(cursor);
            
            searchInput.value = beforeMatch + newTerm + ' ' + afterCursor;
            
            flushInput(false);
            
            tagSuggestionContainer.style.display = 'none';
            tagSuggestionContainer.empty();
            selectedSuggestionIndex = -1;
            
            updateClearButton();
            renderTagButtons();
            searchInput.focus();
        };

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

        const optionsList = [searchScopeContainer, searchNameContainer, searchMediaFilesContainer];

        // 監聽輸入框變化來控制清空按鈕的顯示並更新標籤建議
        searchInput.addEventListener('input', () => {
            if (/\s/.test(searchInput.value)) {
                if (flushInput(false)) {
                    renderTagButtons();
                }
            }
            updateClearButton();
            updateTagSuggestions();
        });

        // 處理上下鍵及 Enter 選擇建議
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && searchInput.value === '') {
                if (currentInputIndex > 0) {
                    currentInputIndex--;
                    searchInput.value = searchTerms.splice(currentInputIndex, 1)[0];
                    renderTagButtons();
                    e.preventDefault();
                }
                return;
            }
            if (e.key === 'Delete' && searchInput.value === '') {
                if (currentInputIndex < searchTerms.length) {
                    searchTerms.splice(currentInputIndex, 1);
                    renderTagButtons();
                    e.preventDefault();
                }
                return;
            }
            if (e.key === 'ArrowLeft' && searchInput.selectionStart === 0 && searchInput.selectionEnd === 0) {
                if (currentInputIndex > 0) {
                    flushInput(true);
                    currentInputIndex--;
                    searchInput.value = searchTerms.splice(currentInputIndex, 1)[0];
                    renderTagButtons();
                    e.preventDefault();
                    setTimeout(() => searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length), 0);
                }
                return;
            }
            if (e.key === 'ArrowRight' && searchInput.selectionStart === searchInput.value.length && searchInput.selectionEnd === searchInput.value.length) {
                if (currentInputIndex < searchTerms.length) {
                    flushInput(true);
                    searchInput.value = searchTerms.splice(currentInputIndex, 1)[0];
                    renderTagButtons();
                    e.preventDefault();
                    setTimeout(() => searchInput.setSelectionRange(0, 0), 0);
                }
                return;
            }

            if (tagSuggestionContainer.style.display !== 'none') {
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
            } else {
                if (e.key === 'ArrowDown') {
                    const firstVisible = optionsList.find(o => o.style.display !== 'none');
                    if (firstVisible) {
                        e.preventDefault();
                        firstVisible.focus();
                    }
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    performSearch();
                }
            }
        });

        // 清空按鈕點擊事件
        clearButton.addEventListener('click', () => {
            searchInput.value = '';
            searchTerms = [];
            currentInputIndex = 0;
            updateClearButton();
            renderTagButtons();
            tagSuggestionContainer.style.display = 'none';
            searchInput.focus();
        });
        optionsList.forEach((container, index) => {
            container.setAttribute('tabindex', '0');
            container.addEventListener('keydown', (e) => {
                if (e.key === ' ') {
                    e.preventDefault();
                    container.click();
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    for (let i = index + 1; i < optionsList.length; i++) {
                        if (optionsList[i].style.display !== 'none') {
                            optionsList[i].focus();
                            return;
                        }
                    }
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    for (let i = index - 1; i >= 0; i--) {
                        if (optionsList[i].style.display !== 'none') {
                            optionsList[i].focus();
                            return;
                        }
                    }
                    searchInput.focus();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    performSearch();
                }
            });
        });

        // 點擊容器時切換勾選框狀態
        searchScopeContainer.addEventListener('click', (e) => {
            if (e.target !== searchScopeCheckbox) {
                searchScopeCheckbox.checked = !searchScopeCheckbox.checked;
            }
            this.gridView.searchCurrentLocationOnly = !searchScopeCheckbox.checked;
        });
        searchNameContainer.addEventListener('click', (e) => {
            if (e.target !== searchNameCheckbox) {
                searchNameCheckbox.checked = !searchNameCheckbox.checked;
            }
            this.gridView.searchFilesNameOnly = searchNameCheckbox.checked;
        });
        searchMediaFilesContainer.addEventListener('click', (e) => {
            if (e.target !== searchMediaFilesCheckbox) {
                searchMediaFilesCheckbox.checked = !searchMediaFilesCheckbox.checked;
            }
            this.gridView.searchMediaFiles = searchMediaFilesCheckbox.checked;
        });

        // 勾選框變更時更新搜尋範圍
        searchScopeCheckbox.addEventListener('change', () => {
            this.gridView.searchCurrentLocationOnly = !searchScopeCheckbox.checked;
        });

        searchMediaFilesCheckbox.addEventListener('change', () => {
            this.gridView.searchMediaFiles = searchMediaFilesCheckbox.checked;
        });

        searchNameCheckbox.addEventListener('change', () => {
            this.gridView.searchFilesNameOnly = searchNameCheckbox.checked;
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

        // 創建單一標籤按鈕
        const createTagButton = (term: string, index: number) => {
            const tagDiv = document.createElement('div');
            tagDiv.className = 'ge-search-tag-button';
            if (term.startsWith('#')) {
                tagDiv.classList.add('is-tag');
            }
            tagDiv.textContent = term;
            
            const deleteButton = document.createElement('div');
            deleteButton.className = 'ge-search-tag-delete-button';
            setIcon(deleteButton, 'x');
            tagDiv.appendChild(deleteButton);
            
            // 刪除按鈕
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                searchTerms.splice(index, 1);
                if (index < currentInputIndex) {
                    currentInputIndex--;
                }
                renderTagButtons();
                updateClearButton();
                searchInput.focus();
            });
            
            // 點擊標籤本身轉為編輯狀態
            tagDiv.addEventListener('click', (e) => {
                let targetIndex = index;
                flushInput(true);
                // 調整 targetIndex 因為 flush 可能改變了 searchTerms 的長度與位置
                if (targetIndex >= currentInputIndex && searchTerms.length > index) {
                    // 如果我們插入了新詞彙在 target 之前，target 往後移動
                    // 這裡的邏輯：因為我們用 closure 記錄了原本的 index，
                    // 如果 flushed 在 index 前面，也就是我們剛才正在 index 前面的輸入框打字，
                    // 那麼 flush 會增加 elements 到 currentInputIndex。
                    // 為了簡化，因為 flushInput(true) 已經執行了，我們需要找到這個詞彙
                    // 最簡單的方式是用傳入時綁定的 index 來直接計算偏移
                    targetIndex += (searchTerms.length - searchTerms.length); // logic simplification
                    // Wait, let's trace:
                }
                // Correction on index logic after flush
                // It's safer to just re-evaluate targetIndex by passing the bound index logic
                // Actually the safest is:
            });
            
            // Re-implementing correctly: click event
            tagDiv.addEventListener('click', (e) => {
                let shift = 0;
                const val = searchInput.value;
                const parts = val.split(/\s+/).filter(p => !!p);
                if (parts.length > 0) {
                    shift = parts.length;
                    searchTerms.splice(currentInputIndex, 0, ...parts);
                }
                
                let targetIndex = index;
                if (targetIndex >= currentInputIndex) {
                    targetIndex += shift;
                }
                
                searchInput.value = searchTerms.splice(targetIndex, 1)[0];
                currentInputIndex = targetIndex;
                renderTagButtons();
                updateClearButton();
                searchInput.focus();
            });
            
            return tagDiv;
        };

        // 渲染成按鈕
        const renderTagButtons = () => {
            inputContainer.querySelectorAll('.ge-search-tag-button').forEach(el => el.remove());
            
            if (searchTerms.length === 0 && currentInputIndex === 0) {
                searchInput.placeholder = t('search_placeholder');
            } else {
                searchInput.placeholder = '';
            }
            
            for (let i = 0; i < currentInputIndex; i++) {
                inputContainer.insertBefore(createTagButton(searchTerms[i], i), searchInput);
            }
            
            for (let i = currentInputIndex; i < searchTerms.length; i++) {
                inputContainer.insertBefore(createTagButton(searchTerms[i], i), clearButton);
            }
            
            updateClearButton();
        };

        // 先保存開啟 Modal 時的原始狀態
        const originalSearchQuery = this.gridView.searchQuery;
        const originalsearchCurrentLocationOnly = this.gridView.searchCurrentLocationOnly;
        const originalSearchFilesNameOnly = this.gridView.searchFilesNameOnly;
        const originalSearchMediaFiles = this.gridView.searchMediaFiles;

        // 綁定搜尋事件
        const performSearch = () => {
            flushInput(true);
            
            // 在執行新搜尋之前，將當前狀態寫入歷史
            this.gridView.pushHistory(
                this.gridView.sourceMode,
                this.gridView.sourcePath,
                originalSearchQuery,
                originalsearchCurrentLocationOnly,
                originalSearchFilesNameOnly,
                originalSearchMediaFiles,
            );
            this.gridView.searchQuery = searchTerms.join(' ');
            this.gridView.searchCurrentLocationOnly = searchScopeCheckbox.checked;
            this.gridView.searchFilesNameOnly = searchNameCheckbox.checked;
            this.gridView.searchMediaFiles = searchMediaFilesCheckbox.checked;
            this.gridView.clearSelection();
            this.gridView.app.workspace.requestSaveLayout();
            this.gridView.render();
            this.close();
        };

        searchButton.addEventListener('click', performSearch);

        cancelButton.addEventListener('click', () => {
            this.close();
        });

        // 初始渲染標籤按鈕
        renderTagButtons();
        
        // 自動聚焦到搜尋輸入框
        searchInput.focus();
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
