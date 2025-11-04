/**
 * 顏色相關的輔助函數
 */

/**
 * 檢查是否為有效的 HEX 色值
 * @param color 要檢查的顏色字串
 * @returns 是否為有效的 HEX 色值
 */
export function isHexColor(color: string): boolean {
    return /^#([0-9A-Fa-f]{3}){1,2}$/i.test(color);
}

/**
 * 將 HEX 色值轉換為 RGBA 字串
 * @param hex HEX 色值（支持 #RGB 和 #RRGGBB 格式）
 * @param alpha 透明度（0-1）
 * @returns RGBA 格式的字串
 */
export function hexToRgba(hex: string, alpha: number): string {
    // 移除 # 符號
    hex = hex.replace('#', '');
    
    // 處理簡寫形式 (#RGB -> #RRGGBB)
    if (hex.length === 3) {
        hex = hex.split('').map(char => char + char).join('');
    }
    
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
