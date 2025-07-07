import { App, PluginSettingTab, Setting, AbstractInputSuggest, Notice, ButtonComponent } from 'obsidian';
import GridExplorerPlugin from '../main';
import { CustomModeModal } from './modal/customModeModal';
import { t } from './translations';

export interface CustomModeOption {
    name: string;
    dataviewCode: string;
}

export interface CustomMode {
    internalName: string;
    icon: string;
    displayName: string;
    name: string;
    dataviewCode: string;
    options?: CustomModeOption[];
    enabled?: boolean; // 是否顯示此自訂模式，預設為 true
}

export interface GallerySettings {
    ignoredFolders: string[]; // 要忽略的資料夾路徑
    ignoredFolderPatterns: string[]; // 要忽略的資料夾模式
    defaultSortType: string; // 預設排序模式
    gridItemWidth: number; // 網格項目寬度
    gridItemHeight: number; // 網格項目高度
    imageAreaWidth: number; // 圖片區域寬度
    imageAreaHeight: number; // 圖片區域高度
    titleFontSize: number; // 筆記標題的字型大小
    summaryLength: number; // 筆記摘要的字數
    enableFileWatcher: boolean; // 是否啟用檔案監控
    showMediaFiles: boolean; // 是否顯示圖片和影片
    showVideoThumbnails: boolean; // 是否顯示影片縮圖
    defaultOpenLocation: string; // 預設開啟位置
    reuseExistingLeaf: boolean; // 是否重用現有的網格視圖
    showBookmarksMode: boolean; // 是否顯示書籤模式
    showSearchMode: boolean; // 是否顯示搜尋結果模式
    showBacklinksMode: boolean; // 是否顯示反向連結模式
    showOutgoinglinksMode: boolean; // 是否顯示外部連結模式
    showAllFilesMode: boolean; // 是否顯示所有檔案模式
    showRandomNoteMode: boolean; // 是否顯示隨機筆記模式
    showRecentFilesMode: boolean; // 是否顯示最近筆記模式
    showTasksMode: boolean; // 是否顯示任務模式
    customFolderIcon: string; // 自訂資料夾圖示
    customDocumentExtensions: string; // 自訂文件副檔名（用逗號分隔）
    recentSources: string[]; // 最近的瀏覽記錄
    noteTitleField: string; // 筆記標題的欄位名稱
    noteSummaryField: string; // 筆記摘要的欄位名稱
    modifiedDateField: string;  // 修改時間的欄位名稱
    createdDateField: string;   // 建立時間的欄位名稱
    recentFilesCount: number; // 最近筆記模式顯示的筆數
    randomNoteCount: number; // 隨機筆記模式顯示的筆數
    showNoteTags: boolean; // 是否顯示筆記標籤
    dateDividerMode: string; // 日期分隔器模式：none, year, month, day
    showCodeBlocksInSummary: boolean; // 是否在摘要中顯示程式碼區塊
    folderNoteDisplaySettings: string; // 資料夾筆記設定
    interceptAllTagClicks: boolean; // 攔截所有tag點擊事件
    interceptBreadcrumbClicks: boolean; // 攔截Breadcrumb點擊事件
    customModes: CustomMode[]; // 自訂模式
    quickAccessCommandPath: string; // Path used by "Open quick access folder" command
    quickAccessModeType: 'bookmarks' | 'search' | 'backlinks' | 'outgoinglinks' | 'all-files' | 'recent-files' | 'random-note' | 'tasks'; // View types used by "Open quick access view" command
    useQuickAccessAsNewTabMode: 'default' | 'folder' | 'mode'; // Use quick access (folder or mode) as a new tab view
}

// 預設設定
export const DEFAULT_SETTINGS: GallerySettings = {
    ignoredFolders: [],
    ignoredFolderPatterns: [], // 預設以字串忽略的資料夾模式
    defaultSortType: 'mtime-desc', // 預設排序模式：修改時間倒序
    gridItemWidth: 300, // 網格項目寬度，預設 300
    gridItemHeight: 0, // 網格項目高度，預設 0
    imageAreaWidth: 100, // 圖片區域寬度，預設 100
    imageAreaHeight: 80, // 圖片區域高度，預設 80
    titleFontSize: 1.0, // 筆記標題的字型大小，預設 1.0
    summaryLength: 100, // 筆記摘要的字數，預設 100
    enableFileWatcher: true, // 預設啟用檔案監控
    showMediaFiles: true, // 預設顯示圖片和影片
    showVideoThumbnails: true, // 預設顯示影片縮圖
    defaultOpenLocation: 'left', // 預設開啟位置：左側邊欄
    reuseExistingLeaf: true, // 預設重用現有的網格視圖
    showBookmarksMode: true, // 預設顯示書籤模式
    showSearchMode: true, // 預設顯示搜尋結果模式
    showBacklinksMode: true, // 預設顯示反向連結模式
    showOutgoinglinksMode: false, // 預設不顯示外部連結模式
    showAllFilesMode: false, // 預設不顯示所有檔案模式
    showRandomNoteMode: true, // 預設顯示隨機筆記模式
    showRecentFilesMode: true, // 預設顯示最近筆記模式
    showTasksMode: false, // 預設不顯示任務模式
    recentFilesCount: 30, // 預設最近筆記模式顯示的筆數
    randomNoteCount: 10, // 預設隨機筆記模式顯示的筆數
    customFolderIcon: '📁', // 自訂資料夾圖示
    customDocumentExtensions: '', // 自訂文件副檔名（用逗號分隔）
    recentSources: [], // 預設最近的瀏覽記錄
    noteTitleField: '', // 筆記標題的欄位名稱
    noteSummaryField: '', // 筆記摘要的欄位名稱
    modifiedDateField: '', // 修改時間的欄位名稱
    createdDateField: '', // 建立時間的欄位名稱
    showNoteTags: false, // 預設不顯示筆記標籤
    dateDividerMode: 'none', // 預設不使用日期分隔器
    showCodeBlocksInSummary: false, // 預設不在摘要中顯示程式碼區塊
    folderNoteDisplaySettings: 'default', // 預設不處理資料夾筆記
    interceptAllTagClicks: false, // 預設不攔截所有tag點擊事件
    interceptBreadcrumbClicks: false, // 預設不攔截Breadcrumb點擊事件
    customModes: [
        {
            internalName: 'custom-1750837329297',
            icon: '🧩',
            displayName: 'My Books (Sample)',
            name: 'Default',
            dataviewCode: 'return dv.pages("#Book");',
        }
    ], // 自訂模式
    quickAccessCommandPath: '', // Path used by "Open quick access folder" command
    useQuickAccessAsNewTabMode: 'default',
    quickAccessModeType: 'all-files', // Default quick access view type
};

// 資料夾選擇器
class FolderSuggest extends AbstractInputSuggest<string> {
    inputEl: HTMLInputElement;

    constructor(app: App, inputEl: HTMLInputElement) {
        super(app, inputEl);
        this.inputEl = inputEl;
    }

    getSuggestions(inputStr: string): string[] {
        const lowerCaseInputStr = inputStr.toLowerCase();
        const allFolders = this.app.vault.getAllFolders();

        const suggestions = allFolders
            .map(folder => folder.path)
            .filter(path => path.toLowerCase().includes(lowerCaseInputStr))
            .sort((a, b) => a.localeCompare(b));
        
        if ('/'.includes(lowerCaseInputStr)) {
            if (!suggestions.includes('/')) {
                suggestions.unshift('/');
            }
        }

        return suggestions;
    }

    renderSuggestion(suggestion: string, el: HTMLElement) {
        el.setText(suggestion);
    }

    selectSuggestion(suggestion: string) {
        this.inputEl.value = suggestion;
        this.inputEl.trigger("input");
        this.close();
    }
}

// 忽略的資料夾選擇器
class IgnoredFolderSuggest extends AbstractInputSuggest<string> {
    inputEl: HTMLInputElement;

    constructor(
        app: App,
        inputEl: HTMLInputElement,
        private plugin: GridExplorerPlugin,
        private settingTab: GridExplorerSettingTab
    ) {
        super(app, inputEl);
        this.inputEl = inputEl;
    }

    getSuggestions(inputStr: string): string[] {
        const lowerCaseInputStr = inputStr.toLowerCase();
        const folders = this.app.vault.getAllFolders();

        return folders
            .map(folder => folder.path)
            .filter(path => {
                if (path === '/') return false; // Cannot ignore root
                const isIgnored = this.plugin.settings.ignoredFolders.some(ignoredPath =>
                    path === ignoredPath || path.startsWith(ignoredPath + '/')
                );
                return !isIgnored && path.toLowerCase().includes(lowerCaseInputStr);
            })
            .sort((a, b) => a.localeCompare(b));
    }

    renderSuggestion(suggestion: string, el: HTMLElement): void {
        el.setText(suggestion);
    }

    async selectSuggestion(suggestion: string): Promise<void> {
        if (suggestion && !this.plugin.settings.ignoredFolders.includes(suggestion)) {
            this.plugin.settings.ignoredFolders.push(suggestion);
            await this.plugin.saveSettings();

            this.inputEl.value = ''; // Clear the input
            this.settingTab.display(); // Re-render the settings tab to update the list
        }
        this.close();
    }
}

export class GridExplorerSettingTab extends PluginSettingTab {
    plugin: GridExplorerPlugin;

    constructor(app: App, plugin: GridExplorerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        // 顯示模式設定區域
        // 自訂模式設定
        containerEl.createEl('h3', { text: t('custom_mode_settings') });

        // 建立自訂模式的容器，以便實現拖曳排序
        const customModesContainer = containerEl.createDiv();
        this.plugin.settings.customModes.forEach((mode, index) => {
            const setting = new Setting(customModesContainer)
                .setName(`${mode.icon} ${mode.displayName}`)
                .addToggle(toggle => {
                    toggle
                        .setValue(mode.enabled ?? true)
                        .onChange(async (value) => {
                            mode.enabled = value;
                            await this.plugin.saveSettings();
                        });
                });

            // 讓設定項目可以被拖曳
            setting.settingEl.setAttr('draggable', 'true');

            // 拖曳開始時，儲存被拖曳項目的索引
            setting.settingEl.addEventListener('dragstart', (event: DragEvent) => {
                if (event.dataTransfer) {
                    event.dataTransfer.setData('text/plain', index.toString());
                    event.dataTransfer.effectAllowed = 'move';
                }
            });

            // 當拖曳到其他項目上時，允許放下
            setting.settingEl.addEventListener('dragover', (event: DragEvent) => {
                event.preventDefault();
                if (event.dataTransfer) {
                    event.dataTransfer.dropEffect = 'move';
                }
            });

            // 放下項目時，更新順序
            setting.settingEl.addEventListener('drop', async (event: DragEvent) => {
                event.preventDefault();
                if (!event.dataTransfer) return;

                const fromIndexStr = event.dataTransfer.getData('text/plain');
                if (!fromIndexStr) return;

                const fromIndex = parseInt(fromIndexStr);
                const toIndex = index;

                if (fromIndex === toIndex) return;

                // 重新排序陣列
                const modes = this.plugin.settings.customModes;
                const movedMode = modes.splice(fromIndex, 1)[0];
                modes.splice(toIndex, 0, movedMode);

                // 儲存設定並重新整理顯示
                await this.plugin.saveSettings();
                this.display();
            });

            // 編輯按鈕
            setting.addButton((button: ButtonComponent) => {
                button.setButtonText(t('edit'))
                    .onClick(() => {
                        // 找到正確的索引，以防萬一順序已變
                        const modeIndex = this.plugin.settings.customModes.findIndex(m => m.internalName === mode.internalName);
                        if (modeIndex === -1) return;
                        new CustomModeModal(this.app, this.plugin, this.plugin.settings.customModes[modeIndex], (result) => {
                            this.plugin.settings.customModes[modeIndex] = result;
                            this.plugin.saveSettings();
                            this.display();
                        }).open();
                    });
            });

            // 移除按鈕
            setting.addButton((button: ButtonComponent) => {
                button.setButtonText(t('remove'))
                    .setWarning()
                    .onClick(() => {
                        // 找到正確的索引，以防萬一順序已變
                        const modeIndex = this.plugin.settings.customModes.findIndex(m => m.internalName === mode.internalName);
                        if (modeIndex === -1) return;
                        this.plugin.settings.customModes.splice(modeIndex, 1);
                        this.plugin.saveSettings();
                        this.display();
                    });
            });
        });

        new Setting(containerEl)
            .addButton(button => {
                button.setButtonText(t('add_custom_mode'))
                    .setCta()
                    .setTooltip(t('add_custom_mode'))
                    .onClick(() => {
                        new CustomModeModal(this.app, this.plugin, null, async (result) => {
                            this.plugin.settings.customModes.push(result);
                            await this.plugin.saveSettings();
                            this.display();
                        }).open();
                    });
            })
            .addButton(button => {
                button.setButtonText(t('export'))
                    .setTooltip(t('export'))
                    .onClick(() => {
                        if (this.plugin.settings.customModes.length === 0) {
                            new Notice(t('no_custom_modes_to_export'));
                            return;
                        }
                        const data = JSON.stringify(this.plugin.settings.customModes, null, 2);
                        const blob = new Blob([data], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'grid-explorer-custom-modes.json';
                        a.click();
                        URL.revokeObjectURL(url);
                    });
            })
            .addButton(button => {
                button.setButtonText(t('import'))
                    .setTooltip(t('import'))
                    .onClick(() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.json';
                        input.onchange = async (e) => {
                            const files = (e.target as HTMLInputElement).files;
                            if (!files || files.length === 0) {
                                return;
                            }
                            const file = files[0];

                            const reader = new FileReader();
                            reader.onload = async (e) => {
                                if (!e.target || typeof e.target.result !== 'string') {
                                    new Notice(t('import_error'));
                                    return;
                                }

                                try {
                                    const content = e.target.result;
                                    const importedModes = JSON.parse(content);
                                    if (Array.isArray(importedModes)) {
                                        const validModes = importedModes.filter(m => m.internalName && m.displayName && m.dataviewCode);
                                        if (validModes.length > 0) {
                                            validModes.forEach(importedMode => {
                                                const existingModeIndex = this.plugin.settings.customModes.findIndex(
                                                    m => m.internalName === importedMode.internalName
                                                );

                                                if (existingModeIndex !== -1) {
                                                    // Update existing mode
                                                    this.plugin.settings.customModes[existingModeIndex] = importedMode;
                                                } else {
                                                    // Add new mode
                                                    this.plugin.settings.customModes.push(importedMode);
                                                }
                                            });

                                            await this.plugin.saveSettings();
                                            this.display();
                                            new Notice(t('import_success'));
                                        } else {
                                            new Notice(t('import_error'));
                                        }
                                    } else {
                                        new Notice(t('import_error'));
                                    }
                                } catch (error) {
                                    new Notice(t('import_error'));
                                    console.error("Grid Explorer: Error importing custom modes", error);
                                }
                            };
                            reader.readAsText(file);
                        };
                        input.click();
                    });
            });

        // 顯示模式設定區域
        containerEl.createEl('h3', { text: t('display_mode_settings') });

        // 設定是否顯示書籤模式
        new Setting(containerEl)
            .setName(`📑 ${t('show_bookmarks_mode')}`)
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.showBookmarksMode)
                    .onChange(async (value) => {
                        this.plugin.settings.showBookmarksMode = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 設定是否顯示搜尋結果模式
        new Setting(containerEl)
            .setName(`🔍 ${t('show_search_mode')}`)
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.showSearchMode)
                    .onChange(async (value) => {
                        this.plugin.settings.showSearchMode = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 設定是否顯示反向連結模式
        new Setting(containerEl)
            .setName(`🔗 ${t('show_backlinks_mode')}`)
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.showBacklinksMode)
                    .onChange(async (value) => {
                        this.plugin.settings.showBacklinksMode = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 設定是否顯示外部連結模式
        new Setting(containerEl)
            .setName(`🔗 ${t('show_outgoinglinks_mode')}`)
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.showOutgoinglinksMode)
                    .onChange(async (value) => {
                        this.plugin.settings.showOutgoinglinksMode = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 設定是否顯示所有檔案模式
        new Setting(containerEl)
        .setName(`📔 ${t('show_all_files_mode')}`)
        .addToggle(toggle => {
            toggle
                .setValue(this.plugin.settings.showAllFilesMode)
                .onChange(async (value) => {
                    this.plugin.settings.showAllFilesMode = value;
                    await this.plugin.saveSettings();
                });
        });

        // 最近檔案模式設定
        const recentFilesSetting = new Setting(containerEl)
            .setName(`📅 ${t('show_recent_files_mode')}`);

        // 添加切換按鈕
        recentFilesSetting.addToggle(toggle => {
            toggle
                .setValue(this.plugin.settings.showRecentFilesMode)
                .onChange(async (value) => {
                    this.plugin.settings.showRecentFilesMode = value;
                    await this.plugin.saveSettings();
                });
        });

        // 在設定描述區域添加數字輸入框
        const recentDescEl = recentFilesSetting.descEl.createEl('div', { cls: 'ge-setting-desc' });

        recentDescEl.createEl('span', { text: t('recent_files_count') });

        const recentInput = recentDescEl.createEl('input', {
            type: 'number',
            value: this.plugin.settings.recentFilesCount.toString(),
            cls: 'ge-setting-number-input'
        });

        recentInput.addEventListener('change', async (e) => {
            const target = e.target as HTMLInputElement;
            const value = parseInt(target.value);
            if (!isNaN(value) && value > 0) {
                this.plugin.settings.recentFilesCount = value;
                await this.plugin.saveSettings(false);
            } else {
                target.value = this.plugin.settings.recentFilesCount.toString();
            }
        });

        // 隨機筆記模式設定
        const randomNoteSetting = new Setting(containerEl)
            .setName(`🎲 ${t('show_random_note_mode')}`);

        // 添加切換按鈕
        randomNoteSetting.addToggle(toggle => {
            toggle
                .setValue(this.plugin.settings.showRandomNoteMode)
                .onChange(async (value) => {
                    this.plugin.settings.showRandomNoteMode = value;
                    await this.plugin.saveSettings();
                });
        });

        // 在設定描述區域添加數字輸入框
        const descEl = randomNoteSetting.descEl.createEl('div', { cls: 'ge-setting-desc' });

        descEl.createEl('span', { text: t('random_note_count') });

        const input = descEl.createEl('input', {
            type: 'number',
            value: this.plugin.settings.randomNoteCount.toString(),
            cls: 'ge-setting-number-input'
        });

        input.addEventListener('change', async (e) => {
            const target = e.target as HTMLInputElement;
            const value = parseInt(target.value);
            if (!isNaN(value) && value > 0) {
                this.plugin.settings.randomNoteCount = value;
                await this.plugin.saveSettings(false);
            } else {
                target.value = this.plugin.settings.randomNoteCount.toString();
            }
        });

        // 顯示任務模式
        new Setting(containerEl)
            .setName(`☑️ ${t('show_tasks_mode')}`)
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.showTasksMode)
                    .onChange(async (value) => {
                        this.plugin.settings.showTasksMode = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 媒體檔案設定區域
        containerEl.createEl('h3', { text: t('media_files_settings') });

        // 顯示圖片和影片設定
        new Setting(containerEl)
            .setName(t('show_media_files'))
            .setDesc(t('show_media_files_desc'))
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.showMediaFiles)
                    .onChange(async (value) => {
                        this.plugin.settings.showMediaFiles = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 顯示影片縮圖設定
        new Setting(containerEl)
            .setName(t('show_video_thumbnails'))
            .setDesc(t('show_video_thumbnails_desc'))
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.showVideoThumbnails)
                    .onChange(async (value) => {
                        this.plugin.settings.showVideoThumbnails = value;
                        await this.plugin.saveSettings();
                    });
            });

        containerEl.createEl('h3', { text: t('grid_view_settings') });

        // 重用現有的網格視圖
        new Setting(containerEl)
        .setName(t('reuse_existing_leaf'))
        .setDesc(t('reuse_existing_leaf_desc'))
        .addToggle(toggle => {
            toggle
                .setValue(this.plugin.settings.reuseExistingLeaf)
                .onChange(async (value) => {
                    this.plugin.settings.reuseExistingLeaf = value;
                    await this.plugin.saveSettings();
                });
        });

        // 預設開啟位置設定
        new Setting(containerEl)
            .setName(t('default_open_location'))
            .setDesc(t('default_open_location_desc'))
            .addDropdown(dropdown => {
                dropdown
                    .addOption('tab', t('open_in_new_tab'))
                    .addOption('left', t('open_in_left_sidebar'))
                    .addOption('right', t('open_in_right_sidebar'))
                    .setValue(this.plugin.settings.defaultOpenLocation)
                    .onChange(async (value) => {
                        this.plugin.settings.defaultOpenLocation = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 預設排序模式設定
        new Setting(containerEl)
            .setName(t('default_sort_type'))
            .setDesc(t('default_sort_type_desc'))
            .addDropdown(dropdown => {
                dropdown
                    .addOption('name-asc', t('sort_name_asc'))
                    .addOption('name-desc', t('sort_name_desc'))
                    .addOption('mtime-desc', t('sort_mtime_desc'))
                    .addOption('mtime-asc', t('sort_mtime_asc'))
                    .addOption('ctime-desc', t('sort_ctime_desc'))
                    .addOption('ctime-asc', t('sort_ctime_asc'))
                    .addOption('random', t('sort_random'))
                    .setValue(this.plugin.settings.defaultSortType)
                    .onChange(async (value) => {
                        this.plugin.settings.defaultSortType = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 筆記標題欄位名稱設定
        new Setting(containerEl)
        .setName(t('note_title_field'))
        .setDesc(t('note_title_field_desc'))
        .addText(text => text
            .setPlaceholder('title')
            .setValue(this.plugin.settings.noteTitleField)
            .onChange(async (value) => {
                this.plugin.settings.noteTitleField = value;
                await this.plugin.saveSettings(false);
            }));

        // 筆記摘要欄位名稱設定
        new Setting(containerEl)
        .setName(t('note_summary_field'))
        .setDesc(t('note_summary_field_desc'))
        .addText(text => text
            .setPlaceholder('summary')
            .setValue(this.plugin.settings.noteSummaryField)
            .onChange(async (value) => {
                this.plugin.settings.noteSummaryField = value;
                await this.plugin.saveSettings(false);
            }));

        // 修改時間欄位名稱設定
        new Setting(containerEl)
        .setName(t('modified_date_field'))
        .setDesc(t('modified_date_field_desc'))
        .addText(text => text
            .setPlaceholder('modified_date')
            .setValue(this.plugin.settings.modifiedDateField)
            .onChange(async (value) => {
                this.plugin.settings.modifiedDateField = value;
                await this.plugin.saveSettings(false);
            }));

        // 建立時間欄位名稱設定
        new Setting(containerEl)
        .setName(t('created_date_field'))
        .setDesc(t('created_date_field_desc'))
        .addText(text => text
            .setPlaceholder('created_date')
            .setValue(this.plugin.settings.createdDateField)
            .onChange(async (value) => {
                this.plugin.settings.createdDateField = value;
                await this.plugin.saveSettings(false);
            }));

        // 日期分隔器模式設定
        new Setting(containerEl)
        .setName(t('date_divider_mode'))
        .setDesc(t('date_divider_mode_desc'))
        .addDropdown(dropdown => {
            dropdown
                .addOption('none', t('date_divider_mode_none'))
                .addOption('year', t('date_divider_mode_year'))
                .addOption('month', t('date_divider_mode_month'))
                .addOption('day', t('date_divider_mode_day'))
                .setValue(this.plugin.settings.dateDividerMode)
                .onChange(async (value) => {
                    this.plugin.settings.dateDividerMode = value;
                    await this.plugin.saveSettings();
                });
        });

        // 檔案監控功能設定
        new Setting(containerEl)
            .setName(t('enable_file_watcher'))
            .setDesc(t('enable_file_watcher_desc'))
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.enableFileWatcher)
                    .onChange(async (value) => {
                        this.plugin.settings.enableFileWatcher = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 攔截所有tag點擊事件
        new Setting(containerEl)
            .setName(t('intercept_all_tag_clicks'))
            .setDesc(t('intercept_all_tag_clicks_desc'))
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.interceptAllTagClicks)
                    .onChange(async (value) => {
                        this.plugin.settings.interceptAllTagClicks = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 攔截Breadcrumb點擊事件
        new Setting(containerEl)
            .setName(t('intercept_breadcrumb_clicks'))
            .setDesc(t('intercept_breadcrumb_clicks_desc'))
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.interceptBreadcrumbClicks)
                    .onChange(async (value) => {
                        this.plugin.settings.interceptBreadcrumbClicks = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 自訂文件副檔名設定
        new Setting(containerEl)
        .setName(t('custom_document_extensions'))
        .setDesc(t('custom_document_extensions_desc'))
        .addText(text => {
            text
                .setPlaceholder(t('custom_document_extensions_placeholder'))
                .setValue(this.plugin.settings.customDocumentExtensions)
                .onChange(async (value) => {
                    this.plugin.settings.customDocumentExtensions = value;
                    await this.plugin.saveSettings();
                });
        });

        // 自訂資料夾圖示
        new Setting(containerEl)
        .setName(t('custom_folder_icon'))
        .setDesc(t('custom_folder_icon_desc'))
        .addText(text => {
            text
                .setValue(this.plugin.settings.customFolderIcon)
                .onChange(async (value) => {
                    this.plugin.settings.customFolderIcon = value;
                    await this.plugin.saveSettings();
                });
        });

        // 顯示筆記標籤設定
        new Setting(containerEl)
            .setName(t('show_note_tags'))
            .setDesc(t('show_note_tags_desc'))
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.showNoteTags)
                    .onChange(async (value) => {
                        this.plugin.settings.showNoteTags = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 網格項目寬度設定
        const gridItemWidthSetting = new Setting(containerEl)
            .setName(t('grid_item_width'))
            .setDesc(`${t('grid_item_width_desc')} (now: ${this.plugin.settings.gridItemWidth}px)`)
            .addSlider(slider => {
                slider
                    .setLimits(200, 600, 10)
                    .setValue(this.plugin.settings.gridItemWidth)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        gridItemWidthSetting.setDesc(`${t('grid_item_width_desc')} (now: ${value}px)`);
                        this.plugin.settings.gridItemWidth = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 網格項目高度設定
        const gridItemHeightSetting = new Setting(containerEl)
            .setName(t('grid_item_height'))
            .setDesc(`${t('grid_item_height_desc')} (now: ${this.plugin.settings.gridItemHeight === 0 ? 'auto' : this.plugin.settings.gridItemHeight})`)
            .addSlider(slider => {
                slider
                    .setLimits(0, 600, 10)
                    .setValue(this.plugin.settings.gridItemHeight)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        gridItemHeightSetting.setDesc(`${t('grid_item_height_desc')} (now: ${value === 0 ? 'auto' : value})`);
                        this.plugin.settings.gridItemHeight = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 圖片區域寬度設定
        const imageAreaWidthSetting = new Setting(containerEl)
            .setName(t('image_area_width'))
            .setDesc(`${t('image_area_width_desc')} (now: ${this.plugin.settings.imageAreaWidth}px)`)
            .addSlider(slider => {
                slider
                    .setLimits(50, 300, 10)
                    .setValue(this.plugin.settings.imageAreaWidth)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        imageAreaWidthSetting.setDesc(`${t('image_area_width_desc')} (now: ${value}px)`);
                        this.plugin.settings.imageAreaWidth = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 圖片區域高度設定
        const imageAreaHeightSetting = new Setting(containerEl)
            .setName(t('image_area_height'))
            .setDesc(`${t('image_area_height_desc')} (now: ${this.plugin.settings.imageAreaHeight}px)`)
            .addSlider(slider => {
                slider
                    .setLimits(50, 300, 10)
                    .setValue(this.plugin.settings.imageAreaHeight)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        imageAreaHeightSetting.setDesc(`${t('image_area_height_desc')} (now: ${value}px)`);
                        this.plugin.settings.imageAreaHeight = value;
                        await this.plugin.saveSettings();
                    });
            });

        //筆記標題的字型大小
        const titleFontSizeSetting = new Setting(containerEl)
            .setName(t('title_font_size'))
            .setDesc(`${t('title_font_size_desc')} (now: ${this.plugin.settings.titleFontSize.toFixed(2)})`)
            .addSlider(slider => {
                slider
                .setLimits(0.8, 1.5, 0.05)
                .setValue(this.plugin.settings.titleFontSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    titleFontSizeSetting.setDesc(`${t('title_font_size_desc')} (now: ${value.toFixed(2)})`);
                    this.plugin.settings.titleFontSize = value;
                    await this.plugin.saveSettings();
                });
            });

        // 筆記摘要的字數設定
        const summaryLengthSetting = new Setting(containerEl)
            .setName(t('summary_length'))
            .setDesc(`${t('summary_length_desc')} (now: ${this.plugin.settings.summaryLength})`)
            .addSlider(slider => {
                slider
                    .setLimits(50, 600, 25)
                    .setValue(this.plugin.settings.summaryLength)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        summaryLengthSetting.setDesc(`${t('summary_length_desc')} (now: ${value})`);
                        this.plugin.settings.summaryLength = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 是否在摘要中顯示程式碼區塊
        new Setting(containerEl)
        .setName(t('show_code_block_in_summary'))
        .setDesc(t('show_code_block_in_summary_desc'))
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.showCodeBlocksInSummary)
            .onChange(async (value) => {
                this.plugin.settings.showCodeBlocksInSummary = value;
                await this.plugin.saveSettings();
            }));

        // 資料夾筆記設定區域
        containerEl.createEl('h3', { text: t('folder_note_settings') });

        // 資料夾筆記設定 (預設、置頂、隱藏)
        new Setting(containerEl)
            .setName(t('foldernote_display_settings'))
            .setDesc(t('foldernote_display_settings_desc'))
            .addDropdown(dropdown => {
                dropdown
                    .addOption('default', t('default'))
                    .addOption('pinned', t('pinned'))
                    .addOption('hidden', t('hidden'))
                    .setValue(this.plugin.settings.folderNoteDisplaySettings)
                    .onChange(async (value) => {
                        this.plugin.settings.folderNoteDisplaySettings = value;
                        await this.plugin.saveSettings();
                    });
            });

        // Quick Access Settings
        containerEl.createEl('h3', { text: t('quick_access_settings_title') });

        // Quick Access Folder Setting
        new Setting(containerEl)
            .setName(t('quick_access_folder_name'))
            .setDesc(t('quick_access_folder_desc'))
            .addText(text => {
                new FolderSuggest(this.app, text.inputEl);
                text.setPlaceholder(t('select_folders'))
                    .setValue(this.plugin.settings.quickAccessCommandPath)
                    .onChange(async (value) => {
                        this.plugin.settings.quickAccessCommandPath = value;
                        await this.plugin.saveSettings(false);
                    });
            });


        // Quick Access View Setting
        new Setting(containerEl)
        .setName(t('quick_access_mode_name'))
        .setDesc(t('quick_access_mode_desc'))
        .addDropdown(dropdown => {
            dropdown
                .addOption('bookmarks', t('bookmarks_mode'))
                .addOption('search', t('search_results'))
                .addOption('backlinks', t('backlinks_mode'))
                .addOption('outgoinglinks', t('outgoinglinks_mode'))
                .addOption('all-files', t('all_files_mode'))
                .addOption('recent-files', t('recent_files_mode'))
                .addOption('random-note', t('random_note_mode'))
                .addOption('tasks', t('tasks_mode'))
                .setValue(this.plugin.settings.quickAccessModeType)
                .onChange(async (value: 'bookmarks' | 'search' | 'backlinks' | 'outgoinglinks' | 'all-files' | 'recent-files' | 'random-note' | 'tasks') => {
                    this.plugin.settings.quickAccessModeType = value;
                    await this.plugin.saveSettings(false);
                });
        });

        // Use Quick Access as a new tab view
        new Setting(containerEl)
        .setName(t('use_quick_access_as_new_tab_view'))
        .setDesc(t('use_quick_access_as_new_tab_view_desc'))
        .addDropdown(dropdown => {
            dropdown
                .addOption('default', t('default_new_tab'))
                .addOption('folder', t('use_quick_access_folder'))
                .addOption('mode', t('use_quick_access_mode'))
                .setValue(this.plugin.settings.useQuickAccessAsNewTabMode)
                .onChange(async (value: 'default' | 'folder' | 'mode') => {
                    this.plugin.settings.useQuickAccessAsNewTabMode = value;
                    await this.plugin.saveSettings(false);
                });
        });

        // 忽略資料夾設定區域
        containerEl.createEl('h3', { text: t('ignored_folders_settings') });

        // 忽略的資料夾設定
        const ignoredFoldersContainer = containerEl.createDiv('ignored-folders-container');

        new Setting(containerEl)
            .setName(t('ignored_folders'))
            .setDesc(t('ignored_folders_desc'))
            .setHeading();

        // 新增資料夾選擇器
        new Setting(ignoredFoldersContainer)
            .setName(t('add_ignored_folder'))
            .addText(text => {
                new IgnoredFolderSuggest(this.app, text.inputEl, this.plugin, this);
                text.setPlaceholder(t('select_folders_to_ignore'));
            });

        // 顯示目前已忽略的資料夾列表
        const ignoredFoldersList = ignoredFoldersContainer.createDiv('ge-ignored-folders-list');
        this.renderIgnoredFoldersList(ignoredFoldersList);

        containerEl.appendChild(ignoredFoldersContainer);

        // 以字串忽略資料夾（可用正則表達式）設定
        const ignoredFolderPatternsContainer = containerEl.createDiv('ignored-folder-patterns-container');

        new Setting(containerEl)
            .setName(t('ignored_folder_patterns'))
            .setDesc(t('ignored_folder_patterns_desc'))
            .setHeading();

        // 新增字串模式輸入框
        const patternSetting = new Setting(ignoredFolderPatternsContainer)
            .setName(t('add_ignored_folder_pattern'))
            .addText(text => {
                text.setPlaceholder(t('ignored_folder_pattern_placeholder'))
                    .onChange(() => {
                        // 僅用於更新輸入值，不進行保存
                    });

                // 儲存文字輸入元素的引用以便後續使用
                return text;
            });

        // 添加按鈕
        patternSetting.addButton(button => {
            button
                .setButtonText(t('add'))
                .setCta()
                .onClick(async () => {
                    // 獲取輸入值
                    const inputEl = patternSetting.controlEl.querySelector('input') as HTMLInputElement;
                    const pattern = inputEl.value.trim();

                    if (pattern && !this.plugin.settings.ignoredFolderPatterns.includes(pattern)) {
                        // 新增到忽略模式列表
                        this.plugin.settings.ignoredFolderPatterns.push(pattern);
                        await this.plugin.saveSettings();

                        // 重新渲染列表
                        this.renderIgnoredFolderPatternsList(ignoredFolderPatternsList);

                        // 清空輸入框
                        inputEl.value = '';
                    }
                });
        });

        // 顯示目前已忽略的資料夾模式列表
        const ignoredFolderPatternsList = ignoredFolderPatternsContainer.createDiv('ge-ignored-folder-patterns-list');
        this.renderIgnoredFolderPatternsList(ignoredFolderPatternsList);

        containerEl.appendChild(ignoredFolderPatternsContainer);

        containerEl.createEl('h3', { text: t('reset_to_default') });

        // 回復預設值按鈕
        new Setting(containerEl)
            .setName(t('reset_to_default'))
            .setDesc(t('reset_to_default_desc'))
            .addButton(button => button
                .setButtonText(t('reset'))
                .setWarning()
                .onClick(async () => {
                    this.plugin.settings = { ...DEFAULT_SETTINGS };
                    await this.plugin.saveSettings();
                    this.display();
                    new Notice(t('settings_reset_notice'));
                }));

    }

    // 渲染已忽略的資料夾列表
    renderIgnoredFoldersList(containerEl: HTMLElement) {
        containerEl.empty();

        if (this.plugin.settings.ignoredFolders.length === 0) {
            containerEl.createEl('p', { text: t('no_ignored_folders') });
            return;
        }

        const list = containerEl.createEl('ul', { cls: 'ge-ignored-folders-list' });

        this.plugin.settings.ignoredFolders.forEach(folder => {
            const item = list.createEl('li', { cls: 'ge-ignored-folder-item' });

            item.createSpan({ text: folder, cls: 'ge-ignored-folder-path' });

            const removeButton = item.createEl('button', {
                cls: 'ge-ignored-folder-remove',
                text: t('remove')
            });

            removeButton.addEventListener('click', async () => {
                // 從忽略列表中移除
                this.plugin.settings.ignoredFolders = this.plugin.settings.ignoredFolders
                    .filter(f => f !== folder);
                await this.plugin.saveSettings();

                // 重新渲染列表
                this.renderIgnoredFoldersList(containerEl);
                this.display();
            });
        });
    }

    // 渲染已忽略的資料夾模式列表
    renderIgnoredFolderPatternsList(containerEl: HTMLElement) {
        containerEl.empty();

        if (this.plugin.settings.ignoredFolderPatterns.length === 0) {
            containerEl.createEl('p', { text: t('no_ignored_folder_patterns') });
            return;
        }

        const list = containerEl.createEl('ul', { cls: 'ge-ignored-folders-list' });

        this.plugin.settings.ignoredFolderPatterns.forEach(pattern => {
            const item = list.createEl('li', { cls: 'ge-ignored-folder-item' });

            item.createSpan({ text: pattern, cls: 'ge-ignored-folder-path' });

            const removeButton = item.createEl('button', {
                cls: 'ge-ignored-folder-remove',
                text: t('remove')
            });

            removeButton.addEventListener('click', async () => {
                // 從忽略模式列表中移除
                this.plugin.settings.ignoredFolderPatterns = this.plugin.settings.ignoredFolderPatterns
                    .filter(p => p !== pattern);
                await this.plugin.saveSettings();

                // 重新渲染列表
                this.renderIgnoredFolderPatternsList(containerEl);
            });
        });
    }
}