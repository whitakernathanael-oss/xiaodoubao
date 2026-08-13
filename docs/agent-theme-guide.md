# Agent 主题制作指南

目标是生成一个可直接导入“小豆包”的普通 ZIP，不生成程序、插件或安装器。

## 最小目录

```text
my-theme/
├── theme.json
└── wallpaper.webp
```

只有标准字段无法表达设计时才添加 `extra.css`。

## 推荐流程

1. 复制 `assets/themes/clean-light/theme.json`。
2. 将 `id` 改为唯一的小写 kebab-case，将 `name`、`author` 和壁纸文件名改为实际值。
3. 生成或选择具有明确授权的静态图片；最长边不超过 4096，文件不超过 25 MB。
4. 先调整标准 `palette` 和 `regions` 字段。
5. 如确有必要，添加严格限定作用域的 `extra.css`。
6. 将文件直接压缩到 ZIP 根部，不要多套一层目录。
7. 用应用导入 ZIP，检查聊天和设置预览，再应用并恢复一次。

## Agent 硬性约束

- 不得生成或包含 JavaScript、TypeScript、HTML、可执行文件、DLL、脚本或字体。
- 不得使用 `http://`、`https://`、`data:`、`file:` 或 `url()` 引用资源。
- 不得引用主题目录之外的文件，不得出现绝对路径、`..` 或符号链接。
- 不得添加付费、授权、DRM、账号或遥测字段。
- 不得修改豆包安装目录或用户数据。
- 不得把真实聊天内容、账号信息或用户素材写入清单、CSS 或日志。

## `extra.css` 示例

```css
html.doubao-skin.theme-my-theme .dbs-sidebar {
  backdrop-filter: blur(18px);
}

@media (max-width: 1000px) {
  html.doubao-skin.theme-my-theme .dbs-composer {
    border-radius: 12px;
  }
}
```

选择器只能使用引擎的 `dbs-*` 语义类和安全的后代选择器；不要复制豆包当前版本的生成类名到主题中。页面适配属于 `doubao-adapter.json`，不属于主题。

## 交付检查清单

- [ ] ZIP 根部只有 `theme.json`、一张壁纸和可选 `extra.css`
- [ ] `formatVersion` 为 `1`
- [ ] ID 是小写 kebab-case
- [ ] 壁纸扩展名、真实文件头和清单一致
- [ ] 所有数字在允许范围内
- [ ] 正文与表面色对比度建议不低于 4.5:1
- [ ] CSS 每条选择器都锚定当前主题 ID
- [ ] 不含远程资源和可执行内容
- [ ] 可导入、可导出、可应用、可恢复
