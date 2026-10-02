import { App, TFile, requestUrl, RequestUrlResponse } from 'obsidian';
import JSZip from 'jszip';
import { type GallerySettings } from '../settings';

type GridExplorerPlugin = {
    settings?: Pick<GallerySettings, 'customDocumentExtensions'>;
};

type AppPluginAccess = {
    plugins?: {
        plugins?: Record<string, GridExplorerPlugin>;
    };
};

// 尋找 zip 檔案內的第一張圖片並回傳它的 base64 Data URL
export async function getFirstImageFromZip(app: App, file: TFile): Promise<string | null> {
    try {
        const arrayBuffer = await app.vault.readBinary(file);
        const zip = await JSZip.loadAsync(arrayBuffer);
        
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg'];
        let imageFileName: string | null = null;
        
        const filenames = Object.keys(zip.files).sort();
        for (const filename of filenames) {
            const fileEntry = zip.files[filename];
            if (fileEntry.dir) continue;
            if (filename.includes('__MACOSX')) continue;
            
            const ext = filename.split('.').pop()?.toLowerCase();
            if (ext && imageExtensions.includes(ext)) {
                imageFileName = filename;
                break;
            }
        }
        
        if (imageFileName) {
            const fileData = zip.files[imageFileName];
            const ext = imageFileName.split('.').pop()?.toLowerCase() || 'jpeg';
            
            let mimeType = 'image/jpeg';
            if (ext === 'png') mimeType = 'image/png';
            else if (ext === 'gif') mimeType = 'image/gif';
            else if (ext === 'webp') mimeType = 'image/webp';
            else if (ext === 'avif') mimeType = 'image/avif';
            else if (ext === 'bmp') mimeType = 'image/bmp';
            else if (ext === 'svg') mimeType = 'image/svg+xml';
            
            const base64Data = await fileData.async('base64');
            return `data:${mimeType};base64,${base64Data}`;
        }
        
        return null;
    } catch (error) {
        console.error('Error reading zip file:', file.path, error);
        return null;
    }
}

// 尋找筆記中的第一張圖片
export async function findFirstImageInNote(app: App, content: string): Promise<string | null> {
    try {
        const pluginAccess = app as unknown as AppPluginAccess;
        const customDocumentExtensions = pluginAccess.plugins?.plugins?.['gridexplorer']?.settings?.customDocumentExtensions;
        const isZipEnabled = customDocumentExtensions
            ?.split(',')
            .map((ext: string) => ext.trim().toLowerCase())
            .includes('zip');

        const allowedExtensions = isZipEnabled 
            ? 'jpg|jpeg|png|gif|webp|avif|zip' 
            : 'jpg|jpeg|png|gif|webp|avif';

        const internalStyle = new RegExp(`!?\\[\\[(.*?\\.(?:${allowedExtensions}))(?:\\|.*?)?\\]\\]`);
        const markdownStyle = new RegExp(`!\\[(.*?)\\]\\(\\s*(\\S+?(?:\\.(?:${allowedExtensions})|format=(?:jpg|jpeg|png|gif|webp))[^\\s)]*)\\s*(?:\\s+["'][^"']*["'])?\\s*\\)`);
        const frontmatterUrl = new RegExp(`^[\\w\\-_]+:\\s*(https?:\\/\\/\\S+?(?:\\.(?:${allowedExtensions})|format=(?:jpg|jpeg|png|gif|webp))[^\\s]*)\\s*$`);

        const combinedPatternSource = `(?:${internalStyle.source}|${markdownStyle.source}|${frontmatterUrl.source})`;
        const initialPattern = new RegExp(combinedPatternSource, 'im');
        const internalMatch = content.match(initialPattern);

        if (internalMatch) {
            const firstImage = await processMediaLink(app, internalMatch);
            if (firstImage) {
                return firstImage;
            }

            const fallbackPattern = new RegExp(combinedPatternSource, 'img');
            let match: RegExpExecArray | null;
            const firstIndex = internalMatch.index;
            const firstMatchText = internalMatch[0];

            while ((match = fallbackPattern.exec(content)) !== null) {
                if (firstIndex !== undefined && match.index === firstIndex && match[0] === firstMatchText) {
                    continue;
                }

                const fallbackImage = await processMediaLink(app, match);
                if (fallbackImage) {
                    return fallbackImage;
                }
            }

            return null;
        } else {    
            return null;
        }
    } catch (error) {
        console.error('Error finding image in note:', error);
        return null;
    }
}

// 處理媒體連結
async function processMediaLink(app: App, internalMatch: RegExpMatchArray | RegExpExecArray): Promise<string | null> {
    const decodePath = (path: string): string => {
        try {
            return decodeURIComponent(path);
        } catch {
            return path;
        }
    };

    // Frontmatter 內的圖片連結
    if (internalMatch[4]) {
        return await resolveUrl(app, internalMatch[4]);
    }

    // 處理 Obsidian 內部連結 ![[file]]
    if (internalMatch[1]) {
        const file = app.metadataCache.getFirstLinkpathDest(decodePath(internalMatch[1]), '');
        if (file) {
            if (file.extension.toLowerCase() === 'zip') {
                return await getFirstImageFromZip(app, file);
            }
            return app.vault.getResourcePath(file);
        }
    }

    // 處理標準 Markdown 連結 ![alt](path)
    if (internalMatch[3]) {
        const url = internalMatch[3];
        if (isRemoteUrl(url)) {
            return await validateRemoteImage(url);
        } else {
            const path = decodePath(url);
            const file = app.metadataCache.getFirstLinkpathDest(path, '');
            if (!file) {
                const fileByPath = app.vault.getAbstractFileByPath(path);
                if (fileByPath instanceof TFile) {
                    if (fileByPath.extension.toLowerCase() === 'zip') {
                        return await getFirstImageFromZip(app, fileByPath);
                    }
                    return app.vault.getResourcePath(fileByPath);
                }
            } else {
                if (file.extension.toLowerCase() === 'zip') {
                    return await getFirstImageFromZip(app, file);
                }
                return app.vault.getResourcePath(file);
            }
        }
    }

    return null;
}

function isRemoteUrl(url: string): boolean {
    return /^https?:\/\//i.test(url);
}

async function resolveUrl(app: App, url: string): Promise<string | null> {
    if (isRemoteUrl(url)) {
        return await validateRemoteImage(url);
    }

    const file = app.metadataCache.getFirstLinkpathDest(url, '');
    if (file) {
        if (file.extension.toLowerCase() === 'zip') {
            return await getFirstImageFromZip(app, file);
        }
        return app.vault.getResourcePath(file);
    }

    const fileByPath = app.vault.getAbstractFileByPath(url);
    if (fileByPath instanceof TFile) {
        if (fileByPath.extension.toLowerCase() === 'zip') {
            return await getFirstImageFromZip(app, fileByPath);
        }
        return app.vault.getResourcePath(fileByPath);
    }

    return null;
}

async function validateRemoteImage(url: string): Promise<string | null> {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    };
    try {
        const headResponse = await requestUrl({ url, method: 'HEAD', headers });
        if (isSuccessfulStatus(headResponse)) {
            return url;
        }

        if (headResponse.status === 405 || headResponse.status === 501) {
            const getResponse = await requestUrl({ url, headers });
            if (isSuccessfulStatus(getResponse)) {
                return url;
            }
        }
    } catch {
        try {
            const getResponse = await requestUrl({ url, headers });
            if (isSuccessfulStatus(getResponse)) {
                return url;
            }
        } catch (fallbackError) {
            console.warn('Remote image validation failed:', url, fallbackError);
        }
    }

    // 即使驗證失敗，只要 URL 格式符合圖片規格，仍傳回原網址讓瀏覽器嘗試載入
    return url;
}

function isSuccessfulStatus(response: RequestUrlResponse): boolean {
    return response.status >= 200 && response.status < 400;
}
