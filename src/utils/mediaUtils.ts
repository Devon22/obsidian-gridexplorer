import { App, TFile, requestUrl, RequestUrlResponse } from 'obsidian';

// 尋找筆記中的第一張圖片
export async function findFirstImageInNote(app: App, content: string): Promise<string | null> {
    try {
        const internalStyle = /!?\[\[(.*?\.(?:jpg|jpeg|png|gif|webp|avif))(?:\|.*?)?\]\]/;
        const markdownStyle = /!\[(.*?)\]\(\s*(\S+?(?:\.(?:jpg|jpeg|png|gif|webp|avif)|format=(?:jpg|jpeg|png|gif|webp))[^\s)]*)\s*(?:\s+["'][^"']*["'])?\s*\)/;
        const frontmatterUrl = /^[\w\-_]+:\s*(https?:\/\/\S+?(?:\.(?:jpg|jpeg|png|gif|webp|avif)|format=(?:jpg|jpeg|png|gif|webp))[^\s]*)\s*$/;

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

    // Frontmatter 內的圖片連結
    if (internalMatch[4]) {
        return await resolveUrl(app, internalMatch[4]);
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
        if (isRemoteUrl(url)) {
            return await validateRemoteImage(url);
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

function isRemoteUrl(url: string): boolean {
    return /^https?:\/\//i.test(url);
}

async function resolveUrl(app: App, url: string): Promise<string | null> {
    if (isRemoteUrl(url)) {
        return await validateRemoteImage(url);
    }

    const file = app.metadataCache.getFirstLinkpathDest(url, '');
    if (file) {
        return app.vault.getResourcePath(file);
    }

    const fileByPath = app.vault.getAbstractFileByPath(url);
    if (fileByPath instanceof TFile) {
        return app.vault.getResourcePath(fileByPath);
    }

    return null;
}

async function validateRemoteImage(url: string): Promise<string | null> {
    try {
        const headResponse = await requestUrl({ url, method: 'HEAD' });
        if (isSuccessfulStatus(headResponse)) {
            return url;
        }

        if (headResponse.status === 405 || headResponse.status === 501) {
            const getResponse = await requestUrl({ url });
            if (isSuccessfulStatus(getResponse)) {
                return url;
            }
        }
    } catch (error) {
        try {
            const getResponse = await requestUrl({ url });
            if (isSuccessfulStatus(getResponse)) {
                return url;
            }
        } catch (fallbackError) {
            console.warn('Remote image validation failed:', url, fallbackError);
        }
    }

    return null;
}

function isSuccessfulStatus(response: RequestUrlResponse): boolean {
    return response.status >= 200 && response.status < 400;
}
