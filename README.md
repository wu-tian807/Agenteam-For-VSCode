# Agenteam for VSCode / Cursor

将编辑器中的代码选区发送到 **当前聚焦的** [agenteam](https://github.com/wu-tian807/agenteam-ink-renderer) ink-renderer 输入框，并附带文件路径、行号与语言信息。

## 功能

- **状态栏** — 有选区时显示 `Send to Ink`，一键发送
- **快捷键** — macOS `Cmd+Shift+L`；Windows / Linux `Ctrl+Shift+L`
- **右键菜单** — 有选区时：Agenteam: Send Selection to Ink
- **IDE Bridge** — 扩展激活后在 `127.0.0.1` 启动本地 WebSocket，写入 `~/.agenteam/ide/{port}.lock` 供 ink-renderer 发现
- **多终端路由** — 同一工作区内多个 ink-renderer 时，snippet 只进入 **最近一次获得终端焦点** 的那个实例

## 工作原理

```
编辑器选区 ──IDE Bridge (本地 WS)──► 聚焦的 ink-renderer 输入框
                ▲
                │  ~/.agenteam/ide/*.lock
                │
         ink-renderer（agenteam TUI）
                │
                └── Gateway WS（实例 / agent / 命令，与 snippet 无关）
```

1. 安装并启用本扩展（同一 Cursor / VS Code 窗口）
2. 在终端中启动 `agenteam`（ink-renderer 会自动连接 IDE Bridge）
3. 在编辑器选中代码，用快捷键或状态栏发送
4. ink-renderer 输入框出现类似 `[已粘贴 src/foo.ts:12-14 · 3 行]` 的标签，确认后提交即可

发送成功后，若使用 **集成终端** 运行 ink-renderer，扩展会尝试 `terminal.show()` 将面板切到前台。

## 环境要求

| 组件 | 要求 |
|------|------|
| Gateway | 本地运行，`~/.agenteam/gateway.json` 存在（ink-renderer 连实例用） |
| ink-renderer | `@agenteam/ink-renderer` + host 支持 IDE Bridge（见 agenteam_os PR） |
| 工作区 | 扩展与 ink-renderer 的 `cwd` 应在同一 workspace 根目录下（lock 按 `workspaceFolders` 匹配） |
| 扩展 | 本扩展已激活（否则无 lock 文件） |

可选环境变量：

- `AGENTEAM_IDE_PORT` — 强制连接指定 IDE Bridge 端口（多窗口调试）
- `AGENTEAM_STATE` / `AGENTEAM_STATE_DIR` — 非默认 state 目录时使用

## 命令

| 命令 ID | 说明 |
|---------|------|
| `agenteam.sendSelection` | 将当前选区发送到聚焦的 ink-renderer |

## 常见问题

**提示 “No ink-renderer connected”**

- ink-renderer 未启动，或启动时扩展未激活（无 lock）
- 工作区路径与 lock 中 `workspaceFolders` 不匹配：在同一文件夹打开编辑器并启动 agenteam

**发送无反应（旧版本）**

- v0.2.0 及以前走 `POST /api/events/snippet`（Gateway 广播）；v0.2.1 起必须搭配支持 IDE Bridge 的 ink-renderer

## Release Notes

### 0.2.1

- **IDE Bridge**：本地 WebSocket + lock 发现；移除 Gateway `snippet` HTTP
- **多终端**：按 ink-renderer 上报的 `focus_state` 单播到最近聚焦实例
- 发送后可选聚焦 VS Code 集成终端

### 0.2.0

- Gateway `POST /api/events/snippet`（已废弃，见 0.2.1）

### 0.1.0

- 初始 MVP：选区 + 文件来源元数据

## License

Apache 2.0
