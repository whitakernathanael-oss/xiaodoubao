# 主题格式

主题目录和 ZIP 根部只允许：

```text
theme.json
wallpaper.png | wallpaper.jpg | wallpaper.jpeg | wallpaper.webp
extra.css（可选）
```

## `theme.json`

顶层必需字段：

| 字段 | 类型与范围 |
|---|---|
| `formatVersion` | 固定为 `1` |
| `id` | 小写 kebab-case，最多 64 字符 |
| `name` | 非空字符串，最多 80 字符 |
| `author` | 非空字符串，最多 80 字符 |
| `wallpaper` | 壁纸配置 |
| `palette` | 全局基础配色 |
| `regions` | 五类语义区域配置 |

未知 JSON 字段在读取时忽略；缺失的区域字段使用引擎默认值。不支持的 `formatVersion` 会被拒绝。

### 壁纸

| 字段 | 类型与范围 |
|---|---|
| `file` | 主题根部的单一图片文件名；不允许路径或 URL |
| `fit` | `cover` 或 `contain` |
| `positionX`, `positionY` | `0`–`100` |
| `scale` | `25`–`300` |
| `blur` | `0`–`40` 像素 |
| `brightness` | `0`–`200` 百分比 |
| `overlayColor` | `#rrggbb`、`#rrggbbaa`、`rgb()` 或 `rgba()` |
| `overlayOpacity` | `0`–`1` |

壁纸最大 25 MB，宽和高均不能超过 4096 像素。只支持 PNG、JPG、JPEG 和 WebP。

### 全局配色

`palette` 包含四个颜色：`ink`、`mutedInk`、`accent`、`surface`。

### 区域

所有透明度和阴影强度均为 `0`–`1`，圆角均为 `0`–`64`。

- `sidebar`：`backgroundColor`、`opacity`、`textColor`、`selectedColor`、`borderColor`、`borderRadius`
- `chat`：`backgroundColor`、`opacity`、`userBubbleColor`、`assistantBubbleColor`、`textColor`、`borderColor`、`borderRadius`、`shadowStrength`
- `composer`：`backgroundColor`、`opacity`、`textColor`、`borderColor`、`borderRadius`、`focusColor`
- `buttons`：`primaryColor`、`backgroundColor`、`textColor`、`borderColor`、`borderRadius`、`shadowStrength`
- `settings`：`panelColor`、`opacity`

完整示例可直接查看 `assets/themes/clean-light/theme.json`。

## ZIP 安全规则

- 必须恰好包含一个 `theme.json`、一张被清单引用的壁纸和最多一个 `extra.css`。
- 拒绝绝对路径、`..`、子目录、重复条目、符号链接和 ZIP64。
- 拒绝嵌套压缩包、JavaScript、HTML、字体和可执行文件。
- 在解压前检查声明的展开大小；完整验证通过后才原子写入主题目录。
- 同名导入会生成 `id-2`、`id-3`，不会覆盖现有主题。

## `extra.css`

每个选择器的第一个复合选择器必须包含：

```css
html.doubao-skin.theme-<主题ID>
```

或：

```css
:root.doubao-skin.theme-<主题ID>
```

只允许普通规则、`@media` 和 `@supports`。禁止 `@import`、`@font-face`、`url()`、`expression()`、`behavior`、`-moz-binding`、转义混淆和任何远程资源。无效 `extra.css` 会被整体忽略，标准主题仍可导入。
