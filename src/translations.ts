import { getLanguage } from 'obsidian';

interface Translations {
    'zh-TW': { [key: string]: string };
    'en': { [key: string]: string }; 
    'zh': { [key: string]: string };
    'ja': { [key: string]: string };
}

type LanguageKey = keyof Translations;

// 全域翻譯函式
export function t(key: string): string {
    const lang = window.localStorage.getItem('language') as LanguageKey;
    //const lang: LanguageKey = getLanguage() as LanguageKey;
    const translations = TRANSLATIONS[lang] || TRANSLATIONS['en'];
    return translations[key] || key;
}

// 語系檔案
export const TRANSLATIONS: Translations = {
    'zh-TW': {
        // 通知訊息
        'bookmarks_plugin_disabled': '請先啟用書籤外掛',

        // 按鈕和標籤
        'sorting': '排序方式',
        'refresh': '重新整理',
        'reselect': '重新選擇位置',
        'go_up': '返回上層資料夾',
        'no_backlinks': '沒有反向連結',
        'search': '搜尋',
        'search_placeholder': '搜尋關鍵字',
        'search_current_location_only': '僅搜尋目前位置',
        'cancel': '取消',
        'new_note': '新增筆記',
        'untitled': '未命名',
        'files': '個檔案',
        'add': '新增',

        // 視圖標題
        'grid_view_title': '網格視圖',
        'bookmarks_mode': '書籤',
        'folder_mode': '資料夾',
        'search_results': '搜尋結果',
        'backlinks_mode': '反向連結',
        'all_files_mode': '所有檔案',
        'recent_files_mode': '最近檔案',
        'random_note_mode': '隨機筆記',

        // 排序選項
        'sort_name_asc': '名稱 (A → Z)',
        'sort_name_desc': '名稱 (Z → A)',
        'sort_mtime_desc': '修改時間 (新 → 舊)',
        'sort_mtime_asc': '修改時間 (舊 → 新)',
        'sort_ctime_desc': '建立時間 (新 → 舊)',
        'sort_ctime_asc': '建立時間 (舊 → 新)',
        'sort_random': '隨機排序',

        // 設定
        'grid_view_settings': '網格視圖設定',
        'media_files_settings': '媒體檔案設定',
        'show_media_files': '顯示圖片和影片',
        'show_media_files_desc': '在網格視圖中顯示圖片和影片檔案',
        'search_media_files': '搜尋圖片和影片',
        'search_media_files_desc': '在搜尋結果中包含圖片和影片檔案（僅在啟用顯示圖片和影片時有效）',
        'show_video_thumbnails': '顯示影片縮圖',
        'show_video_thumbnails_desc': '在網格視圖中顯示影片的縮圖，關閉時將顯示播放圖示',
        'ignored_folders': '忽略的資料夾',
        'ignored_folders_desc': '在這裡設定要忽略的資料夾',
        'add_ignored_folder': '新增忽略資料夾',
        'no_ignored_folders': '沒有忽略的資料夾。',
        'ignored_folder_patterns': '以字串忽略資料夾和檔案',
        'ignored_folder_patterns_desc': '使用字串模式忽略資料夾和檔案（支援正則表達式）',
        'add_ignored_folder_pattern': '新增忽略資料夾模式',
        'ignored_folder_pattern_placeholder': '輸入資料夾名稱或正則表達式',
        'no_ignored_folder_patterns': '沒有忽略的資料夾模式。',
        'remove': '移除',
        'default_sort_type': '預設排序模式',
        'default_sort_type_desc': '設定開啟網格視圖時的預設排序模式',
        'modified_date_field': '"修改時間"欄位名稱',
        'modified_date_field_desc': '指定 frontmatter 中用於筆記修改時間的欄位名稱',
        'created_date_field': '"建立時間"欄位名稱',    
        'created_date_field_desc': '指定 frontmatter 中用於筆記建立時間的欄位名稱',
        'grid_item_width': '網格項目寬度',
        'grid_item_width_desc': '設定網格項目的寬度',
        'grid_item_height': '網格項目高度',
        'grid_item_height_desc': '設定網格項目的高度 (設為0時為自動調整)',
        'image_area_width': '圖片區域寬度',
        'image_area_width_desc': '設定圖片預覽區域的寬度',
        'image_area_height': '圖片區域高度',
        'image_area_height_desc': '設定圖片預覽區域的高度',
        'title_font_size': '標題字體大小',
        'title_font_size_desc': '設定標題字體的大小',
        'summary_length': '摘要長度',
        'summary_length_desc': '設定摘要的長度',
        'enable_file_watcher': '啟用檔案監控',
        'enable_file_watcher_desc': '啟用後會自動偵測檔案變更並更新視圖，關閉後需手動點擊重新整理按鈕',
        'reset_to_default' : '重置為預設值',
        'reset_to_default_desc': '將所有設定重置為預設值',
        'settings_reset_notice': '設定值已重置為預設值',
        'ignored_folders_settings': '忽略資料夾設定',
        'display_mode_settings': '顯示模式設定',
        'show_bookmarks_mode': '顯示書籤模式',
        'show_search_mode': '顯示搜尋結果模式',
        'show_backlinks_mode': '顯示反向連結模式',
        'show_all_files_mode': '顯示所有檔案模式',
        'show_recent_files_mode': '顯示最近檔案模式',
        'show_random_note_mode': '顯示隨機筆記模式',
        'random_note_notes_only': '僅筆記',
        'random_note_include_media_files': '包含圖片影片',
        
        // 顯示"返回上層資料夾"選項設定
        'show_parent_folder_item': '顯示「返回上層資料夾」',
        'show_parent_folder_item_desc': '在網格的第一項顯示「返回上層資料夾」選項',
        'parent_folder': '上層資料夾',
        
        // 預設開啟位置設定
        'default_open_location': '預設開啟位置',
        'default_open_location_desc': '設定網格視圖預設開啟的位置',
        'open_in_left_sidebar': '開在左側邊欄',
        'open_in_right_sidebar': '開在右側邊欄',
        'open_in_new_tab': '在新分頁開啟',
        'reuse_existing_leaf': '重複使用已開啟的視圖',
        'reuse_existing_leaf_desc': '開啟網格視圖時，優先使用已開啟的視圖而非建立新視圖',

        'custom_document_extensions': '自訂文件檔案副檔名',
        'custom_document_extensions_desc': '額外的文件副檔名（用逗號分隔，不含點號）',
        'custom_document_extensions_placeholder': '例如：txt,doc,docx',

        // 選擇資料夾對話框
        'select_folders': '選擇資料夾',
        'open_grid_view': '開啟網格視圖',
        'open_in_grid_view': '在網格視圖中開啟',
        'open_note_in_grid_view': '在網格視圖中開啟當前筆記',
        'open_backlinks_in_grid_view': '在網格視圖中開啟反向連結',
        'open_recent_files_in_grid_view': '在最近檔案中開啟當前筆記',
        'open_settings': '開啟設定',
        'open_new_grid_view': '開啟新網格視圖',
        'delete_note': '刪除檔案',
        'open_folder_note': '開啟資料夾筆記',
        'create_folder_note': '建立資料夾筆記',
        'delete_folder_note': '刪除資料夾筆記',
        'edit_folder_note_settings': '編輯資料夾筆記設定',
        'ignore_folder': '忽略此資料夾',
        'searching': '搜尋中...',
        'no_files': '沒有找到任何檔案',
        'filter_folders': '篩選資料夾...',

        // 資料夾筆記設定對話框
        'folder_note_settings': '資料夾筆記設定',
        'folder_sort_type': '資料夾排序方式',
        'folder_sort_type_desc': '設定此資料夾的預設排序方式',
        'folder_color': '資料夾顏色',
        'folder_color_desc': '設定此資料夾的顯示顏色',
        'default_sort': '使用預設排序',
        'no_color': '無顏色',
        'color_red': '紅色',
        'color_orange': '橙色',
        'color_yellow': '黃色',
        'color_green': '綠色',
        'color_cyan': '青色',
        'color_blue': '藍色',
        'color_purple': '紫色',
        'color_pink': '粉色',
        'confirm': '確認',
        'note_color_settings': '筆記顏色設定',
        'note_color': '筆記顏色',
        'note_color_desc': '設定此筆記的顯示顏色',
        'set_note_color': '設定筆記顏色',
    },
    'en': {
        // Notifications
        'bookmarks_plugin_disabled': 'Please enable the Bookmarks plugin first',

        // Buttons and Labels
        'sorting': 'Sort by',
        'refresh': 'Refresh',
        'reselect': 'Reselect',
        'go_up': 'Go Up',
        'no_backlinks': 'No backlinks',
        'search': 'Search',
        'search_placeholder': 'Search keyword',
        'search_current_location_only': 'Search current location only',
        'cancel': 'Cancel',
        'new_note': 'New note',
        'untitled': 'Untitled',
        'files': 'files',
        'add': 'Add',

        // View Titles
        'grid_view_title': 'Grid view',
        'bookmarks_mode': 'Bookmarks',
        'folder_mode': 'Folder',
        'search_results': 'Search results',
        'backlinks_mode': 'Backlinks',
        'all_files_mode': 'All files',
        'recent_files_mode': 'Recent files',
        'random_note_mode': 'Random note',

        // Sort Options
        'sort_name_asc': 'Name (A → Z)',
        'sort_name_desc': 'Name (Z → A)',
        'sort_mtime_desc': 'Modified (New → Old)',
        'sort_mtime_asc': 'Modified (Old → New)',
        'sort_ctime_desc': 'Created (New → Old)',
        'sort_ctime_asc': 'Created (Old → New)',
        'sort_random': 'Random',

        // Settings
        'grid_view_settings': 'Grid view settings',
        'media_files_settings': 'Media files settings',
        'show_media_files': 'Show images and videos',
        'show_media_files_desc': 'Display image and video files in the grid view',
        'search_media_files': 'Search images and videos',
        'search_media_files_desc': 'Include image and video files in search results (only effective when show images and videos is enabled)',
        'show_video_thumbnails': 'Show video thumbnails',
        'show_video_thumbnails_desc': 'Display thumbnails for videos in the grid view, shows a play icon when disabled',
        'ignored_folders': 'Ignored folders',
        'ignored_folders_desc': 'Set folders to ignore here',
        'add_ignored_folder': 'Add ignored folder',
        'no_ignored_folders': 'No ignored folders.',
        'ignored_folder_patterns': 'Ignore folders and files by pattern',
        'ignored_folder_patterns_desc': 'Use string patterns to ignore folders and files (supports regular expressions)',
        'add_ignored_folder_pattern': 'Add folder pattern',
        'ignored_folder_pattern_placeholder': 'Enter folder name or regex pattern',
        'no_ignored_folder_patterns': 'No ignored folder patterns.',
        'remove': 'Remove',
        'default_sort_type': 'Default sort type',
        'default_sort_type_desc': 'Set the default sorting method when opening Grid View',
        'modified_date_field': '"Modified date" field name',
        'modified_date_field_desc': 'Set the field name in frontmatter to use for the modified date',
        'created_date_field': '"Created date" field name',    
        'created_date_field_desc': 'Set the field name in frontmatter to use for the created date',
        'grid_item_width': 'Grid item width',
        'grid_item_width_desc': 'Set the width of grid items',
        'grid_item_height': 'Grid item height',
        'grid_item_height_desc': 'Set the height of grid items (set to 0 to automatically adjust)',
        'image_area_width': 'Image area width',
        'image_area_width_desc': 'Set the width of the image preview area',
        'image_area_height': 'Image area height',
        'image_area_height_desc': 'Set the height of the image preview area',
        'title_font_size': 'Title font size',
        'title_font_size_desc': 'Set the size of the title font',
        'summary_length': 'Summary length',
        'summary_length_desc': 'Set the length of the summary',
        'enable_file_watcher': 'Enable file watcher',
        'enable_file_watcher_desc': 'When enabled, the view will automatically update when files change. If disabled, you need to click the refresh button manually',
        'reset_to_default': 'Reset to default',
        'reset_to_default_desc': 'Reset all settings to default values',
        'settings_reset_notice': 'Settings have been reset to default values',
        'ignored_folders_settings': 'Ignore folders settings',
        'display_mode_settings': 'Display mode settings',
        'show_bookmarks_mode': 'Show bookmarks mode',
        'show_search_mode': 'Show search results mode',
        'show_backlinks_mode': 'Show backlinks mode',
        'show_all_files_mode': 'Show all files mode',
        'show_recent_files_mode': 'Show recent files mode',
        'show_random_note_mode': 'Show random note mode',
        'random_note_notes_only': 'Notes Only',
        'random_note_include_media_files': 'Include Media Files',
        
        // Show "Parent Folder" option setting
        'show_parent_folder_item': 'Show "Parent Folder" item',
        'show_parent_folder_item_desc': 'Show a "Parent Folder" item as the first item in the grid',
        'parent_folder': 'Parent Folder',
        
        // Default open location setting
        'default_open_location': 'Default open location',
        'default_open_location_desc': 'Set the default location to open the grid view',
        'open_in_left_sidebar': 'Open in left sidebar',
        'open_in_right_sidebar': 'Open in right sidebar',
        'open_in_new_tab': 'Open in new tab',
        'reuse_existing_leaf': 'Reuse existing view',
        'reuse_existing_leaf_desc': 'When opening Grid View, prioritize using an existing view instead of creating a new one',

        'custom_document_extensions': 'Custom Document Extensions',
        'custom_document_extensions_desc': 'Additional document extensions (comma-separated, without dots)',
        'custom_document_extensions_placeholder': 'e.g., txt,doc,docx',

        // Select Folder Dialog
        'select_folders': 'Select folder',
        'open_grid_view': 'Open grid view',
        'open_in_grid_view': 'Open in grid view',
        'open_note_in_grid_view': 'Open note in grid view',
        'open_backlinks_in_grid_view': 'Open backlinks in grid view',
        'open_recent_files_in_grid_view': 'Open current note in recent files',
        'open_settings': 'Open settings',
        'open_new_grid_view': 'Open new grid view',
        'delete_note': 'Delete file',
        'open_folder_note': 'Open folder note',
        'create_folder_note': 'Create folder note',
        'delete_folder_note': 'Delete folder note',
        'edit_folder_note_settings': 'Edit folder note settings',
        'ignore_folder': 'Ignore this folder',
        'searching': 'Searching...',
        'no_files': 'No files found',
        'filter_folders': 'Filter folders...',

        // Folder Note Settings Dialog
        'folder_note_settings': 'Folder Note Settings',
        'folder_sort_type': 'Folder Sort Type',
        'folder_sort_type_desc': 'Set the default sort type for this folder',
        'folder_color': 'Folder Color',
        'folder_color_desc': 'Set the display color for this folder',
        'default_sort': 'Use Default Sort',
        'no_color': 'No Color',
        'color_red': 'Red',
        'color_orange': 'Orange',
        'color_yellow': 'Yellow',
        'color_green': 'Green',
        'color_cyan': 'Cyan',
        'color_blue': 'Blue',
        'color_purple': 'Purple',
        'color_pink': 'Pink',
        'confirm': 'Confirm',
        'note_color_settings': 'Note color settings',
        'note_color': 'Note color',
        'note_color_desc': 'Set the display color for this note',
        'set_note_color': 'Set note color',
    },
    'zh': {
        // 通知信息
        'bookmarks_plugin_disabled': '请先启用书签插件',

        // 按钮和标签
        'sorting': '排序方式',
        'refresh': '刷新',
        'reselect': '重新选择位置',
        'go_up': '返回上级文件夹',
        'no_backlinks': '没有反向链接',
        'search': '搜索',
        'search_placeholder': '搜索关键字',
        'search_current_location_only': '仅搜索当前位置',
        'cancel': '取消',
        'new_note': '新建笔记',
        'untitled': '未命名',
        'files': '个文件',
        'add': '添加',

        // 视图标题
        'grid_view_title': '网格视图',
        'bookmarks_mode': '书签',
        'folder_mode': '文件夹',
        'search_results': '搜索结果',
        'backlinks_mode': '反向链接',
        'all_files_mode': '所有文件',
        'recent_files_mode': '最近文件',
        'random_note_mode': '随机笔记',

        // 排序选项
        'sort_name_asc': '名称 (A → Z)',
        'sort_name_desc': '名称 (Z → A)',
        'sort_mtime_desc': '修改时间 (新 → 旧)',
        'sort_mtime_asc': '修改时间 (旧 → 新)',
        'sort_ctime_desc': '创建时间 (新 → 旧)',
        'sort_ctime_asc': '创建时间 (旧 → 新)',
        'sort_random': '随机排序',

        // 设置
        'grid_view_settings': '网格视图设置',
        'media_files_settings': '媒体文件设置',
        'show_media_files': '显示图片和视频',
        'show_media_files_desc': '在网格视图中显示图片和视频文件',
        'search_media_files': '搜索图片和视频',
        'search_media_files_desc': '在搜索结果中包含图片和视频文件（仅在启用显示图片和视频时有效）',
        'show_video_thumbnails': '显示视频缩略图',
        'show_video_thumbnails_desc': '在网格视图中显示视频的缩略图，关闭时将显示播放图标',
        'ignored_folders': '忽略的文件夹',
        'ignored_folders_desc': '在这里设置要忽略的文件夹',
        'add_ignored_folder': '添加忽略文件夹',
        'no_ignored_folders': '没有忽略的文件夹。',
        'ignored_folder_patterns': '以字符串忽略文件夹和文件',
        'ignored_folder_patterns_desc': '使用字符串模式忽略文件夹和文件（支持正则表达式）',
        'add_ignored_folder_pattern': '添加忽略文件夹模式',
        'ignored_folder_pattern_placeholder': '输入文件夹名称或正则表达式',
        'no_ignored_folder_patterns': '没有忽略的文件夹模式。',
        'remove': '移除',
        'default_sort_type': '默认排序模式',
        'default_sort_type_desc': '设置打开网格视图时的默认排序模式',
        'modified_date_field': '"修改时间"字段名称',
        'modified_date_field_desc': '设置 frontmatter 中用于笔记修改时间的字段名称',
        'created_date_field': '"创建时间"字段名称',
        'created_date_field_desc': '设置 frontmatter 中用于笔记创建时间的字段名称',
        'grid_item_width': '网格项目宽度',
        'grid_item_width_desc': '设置网格项目的宽度',
        'grid_item_height': '网格项目高度',
        'grid_item_height_desc': '设置网格项目的高度 (设为0时为自动调整)',
        'image_area_width': '图片区域宽度',
        'image_area_width_desc': '设置图片预览区域的宽度',
        'image_area_height': '图片区域高度',
        'image_area_height_desc': '设置图片预览区域的高度',
        'title_font_size': '标题字体大小',
        'title_font_size_desc': '设置标题字体的大小',
        'summary_length': '摘要长度',
        'summary_length_desc': '设置摘要的长度',
        'enable_file_watcher': '启用文件监控',
        'enable_file_watcher_desc': '启用后会自动检测文件变更并更新视图，关闭后需手动点击刷新按钮',
        'reset_to_default': '重置为默认值',
        'reset_to_default_desc': '将所有设置重置为默认值',
        'settings_reset_notice': '设置值已重置为默认值',
        'ignored_folders_settings': '忽略文件夹设置',
        'display_mode_settings': '显示模式设置',
        'show_bookmarks_mode': '显示书签模式',
        'show_search_mode': '显示搜索结果模式',
        'show_backlinks_mode': '显示反向链接模式',
        'show_all_files_mode': '显示所有文件模式',
        'show_recent_files_mode': '显示最近文件模式',
        'show_random_note_mode': '显示随机笔记模式',
        'random_note_notes_only': '仅笔记',
        'random_note_include_media_files': '包含图片视频',
        
        // 显示"返回上级文件夹"选项设置
        'show_parent_folder_item': '显示「返回上级文件夹」',
        'show_parent_folder_item_desc': '在网格的第一项显示「返回上级文件夹」选项',
        'parent_folder': '上级文件夹',
        
        // 默认打开位置设置
        'default_open_location': '默认打开位置',
        'default_open_location_desc': '设置网格视图默认打开的位置',
        'open_in_left_sidebar': '在左侧边栏打开',
        'open_in_right_sidebar': '在右侧边栏打开',
        'open_in_new_tab': '在新标签页打开',
        'reuse_existing_leaf': '重复使用已打开的视图',
        'reuse_existing_leaf_desc': '打开网格视图时，优先使用已打开的视图而非创建新视图',

        'custom_document_extensions': '自定义文件扩展名',
        'custom_document_extensions_desc': '额外的文件扩展名（用逗号分隔，不含点号）',
        'custom_document_extensions_placeholder': '例如：txt,doc,docx',

        // 选择文件夹对话框
        'select_folders': '选择文件夹',
        'open_grid_view': '打开网格视图',
        'open_in_grid_view': '在网格视图中打开',
        'open_note_in_grid_view': '在网格视图中打开当前笔记',
        'open_backlinks_in_grid_view': '在网格视图中打开反向链接',
        'open_recent_files_in_grid_view': '在最近文件中打开当前笔记',
        'open_settings': '打开设置',
        'open_new_grid_view': '打开新网格视图',
        'delete_note': '删除文件',
        'open_folder_note': '打开文件夹笔记',
        'create_folder_note': '创建文件夹笔记',
        'delete_folder_note': '删除文件夹笔记',
        'edit_folder_note_settings': '编辑文件夹笔记设置',
        'ignore_folder': '忽略此文件夹',
        'searching': '搜索中...',
        'no_files': '没有找到任何文件',
        'filter_folders': '筛选文件夹...',

        // 文件夹笔记设置对话框
        'folder_note_settings': '文件夹笔记设置',
        'folder_sort_type': '文件夹排序方式',
        'folder_sort_type_desc': '设置此文件夹的默认排序方式',
        'folder_color': '文件夹颜色',
        'folder_color_desc': '设置此文件夹的显示颜色',
        'default_sort': '使用默认排序',
        'no_color': '无颜色',
        'color_red': '红色',
        'color_orange': '橙色',
        'color_yellow': '黄色',
        'color_green': '绿色',
        'color_cyan': '青色',
        'color_blue': '蓝色',
        'color_purple': '紫色',
        'color_pink': '粉色',
        'confirm': '确认',
        'note_color_settings': '笔记颜色设置',
        'note_color': '笔记颜色',
        'note_color_desc': '设置此笔记的显示颜色',
        'set_note_color': '设置笔记颜色',
    },
    'ja': {
        // 通知メッジ
        'bookmarks_plugin_disabled': 'ブックマークプラグインを有効にしてください',

        // ボタンとラベル
        'sorting': '並び替え',
        'refresh': '更新',
        'reselect': '再選択',
        'go_up': '上の階層へ',
        'no_backlinks': 'バックリンクなし',
        'search': '検索',
        'search_placeholder': 'キーワード検索',
        'search_current_location_only': '現在の場所のみ検索',
        'cancel': 'キャンセル',
        'new_note': '新規ノート',
        'untitled': '無題',
        'files': 'ファイル',
        'add': '追加',

        // ビュータイトル
        'grid_view_title': 'グリッドビュー',
        'bookmarks_mode': 'ブックマーク',
        'folder_mode': 'フォルダ',
        'search_results': '検索結果',
        'backlinks_mode': 'バックリンク',
        'all_files_mode': 'すべてのファイル',
        'recent_files_mode': '最近のファイル',
        'random_note_mode': 'ランダムノート',

        // 並べ替えオプション
        'sort_name_asc': '名前 (A → Z)',
        'sort_name_desc': '名前 (Z → A)',
        'sort_mtime_desc': '更新日時 (新 → 古)',
        'sort_mtime_asc': '更新日時 (古 → 新)',
        'sort_ctime_desc': '作成日時 (新 → 古)',
        'sort_ctime_asc': '作成日時 (古 → 新)',
        'sort_random': 'ランダム',

        // 設定
        'grid_view_settings': 'グリッドビュー設定',
        'media_files_settings': 'メディアファイル設定',
        'show_media_files': '画像と動画を表示',
        'show_media_files_desc': 'グリッドビューで画像と動画ファイルを表示する',
        'search_media_files': '画像と動画を検索',
        'search_media_files_desc': '検索結果に画像と動画ファイルを含める（画像と動画の表示が有効な場合のみ）',
        'show_video_thumbnails': '動画のサムネイルを表示',
        'show_video_thumbnails_desc': 'グリッドビューで動画のサムネイルを表示する、無効の場合は再生アイコンを表示',
        'ignored_folders': '無視するフォルダ',
        'ignored_folders_desc': '無視するフォルダを設定する',
        'add_ignored_folder': '無視するフォルダを追加',
        'no_ignored_folders': '無視するフォルダはありません。',
        'ignored_folder_patterns': 'パターンでフォルダとファイルを無視',
        'ignored_folder_patterns_desc': '文字列パターンを使用してフォルダとファイルを無視する（正規表現をサポート）',
        'add_ignored_folder_pattern': 'フォルダパターンを追加',
        'ignored_folder_pattern_placeholder': 'フォルダ名または正規表現パターンを入力',
        'no_ignored_folder_patterns': '無視するフォルダパターンはありません。',
        'remove': '削除',
        'default_sort_type': 'デフォルトの並び替え',
        'default_sort_type_desc': 'グリッドビューを開いたときのデフォルトの並び替え方法を設定',
        'modified_date_field': '"更新日"フィールド名',
        'modified_date_field_desc': 'frontmatterで更新日として使用するフィールド名を設定',
        'created_date_field': '"作成日"フィールド名',
        'created_date_field_desc': 'frontmatterで作成日として使用するフィールド名を設定',
        'grid_item_width': 'グリッドアイテムの幅',
        'grid_item_width_desc': 'グリッドアイテムの幅を設定',
        'grid_item_height': 'グリッドアイテムの高さ',
        'grid_item_height_desc': 'グリッドアイテムの高さを設定（0に設定すると自動調整）',
        'image_area_width': '画像エリアの幅',
        'image_area_width_desc': '画像プレビューエリアの幅を設定',
        'image_area_height': '画像エリアの高さ',
        'image_area_height_desc': '画像プレビューエリアの高さを設定',
        'title_font_size': 'タイトルのフォントサイズ',
        'title_font_size_desc': 'タイトルのフォントサイズを設定',
        'summary_length': '要約の長さ',
        'summary_length_desc': '要約の長さを設定',
        'enable_file_watcher': 'ファイル監視を有効にする',
        'enable_file_watcher_desc': '有効にすると、ファイルの変更を自動的に検出してビューを更新します。無効の場合は、更新ボタンを手動でクリックする必要があります',
        'reset_to_default': 'デフォルトに戻す',
        'reset_to_default_desc': 'すべての設定をデフォルト値に戻',
        'settings_reset_notice': '設定値がデフォルト値にリセットされました',
        'ignored_folders_settings': '無視するフォルダ設定',
        'display_mode_settings': '表示モード設定',
        'show_bookmarks_mode': 'ブックマークモードを表示',
        'show_search_mode': '検索結果モードを表示',
        'show_backlinks_mode': 'バックリンクモードを表示',
        'show_all_files_mode': '全ファイルモードを表示',
        'show_recent_files_mode': '最近ファイルモードを表示',
        'show_random_note_mode': 'ランダムノートモードを表示',
        'random_note_notes_only': 'ノートのみ',
        'random_note_include_media_files': 'メディアを含む',
        
        // 「親フォルダ」オプション設定を表示
        'show_parent_folder_item': '「親フォルダ」項目を表示',
        'show_parent_folder_item_desc': 'グリッドの最初の項目として「親フォルダ」項目を表示します',
        'parent_folder': '親フォルダ',
        
        // 開く場所設定
        'default_open_location': 'デフォルトの開く場所',
        'default_open_location_desc': 'グリッドビューを開くデフォルトの場所を設定',
        'open_in_left_sidebar': '左サイドバーで開く',
        'open_in_right_sidebar': '右サイドバーで開く',
        'open_in_new_tab': '新しいタブで開く',
        'reuse_existing_leaf': '既存のビューを再利用',
        'reuse_existing_leaf_desc': 'グリッドビューを開くとき、新しいビューを作成せずに既存のビューを優先使用',

        'custom_document_extensions': 'カスタム文書拡張子',
        'custom_document_extensions_desc': '追加の文書拡張子（カンマ区切り、ドット無し）',
        'custom_document_extensions_placeholder': '例：txt,doc,docx',

        // フォルダ選択ダイアログ
        'select_folders': 'フォルダを選択',
        'open_grid_view': 'グリッドビューを開く',
        'open_in_grid_view': 'グリッドビューで開く',
        'open_note_in_grid_view': 'グリッドビューで現在のノートを開く',
        'open_backlinks_in_grid_view': 'グリッドビューでバックリンクを開く',
        'open_recent_files_in_grid_view': '最近のファイルで現在のノートを開く',
        'open_settings': '設定を開く',
        'open_new_grid_view': '新しいグリッドビューを開く',
        'delete_note': 'ファイルを削除',
        'open_folder_note': 'フォルダーノートを開く',
        'create_folder_note': 'フォルダーノートを作成',
        'delete_folder_note': 'フォルダーノートを削除',
        'edit_folder_note_settings': 'フォルダーノート設定を編集',
        'ignore_folder': 'このフォルダーを無視',
        'searching': '検索中...',
        'no_files': 'ファイルが見つかりません',
        'filter_folders': 'フォルダをフィルタリング...',

        // フォルダーノート設定ダイアログ
        'folder_note_settings': 'フォルダーノート設定',
        'folder_sort_type': 'フォルダの並び替え',
        'folder_sort_type_desc': 'このフォルダのデフォルトの並び替え方法を設定',
        'folder_color': 'フォルダの色',
        'folder_color_desc': 'このフォルダの表示色を設定',
        'default_sort': 'デフォルトの並び替え',
        'no_color': '色なし',
        'color_red': '赤',
        'color_orange': 'オレンジ',
        'color_yellow': '黄',
        'color_green': '緑',
        'color_cyan': 'シアン',
        'color_blue': '青',
        'color_purple': '紫',
        'color_pink': 'ピンク',
        'confirm': '確認',
        'note_color_settings': 'ノート色設定',
        'note_color': 'ノート色',
        'note_color_desc': 'このノートの表示色を設定',
        'set_note_color': 'ノート色を設定',
    }
}
