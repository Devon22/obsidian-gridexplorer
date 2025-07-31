# Grid Explorer 自訂模式欄位說明

## 功能概述

Grid Explorer 現在支援在自訂模式中為欄位設定別名，並在顯示時進行即時計算。這讓您能夠以更靈活的方式顯示和計算筆記中的元數據。

## 基本語法

### 欄位別名

使用 `|` 符號為欄位設定顯示名稱：

```
原始欄位名稱|顯示名稱
```

**範例：**
- `birthday|生日` - 將 `birthday` 欄位顯示為「生日」
- `status|狀態` - 將 `status` 欄位顯示為「狀態」

### 計算表達式

使用 `{{ ... }}` 包裝 JavaScript 表達式來進行計算：

```
欄位名稱 {{ 表達式 }}
```

**可用變數：**

在計算表達式中，您可以使用以下變數：

| 變數 | 說明 | 範例 |
|------|------|------|
| `value` | 當前欄位的原始值 | `value` 或 `this` |
| `metadata` | 整個 frontmatter 元數據對象 | `metadata.tags` |
| `app` | Obsidian 應用程式實例 | `app.vault.getMarkdownFiles()` |
| `dv` | Dataview API 實例（需安裝 Dataview 插件） | `dv.pages('#tag')` |

## 進階用法

### 結合別名與計算

您可以同時使用別名和計算表達式：

```
欄位名稱|顯示名稱 {{ 表達式 }}
```

**基本範例：**
```
birthday|年齡 {{ Math.floor((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) }}
```

**結合 Dataview 範例：**
```
tags|相關筆記 {{ dv.pages(value).length }}
```

### 多欄位組合

您可以在計算表達式中引用其他欄位：

```
full_name|全名 {{ (metadata.first_name || '') + ' ' + (metadata.last_name || '') }}
```

## 實際應用範例

### 1. 基本計算

#### 計算年齡
```
birthday|年齡 {{ Math.floor((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) }}
```

#### 格式化日期
```
date|日期 {{ new Date(value).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' }) }}
```

### 2. 使用 Dataview 的進階功能

#### 計算相關筆記數量
```
tags|相關筆記 {{ dv.pages(value).length }}
```

#### 顯示未完成任務數
```
file.folder|待辦事項 {{ dv.pages(`"${value}"`).file.tasks.where(t => !t.completed).length }}
```

#### 計算標籤使用頻率
```
tags|標籤統計 {{ value.map(tag => `${tag}(${dv.pages(tag).length})`).join(', ') }}
```

#### 顯示最近修改時間
```
file.mtime|最後修改 {{ dv.date(value).toFormat('yyyy-MM-dd HH:mm') }}
```

### 3. 條件顯示

```
status|狀態 {{ value === 'active' ? '啟用' : '停用' }}
```

### 4. 計算進度

```
progress|進度 {{ Math.round((metadata.completed / metadata.total) * 100) + '%' }}
```

## 注意事項

1. 計算表達式中的 JavaScript 代碼會在顯示時動態執行
2. 如果計算表達式出錯，會自動回退顯示原始值
3. 為確保安全性，不建議在表達式中使用可能有害的代碼
4. 表達式應保持簡潔，複雜的計算建議使用 Dataview 插件

## 疑難排解

如果計算結果不符合預期：

1. 檢查表達式語法是否正確
2. 使用 `console.log(value, metadata)` 調試表達式
3. 確認欄位名稱和大小寫是否正確
4. 檢查是否有額外的空格或特殊字符

## 進階提示

- 使用三元運算符進行條件渲染
- 結合多個欄位進行計算
- 使用 JavaScript 的內建函數（如 `toLocaleString()`、`toFixed()` 等）格式化輸出
- 在表達式中使用 `app` 變數訪問 Obsidian API
---

這個功能讓您能夠更靈活地呈現和計算筆記中的數據，無需編寫複雜的插件代碼即可實現強大的顯示效果。
