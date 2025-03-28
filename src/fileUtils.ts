import { TFile } from 'obsidian';
import { DEFAULT_SETTINGS, type GallerySettings } from './settings';

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
    const audioExtensions = ['flac', 'm4a', 'mp3', 'ogg', 'wav', 'webm', '3gp'];
    return audioExtensions.includes(file.extension.toLowerCase());
}

// 檢查檔案是否為媒體檔案
export function isMediaFile(file: TFile): boolean {
    return isImageFile(file) || isVideoFile(file) || isAudioFile(file);
}
