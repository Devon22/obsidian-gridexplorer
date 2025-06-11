import { App, TFile } from 'obsidian';

// 尋找筆記中的第一張圖片
export async function findFirstImageInNote(app: App, content: string) {
    try {
        const internalMatch = content.match(/(?:!?\[\[(.*?\.(?:jpg|jpeg|png|gif|webp))(?:\|.*?)?\]\]|!\[(.*?)\]\(\s*(\S+?(?:\.(?:jpg|jpeg|png|gif|webp)|format=(?:jpg|jpeg|png|gif|webp))[^\s)]*)\s*(?:\s+["'][^"']*["'])?\s*\))/i);
        if (internalMatch) {
            return processMediaLink(app, internalMatch);
        } else {    
            return null;
        }
    } catch (error) {
        console.error('Error finding image in note:', error);
        return null;
    }
}

// 處理媒體連結
function processMediaLink(app: App, linkText: RegExpMatchArray) {
    // 處理 Obsidian 內部連結 ![[file]]
    const internalMatch = linkText[0].match(/!?\[\[(.*?)\]\]/);
    if (internalMatch) {
        if (linkText[1]) {
            const file = app.metadataCache.getFirstLinkpathDest(linkText[1], '');
            if (file) {
                return app.vault.getResourcePath(file);
            }
        }
        return null;
    }

    // 處理標準 Markdown 連結 ![alt](path)
    const markdownMatch = linkText[0].match(/!?\[(.*?)\]\((.*?)\)/);
    if (markdownMatch) {
        if (linkText[3]) {
            const url = linkText[3];
            if (url.startsWith('http')) {
                return url;
            } else {
                const file = app.metadataCache.getFirstLinkpathDest(url, '');
                if (!file) {
                    const fileByPath = app.vault.getAbstractFileByPath(url);
                    if (fileByPath instanceof TFile) {
                        return app.vault.getResourcePath(fileByPath);
                    }
                } else {
                    return app.vault.getResourcePath(file);
                }
            }
        }
    }
    return null;
}
