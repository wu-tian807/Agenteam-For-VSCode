/**
 * @desc Agenteam Bridge — VSCode/Cursor extension to send code selections
 *       to agenteam ink-renderer via IDE Bridge (local WebSocket).
 *
 * Features:
 *   - Status bar button: appears when text is selected, click to send
 *   - Command: "Agenteam: Send Selection to Ink" (Cmd+Shift+L)
 *   - IDE Bridge: ~/.agenteam/ide/{port}.lock for ink-renderer discovery
 */

import * as vscode from "vscode";
import { IdeBridgeServer } from "./ide-bridge";

let bridge: IdeBridgeServer | null = null;

// ─── Send selection ───

async function sendSelection(): Promise<boolean> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    vscode.window.showWarningMessage("No text selected");
    return false;
  }

  if (!bridge) {
    vscode.window.showErrorMessage("Agenteam IDE bridge is not running");
    return false;
  }

  const sel = editor.selection;
  const content = editor.document.getText(sel);
  const filePath = vscode.workspace.asRelativePath(editor.document.uri);
  const lineStart = sel.start.line + 1;
  const lineEnd = sel.end.line + 1;
  const language = editor.document.languageId;

  const result = bridge.sendSnippet({
    path: filePath,
    content,
    lineStart,
    lineEnd,
    language,
  });

  if (result.ok) {
    vscode.window.setStatusBarMessage(
      `$(check) Sent to ink: ${filePath}:${lineStart}-${lineEnd}`,
      5000,
    );
    // Focus integrated terminal when ink-renderer runs inside VS Code/Cursor.
    const term = vscode.window.activeTerminal
      ?? vscode.window.terminals[vscode.window.terminals.length - 1];
    if (term) {
      term.show();
    }
    return true;
  }

  vscode.window.showErrorMessage(`Failed to send to ink: ${result.error}`);
  return false;
}

async function handleSendSelection(): Promise<void> {
  await sendSelection();
}

// ─── Activation ───

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log("[agenteam] extension activated");

  bridge = new IdeBridgeServer();
  try {
    await bridge.start(vscode.workspace.workspaceFolders ?? []);
  } catch (err) {
    console.error("[agenteam] IDE bridge failed to start:", err);
    vscode.window.showErrorMessage(
      `Agenteam IDE bridge failed to start: ${(err as Error).message}`,
    );
    bridge = null;
  }

  const commandDisposable = vscode.commands.registerCommand(
    "agenteam.sendSelection",
    () => handleSendSelection(),
  );
  context.subscriptions.push(commandDisposable);

  const statusItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusItem.command = "agenteam.sendSelection";
  statusItem.text = "$(symbol-file) Send to Ink";
  statusItem.tooltip = "Send selected code to agenteam ink-renderer (IDE bridge)";
  context.subscriptions.push(statusItem);

  function updateStatusBar(): void {
    const editor = vscode.window.activeTextEditor;
    if (editor && !editor.selection.isEmpty) {
      statusItem.show();
    } else {
      statusItem.hide();
    }
  }

  updateStatusBar();

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(updateStatusBar),
  );
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(updateStatusBar),
  );

  context.subscriptions.push({
    dispose: () => {
      bridge?.stop();
      bridge = null;
    },
  });

  console.log("[agenteam] IDE bridge registered");
}

export function deactivate(): void {
  bridge?.stop();
  bridge = null;
  console.log("[agenteam] extension deactivated");
}
