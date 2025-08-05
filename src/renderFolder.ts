import { TFolder, TFile, Menu, Platform, setIcon, normalizePath, setTooltip } from 'obsidian';
import { GridView } from './GridView';
import { isFolderIgnored } from './fileUtils';
import { showFolderNoteSettingsModal } from './modal/folderNoteSettingsModal';
import { showFolderRenameModal } from './modal/folderRenameModal';
import { showFolderMoveModal } from './modal/folderMoveModal';
import { t } from './translations';

export async function renderFolder(gridView: GridView, container: HTMLElement) {

    // 如果是資料夾模式，先顯示所有子資料夾
    if (gridView.sourceMode === 'folder' && gridView.searchQuery === '') {
        const currentFolder = gridView.app.vault.getAbstractFileByPath(gridView.sourcePath || '/');
        if (currentFolder instanceof TFolder) {

            // 為網格容器添加拖曳目標功能（當前資料夾）
            if(Platform.isDesktop) {
                container.addEventListener('dragover', (event) => {
                    // 如果拖曳目標是資料夾項目，則不處理
                    if ((event.target as HTMLElement).closest('.ge-folder-item')) {
                        return;
                    }
                    // 防止預設行為以允許放置
                    event.preventDefault();
                    // 設定拖曳效果為移動
                    (event as any).dataTransfer!.dropEffect = 'move';
                    // 顯示可放置的視覺提示
                    container.addClass('ge-dragover');
                }, true); // 使用捕獲階段
                
                container.addEventListener('dragleave', (event) => {
                    // 如果移入的是子元素，則不處理
                    if (container.contains(event.relatedTarget as Node)) {
                        return;
                    }
                    // 移除視覺提示
                    container.removeClass('ge-dragover');
                });
                
                container.addEventListener('drop', async (event) => {
                    // 如果拖曳目標是資料夾項目，則不處理
                    if ((event.target as HTMLElement).closest('.ge-folder-item')) {
                        return;
                    }
                    
                    // 防止預設行為
                    event.preventDefault();
                    // 移除視覺提示
                    container.removeClass('ge-dragover');
                    
                    // 獲取拖曳的檔案路徑列表
                    const filesDataString = (event as any).dataTransfer?.getData('application/obsidian-grid-explorer-files');
                    if (filesDataString) {
                        try {
                            // 解析檔案路徑列表
                            const filePaths = JSON.parse(filesDataString);
                            
                            // 獲取當前資料夾路徑
                            const folderPath = currentFolder.path;
                            if (!folderPath) return;
                            
                            // 移動檔案
                            for (const path of filePaths) {
                                const file = gridView.app.vault.getAbstractFileByPath(path);
                                if (file instanceof TFile) {
                                    try {
                                        // 計算新的檔案路徑
                                        const newPath = normalizePath(`${folderPath}/${file.name}`);
                                        // 如果來源路徑和目標路徑相同，則跳過
                                        if (path === newPath) {
                                            continue;
                                        }
                                        // 移動檔案
                                        await gridView.app.fileManager.renameFile(file, newPath);
                                    } catch (error) {
                                        console.error(`An error occurred while moving the file ${file.path}:`, error);
                                    }
                                }
                            }
                            return;
                        } catch (error) {
                            console.error('Error parsing dragged files data:', error);
                        }
                    }

                    // 如果沒有檔案路徑列表，則使用檔案路徑
                    const filePath = (event as any).dataTransfer?.getData('text/plain');
                    if (!filePath) return;
                    
                    const cleanedFilePath = filePath.replace(/!?\[\[(.*?)\]\]/, '$1');
                    
                    // 獲取檔案和資料夾物件
                    const file = gridView.app.vault.getAbstractFileByPath(cleanedFilePath);
                    
                    if (file instanceof TFile) {
                        try {
                            // 計算新的檔案路徑
                            const newPath = normalizePath(`${currentFolder.path}/${file.name}`);
                            // 如果來源路徑和目標路徑相同，則不執行移動
                            if (file.path !== newPath) {
                                // 移動檔案
                                await gridView.app.fileManager.renameFile(file, newPath);
                            }
                        } catch (error) {
                            console.error('An error occurred while moving the file:', error);
                        }
                    }
                });
            }

            // 如果顯示資料夾關閉，則不顯示資料夾
            if(!gridView.plugin.settings.showFolder) return;

            // 顯示子資料夾
            const subfolders = currentFolder.children
                .filter(child => {
                    // 如果不是資料夾，則不顯示
                    if (!(child instanceof TFolder)) return false;
                    
                    // 使用 isFolderIgnored 函數檢查是否應該忽略此資料夾
                    return !isFolderIgnored(
                        child, 
                        gridView.plugin.settings.ignoredFolders, 
                        gridView.plugin.settings.ignoredFolderPatterns, 
                        gridView.showIgnoredFolders
                    );
                })
                .sort((a, b) => a.name.localeCompare(b.name));
            for (const folder of subfolders) {
                const folderEl = container.createDiv('ge-grid-item ge-folder-item');
                gridView.gridItems.push(folderEl); // 添加到網格項目數組
                
                // 設置資料夾路徑屬性，用於拖曳功能
                folderEl.dataset.folderPath = folder.path;
                
                const contentArea = folderEl.createDiv('ge-content-area');
                const titleContainer = contentArea.createDiv('ge-title-container');
                const customFolderIcon = gridView.plugin.settings.customFolderIcon;
                titleContainer.createEl('span', { cls: 'ge-title', text: `${customFolderIcon} ${folder.name}`.trim() });
                setTooltip(folderEl, folder.name,{ placement: gridView.cardLayout === 'vertical' ? 'bottom' : 'right' });
                
                // 檢查同名筆記是否存在
                const notePath = `${folder.path}/${folder.name}.md`;
                const noteFile = gridView.app.vault.getAbstractFileByPath(notePath);
                
                if (noteFile instanceof TFile) {
                    // 使用 span 代替 button，只顯示圖示
                    const noteIcon = titleContainer.createEl('span', {
                        cls: 'ge-foldernote-button'
                    });
                    setIcon(noteIcon, 'panel-left-open');
                    
                    // 點擊圖示時開啟同名筆記
                    noteIcon.addEventListener('click', (e) => {
                        e.stopPropagation(); // 防止觸發資料夾的點擊事件
                        gridView.app.workspace.getLeaf().openFile(noteFile);
                    });

                    // 根據同名筆記設置背景色
                    const metadata = gridView.app.metadataCache.getFileCache(noteFile)?.frontmatter;
                    const colorValue = metadata?.color;
                    if (colorValue) {
                        // 依顏色名稱加入對應的樣式類別
                        folderEl.addClass(`ge-folder-color-${colorValue}`);
                    }
                    const iconValue = metadata?.icon;
                    if (iconValue) {
                        // 修改原本的title文字
                        const title = folderEl.querySelector('.ge-title');
                        if (title) {
                            title.textContent = `${iconValue} ${folder.name}`;
                        }
                    }
                    
                }
                
                // 點擊時進入子資料夾
                folderEl.addEventListener('click', (event) => {
                    if (event.ctrlKey || event.metaKey) {
                        event.preventDefault();
                        event.stopPropagation();
                        openFolderInNewView(gridView, folder.path);
                    } else {
                        gridView.setSource('folder', folder.path);
                        gridView.clearSelection();
                    }
                });

                // 添加右鍵選單
                folderEl.addEventListener('contextmenu', (event) => {
                    event.preventDefault();
                    const menu = new Menu();
                    
                    //在新網格視圖開啟
                    menu.addItem((item) => {
                        item
                            .setTitle(t('open_in_new_grid_view'))
                            .setIcon('grid')
                            .onClick(() => {
                                openFolderInNewView(gridView, folder.path);
                            });
                    });
                    menu.addSeparator();

                    // 檢查同名筆記是否存在
                    const notePath = `${folder.path}/${folder.name}.md`;
                    let noteFile = gridView.app.vault.getAbstractFileByPath(notePath);
                    if (noteFile instanceof TFile) {
                        //打開資料夾筆記
                        menu.addItem((item) => {
                            item
                                .setTitle(t('open_folder_note'))
                                .setIcon('panel-left-open')
                                .onClick(() => {
                                    gridView.app.workspace.getLeaf().openFile(noteFile);
                                });
                        });
                        //編輯資料夾筆記設定
                        menu.addItem((item) => {
                            item
                                .setTitle(t('edit_folder_note_settings'))
                                .setIcon('settings-2')
                                .onClick(() => {
                                    if (folder instanceof TFolder) {
                                        showFolderNoteSettingsModal(gridView.app, gridView.plugin, folder, gridView);
                                    }
                                });
                        });
                        //刪除資料夾筆記
                        menu.addItem((item) => {
                            item
                                .setTitle(t('delete_folder_note'))
                                .setIcon('folder-x')
                                .onClick(() => {
                                    gridView.app.fileManager.trashFile(noteFile as TFile);
                                });
                        });
                    } else {
                        //建立Folder note
                        menu.addItem((item) => {
                            item
                                .setTitle(t('create_folder_note'))
                                .setIcon('file-cog')
                                .onClick(() => {
                                    if (folder instanceof TFolder) {
                                        showFolderNoteSettingsModal(gridView.app, gridView.plugin, folder, gridView);
                                    }
                                });
                        });
                    }
                    menu.addSeparator();

                    if (!gridView.plugin.settings.ignoredFolders.includes(folder.path)) {
                        //加入"忽略此資料夾"選項
                        menu.addItem((item) => {
                            item
                                .setTitle(t('ignore_folder'))
                                .setIcon('folder-x')
                                .onClick(() => {
                                    gridView.plugin.settings.ignoredFolders.push(folder.path);
                                    gridView.plugin.saveSettings();
                                });
                        });
                    } else {
                        //加入"取消忽略此資料夾"選項
                        menu.addItem((item) => {
                            item
                                .setTitle(t('unignore_folder'))
                                .setIcon('folder-up')
                                .onClick(() => {
                                    gridView.plugin.settings.ignoredFolders = gridView.plugin.settings.ignoredFolders.filter((path) => path !== folder.path);
                                    gridView.plugin.saveSettings();
                                });
                        });
                    }
                    // 搬移資料夾
                    menu.addItem((item) => {
                        item
                            .setTitle(t('move_folder'))
                            .setIcon('folder-cog')
                            .onClick(() => {
                                if (folder instanceof TFolder) {
                                    new showFolderMoveModal(gridView.plugin, folder, gridView).open();
                                }
                            });
                    });
                    // 重新命名資料夾
                    menu.addItem((item) => {
                        item
                            .setTitle(t('rename_folder'))
                            .setIcon('file-cog')
                            .onClick(() => {
                                if (folder instanceof TFolder) {
                                    showFolderRenameModal(gridView.app, gridView.plugin, folder, gridView);
                                }
                            });
                    });
                    // 刪除資料夾
                    menu.addItem((item) => {
                        (item as any).setWarning(true);
                        item
                            .setTitle(t('delete_folder'))
                            .setIcon('trash')
                            .onClick(async () => {
                                if (folder instanceof TFolder) {
                                    await gridView.app.fileManager.trashFile(folder);
                                    // 重新渲染視圖
                                    requestAnimationFrame(() => {
                                        gridView.render();
                                    });
                                }
                            });
                    });
                    menu.showAtMouseEvent(event);
                });
            }
            
            // 資料夾渲染完插入 break（僅當有資料夾）
            if (subfolders.length > 0) {
                container.createDiv('ge-break');
            }
        }
    }

    // 為資料夾項目添加拖曳目標功能
    if(Platform.isDesktop) {
        const folderItems = gridView.containerEl.querySelectorAll('.ge-folder-item');
        folderItems.forEach(folderItem => {
            folderItem.addEventListener('dragover', (event) => {
                // 防止預設行為以允許放置
                event.preventDefault();
                // 設定拖曳效果為移動
                (event as any).dataTransfer!.dropEffect = 'move';
                // 顯示可放置的視覺提示
                folderItem.addClass('ge-dragover');
            });
            
            folderItem.addEventListener('dragleave', () => {
                // 移除視覺提示
                folderItem.removeClass('ge-dragover');
            });
            
            folderItem.addEventListener('drop', async (event) => {
                // 防止預設行為
                event.preventDefault();
                // 移除視覺提示
                folderItem.removeClass('ge-dragover');
                
                // 獲取拖曳的檔案路徑列表
                const filesDataString = (event as any).dataTransfer?.getData('application/obsidian-grid-explorer-files');
                if (filesDataString) {
                    try {
                        // 解析檔案路徑列表
                        const filePaths = JSON.parse(filesDataString);
                        
                        // 獲取目標資料夾路徑
                        const folderPath = (folderItem as any).dataset.folderPath;
                        if (!folderPath) return;
                        
                        // 獲取資料夾物件
                        const folder = gridView.app.vault.getAbstractFileByPath(folderPath);
                        if (!(folder instanceof TFolder)) return;
                        
                        // 移動檔案
                        for (const path of filePaths) {
                            const file = gridView.app.vault.getAbstractFileByPath(path);
                            if (file instanceof TFile) {
                                try {
                                    // 計算新的檔案路徑
                                    const newPath = normalizePath(`${folderPath}/${file.name}`);
                                    // 移動檔案
                                    await gridView.app.fileManager.renameFile(file, newPath);
                                } catch (error) {
                                    console.error(`An error occurred while moving the file ${file.path}:`, error);
                                }
                            }
                        }

                        return;

                    } catch (error) {
                        console.error('Error parsing dragged files data:', error);
                    }
                }

                // 如果沒有檔案路徑列表，則使用檔案路徑
                const filePath = (event as any).dataTransfer?.getData('text/plain');
                if (!filePath) return;
                
                const cleanedFilePath = filePath.replace(/!?\[\[(.*?)\]\]/, '$1');
                
                // 獲取目標資料夾路徑
                const folderPath = (folderItem as any).dataset.folderPath;
                if (!folderPath) return;
                
                // 獲取檔案和資料夾物件
                const file = gridView.app.vault.getAbstractFileByPath(cleanedFilePath);
                const folder = gridView.app.vault.getAbstractFileByPath(folderPath);
                
                if (file instanceof TFile && folder instanceof TFolder) {
                    try {
                        // 計算新的檔案路徑
                        const newPath = normalizePath(`${folderPath}/${file.name}`);
                        // 移動檔案
                        await gridView.app.fileManager.renameFile(file, newPath);

                    } catch (error) {
                        console.error('An error occurred while moving the file:', error);
                    }
                }
            });
        });
    }
}

// 在新視窗中開啟資料夾
function openFolderInNewView(gridview: GridView, folderPath: string) {
    const { workspace } = gridview.app;
    let leaf = null;
    workspace.getLeavesOfType('grid-view');
    switch (gridview.plugin.settings.defaultOpenLocation) {
        case 'left':
            leaf = workspace.getLeftLeaf(false);
            break;
        case 'right':
            leaf = workspace.getRightLeaf(false);
            break;
        case 'tab':
        default:
            leaf = workspace.getLeaf('tab');
            break;
    }
    if (!leaf) {
        // 如果無法獲取指定位置的 leaf，則回退到新分頁
        leaf = workspace.getLeaf('tab');
    }
    leaf.setViewState({ type: 'grid-view', active: true });
    // 設定資料來源
    if (leaf.view instanceof GridView) {
        leaf.view.setSource('folder', folderPath);
    }
    // 確保視圖是活躍的
    workspace.revealLeaf(leaf);
}