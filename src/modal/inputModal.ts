import { App, Modal } from 'obsidian';
import { t } from '../translations';

export interface SearchOptions {
    searchCurrentLocationOnly: boolean;
    searchFilesNameOnly: boolean;
    searchMediaFiles: boolean;
}

interface InputModalOptions {
    title: string;
    placeholder: string;
    defaultValue?: string;
    inputType?: 'text' | 'url';
    onSubmit: (value: string, searchOptions?: SearchOptions) => void;
    showSearchOptions?: boolean;
}

export class InputModal extends Modal {
    options: InputModalOptions;

    constructor(app: App, options: InputModalOptions) {
        super(app);
        this.options = options;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // 添加標題
        contentEl.createEl('h2', { text: this.options.title });

        // 創建輸入框容器
        const inputContainer = contentEl.createDiv('ge-input-field-container');
        
        // 創建輸入框
        const input = inputContainer.createEl('input', {
            type: this.options.inputType || 'text',
            value: this.options.defaultValue || '',
            placeholder: this.options.placeholder,
            cls: 'ge-input-field'
        });

        // 如果是搜尋文字，添加搜尋選項
        let searchOptions: SearchOptions = {
            searchCurrentLocationOnly: false,
            searchFilesNameOnly: false,
            searchMediaFiles: false
        };

        if (this.options.showSearchOptions || this.options.title === t('search_text')) {
            const searchOptionsContainer = contentEl.createDiv('ge-search-options');
            
            // 僅搜尋目前位置檔案選項
            const searchScopeContainer = searchOptionsContainer.createDiv('ge-search-option');
            const searchScopeCheckbox = searchScopeContainer.createEl('input', {
                type: 'checkbox',
                attr: { 
                    id: 'searchCurrentLocationOnly'
                }
            }) as HTMLInputElement;
            if (searchOptions.searchCurrentLocationOnly) {
                searchScopeCheckbox.checked = true;
            }
            const searchScopeLabel = searchScopeContainer.createEl('label', { text: t('search_current_location_only') });
            searchScopeLabel.setAttribute('for', 'searchCurrentLocationOnly');

            // 只搜尋檔名選項
            const searchNameContainer = searchOptionsContainer.createDiv('ge-search-option');
            const searchNameCheckbox = searchNameContainer.createEl('input', {
                type: 'checkbox',
                attr: { 
                    id: 'searchFilesNameOnly'
                }
            }) as HTMLInputElement;
            if (searchOptions.searchFilesNameOnly) {
                searchNameCheckbox.checked = true;
            }
            const searchNameLabel = searchNameContainer.createEl('label', { text: t('search_files_name_only') });
            searchNameLabel.setAttribute('for', 'searchFilesNameOnly');

            // 搜尋媒體檔案選項
            const searchMediaFilesContainer = searchOptionsContainer.createDiv('ge-search-option');
            const searchMediaFilesCheckbox = searchMediaFilesContainer.createEl('input', {
                type: 'checkbox',
                attr: { 
                    id: 'searchMediaFiles'
                }
            }) as HTMLInputElement;
            if (searchOptions.searchMediaFiles) {
                searchMediaFilesCheckbox.checked = true;
            }
            const searchMediaFilesLabel = searchMediaFilesContainer.createEl('label', { text: t('search_media_files') });
            searchMediaFilesLabel.setAttribute('for', 'searchMediaFiles');

            // 更新搜尋選項
            const updateSearchOptions = () => {
                searchOptions = {
                    searchCurrentLocationOnly: searchScopeCheckbox.checked,
                    searchFilesNameOnly: searchNameCheckbox.checked,
                    searchMediaFiles: searchMediaFilesCheckbox.checked
                };
            };

            // 添加事件監聽器
            searchScopeCheckbox.addEventListener('change', updateSearchOptions);
            searchNameCheckbox.addEventListener('change', updateSearchOptions);
            searchMediaFilesCheckbox.addEventListener('change', updateSearchOptions);
        }

        // 創建按鈕容器
        const buttonContainer = contentEl.createDiv('ge-button-container');

        // 創建確認按鈕
        const submitButton = buttonContainer.createEl('button', {
            text: t('confirm'),
            cls: 'mod-cta'
        });

        // 創建取消按鈕
        const cancelButton = buttonContainer.createEl('button', {
            text: t('cancel')
        });

        // 執行提交的函數
        const performSubmit = () => {
            const value = input.value.trim();
            if (value) {
                if (this.options.showSearchOptions || this.options.title === t('search_text')) {
                    this.options.onSubmit(value, searchOptions);
                } else {
                    this.options.onSubmit(value);
                }
                this.close();
            }
        };

        // 綁定事件
        submitButton.addEventListener('click', performSubmit);
        
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSubmit();
            }
        });

        cancelButton.addEventListener('click', () => {
            this.close();
        });

        // 自動聚焦到輸入框
        input.focus();
        input.select();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// 便利函數：顯示搜尋輸入 modal
export function showSearchInputModal(app: App, onSubmit: (searchText: string, searchOptions?: SearchOptions) => void) {
    new InputModal(app, {
        title: t('search_text'),
        placeholder: t('enter_search_text'),
        onSubmit,
        showSearchOptions: true
    }).open();
}

// 便利函數：顯示 URI 輸入 modal
export function showUriInputModal(app: App, onSubmit: (uri: string) => void) {
    new InputModal(app, {
        title: t('enter_uri'),
        placeholder: t('enter_uri_placeholder'),
        inputType: 'url',
        onSubmit
    }).open();
}