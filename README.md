# Agenteam for VSCode / Cursor

Send code selections from your editor to the **currently focused** [agenteam](https://github.com/wu-tian807/agenteam-ink-renderer) ink-renderer input box, with file path, line range, and language metadata.

## Features

- **Status bar** — Shows `Send to Ink` when text is selected; click to send
- **Keyboard shortcut** — macOS `Cmd+Shift+L`; Windows / Linux `Ctrl+Shift+L`
- **Context menu** — When there is a selection: *Agenteam: Send Selection to Ink*
- **IDE Bridge** — On activation, starts a local WebSocket on `127.0.0.1` and writes `~/.agenteam/ide/{port}.lock` for ink-renderer discovery
- **Multi-terminal routing** — With multiple ink-renderer sessions in the same workspace, snippets go only to the instance that **most recently had terminal focus**

## How it works

```
Editor selection ──IDE Bridge (local WS)──► Focused ink-renderer input box
                ▲
                │  ~/.agenteam/ide/*.lock
                │
         ink-renderer (agenteam TUI)
                │
                └── Gateway WS (instances / agents / commands — not used for snippets)
```

1. Install and enable this extension (same Cursor / VS Code window)
2. Run `agenteam` in a terminal (ink-renderer connects to the IDE Bridge automatically)
3. Select code in the editor and send via shortcut or status bar
4. A paste chip appears in the ink-renderer input (e.g. `[pasted src/foo.ts:12-14 · 3 lines]`); edit and submit as usual

After a successful send, if ink-renderer runs in an **integrated terminal**, the extension may call `terminal.show()` to bring that panel forward.

## Requirements

| Component | Requirement |
|-----------|-------------|
| Gateway | Running locally; `~/.agenteam/gateway.json` present (ink-renderer uses it for instances) |
| ink-renderer | `@agenteam/ink-renderer` with IDE Bridge host wiring (`observeSnippets` in `ctl-command/ink-renderer.ts`) |
| Workspace | Extension and ink-renderer `cwd` should share the same workspace root (lock matches `workspaceFolders`) |
| Extension | Must be activated (otherwise no lock file) |

Optional environment variables:

- `AGENTEAM_IDE_PORT` — Force a specific IDE Bridge port (multi-window debugging)
- `AGENTEAM_STATE` / `AGENTEAM_STATE_DIR` — Non-default state directory

## Commands

| Command ID | Description |
|------------|-------------|
| `agenteam.sendSelection` | Send the current selection to the focused ink-renderer |

## Troubleshooting

**“No ink-renderer connected”**

- ink-renderer is not running, or the extension was not active when it started (no lock file)
- Workspace path does not match `workspaceFolders` in the lock — open the same folder in the editor and start `agenteam` there
- Restart `agenteam` after updating host code so `observeSnippets` is wired

**Send succeeds but nothing appears in the TUI**

- Host must implement `observeSnippets` + `startIdeBridgeSubscriber` (IDE Bridge v0.2.1+)

**No reaction on older stacks**

- v0.2.0 and earlier used `POST /api/events/snippet` (Gateway broadcast). v0.2.1+ requires IDE Bridge + matching ink-renderer.

## Release notes

### 0.2.1

- **IDE Bridge**: local WebSocket + lock discovery; removed Gateway `snippet` HTTP
- **Multi-terminal**: unicast to the ink-renderer with the latest `focus_state`
- Lock heartbeat (`updatedAt` refreshed every 15s) for reliable discovery
- Optional focus on VS Code integrated terminal after send

### 0.2.0

- Gateway `POST /api/events/snippet` (deprecated; see 0.2.1)

### 0.1.0

- Initial MVP: selection + file provenance metadata

## License

Apache 2.0
