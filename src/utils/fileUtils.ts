import { TFile, TFolder, getFrontMatterInfo, Notice } from 'obsidian';
import { GridView } from '../GridView';
import { type GallerySettings } from '../settings';
import { t } from '../translations';

// 擴展 App 類型以包含 plugins 屬性
declare module 'obsidian' {
    interface App {
        plugins: {
            plugins: {
                [id: string]: any;
            };
        };
    }
}

// 媒體檔案副檔名集合
export const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg']);
export const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'ogv']);
export const AUDIO_EXTENSIONS = new Set(['flac', 'm4a', 'mp3', 'ogg', 'wav', '3gp']);
export const DOCUMENT_EXTENSIONS = new Set(['md', 'pdf', 'canvas', 'base']);

let customDocumentExtensions: string[] = [];

// 更新自訂文件副檔名列表
export function updateCustomDocumentExtensions(settings: GallerySettings) {
    if (settings.customDocumentExtensions) {
        customDocumentExtensions = settings.customDocumentExtensions
            .split(',')
            .map(ext => ext.trim().toLowerCase())
            .filter(ext => ext.length > 0);
    } else {
        customDocumentExtensions = [];
    }
}

// 檢查檔案是否為文件檔案
export function isDocumentFile(file: TFile): boolean {
    const extension = file.extension.toLowerCase();
    return DOCUMENT_EXTENSIONS.has(extension) || customDocumentExtensions.includes(extension);
}

// 檢查檔案是否為圖片檔案
export function isImageFile(file: TFile): boolean {
    return IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
}

// 檢查檔案是否為影片檔案
export function isVideoFile(file: TFile): boolean {
    return VIDEO_EXTENSIONS.has(file.extension.toLowerCase());
}

// 檢查檔案是否為音樂檔案
export function isAudioFile(file: TFile): boolean {
    return AUDIO_EXTENSIONS.has(file.extension.toLowerCase());
}

// 檢查檔案是否為媒體檔案
export function isMediaFile(file: TFile): boolean {
    return isImageFile(file) || isVideoFile(file) || isAudioFile(file);
}

//排序檔案（支援可選覆寫排序類型）
export function sortFiles(files: TFile[], gridView: GridView, overrideSortType?: string): TFile[] {
    const app = gridView.app;
    const settings = gridView.plugin.settings;
    const sortType = overrideSortType ?? gridView.sortType;

    // 檢查排序類型是否為非日期相關
    const isNonDateSort = ['name-asc', 'name-desc', 'random'].includes(sortType);

    // 檢查是否有任何日期欄位的設定
    const hasModifiedField = !!settings.modifiedDateField;
    const hasCreatedField = !!settings.createdDateField;
    const hasAnyDateField = hasModifiedField || hasCreatedField;
    
    // 符合以下任一條件就使用簡單排序：
    // 1. 非日期排序類型 (name-asc, name-desc, random)
    // 2. 沒有設定任何日期欄位
    const shouldUseSimpleSort = isNonDateSort || !hasAnyDateField;
    if (shouldUseSimpleSort) {
        if (sortType === 'name-asc') {
            return files.sort((a, b) => a.basename.localeCompare(b.basename, undefined, { numeric: true, sensitivity: 'base' }));
        } else if (sortType === 'name-desc') {
            return files.sort((a, b) => b.basename.localeCompare(a.basename, undefined, { numeric: true, sensitivity: 'base' }));
        } else if (sortType === 'mtime-desc') {
            return files.sort((a, b) => b.stat.mtime - a.stat.mtime);
        } else if (sortType === 'mtime-asc') {
            return files.sort((a, b) => a.stat.mtime - b.stat.mtime);
        } else if (sortType === 'ctime-desc') {
            return files.sort((a, b) => b.stat.ctime - a.stat.ctime);
        } else if (sortType === 'ctime-asc') {
            return files.sort((a, b) => a.stat.ctime - b.stat.ctime);
        } else if (sortType === 'random') {
            return files.sort(() => Math.random() - 0.5);
        } else {
            return files;
        }
    }

    // 處理需要讀取metadata的日期排序情況
    // 只有在以下條件都成立時才會執行：
    // 1. 是日期排序類型 (mtime-desc, mtime-asc, ctime-desc, ctime-asc)
    // 2. 至少設定了一個日期欄位 (modifiedDateField 或 createdDateField)
    const filesWithDates = files.map(file => {
        // 只對 .md 檔案讀取 metadata
        const shouldReadMetadata = file.extension === 'md';
        const metadata = shouldReadMetadata ? app.metadataCache.getFileCache(file) : null;
        
        return {
            file,
            mDate: (() => {
                if (metadata?.frontmatter) {
                    // 支援多個欄位名稱（用逗號隔開）
                    const fieldNames = settings.modifiedDateField
                        ? settings.modifiedDateField.split(',').map(f => f.trim()).filter(Boolean)
                        : [];
                    for (const fieldName of fieldNames) {
                        const dateStr = metadata.frontmatter[fieldName];
                        if (dateStr) {
                            const date = new Date(dateStr);
                            if (!isNaN(date.getTime())) {
                                return date.getTime();
                            }
                        }
                    }
                }
                return file.stat.mtime;
            })(),
            cDate: (() => {
                if (metadata?.frontmatter) {
                    // 支援多個欄位名稱（用逗號隔開）
                    const fieldNames = settings.createdDateField
                        ? settings.createdDateField.split(',').map(f => f.trim()).filter(Boolean)
                        : [];
                    for (const fieldName of fieldNames) {
                        const dateStr = metadata.frontmatter[fieldName];
                        if (dateStr) {
                            const date = new Date(dateStr);
                            if (!isNaN(date.getTime())) {
                                return date.getTime();
                            }
                        }
                    }
                }
                return file.stat.ctime;
            })()
        };
    });

    if (sortType === 'mtime-desc') {
        return filesWithDates.sort((a, b) => b.mDate - a.mDate).map(item => item.file);
    } else if (sortType === 'mtime-asc') {
        return filesWithDates.sort((a, b) => a.mDate - b.mDate).map(item => item.file);
    } else if (sortType === 'ctime-desc') {
        return filesWithDates.sort((a, b) => b.cDate - a.cDate).map(item => item.file);
    } else if (sortType === 'ctime-asc') {
        return filesWithDates.sort((a, b) => a.cDate - b.cDate).map(item => item.file);
    } else {
        return files;
    }
}

// 檢查資料夾是否應該被忽略
export function isFolderIgnored(folder: TFolder, ignoredFolders: string[], ignoredFolderPatterns: string[], showIgnoredFolders: boolean): boolean {
    // 如果開啟顯示忽略資料夾模式，則不忽略任何資料夾
    if (showIgnoredFolders) return false;

    // 檢查資料夾是否在忽略清單中
    const isInIgnoredFolders = ignoredFolders.some(ignored => 
        folder.path === ignored || folder.path.startsWith(ignored + '/')
    );
    
    if (isInIgnoredFolders) return true;
    
    // 檢查資料夾是否符合忽略的模式
    if (ignoredFolderPatterns && ignoredFolderPatterns.length > 0) {
        const matchesIgnoredPattern = ignoredFolderPatterns.some(pattern => {
            try {
                // 嘗試將模式作為正則表達式處理
                // 如果模式包含特殊字符，使用正則表達式處理
                if (/[\^\$\*\+\?\(\)\[\]\{\}\|\\]/.test(pattern)) {
                    const regex = new RegExp(pattern); 
                    return regex.test(folder.path);
                } else {
                    // 檢查資料夾名稱是否包含模式字串（不區分大小寫）
                    return folder.name.toLowerCase().includes(pattern.toLowerCase());
                }
            } catch (error) {
                // 如果正則表達式無效，直接檢查資料夾名稱
                return folder.name.toLowerCase().includes(pattern.toLowerCase());
            }
        });
        
        if (matchesIgnoredPattern) return true;
    }

    return false;
}

// 檢查檔案是否應該被忽略
export function ignoredFiles(files: TFile[], gridView: GridView): TFile[] {
    const settings = gridView.plugin.settings;
    
    // 如果開啟顯示忽略資料夾模式，則顯示所有檔案
    if (gridView.showIgnoredFolders) {
        return files;
    }
    
    // 建立一個快取來存儲已經檢查過的資料夾路徑
    const folderCache: {[path: string]: boolean} = {};
    
    return files.filter(file => {
        // 獲取檔案所在的資料夾路徑
        const folderPath = file.parent?.path || '/';
        
        // 如果快取中沒有這個資料夾的檢查結果，則進行檢查
        if (folderCache[folderPath] === undefined) {
            // 獲取資料夾對象
            const folder = gridView.app.vault.getAbstractFileByPath(folderPath);
            
            if (folder instanceof TFolder) {
                // 使用 isFolderIgnored 檢查資料夾是否應該被忽略
                folderCache[folderPath] = isFolderIgnored(
                    folder,
                    settings.ignoredFolders,
                    settings.ignoredFolderPatterns,
                    false // 這裡傳入 false 因為已經在前面檢查過 showIgnoredFolders
                );
            } else {
                // 如果無法獲取資料夾對象，則不忽略該檔案
                folderCache[folderPath] = false;
            }
        }
        
        // 如果資料夾被忽略，則過濾掉該檔案
        return !folderCache[folderPath];
    });
}

// 獲取檔案
export async function getFiles(gridView: GridView, includeMediaFiles: boolean): Promise<TFile[]> {
    const app = gridView.app;
    const settings = gridView.plugin.settings;
    const sourceMode = gridView.sourceMode;
    const sourcePath = gridView.sourcePath;

    if (sourceMode === 'folder' && sourcePath) {
        // 獲取指定資料夾內的所有 Markdown、圖片和影片檔案
        const folder = app.vault.getAbstractFileByPath(sourcePath);
        if (folder instanceof TFolder) {
            // 只取得當前資料夾中的支援檔案，不包含子資料夾
            const files = folder.children.filter((file): file is TFile => {
                if (!(file instanceof TFile)) return false;
                
                // 當存在搜尋關鍵字時，是否包含媒體檔案取決於 includeMediaFiles
                // 不存在搜尋關鍵字時，是否包含媒體檔案取決於 settings.showMediaFiles
                const allowMedia = settings.showMediaFiles && (!gridView.searchQuery || includeMediaFiles);
                    
                // 如果是文件檔案，直接包含；若為媒體檔案則依 allowMedia 判斷
                if (isDocumentFile(file) || (allowMedia && isMediaFile(file))) {
                    return true;
                }
                return false;
            });
            return sortFiles(files, gridView);
        }
        return [];
    } else if (sourceMode === 'search') {
        // 搜尋模式：使用 Obsidian 的搜尋功能
        const globalSearchPlugin = (app as any).internalPlugins.getPluginById('global-search');
        if (globalSearchPlugin?.instance) {
            const searchLeaf = (app as any).workspace.getLeavesOfType('search')[0];
            if (searchLeaf && searchLeaf.view && searchLeaf.view.dom) {
                const resultDomLookup = searchLeaf.view.dom.resultDomLookup;
                if (resultDomLookup) {
                    const files = Array.from(resultDomLookup.keys())
                    .filter((file): file is TFile => file instanceof TFile);
                    return sortFiles(files, gridView);
                }
            }
        }
        return [];
    } else if (sourceMode === 'backlinks') {        
        // 反向連結模式：找出所有引用當前筆記的檔案
        const activeFile = app.workspace.getActiveFile();
        if (!activeFile) {
            return [];
        }

        const backlinks = new Set();
        // 使用 resolvedLinks 來找出反向連結
        const resolvedLinks = app.metadataCache.resolvedLinks;
        for (const [sourcePath, links] of Object.entries(resolvedLinks)) {
            if (Object.keys(links).includes(activeFile.path)) {
                const sourceFile = app.vault.getAbstractFileByPath(sourcePath) as TFile;
                if (sourceFile) {
                        backlinks.add(sourceFile);
                    }
                }
            }

        return sortFiles(Array.from(backlinks) as TFile[], gridView);
    } else if (sourceMode === 'outgoinglinks') {
        // 外部連結模式：找出當前筆記所引用的檔案，並包含所有媒體連結
        const activeFile = app.workspace.getActiveFile();
        if (!activeFile) {
            return [];
        }

        const outgoingLinks = new Set<TFile>();
        // 使用 resolvedLinks 來找出外部連結
        const resolvedLinks = app.metadataCache.resolvedLinks;
        const fileLinks = resolvedLinks[activeFile.path];
        
        if (fileLinks) {
            for (const targetPath of Object.keys(fileLinks)) {
                const targetFile = app.vault.getAbstractFileByPath(targetPath) as TFile;
                if (targetFile && (isDocumentFile(targetFile) || 
                    (settings.showMediaFiles && isMediaFile(targetFile)))) {
                    outgoingLinks.add(targetFile);
                }
            }
        }

        // 讀取目前筆記內容，找出所有媒體連結
        if (settings.showMediaFiles) {
            try {
                const content = await app.vault.cachedRead(activeFile);
                // 去除 frontmatter
                const frontMatterInfo = getFrontMatterInfo(content);
                const contentWithoutFrontmatter = content.substring(frontMatterInfo.contentStart);

                // 正則找出所有媒體連結
                const mediaMatches = Array.from(contentWithoutFrontmatter.matchAll(/(?:!\[\[(.*?)(?:\|.*?)?\]\]|!\[(.*?)\]\((.*?)\))/g));
                for (const match of mediaMatches) {
                    // 內部連結 ![[xxx]]
                    let mediaPath = match[1] || match[3];
                    if (mediaPath) {
                        // 處理內部連結路徑（去除 | 之後的部分）
                        mediaPath = mediaPath.split('|')[0].trim();
                        // 取得對應的 TFile
                        const mediaFile = app.metadataCache.getFirstLinkpathDest(mediaPath, activeFile.path);
                        if (mediaFile && isMediaFile(mediaFile)) {
                            outgoingLinks.add(mediaFile);
                        }
                    }
                }
            } catch (e) {
                // 忽略讀取錯誤
            }
        }

        return sortFiles(Array.from(outgoingLinks), gridView);
    } else if(sourceMode === 'bookmarks') {
        // 書籤模式
        const bookmarksPlugin = (app as any).internalPlugins.plugins.bookmarks;
        if (!bookmarksPlugin?.enabled) {
            return [];
        }

        const bookmarks = bookmarksPlugin.instance.items;
        const bookmarkedFiles = new Set();
        
        const processBookmarkItem = (item: any) => {
            if (item.type === 'file') {
                const file = app.vault.getAbstractFileByPath(item.path);
                if (file instanceof TFile) {
                    // 根據設定決定是否包含媒體檔案
                    if (isDocumentFile(file) ||
                        (settings.showMediaFiles && isMediaFile(file))) {
                        bookmarkedFiles.add(file);
                    }
                }
            } else if (item.type === 'group' && item.items) {
                item.items.forEach(processBookmarkItem);
            }
        };
        
        bookmarks.forEach(processBookmarkItem);
        return Array.from(bookmarkedFiles) as TFile[];
    } else if (sourceMode === 'tasks') {
        // 任務模式
        const filesWithTasks = new Set<TFile>();
        const dv = this.app.plugins.plugins.dataview?.api;
        const tasksPlugin = app.plugins.plugins['obsidian-tasks-plugin'];
        if (tasksPlugin) {
            // 任務模式 - 使用 Tasks 插件 API
            try {
                // 獲取所有任務
                const allTasks = tasksPlugin.getTasks ? tasksPlugin.getTasks() : [];

                // 過濾任務
                for (const task of allTasks) {
                    const file = app.vault.getAbstractFileByPath(task.path);
                    if (!(file instanceof TFile)) continue;
                    
                    // 根據過濾條件檢查任務
                    if (gridView.taskFilter === 'uncompleted' && !task.isDone) {
                        filesWithTasks.add(file);
                    } else if (gridView.taskFilter === 'completed' && task.isDone) {
                        filesWithTasks.add(file);
                    } else if (gridView.taskFilter === 'all') {
                        filesWithTasks.add(file);
                    }
                }
            } catch (error) {
                console.error('Error getting tasks from Tasks plugin:', error);
                return [];
            }
        } else if (dv) {
            // 任務模式 - 使用 Dataview API
            try {
                const tasks = dv.pages().file.tasks;
                let filteredTasks;
                
                if (gridView.taskFilter === 'uncompleted') {
                    filteredTasks = tasks.where((t: { completed: boolean }) => !t.completed);
                } else if (gridView.taskFilter === 'completed') {
                    filteredTasks = tasks.where((t: { completed: boolean }) => t.completed);
                } else { // 'all'
                    filteredTasks = tasks;
                }
                
                for (const task of filteredTasks.array()) {
                    const file = app.vault.getAbstractFileByPath(task.path);
                    if (file instanceof TFile) {
                        filesWithTasks.add(file);
                    }
                }
            } catch (error) {
                console.error('Error getting tasks from Dataview:', error);
                return [];
            }
            
        } else {
            // 使用原生方法
            const markdownFiles = app.vault.getMarkdownFiles();
            for (const file of markdownFiles) {
                try {
                    const content = await app.vault.cachedRead(file);
                    let shouldAdd = false;
                    // 用 gridView.taskFilter 匹配 uncompleted、completed、all 任務
                    if (gridView.taskFilter === 'uncompleted') {
                        // 只匹配未完成的任務: - [ ] 或 * [ ]
                        shouldAdd = /^[\s]*[-*]\s*\[\s*\](?![^\[]*\[\s*[^\s\]]+\]).*$/m.test(content);
                    } else if (gridView.taskFilter === 'completed') {
                        // 只匹配所有任務均已完成的檔案（至少有一個已完成且沒有未完成）
                        const hasCompleted = /^[\s]*[-*]\s*\[x\](?![^\[]*\[\s*[^\s\]]+\]).*$/m.test(content);
                        const hasIncomplete = /^[\s]*[-*]\s*\[\s*\](?![^\[]*\[\s*[^\s\]]+\]).*$/m.test(content);
                        shouldAdd = hasCompleted && !hasIncomplete;
                    } else if (gridView.taskFilter === 'all') {
                        // 匹配任何任務（已完成或未完成皆可）
                        const hasIncomplete = /^[\s]*[-*]\s*\[\s*\](?![^\[]*\[\s*[^\s\]]+\]).*$/m.test(content);
                        const hasCompleted = /^[\s]*[-*]\s*\[x\](?![^\[]*\[\s*[^\s\]]+\]).*$/m.test(content);
                        shouldAdd = hasIncomplete || hasCompleted;
                    }
                    
                    if (shouldAdd) {
                        filesWithTasks.add(file);
                    }
                } catch (error) {
                    console.error(`Error reading file ${file.path}:`, error);
                    return [];
                }
            }
        }
        return sortFiles(Array.from(filesWithTasks), gridView);
    } else if (sourceMode === 'all-files') {
        // 所有筆記模式
        const allVaultFiles = app.vault.getFiles().filter(file => {
            // 根據設定決定是否包含媒體檔案
            if (isDocumentFile(file) ||
                (settings.showMediaFiles && includeMediaFiles && isMediaFile(file))) {
                return true;
            }
            return false;
        });
        return sortFiles(allVaultFiles, gridView);
    } else if (sourceMode === 'recent-files') {
        // 最近檔案模式
        const recentFiles = app.vault.getFiles().filter(file => {
            // 根據設定決定是否包含媒體檔案
            if (isDocumentFile(file) ||
                (settings.showMediaFiles && includeMediaFiles && isMediaFile(file))) {
                return true;
            }
            return false;
        });
        // 直接使用覆寫排序參數
        return sortFiles(recentFiles, gridView, 'mtime-desc');
    } else if (sourceMode === 'random-note') {
        // 隨機筆記模式，從所有筆記中隨機選取
        const randomFiles = app.vault.getFiles().filter(file => {
            // 根據設定決定是否包含媒體檔案
            if (isDocumentFile(file) ||
                (settings.showMediaFiles && includeMediaFiles && isMediaFile(file))) {
                return true;
            }
            return false;
        }).sort(() => Math.random() - 0.5);
        return randomFiles; // 隨機模式不需要額外排序
    } else if (sourceMode.startsWith('custom-')) {
        // 自訂模式
        const dvApi = app.plugins.plugins.dataview?.api;
        if (!dvApi) {
            new Notice(t('Dataview plugin is not enabled.'));
            return [];
        }

        const mode = settings.customModes.find(m => m.internalName === sourceMode);
        if (!mode) {
            return [];
        }

        // 依據 GridView 目前選擇的選項決定要使用哪段 Dataview 程式碼
        let dvCode: string | undefined = mode?.dataviewCode;
        if (mode && mode.options && mode.options.length > 0) {
            const idx = (gridView as any).customOptionIndex ?? -1;
            if (idx >= 0 && idx < mode.options.length) {
                dvCode = mode.options[idx].dataviewCode;
            }
        }
        
        try {
            const activeFile = app.workspace.getActiveFile();
            if (activeFile) {
                // 暫時添加 .current 到 dvApi 物件內
                dvApi.current = () => dvApi.page(activeFile.path);
            }

            const func = new Function('app', 'dv', dvCode!);
            const dvPagesResult = func(app, dvApi);
            const dvPages = Array.isArray(dvPagesResult) ? dvPagesResult : Array.from(dvPagesResult || []);

            if (!dvPages || dvPages.length === 0) {
                return [];
            }

            const files = new Set<TFile>();

            for (const page of dvPages) {
                // Add null checks for page and page.file
                if (page?.file?.path) {
                    const file = app.vault.getAbstractFileByPath(page.file.path);
                    if (file instanceof TFile) {
                        files.add(file);
                    }
                }
            }
            return sortFiles(Array.from(files) as TFile[], gridView);
        } catch (error) {
            console.error('Grid Explorer: Error executing Dataview query.', error);
            return [];
        }
    } else {
        return [];
    }
}
