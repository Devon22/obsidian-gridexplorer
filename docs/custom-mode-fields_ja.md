# Grid Explorer カスタムモード フィールドガイド

## 概要

Grid Explorer は、カスタムモードでフィールドのエイリアスを設定し、リアルタイムで計算を実行する機能をサポートしています。これにより、メタデータを柔軟に表示・計算できます。

## 基本構文

### フィールドエイリアス

`|` 記号を使用して、フィールドに表示名を設定します：

```
元のフィールド名|表示名
```

**例:**
- `birthday|誕生日` - `birthday` フィールドを「誕生日」として表示
- `status|状態` - `status` フィールドを「状態」として表示

### 計算式

`{{ ... }}` で JavaScript の式を囲んで計算を実行します：

```
フィールド名 {{ 式 }}
```

**使用可能な変数:**

| 変数 | 説明 | 例 |
|------|------|-----|
| `value` | 現在のフィールドの値 | `value` または `this` |
| `metadata` | フロントマターのメタデータオブジェクト | `metadata.tags` |
| `app` | Obsidian アプリケーションインスタンス | `app.vault.getMarkdownFiles()` |
| `dv` | Dataview API インスタンス（Dataview プラグインが必要） | `dv.pages('#tag')` |

## 高度な使い方

### エイリアスと計算の組み合わせ

```
フィールド名|表示名 {{ 式 }}
```

**基本例:**
```
birthday|年齢 {{ Math.floor((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) }}
```

**Dataview 使用例:**
```
tags|関連ノート {{ dv.pages(value).length }}
```

### 複数フィールドの組み合わせ

```
full_name|フルネーム {{ (metadata.first_name || '') + ' ' + (metadata.last_name || '') }}
```

## 実践的な例

### 1. 基本的な計算

#### 年齢の計算
```
birthday|年齢 {{ Math.floor((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) }}
```

#### 日付のフォーマット
```
date|日付 {{ new Date(value).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }) }}
```

### 2. Dataview の高度な機能

#### 関連ノートのカウント
```
tags|関連ノート {{ dv.pages(value).length }}
```

#### 未完了タスクの表示
```
file.folder|ToDo {{ dv.pages(`"${value}"`).file.tasks.where(t => !t.completed).length }}
```

#### タグの使用頻度
```
tags|タグ統計 {{ value.map(tag => `${tag}(${dv.pages(tag).length})`).join(', ') }}
```

#### 最終更新日時の表示
```
file.mtime|最終更新 {{ dv.date(value).toFormat('yyyy-MM-dd HH:mm') }}
```

### 3. 条件付き表示

```
status|状態 {{ value === 'active' ? '有効' : '無効' }}
```

### 4. 進捗率の計算

```
progress|進捗 {{ Math.round((metadata.completed / metadata.total) * 100) + '%' }}
```

## 注意事項

1. 計算式内の JavaScript コードは表示時に動的に実行されます
2. 計算に失敗した場合は元の値が表示されます
3. セキュリティのため、危険なコードは使用しないでください
4. 複雑な計算には Dataview プラグインの使用を推奨します

## トラブルシューティング

計算が期待通りに動作しない場合：

1. 式の構文を確認してください
2. `console.log(value, metadata)` でデバッグできます
3. フィールド名と大文字小文字を確認してください
4. 余分なスペースや特殊文字を確認してください

## 高度なヒント

- 条件付き表示には三項演算子を使用します
- 複数のフィールドを組み合わせて計算します
- 表示のフォーマットには `toLocaleString()` や `toFixed()` などの JavaScript 組み込み関数を使用します
- `app` 変数で Obsidian API にアクセスできます
---

この機能を使用すると、複雑なプラグインコードを書かずに、ノートデータを柔軟に表示・計算できます。
