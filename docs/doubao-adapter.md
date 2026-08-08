# 豆包页面适配器

`assets/adapters/doubao-adapter.json` 是工具唯一加载的内置适配器。用户可以在
`%LOCALAPPDATA%\DoubaoSkin\adapter\doubao-adapter.json` 放置完整替代文件；两者不会合并，工具也不会联网更新。

当前内置选择器于 2026-08-08 在豆包 2.22.7 实测。聊天页使用 `#root`、
`flow_chat_sidebar`、`main[data-container-name="main"]` 和 `#input-engine-container` 等稳定结构属性；
设置面板使用带 `role="dialog"` 的 `data-slot="dialog-content"`。

## 安全边界

- 只允许明确列出的 `doubao://` 页面目标。
- 后台页、`cross-site-support`、登录页和未知目标不会连接。
- 每个页面状态都有必需区域；缺少任一必需区域时拒绝注入。
- 主题 CSS 只使用适配器添加的 `dbs-*` 语义类，不直接依赖豆包内部类名。

## 只读检查

先用调试端口启动豆包，然后运行：

```powershell
node tools\inspect-doubao.mjs --port 9225
```

该工具只输出目标地址、元素标签、结构属性与矩形尺寸，不读取输入值、账号标识或聊天正文。

## 更新检查清单

1. 在聊天页和设置页分别运行结构检查。
2. 优先选择稳定的 `role`、`data-*`、`aria-*` 和结构关系。
3. 验证 `appRoot`、`chatArea` 与 `settingsPanel` 的必需项。
4. 确认辅助目标仍为排除状态。
5. 实测应用、重复应用和恢复官方外观。
