# Grid Explorer Custom Mode Fields Guide

## Overview

Grid Explorer supports setting field aliases and performing real-time computations in custom modes. This allows for more flexible display and calculation of note metadata.

## Basic Syntax

### Field Aliases

Use the `|` symbol to set a display name for a field:

```
original_field|Display Name
```

**Examples:**
- `birthday|Birthday` - Displays the `birthday` field as "Birthday"
- `status|Status` - Displays the `status` field as "Status"

### Computation Expressions

Use `{{ ... }}` to wrap JavaScript expressions for computation:

```
field_name {{ expression }}
```

**Available Variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `value` | Current field's raw value | `value` or `this` |
| `metadata` | The complete frontmatter metadata object | `metadata.tags` |
| `app` | Obsidian app instance | `app.vault.getMarkdownFiles()` |
| `dv` | Dataview API instance (requires Dataview plugin) | `dv.pages('#tag')` |

## Advanced Usage

### Combining Aliases and Computations

```
field_name|Display Name {{ expression }}
```

**Basic Example:**
```
age|Age {{ Math.floor((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) }}
```

**With Dataview Example:**
```
tags|Related Notes {{ dv.pages(value).length }}
```

### Multi-field Combinations

```
full_name|Full Name {{ (metadata.first_name || '') + ' ' + (metadata.last_name || '') }}
```

## Practical Examples

### 1. Basic Computations

#### Calculate Age
```
birthday|Age {{ Math.floor((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) }}
```

#### Format Date
```
date|Date {{ new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) }}
```

### 2. Advanced Dataview Usage

#### Count Related Notes
```
tags|Related Notes {{ dv.pages(value).length }}
```

#### Show Incomplete Tasks
```
file.folder|To-dos {{ dv.pages(`"${value}"`).file.tasks.where(t => !t.completed).length }}
```

#### Calculate Tag Frequency
```
tags|Tag Stats {{ value.map(tag => `${tag}(${dv.pages(tag).length})`).join(', ') }}
```

#### Show Last Modified Time
```
file.mtime|Last Modified {{ dv.date(value).toFormat('yyyy-MM-dd HH:mm') }}
```

### 3. Conditional Display

```
status|Status {{ value === 'active' ? 'Active' : 'Inactive' }}
```

### 4. Progress Calculation

```
progress|Progress {{ Math.round((metadata.completed / metadata.total) * 100) + '%' }}
```

## Notes

1. JavaScript code in computation expressions is executed dynamically when displayed
2. If a computation fails, it falls back to the original value
3. For security, avoid using potentially harmful code in expressions
4. Keep expressions simple; use Dataview plugin for complex calculations

## Troubleshooting

If computations don't work as expected:

1. Check expression syntax
2. Use `console.log(value, metadata)` for debugging
3. Verify field names and case sensitivity
4. Check for extra spaces or special characters

## Advanced Tips

- Use ternary operators for conditional rendering
- Combine multiple fields in computations
- Use JavaScript built-in functions (like `toLocaleString()`, `toFixed()`) for formatting
- Access Obsidian API using the `app` variable
---

This feature allows for flexible display and computation of note data without writing complex plugin code.
