import { App, TFile } from 'obsidian';

// 尋找筆記中的第一張圖片
export async function findFirstImageInNote(app: App, content: string) {
    try {
        const internalStyle = /!?\[\[(.*?\.(?:jpg|jpeg|png|gif|webp))(?:\|.*?)?\]\]/;
        const markdownStyle = /!\[(.*?)\]\(\s*(\S+?(?:\.(?:jpg|jpeg|png|gif|webp)|format=(?:jpg|jpeg|png|gif|webp))[^\s)]*)\s*(?:\s+["'][^"']*["'])?\s*\)/;
        const frontmatterUrl = /^[\w\-_]+:\s*(https?:\/\/\S+?(?:\.(?:jpg|jpeg|png|gif|webp)|format=(?:jpg|jpeg|png|gif|webp))[^\s]*)\s*$/;

        const internalMatch = content.match(new RegExp(`(?:${internalStyle.source}|${markdownStyle.source}|${frontmatterUrl.source})`, 'im'));

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
function processMediaLink(app: App, internalMatch: RegExpMatchArray) {

    // Frontmatter 內的圖片連結
    if (internalMatch[4]) {
        return internalMatch[4];
    }

    // 處理 Obsidian 內部連結 ![[file]]
    if (internalMatch[1]) {
        const file = app.metadataCache.getFirstLinkpathDest(internalMatch[1], '');
        if (file) {
            return app.vault.getResourcePath(file);
        }
    }

    // 處理標準 Markdown 連結 ![alt](path)
    if (internalMatch[3]) {
        const url = internalMatch[3];
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

    return null;
}
