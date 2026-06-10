import { App, Modal, Setting, setIcon } from 'obsidian';
import GridExplorerPlugin from '../main';
import { CustomMode, CustomModeOption } from '../settings';
import { t } from '../translations';

export class CustomModeModal extends Modal {
    plugin: GridExplorerPlugin;
    mode: CustomMode | null;
    onSubmit: (result: CustomMode) => void;

    constructor(app: App, plugin: GridExplorerPlugin, mode: CustomMode | null, onSubmit: (result: CustomMode) => void) {
        super(app);
        this.plugin = plugin;
        this.mode = mode;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: this.mode ? t('edit_custom_mode') : t('add_custom_mode') });

        let icon = this.mode ? this.mode.icon : '🧩';
        let displayName = this.mode ? this.mode.displayName : '';
        // 新增名稱欄位，用於原始 dataviewCode 的選項名稱
        let name = this.mode?.name || t('default');
        // 支援多個子選項，每個選項包含名稱與 Dataview 程式碼
        const options: CustomModeOption[] = this.mode?.options ? this.mode.options.map(opt => ({ ...opt })) : []; // 其他選項（不含 Default）
        // 向下相容：使用第一個選項作為主要 dataviewQuery
        let dataviewQuery = this.mode ? this.mode.dataviewQuery : '';
        let enabled = this.mode ? (this.mode.enabled ?? true) : true;
        let fields = this.mode ? this.mode.fields : '';

        new Setting(contentEl)
            .setName(t('custom_mode_display_name'))
            .setDesc(t('custom_mode_display_name_desc'))
            .addText(text => {
                text.setValue(icon)
                    .onChange(value => {
                        icon = value || '🧩';
                    });
                // 設置固定寬度，適合單個圖示
                text.inputEl.addClass('ge-custommode-icon-input');
            })
            .addText(text => {
                text.setValue(displayName)
                    .onChange(value => {
                        displayName = value;
                    });
            });

        const dvSetting = new Setting(contentEl)
            .setName(t('custom_mode_dataview_code'))
            .setDesc(t('custom_mode_dataview_code_desc'));

        // 使標題與描述佔據一行，輸入區域佔據了下一行
        dvSetting.settingEl.addClass('ge-custommode-dataview-setting');

        dvSetting.addText(text => {
            text.setValue(name)
                .setPlaceholder(t('default'))
                .onChange(v => name = v);
        });
        
        // 示範查詢
        const dataviewExampleQuery = 'LIST FROM #tag\nTABLE status FROM "folder" SORT file.mtime DESC'

        dvSetting.addTextArea(text => {
            text.setValue(dataviewQuery)
                .onChange(value => {
                    dataviewQuery = value;
                })
                .setPlaceholder(dataviewExampleQuery);
            // 給TextArea有足夠的垂直空間和完整的寬度
            text.inputEl.setAttr('rows', 4);
            text.inputEl.addClass('ge-custommode-code-input');
        });

        dvSetting.addText(text => {
            text.setValue(fields || '')
                .setPlaceholder(t('custom_mode_fields_placeholder'))
                .onChange(value => {
                    fields = value;
                });
        });

        // 讓 Text 與 TextArea 在 control 區域各佔一行
        dvSetting.controlEl.addClass('ge-custommode-dataview-controls');

        // ===== 選項管理區域 =====
        contentEl.createEl('h3', { text: t('custom_mode_sub_options') });
        const optionsContainer = contentEl.createDiv('ge-custommode-options-container');

        let draggedIndex: number | null = null;
        const expandedStates: boolean[] = [];
        let dropIndicators: HTMLElement[] = [];

        const createDropIndicators = () => {
            // 清除舊的指示線
            dropIndicators.forEach(indicator => indicator.remove());
            dropIndicators = [];
            
            // 為每個位置創建指示線（包括最後一個位置）
            for (let i = 0; i <= options.length; i++) {
                const indicator = optionsContainer.createDiv('ge-custommode-drop-indicator');
                dropIndicators.push(indicator);
            }
        };

        const showDropIndicator = (index: number) => {
            dropIndicators.forEach((indicator, i) => {
                if (i === index) {
                    indicator.classList.add('show');
                } else {
                    indicator.classList.remove('show');
                }
            });
        };

        const hideAllDropIndicators = () => {
            dropIndicators.forEach(indicator => indicator.classList.remove('show'));
        };

        const getDropIndex = (e: DragEvent): number => {
            const containers = Array.from(optionsContainer.querySelectorAll<HTMLElement>('.ge-custommode-option-container'));
            const y = e.clientY;
            
            for (let i = 0; i < containers.length; i++) {
                const container = containers[i];
                const rect = container.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                
                if (y < midY) {
                    return i;
                }
            }
            
            return containers.length; // 插入到最後
        };

        const renderOptions = () => {
            optionsContainer.empty();
            
            // 創建拖放指示線
            createDropIndicators();
            
            options.forEach((opt, idx) => {
                // 初始化展開狀態
                if (expandedStates[idx] === undefined) {
                    expandedStates[idx] = false;
                }
                
                // 在指示線之後插入選項容器
                const optionContainer = activeDocument.createElement('div');
                optionContainer.className = 'ge-custommode-option-container';
                if (expandedStates[idx]) {
                    optionContainer.classList.add('expanded');
                }
                
                // 插入到對應的指示線之後
                optionsContainer.insertBefore(optionContainer, dropIndicators[idx + 1]);
                
                // 設置拖曳屬性
                optionContainer.draggable = false; // 預設關閉，只在拖曳手柄上啟用
                optionContainer.dataset.index = idx.toString();
                
                // 創建標題列
                const headerEl = optionContainer.createDiv('ge-custommode-option-header');
                
                // 拖曳手柄
                const dragHandle = headerEl.createDiv('ge-custommode-option-drag-handle');
                setIcon(dragHandle, 'grip-vertical');
                
                // 選項名稱
                const nameEl = headerEl.createDiv('ge-custommode-option-name');
                nameEl.textContent = opt.name || `${t('option')} ${idx + 1}`;
                
                // 展開/摺疊按鈕
                const toggleEl = headerEl.createDiv('ge-custommode-option-toggle');
                setIcon(toggleEl, 'chevron-right');
                
                // 刪除按鈕
                const deleteEl = headerEl.createDiv('ge-custommode-option-delete');
                setIcon(deleteEl, 'trash-2');
                
                // 內容區域
                const contentEl = optionContainer.createDiv('ge-custommode-option-content');
                const optSetting = new Setting(contentEl);
                
                optSetting
                    .addText(text => {
                        text.setPlaceholder(t('option_name'))
                            .setValue(opt.name)
                            .onChange(val => {
                                opt.name = val;
                                nameEl.textContent = val || `${t('option')} ${idx + 1}`;
                            });
                    })
                    .addTextArea(text => {
                        text.setPlaceholder(dataviewExampleQuery)
                            .setValue(opt.dataviewQuery)
                            .onChange(val => {
                                opt.dataviewQuery = val;
                            });
                        text.inputEl.setAttr('rows', 4);
                        text.inputEl.addClass('ge-custommode-code-input');
                    })
                    .addText(text => {
                        text.setPlaceholder(t('custom_mode_fields_placeholder'))
                            .setValue(opt.fields || '')
                            .onChange(val => {
                                opt.fields = val;
                            });
                    });

                // 點擊標題列展開/摺疊
                headerEl.addEventListener('click', (e) => {
                    // 避免在拖曳手柄和刪除按鈕上觸發
                    if (e.target === dragHandle || dragHandle.contains(e.target as Node) ||
                        e.target === deleteEl || deleteEl.contains(e.target as Node)) {
                        return;
                    }
                    
                    expandedStates[idx] = !expandedStates[idx];
                    if (expandedStates[idx]) {
                        optionContainer.classList.add('expanded');
                    } else {
                        optionContainer.classList.remove('expanded');
                    }
                });

                // 刪除按鈕事件
                deleteEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    options.splice(idx, 1);
                    expandedStates.splice(idx, 1);
                    renderOptions();
                });

                // 拖曳事件監聽器 - 只在拖曳手柄上啟用
                dragHandle.addEventListener('mousedown', () => {
                    optionContainer.draggable = true;
                });

                optionContainer.addEventListener('dragstart', (e) => {
                    draggedIndex = idx;
                    optionContainer.classList.add('dragging');
                    if (e.dataTransfer) {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', idx.toString());
                    }
                });

                optionContainer.addEventListener('dragend', () => {
                    optionContainer.classList.remove('dragging');
                    optionContainer.draggable = false;
                    hideAllDropIndicators();
                    draggedIndex = null;
                });
            });

            // 為整個容器添加拖放事件監聽器
            optionsContainer.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (e.dataTransfer && draggedIndex !== null) {
                    e.dataTransfer.dropEffect = 'move';
                    const dropIndex = getDropIndex(e);
                    showDropIndicator(dropIndex);
                }
            });

            optionsContainer.addEventListener('dragleave', (e) => {
                // 只有當滑鼠離開整個容器時才隱藏指示線
                const rect = optionsContainer.getBoundingClientRect();
                if (e.clientX < rect.left || e.clientX > rect.right || 
                    e.clientY < rect.top || e.clientY > rect.bottom) {
                    hideAllDropIndicators();
                }
            });

            optionsContainer.addEventListener('drop', (e) => {
                e.preventDefault();
                hideAllDropIndicators();
                
                if (draggedIndex !== null) {
                    const dropIndex = getDropIndex(e);
                    
                    if (dropIndex !== draggedIndex && dropIndex !== draggedIndex + 1) {
                        // 保存展開狀態
                        const draggedExpanded = expandedStates[draggedIndex];
                        const draggedOption = options[draggedIndex];
                        if (!draggedOption) {
                            return;
                        }
                        
                        // 從原位置移除
                        options.splice(draggedIndex, 1);
                        expandedStates.splice(draggedIndex, 1);
                        
                        // 計算新的插入位置
                        const newIndex = dropIndex > draggedIndex ? dropIndex - 1 : dropIndex;
                        
                        // 插入到新位置
                        options.splice(newIndex, 0, draggedOption);
                        expandedStates.splice(newIndex, 0, draggedExpanded);
                        
                        // 重新渲染
                        renderOptions();
                    }
                }
            });
        };

        // 新增選項按鈕
        new Setting(contentEl)
            .addButton(btn => {
                btn.setButtonText(t('add_option'))
                    .onClick(() => {
                        options.push({ name: `${t('option')} ${options.length + 1}`, dataviewQuery: '' });
                        renderOptions();
                    });
            });

        renderOptions();

        const saveSetting = new Setting(contentEl);
        saveSetting.settingEl.classList.add('ge-save-footer');
        saveSetting
            .addButton(button => {
                button.setButtonText(t('save'))
                    .setCta()
                    .onClick(() => {
                        if (!displayName.trim()) displayName = t('untitled');
                        const internalName = this.mode ? this.mode.internalName : `custom-${Date.now()}`;
                        this.onSubmit({
                            internalName,
                            icon,
                            displayName,
                            name,
                            dataviewQuery,
                            options: options,
                            enabled,
                            fields
                        });
                        this.close();
                    });
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
