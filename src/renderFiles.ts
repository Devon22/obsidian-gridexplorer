import { TFile } from 'obsidian';
import { GridView } from './GridView';
import { isDocumentFile, isMediaFile, sortFiles, ignoredFiles, getFiles } from './fileUtils';
import { t } from './translations';

export async function renderFiles(gridView: GridView, container: HTMLElement) {

    let loadingDiv: HTMLElement | null = null;
    if (gridView.searchQuery || gridView.sourceMode === 'tasks') {
        // 顯示搜尋中的提示
        loadingDiv = container.createDiv({ text: t('searching'), cls: 'ge-loading-indicator' });
    }

    let files: TFile[] = [];
    // 使用 Map 來記錄原始順序
    let fileIndexMap = new Map<TFile, number>();
    if (gridView.searchQuery) {
        // 取得 vault 中所有支援的檔案
        let allFiles: TFile[] = [];
        if (!gridView.searchCurrentLocationOnly) {
            // 全部檔案
            allFiles = gridView.app.vault.getFiles().filter(file => 
                isDocumentFile(file) || (isMediaFile(file) && gridView.searchMediaFiles)
            );
        } else {
            // 當前位置檔案
            allFiles = await getFiles(gridView, gridView.searchMediaFiles);

            if (gridView.sourceMode === 'bookmarks') {
                allFiles = allFiles.filter(file => 
                    isDocumentFile(file) || (isMediaFile(file) && gridView.searchMediaFiles)
                );
                // 使用 Map 來記錄原始順序
                allFiles.forEach((file, index) => {
                    fileIndexMap.set(file, index);
                });
            } else if (gridView.sourceMode === 'search') {
                allFiles = allFiles.filter(file =>
                    isDocumentFile(file) || (isMediaFile(file) && gridView.searchMediaFiles)
                );
            } else if (gridView.sourceMode === 'recent-files') {
                // 搜尋"最近檔案"的當前位置時，先作忽略檔案和只取前n筆
                allFiles = ignoredFiles(allFiles, gridView).slice(0, gridView.plugin.settings.recentFilesCount);
            } else if (gridView.sourceMode.startsWith('custom-')) {
                // 使用 Map 來記錄原始順序
                allFiles.forEach((file, index) => {
                    fileIndexMap.set(file, index);
                });
            }
        }

        // 根據搜尋關鍵字進行過濾（不分大小寫）
        const searchTerms = gridView.searchQuery.toLowerCase().split(/\s+/).filter(term => term.trim() !== '');
        
        // 分離標籤搜尋、一般搜尋和連結搜尋
        const tagTerms: string[] = [];
        const linkTerms: string[] = [];
        const normalTerms: string[] = [];
        
        for (const term of searchTerms) {
            if (term.startsWith('#')) {
                tagTerms.push(term.substring(1));
            } else if (term.startsWith('[[') && term.endsWith(']]')) {
                linkTerms.push(term.slice(2, -2)); // 移除 [[ 和 ]]
            } else {
                normalTerms.push(term);
            }
        }

        // 檢查是否有 Obsidian 連結格式 [[ ]]
        let linkTargetFileSets: Set<string>[] = [];
        const hasLinkSearch = linkTerms.length > 0;
        
        if (hasLinkSearch) {
            for (const linkTarget of linkTerms) {                  
                // 尋找目標檔案
                let targetFile = gridView.app.vault.getAbstractFileByPath(linkTarget + '.md');
                if (!targetFile) {
                    targetFile = gridView.app.metadataCache.getFirstLinkpathDest(linkTarget, '');
                }
                
                if (targetFile && 'extension' in targetFile) {
                    // 使用 Obsidian 的 getBacklinksForFile API
                    const backlinks = (gridView.app.metadataCache as any).getBacklinksForFile(targetFile);
                    
                    const currentLinkFiles = new Set<string>();
                    if (backlinks) {
                        // 收集所有反向連結的檔案路徑
                        for (const [filePath, links] of backlinks.data.entries()) {
                            currentLinkFiles.add(filePath);
                        }
                    }
                    linkTargetFileSets.push(currentLinkFiles);
                } else {
                    // 如果找不到目標檔案，加入空集合
                    linkTargetFileSets.push(new Set<string>());
                }
            }
        }
        
        // 使用 Promise.all 來非同步地讀取所有檔案內容，順序可能會跟之前不同
        await Promise.all(
            allFiles.map(async file => {
                // 檢查連結搜尋條件：檔案必須在所有連結的反向連結中
                if (hasLinkSearch) {
                    const isInAllLinkTargets = linkTargetFileSets.every(linkSet => linkSet.has(file.path));
                    if (!isInAllLinkTargets) {
                        return; // 如果檔案不在所有連結的反向連結中，直接跳過
                    }
                }
                
                const fileName = file.name.toLowerCase();
                let matchesNormalTerms = true;
                let matchesTags = true;
                
                // 檢查一般搜尋詞
                if (normalTerms.length > 0) {
                    if (gridView.searchFilesNameOnly) {
                        // 僅檢查檔名
                        matchesNormalTerms = normalTerms.every(term => fileName.includes(term));
                    } else {
                        // 檢查每個一般搜尋字串是否存在於檔名或（若為 Markdown）檔案內容中
                        matchesNormalTerms = true;
                        let contentLower: string | null = null;
                        for (const term of normalTerms) {
                            if (fileName.includes(term)) {
                                continue; // 此關鍵字已在檔名中找到
                            }
                            
                            if (file.extension === 'md') {
                                // 延遲讀取內容，避免不必要的 IO
                                if (contentLower === null) {
                                    contentLower = (await gridView.app.vault.cachedRead(file)).toLowerCase();
                                }
                                if (contentLower.includes(term)) {
                                    continue; // 此關鍵字在內容中找到
                                }
                            }
                            // 若此關鍵字既不在檔名也不在內容中，則不符合
                            matchesNormalTerms = false;
                            break;
                        }
                    }
                }
                
                // 檢查標籤搜尋詞
                if (tagTerms.length > 0) {
                    if (file.extension !== 'md') {
                        matchesTags = false; // 非 Markdown 檔案不能匹配標籤
                    } else {
                        const fileCache = gridView.app.metadataCache.getFileCache(file);
                        matchesTags = false;
                        
                        if (fileCache) {
                            const collectedTags: string[] = [];

                            // 內文標籤
                            if (Array.isArray(fileCache.tags)) {
                                for (const t of fileCache.tags) {
                                    if (t && t.tag) {
                                        const clean = t.tag.toLowerCase().replace(/^#/, '');
                                        collectedTags.push(...clean.split(/\s+/).filter(st => st.trim() !== ''));
                                    }
                                }
                            }

                            // frontmatter 標籤
                            if (fileCache.frontmatter && fileCache.frontmatter.tags) {
                                const fmTags = fileCache.frontmatter.tags;
                                if (typeof fmTags === 'string') {
                                    collectedTags.push(
                                        ...fmTags.split(/[,\s]+/)
                                            .map(t => t.toLowerCase().replace(/^#/, ''))
                                            .filter(t => t.trim() !== '')
                                    );
                                } else if (Array.isArray(fmTags)) {
                                    for (const t of fmTags) {
                                        if (typeof t === 'string') {
                                            const clean = t.toLowerCase().replace(/^#/, '');
                                            collectedTags.push(...clean.split(/\s+/).filter(st => st.trim() !== ''));
                                        }
                                    }
                                }
                            }

                            matchesTags = tagTerms.every(tag => collectedTags.includes(tag));
                        }
                    }
                }
                
                // 只有當所有條件都符合時才加入結果
                if (matchesNormalTerms && matchesTags) {
                    files.push(file);
                }
            })
        );
        
        // 排序檔案
        if (!gridView.searchCurrentLocationOnly) {
            // 搜尋所有檔案時
            files = sortFiles(files, gridView);
        } else {
            // 非搜尋所有檔案時
            if (gridView.sourceMode === 'bookmarks') {
                // 保持原始順序
                files.sort((a, b) => {
                    const indexA = fileIndexMap.get(a) ?? Number.MAX_SAFE_INTEGER;
                    const indexB = fileIndexMap.get(b) ?? Number.MAX_SAFE_INTEGER;
                    return indexA - indexB;
                });
            } else if (gridView.sourceMode === 'recent-files') {
                // 臨時的排序類型
                const sortType = gridView.sortType;
                gridView.sortType = 'mtime-desc';
                files = sortFiles(files, gridView);
                gridView.sortType = sortType;
            } else if (gridView.sourceMode === 'random-note') {
                // 臨時的排序類型
                const sortType = gridView.sortType;
                gridView.sortType = 'random';
                files = sortFiles(files, gridView);
                gridView.sortType = sortType;
            } else if (gridView.sourceMode.startsWith('custom-')) {
                // 保持原始順序
                files.sort((a, b) => {
                    const indexA = fileIndexMap.get(a) ?? Number.MAX_SAFE_INTEGER;
                    const indexB = fileIndexMap.get(b) ?? Number.MAX_SAFE_INTEGER;
                    return indexA - indexB;
                });
            } else {
                files = sortFiles(files, gridView);
            }
        }

        // 忽略檔案
        files = ignoredFiles(files, gridView);
    } else {
        // 無搜尋關鍵字的情況
        files = await getFiles(gridView, gridView.includeMedia);

        // 忽略檔案
        files = ignoredFiles(files, gridView)

        // 最近檔案模式，只取前n筆
        if (gridView.sourceMode === 'recent-files') {
            files = files.slice(0, gridView.plugin.settings.recentFilesCount);
        }

        // 隨機筆記模式，只取前n筆
        if (gridView.sourceMode === 'random-note') {
            files = files.slice(0, gridView.plugin.settings.randomNoteCount);
        }
    }

    if (loadingDiv) {
        loadingDiv.remove();
    }

    return files;
}
