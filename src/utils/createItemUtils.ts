import { App, TFile, Notice } from 'obsidian';
import { showNameInputModal } from '../modal/folderRenameModal';
import { t } from '../translations';

/**
 * 創建新筆記的共用函數
 * @param app Obsidian App 實例
 * @param folderPath 目標資料夾路徑
 */
export async function createNewNote(app: App, folderPath: string) {
    let newFileName = `${t('untitled')}.md`;
    let newFilePath = !folderPath || folderPath === '/' ? newFileName : `${folderPath}/${newFileName}`;

    // 檢查檔案是否已存在，如果存在則遞增編號
    let counter = 1;
    while (app.vault.getAbstractFileByPath(newFilePath)) {
        newFileName = `${t('untitled')} ${counter}.md`;
        newFilePath = !folderPath || folderPath === '/' ? newFileName : `${folderPath}/${newFileName}`;
        counter++;
    }

    try {
        // 建立新筆記
        const newFile = await app.vault.create(newFilePath, '');
        // 開啟新筆記
        await app.workspace.getLeaf().openFile(newFile);
    } catch (error) {
        console.error('An error occurred while creating a new note:', error);
    }
}

/**
 * 創建新資料夾的共用函數
 * @param app Obsidian App 實例
 * @param folderPath 目標資料夾路徑
 * @param onSuccess 成功後的回調函數
 */
export async function createNewFolder(app: App, folderPath: string, onSuccess?: () => void) {
    // 預設名稱
    const defaultName = `${t('untitled')}`;

    // 先彈出名稱輸入框
    showNameInputModal(app, {
        title: t('new_folder'),
        description: t('enter_new_folder_name'),
        defaultValue: defaultName,
        onSubmit: async (inputName: string) => {
            let baseName = (inputName && inputName.trim().length > 0) ? inputName.trim() : defaultName;
            let newFolderName = baseName;
            let newFolderPath = !folderPath || folderPath === '/' ? newFolderName : `${folderPath}/${newFolderName}`;

            // 檢查資料夾是否已存在，如果存在則遞增編號
            let counter = 1;
            while (app.vault.getAbstractFileByPath(newFolderPath)) {
                newFolderName = `${baseName} ${counter}`;
                newFolderPath = !folderPath || folderPath === '/' ? newFolderName : `${folderPath}/${newFolderName}`;
                counter++;
            }

            try {
                // 建立新資料夾
                await app.vault.createFolder(newFolderPath);
                // 執行成功回調
                if (onSuccess) {
                    onSuccess();
                }
            } catch (error) {
                console.error('An error occurred while creating a new folder:', error);
            }
        },
    });
}

/**
 * 創建新畫布的共用函數
 * @param app Obsidian App 實例
 * @param folderPath 目標資料夾路徑
 */
export async function createNewCanvas(app: App, folderPath: string) {
    let newFileName = `${t('untitled')}.canvas`;
    let newFilePath = !folderPath || folderPath === '/' ? newFileName : `${folderPath}/${newFileName}`;

    // 檢查檔案是否已存在，如果存在則遞增編號
    let counter = 1;
    while (app.vault.getAbstractFileByPath(newFilePath)) {
        newFileName = `${t('untitled')} ${counter}.canvas`;
        newFilePath = !folderPath || folderPath === '/' ? newFileName : `${folderPath}/${newFileName}`;
        counter++;
    }

    try {
        // 建立新畫布
        const newFile = await app.vault.create(newFilePath, '');
        // 開啟新畫布
        await app.workspace.getLeaf().openFile(newFile);
    } catch (error) {
        console.error('An error occurred while creating a new canvas:', error);
    }
}

/**
 * 創建新 base 檔案的共用函數
 * @param app Obsidian App 實例
 * @param folderPath 目標資料夾路徑
 */
export async function createNewBase(app: App, folderPath: string) {
    let newFileName = `${t('untitled')}.base`;
    let newFilePath = !folderPath || folderPath === '/' ? newFileName : `${folderPath}/${newFileName}`;
    
    // 檢查檔案是否已存在，如果存在則遞增編號
    let counter = 1;
    while (app.vault.getAbstractFileByPath(newFilePath)) {
        newFileName = `${t('untitled')} ${counter}.base`;
        newFilePath = !folderPath || folderPath === '/' ? newFileName : `${folderPath}/${newFileName}`;
        counter++;
    }
    
    try {
        // 建立新 base 檔案
        const newFile = await app.vault.create(newFilePath, '');
        // 開啟新檔案
        await app.workspace.getLeaf().openFile(newFile);
    } catch (error) {
        console.error('An error occurred while creating a new base:', error);
    }
}

/**
 * 創建捷徑檔案的共用函數
 * @param app Obsidian App 實例
 * @param folderPath 目標資料夾路徑
 * @param option 捷徑選項
 */
export async function createShortcut(
    app: App,
    folderPath: string,
    option: { 
        type: 'mode' | 'folder' | 'file' | 'search' | 'uri'; 
        value: string; 
        display: string;
        searchOptions?: {
            searchCurrentLocationOnly: boolean;
            searchFilesNameOnly: boolean;
            searchMediaFiles: boolean;
        };
    }
) {
    try {
        // 生成不重複的檔案名稱
        let counter = 0;
        let shortcutName: string;
        
        // 對於 URI 類型，使用特殊的檔名生成邏輯
        if (option.type === 'uri') {
            shortcutName = generateFilenameFromUri(option.value);
        } else {
            shortcutName = `${option.display}`;
        }

        let newName = `${shortcutName}.md`;
        let newPath = !folderPath || folderPath === '/' ? newName : `${folderPath}/${newName}`;
        while (app.vault.getAbstractFileByPath(newPath)) {
            counter++;
            const baseName = option.type === 'uri' ? generateFilenameFromUri(option.value) : option.display;
            shortcutName = `${baseName} ${counter}`;
            newName = `${shortcutName}.md`;
            newPath = !folderPath || folderPath === '/' ? newName : `${folderPath}/${newName}`;
        }

        // 創建新檔案
        const newFile = await app.vault.create(newPath, '');

        // 使用 processFrontMatter 來更新 frontmatter
        await app.fileManager.processFrontMatter(newFile, (frontmatter: any) => {                
            if (option.type === 'mode') {
                frontmatter.type = 'mode';
                frontmatter.redirect = option.value;
            } else if (option.type === 'folder') {
                frontmatter.type = 'folder';
                frontmatter.redirect = option.value;
            } else if (option.type === 'file') {
                const link = app.fileManager.generateMarkdownLink(
                    app.vault.getAbstractFileByPath(option.value) as TFile, 
                    ""
                );
                frontmatter.type = "file";
                frontmatter.redirect = link;
            } else if (option.type === 'search') {
                frontmatter.type = 'search';
                frontmatter.redirect = option.value;
                // 添加搜尋選項到 frontmatter
                if (option.searchOptions) {
                    frontmatter.searchCurrentLocationOnly = option.searchOptions.searchCurrentLocationOnly;
                    frontmatter.searchFilesNameOnly = option.searchOptions.searchFilesNameOnly;
                    frontmatter.searchMediaFiles = option.searchOptions.searchMediaFiles;
                }
            } else if (option.type === 'uri') {
                frontmatter.type = 'uri';
                frontmatter.redirect = option.value;
            }
        });

        new Notice(`${t('shortcut_created')}: ${shortcutName}`);

    } catch (error) {
        console.error('Create shortcut error', error);
        new Notice(t('failed_to_create_shortcut'));
    }
}

/**
 * 從 URI 生成檔案名稱
 * @param uri URI 字串
 * @returns 檔案名稱
 */
function generateFilenameFromUri(uri: string): string {
    try {
        // 處理 obsidian:// 協議
        if (uri.startsWith('obsidian://')) {
            const match = uri.match(/obsidian:\/\/([^?]+)/);
            let vaultName = '';
            
            // 嘗試提取 vault 參數
            const vaultMatch = uri.match(/[?&]vault=([^&]+)/);
            if (vaultMatch) {
                vaultName = decodeURIComponent(vaultMatch[1]);
                // 清理 vault 名稱，移除不適合檔名的字符
                vaultName = vaultName.replace(/[<>:"/\\|?*]/g, '_');
            }
            
            if (match) {
                const action = match[1];
                const vaultSuffix = vaultName ? ` (${vaultName})` : '';
                
                // 根據不同的 obsidian 動作生成檔名
                switch (action) {
                    case 'open':
                        return `🌐 Obsidian Open${vaultSuffix}`;
                    case 'new':
                        return `🌐 Obsidian New${vaultSuffix}`;
                    case 'search':
                        return `🌐 Obsidian Search${vaultSuffix}`;
                    case 'hook-get-address':
                        return `🌐 Obsidian Hook${vaultSuffix}`;
                    default:
                        return `🌐 Obsidian ${action}${vaultSuffix}`;
                }
            }
            return vaultName ? `🌐 Obsidian Link (${vaultName})` : '🌐 Obsidian Link';
        }
        
        // 處理 file:// 協議
        if (uri.startsWith('file://')) {
            const filename = uri.split('/').pop() || 'Local File';
            return `🌐 ${filename}`;
        }
        
        // 處理 http/https 協議
        if (uri.startsWith('http://') || uri.startsWith('https://')) {
            const url = new URL(uri);
            let domain = url.hostname;
            
            // 移除 www. 前綴
            if (domain.startsWith('www.')) {
                domain = domain.substring(4);
            }
            
            // 如果有路徑，嘗試提取有意義的部分
            if (url.pathname && url.pathname !== '/') {
                const pathParts = url.pathname.split('/').filter(part => part.length > 0);
                if (pathParts.length > 0) {
                    const lastPart = pathParts[pathParts.length - 1];
                    // 如果最後一部分看起來像檔名或有意義的標識符
                    if (lastPart.length < 50 && !lastPart.includes('?')) {
                        return `🌐 ${domain} - ${lastPart}`;
                    }
                }
            }
            
            return `🌐 ${domain}`;
        }
        
        // 其他協議的處理
        const protocolMatch = uri.match(/^([^:]+):/);
        if (protocolMatch) {
            const protocol = protocolMatch[1].toUpperCase();
            return `🌐 ${protocol} Link`;
        }
        
        // 如果不是標準 URI，直接使用前 30 個字符
        const cleanUri = uri.replace(/[<>:"/\\|?*]/g, '_').substring(0, 30);
        return `🌐 ${cleanUri}`;
        
    } catch (error) {
        // 如果解析失敗，使用安全的預設名稱
        const cleanUri = uri.replace(/[<>:"/\\|?*]/g, '_').substring(0, 30);
        return `🌐 ${cleanUri}`;
    }
}
