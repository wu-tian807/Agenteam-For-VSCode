# Agenteam for VSCode

Send code selections from your editor directly to agenteam's ink-renderer terminal with file-source provenance (path, line numbers, language).

## Features

- **Status bar button** — select any code in the editor, click `📄 Send to Ink` in the status bar
- **Keyboard shortcut** — `Cmd+Shift+L` (or `Ctrl+Shift+L` on Windows/Linux)
- **Right-click menu** — select code, right-click → "Agenteam: Send Selection to Ink"
- **Auto-discovery** — finds your local agenteam Gateway automatically
- **Smart routing** — picks the nearest running instance, remembers your last choice

## How it works

1. Select code in the editor
2. Send it via status bar, shortcut, or right-click
3. The code appears in ink-renderer's input box with a label like `[已粘贴 src/foo.ts:12-14 · 3 行]`
4. Submit the message — the file source is automatically encoded in the response to the agent

## Requirements

- [agenteam](https://github.com/your-repo/agenteam) framework running locally (Gateway on `localhost:3700`)
- ink-renderer terminal connected to a running instance

## Extension Settings

This extension contributes the following commands:

- `agenteam.sendSelection`: Send the selected code to agenteam ink-renderer

## Known Issues

- The extension discovers the Gateway via `~/.agenteam/gateway.json`. If your Gateway uses a different path, set `AGENTEAM_STATE` or `AGENTEAM_STATE_DIR` environment variable.

## Release Notes

### 0.1.0

Initial MVP release:
- Send code selections with file path, line range, and language metadata
- Status bar button, keyboard shortcut, and right-click menu
- Auto-discovery of agenteam Gateway
- Instance selection with last-used memory

## License

Apache 2.0
