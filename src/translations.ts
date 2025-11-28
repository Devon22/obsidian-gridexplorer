import zhTW from './translations/zh-TW';
import en from './translations/en';
import zh from './translations/zh';
import ja from './translations/ja';
import ru from './translations/ru';
import uk from './translations/uk';
import ko from './translations/ko';

interface Translations {
    'zh-TW': { [key: string]: string };
    'en': { [key: string]: string };
    'zh': { [key: string]: string };
    'ja': { [key: string]: string };
    'ru': { [key: string]: string };
    'uk': { [key: string]: string };
    'ko': { [key: string]: string };
}

type LanguageKey = keyof Translations;

// 全域翻譯函式
export function t(key: string): string {
    const lang = window.localStorage.getItem('language') as LanguageKey;
    //const lang: LanguageKey = getLanguage() as LanguageKey;
    const translations = TRANSLATIONS[lang] || TRANSLATIONS['en'];
    return translations[key] || key;
}

// 語系檔案
export const TRANSLATIONS: Translations = {
    'zh-TW': zhTW,
    'en': en,
    'zh': zh,
    'ja': ja,
    'ru': ru,
    'uk': uk,
    'ko': ko,
};
