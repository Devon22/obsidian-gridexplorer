import { TFile, TFolder, getFrontMatterInfo } from 'obsidian';
import { type GallerySettings } from './settings';
import { GridView } from './GridView';

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
    const defaultDocumentExtensions = ['md', 'pdf', 'canvas'];
    const extension = file.extension.toLowerCase();
    return defaultDocumentExtensions.includes(extension) || 
            customDocumentExtensions.includes(extension);
}

// 檢查檔案是否為圖片檔案
export function isImageFile(file: TFile): boolean {
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg'];
    return imageExtensions.includes(file.extension.toLowerCase());
}

// 檢查檔案是否為影片檔案
export function isVideoFile(file: TFile): boolean {
    const videoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'ogv'];
    return videoExtensions.includes(file.extension.toLowerCase());
}

// 檢查檔案是否為音樂檔案
export function isAudioFile(file: TFile): boolean {
    const audioExtensions = ['flac', 'm4a', 'mp3', 'ogg', 'wav', '3gp'];
    return audioExtensions.includes(file.extension.toLowerCase());
}

// 檢查檔案是否為媒體檔案
export function isMediaFile(file: TFile): boolean {
    return isImageFile(file) || isVideoFile(file) || isAudioFile(file);
}

//排序檔案
export function sortFiles(files: TFile[], gridView: GridView): TFile[] {
    const app = gridView.app;
    const settings = gridView.plugin.settings;
    const sortType = gridView.folderSortType ? gridView.folderSortType : gridView.sortType;

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
                    const fieldName = settings.modifiedDateField;
                    const dateStr = metadata.frontmatter[fieldName];
                    if (dateStr) {
                        const date = new Date(dateStr);
                        if (!isNaN(date.getTime())) {
                            return date.getTime();
                        }
                    }
                }
                return file.stat.mtime;
            })(),
            cDate: (() => {
                if (metadata?.frontmatter) {
                    const fieldName = settings.createdDateField;
                    const dateStr = metadata.frontmatter[fieldName];
                    if (dateStr) {
                        const date = new Date(dateStr);
                        if (!isNaN(date.getTime())) {
                            return date.getTime();
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

//忽略檔案
export function ignoredFiles(files: TFile[], gridView: GridView): TFile[] {
    const settings = gridView.plugin.settings;
    return files.filter(file => {
        // 檢查是否在忽略的資料夾中
        const isInIgnoredFolder = settings.ignoredFolders.some(folder => 
            file.path.startsWith(`${folder}/`)
        );
        
        if (isInIgnoredFolder) {
            return false;
        }
        
        // 檢查資料夾是否符合忽略的模式
        if (settings.ignoredFolderPatterns && settings.ignoredFolderPatterns.length > 0) {
            const matchesIgnoredPattern = settings.ignoredFolderPatterns.some(pattern => {
                try {
                    // 嘗試將模式作為正則表達式處理
                    // 如果模式包含特殊字符，使用正則表達式處理
                    if (/[\^\$\*\+\?\(\)\[\]\{\}\|\\]/.test(pattern)) {
                        const regex = new RegExp(pattern); 
                        // 檢查檔案路徑是否符合正則表達式
                        return regex.test(file.path);
                    } else {
                        // 如果模式不包含特殊字符，直接檢查檔案路徑
                        return file.path.toLowerCase().includes(pattern.toLowerCase())
                    }
                } catch (error) {
                    // 如果正則表達式無效，直接檢查檔案路徑
                    return file.path.toLowerCase().includes(pattern.toLowerCase())
                }
            });
            // 如果符合任何忽略模式，則忽略此檔案
            return !matchesIgnoredPattern;
        }
        
        return true;
    });
}

// 獲取檔案
export async function getFiles(gridView: GridView): Promise<TFile[]> {
    const app = gridView.app;
    const settings = gridView.plugin.settings;
    const sourceMode = gridView.sourceMode;
    const sourcePath = gridView.sourcePath;
    const randomNoteIncludeMedia = gridView.randomNoteIncludeMedia;

    if (sourceMode === 'folder' && sourcePath) {
        // 獲取指定資料夾內的所有 Markdown、圖片和影片檔案
        const folder = app.vault.getAbstractFileByPath(sourcePath);
        if (folder instanceof TFolder) {
            // 只取得當前資料夾中的支援檔案，不包含子資料夾
            const files = folder.children.filter((file): file is TFile => {
                if (!(file instanceof TFile)) return false;
                
                // 如果是 Markdown 檔案，直接包含
                if (isDocumentFile(file) ||
                    (settings.showMediaFiles && isMediaFile(file))) {
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
    } else if (sourceMode === 'all-files') {
        // 所有筆記模式
        const allVaultFiles = app.vault.getFiles().filter(file => {
            // 根據設定決定是否包含媒體檔案
            if (isDocumentFile(file) ||
                (settings.showMediaFiles && randomNoteIncludeMedia && isMediaFile(file))) {
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
                (settings.showMediaFiles && randomNoteIncludeMedia && isMediaFile(file))) {
                return true;
            }
            return false;
        });
        //臨時的排序類型
        const sortType = gridView.sortType;
        gridView.sortType = 'mtime-desc';
        const sortedFiles = sortFiles(recentFiles, gridView);
        gridView.sortType = sortType;
        return sortedFiles;
    } else if (sourceMode === 'random-note') {
        // 隨機筆記模式，從所有筆記中隨機選取
        const randomFiles = app.vault.getFiles().filter(file => {
            // 根據設定決定是否包含媒體檔案
            if (isDocumentFile(file) ||
                (settings.showMediaFiles && randomNoteIncludeMedia && isMediaFile(file))) {
                return true;
            }
            return false;
        }).sort(() => Math.random() - 0.5);
        return randomFiles; // 隨機模式不需要額外排序
    } else {
        return [];
    }
}
