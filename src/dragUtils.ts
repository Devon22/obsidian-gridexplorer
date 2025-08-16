/**
 * 拖曳相關的工具函數
 * 用於處理 Obsidian URI 格式的拖曳操作
 */

// 從 obsidian://open?vault=...&file=... 解析出 vault 名稱與檔案路徑
export function parseObsidianOpenUris(input: string): Array<{ vault?: string; file?: string }> {
    const results: Array<{ vault?: string; file?: string }> = [];
    if (!input) return results;

    // 可能是多行或連續字串，先嘗試按換行切分
    const chunks = input.split(/\r?\n/).filter(Boolean);
    console.log(chunks);
    const toScan = chunks.length ? chunks : [input];

    for (const part of toScan) {
        // 支援無分隔連續的多筆 obsidian://open
        const re = /obsidian:\/\/open\?([\s\S]*?)(?=obsidian:\/\/open\?|$)/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(part)) !== null) {
            const q = m[1];
            try {
                const usp = new URLSearchParams(q);
                const vault = usp.get('vault') || undefined;
                const file = usp.get('file') ? decodeURIComponent(usp.get('file') as string) : undefined;
                results.push({ vault, file });
            } catch { /* ignore */ }
        }
    }
    return results;
}

// 從 DataTransfer 嘗試萃取 obsidian://open URI 的 file 路徑（支援多筆）
export async function extractObsidianPathsFromDT(dt: DataTransfer | null): Promise<string[]> {
    if (!dt) return [];
    
    const texts: string[] = [];
    // 1) items (getAsString)
    if (dt.items) {
        const items = Array.from(dt.items).filter(i => i.kind === 'string');
        await Promise.all(items.map(i => new Promise<void>(resolve => {
            try {
                i.getAsString((s) => { if (s) texts.push(s); resolve(); });
            } catch { resolve(); }
        })));
    }
    // 2) text/uri-list
    try {
        const uriList = dt.getData('text/uri-list');
        if (uriList) texts.push(uriList);
    } catch {}
    // 3) text/plain
    try {
        const plain = dt.getData('text/plain');
        if (plain && plain.startsWith('obsidian://')) texts.push(plain);
    } catch {}

    const vaultName = (window as any).app?.vault?.getName?.() as string | undefined;
    const paths: string[] = [];
    for (const t of texts) {
        const entries = parseObsidianOpenUris(t);
        for (const e of entries) {
            if (!e.file) continue;
            // 僅接受相同 vault（若有提供 vault 參數）
            if (e.vault && vaultName && e.vault !== vaultName) continue;
            paths.push(e.file);
        }
    }
    // 去重
    return Array.from(new Set(paths));
}
