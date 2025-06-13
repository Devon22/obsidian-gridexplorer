import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import { t } from './translations';
import GridExplorerPlugin from '../main';

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
    showParentFolderItem: boolean; // 是否显示"返回上级文件夹"选项
    reuseExistingLeaf: boolean; // 是否重用現有的網格視圖
    showBookmarksMode: boolean; // 是否顯示書籤模式
    showSearchMode: boolean; // 是否顯示搜尋結果模式
    showBacklinksMode: boolean; // 是否顯示反向連結模式
    showOutgoinglinksMode: boolean; // 是否顯示外部連結模式
    showAllFilesMode: boolean; // 是否顯示所有檔案模式
    showRandomNoteMode: boolean; // 是否顯示隨機筆記模式
    showRecentFilesMode: boolean; // 是否顯示最近筆記模式
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
}

// 預設設定
export const DEFAULT_SETTINGS: GallerySettings = {
    ignoredFolders: [],
    ignoredFolderPatterns: [], // 預設以字串忽略的資料夾模式
    defaultSortType: 'mtime-desc', // 預設排序模式：修改時間倒序
    gridItemWidth: 300, // 網格項目寬度，預設 300
    gridItemHeight: 0, // 網格項目高度，預設 0
    imageAreaWidth: 100, // 圖片區域寬度，預設 100
    imageAreaHeight: 100, // 圖片區域高度，預設 100
    titleFontSize: 1.0, // 筆記標題的字型大小，預設 1.0
    summaryLength: 100, // 筆記摘要的字數，預設 100
    enableFileWatcher: true, // 預設啟用檔案監控
    showMediaFiles: true, // 預設顯示圖片和影片
    showVideoThumbnails: false, // 預設不顯示影片縮圖
    defaultOpenLocation: 'tab', // 預設開啟位置：新分頁
    showParentFolderItem: false, // 預設不顯示"返回上级文件夹"選項
    reuseExistingLeaf: false, // 預設不重用現有的網格視圖
    showBookmarksMode: true, // 預設顯示書籤模式
    showSearchMode: true, // 預設顯示搜尋結果模式
    showBacklinksMode: true, // 預設顯示反向連結模式
    showOutgoinglinksMode: false, // 預設不顯示外部連結模式
    showAllFilesMode: false, // 預設不顯示所有檔案模式
    showRandomNoteMode: false, // 預設不顯示隨機筆記模式
    showRecentFilesMode: true, // 預設顯示最近筆記模式
    recentFilesCount: 30, // 預設最近筆記模式顯示的筆數
    randomNoteCount: 10, // 預設隨機筆記模式顯示的筆數
    customFolderIcon: '📁', // 自訂資料夾圖示
    customDocumentExtensions: '', // 自訂文件副檔名（用逗號分隔）
    recentSources: [], // 預設最近的瀏覽記錄
    noteTitleField: 'title', // 筆記標題的欄位名稱
    noteSummaryField: 'summary', // 筆記摘要的欄位名稱
    modifiedDateField: '', // 修改時間的欄位名稱
    createdDateField: '', // 建立時間的欄位名稱
    showNoteTags: false, // 預設不顯示筆記標籤
    dateDividerMode: 'none', // 預設不使用日期分隔器
    showCodeBlocksInSummary: false, // 預設不在摘要中顯示程式碼區塊
};

// 設定頁面類別
export class GridExplorerSettingTab extends PluginSettingTab {
    plugin: GridExplorerPlugin;

    constructor(app: App, plugin: GridExplorerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        // 回復預設值按鈕
        new Setting(containerEl)
            .setName(t('reset_to_default'))
            .setDesc(t('reset_to_default_desc'))
            .addButton(button => button
                .setButtonText(t('reset'))
                .onClick(async () => {
                    this.plugin.settings = { ...DEFAULT_SETTINGS };
                    await this.plugin.saveSettings();
                    this.display();
                    new Notice(t('settings_reset_notice'));
                }));

        // 顯示模式設定區域
        containerEl.createEl('h3', { text: t('display_mode_settings') });

        // 設定是否顯示書籤模式
        new Setting(containerEl)
            .setName(t('show_bookmarks_mode'))
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
            .setName(t('show_search_mode'))
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
            .setName(t('show_backlinks_mode'))
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
            .setName(t('show_outgoinglinks_mode'))
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
        .setName(t('show_all_files_mode'))
        .addToggle(toggle => {
            toggle
                .setValue(this.plugin.settings.showAllFilesMode)
                .onChange(async (value) => {
                    this.plugin.settings.showAllFilesMode = value;
                    await this.plugin.saveSettings();
                });
        });

        // 設定是否顯示最近檔案模式
        new Setting(containerEl)
            .setName(t('show_recent_files_mode'))
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.showRecentFilesMode)
                    .onChange(async (value) => {
                        this.plugin.settings.showRecentFilesMode = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 最近檔案模式的顯示資料筆數
        new Setting(containerEl)
            .setName(t('recent_files_count'))
            .addText(text => {
                text
                    .setValue(this.plugin.settings.recentFilesCount.toString())
                    .onChange(async (value) => {
                        this.plugin.settings.recentFilesCount = parseInt(value);
                        await this.plugin.saveSettings(false);
                    });
            });

        // 設定是否顯示隨機筆記模式
        new Setting(containerEl)
            .setName(t('show_random_note_mode'))
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.showRandomNoteMode)
                    .onChange(async (value) => {
                        this.plugin.settings.showRandomNoteMode = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 隨機筆記模式的顯示資料筆數
        new Setting(containerEl)
            .setName(t('random_note_count'))
            .addText(text => {
                text
                    .setValue(this.plugin.settings.randomNoteCount.toString())
                    .onChange(async (value) => {
                        this.plugin.settings.randomNoteCount = parseInt(value);
                        await this.plugin.saveSettings(false);
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

        // 顯示"回上層資料夾"選項設定
        new Setting(containerEl)
            .setName(t('show_parent_folder_item'))
            .setDesc(t('show_parent_folder_item_desc'))
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.showParentFolderItem)
                    .onChange(async (value) => {
                        this.plugin.settings.showParentFolderItem = value;
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
        new Setting(containerEl)
            .setName(t('grid_item_width'))
            .setDesc(t('grid_item_width_desc'))
            .addSlider(slider => {
                slider
                    .setLimits(200, 600, 10)
                    .setValue(this.plugin.settings.gridItemWidth)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.gridItemWidth = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 網格項目高度設定
        new Setting(containerEl)
            .setName(t('grid_item_height'))
            .setDesc(t('grid_item_height_desc'))
            .addSlider(slider => {
                slider
                    .setLimits(0, 600, 10)
                    .setValue(this.plugin.settings.gridItemHeight)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.gridItemHeight = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 圖片區域寬度設定
        new Setting(containerEl)
            .setName(t('image_area_width'))
            .setDesc(t('image_area_width_desc'))
            .addSlider(slider => {
                slider
                    .setLimits(50, 300, 10)
                    .setValue(this.plugin.settings.imageAreaWidth)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.imageAreaWidth = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 圖片區域高度設定
        new Setting(containerEl)
            .setName(t('image_area_height'))
            .setDesc(t('image_area_height_desc'))
            .addSlider(slider => {
                slider
                    .setLimits(50, 300, 10)
                    .setValue(this.plugin.settings.imageAreaHeight)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.imageAreaHeight = value;
                        await this.plugin.saveSettings();
                    });
            });
        
        //筆記標題的字型大小
        new Setting(containerEl)
            .setName(t('title_font_size'))
            .setDesc(t('title_font_size_desc'))
            .addSlider(slider => {
                slider
                .setLimits(0.8, 1.5, 0.05)
                .setValue(this.plugin.settings.titleFontSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.titleFontSize = value;
                    await this.plugin.saveSettings();
                });
            });
        
                
        // 筆記摘要的字數設定
        new Setting(containerEl)
            .setName(t('summary_length'))
            .setDesc(t('summary_length_desc'))
            .addSlider(slider => {
                slider
                    .setLimits(50, 600, 25)
                    .setValue(this.plugin.settings.summaryLength)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
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
            .addDropdown(dropdown => {
                // 獲取所有資料夾
                const folders = this.app.vault.getAllFolders()
                    .filter(folder => folder.path !== '/') // 排除根目錄
                    .sort((a, b) => a.path.localeCompare(b.path));
                
                // 新增空選項作為預設值
                dropdown.addOption('', t('select_folders'));
                
                // 新增所有資料夾作為選項
                folders.forEach(folder => {
                    // 只顯示尚未被忽略的資料夾
                    const isIgnored = this.plugin.settings.ignoredFolders.some(ignoredPath =>
                        folder.path === ignoredPath || folder.path.startsWith(ignoredPath + '/')
                    );
                    if (!isIgnored) {
                        dropdown.addOption(folder.path, folder.path);
                    }
                });
                
                dropdown.onChange(async (value) => {
                    if (value) {
                        // 新增到忽略列表
                        this.plugin.settings.ignoredFolders.push(value);
                        await this.plugin.saveSettings();
                        
                        // 重新渲染列表
                        this.renderIgnoredFoldersList(ignoredFoldersList);
                        
                        // 重設下拉選單
                        dropdown.setValue('');
                        this.display();
                    }
                });
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