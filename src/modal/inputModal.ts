import { App, Modal } from 'obsidian';
import { t } from '../translations';

interface InputModalOptions {
    title: string;
    placeholder: string;
    defaultValue?: string;
    inputType?: 'text' | 'url';
    onSubmit: (value: string) => void;
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
                this.options.onSubmit(value);
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
export function showSearchInputModal(app: App, onSubmit: (searchText: string) => void) {
    new InputModal(app, {
        title: t('search_text'),
        placeholder: t('enter_search_text'),
        onSubmit
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