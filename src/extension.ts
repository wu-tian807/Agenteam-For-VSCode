/**
 * @desc Agenteam Bridge — VSCode/Cursor extension to send code selections
 *       to agenteam ink-renderer with file-source provenance.
 *
 * Features:
 *   - Status bar button: appears when text is selected, click to send
 *   - Command: "Agenteam: Send Selection to Ink" (Cmd+Shift+L)
 *   - Auto-discovers nearest running instance (remembers last choice)
 */

import * as vscode from "vscode";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as http from "node:http";

// ─── Types ───

interface ConnInfo {
  token: string;
  host: string;
  port: number;
}

// ─── Config discovery ───

function findConnInfo(): ConnInfo | null {
  const envDir = process.env.AGENTEAM_STATE ?? process.env.AGENTEAM_STATE_DIR;
  if (envDir) {
    try {
      const raw = fs.readFileSync(path.join(envDir, "gateway.json"), "utf-8");
      const cfg = JSON.parse(raw);
      return { token: cfg.token ?? "", host: cfg.host ?? "127.0.0.1", port: cfg.port ?? 3700 };
    } catch { /* fall through */ }
  }
  try {
    const raw = fs.readFileSync(path.join(os.homedir(), ".agenteam", "gateway.json"), "utf-8");
    const cfg = JSON.parse(raw);
    return { token: cfg.token ?? "", host: cfg.host ?? "127.0.0.1", port: cfg.port ?? 3700 };
  } catch {
    return null;
  }
}

function apiCall(
  conn: ConnInfo,
  method: string,
  apiPath: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = {};
    if (conn.token) headers["Authorization"] = `Bearer ${conn.token}`;
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = String(Buffer.byteLength(payload));
    }
    const req = http.request(
      { hostname: conn.host, port: conn.port, path: apiPath, method, headers, timeout: 10_000 },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: unknown;
          try { data = JSON.parse(raw); } catch { data = raw; }
          resolve({ status: res.statusCode ?? 0, data });
        });
      },
    );
    req.on("timeout", () => { req.destroy(new Error("Request timed out")); });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Send selection ───

async function sendSelection(conn: ConnInfo): Promise<boolean> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    vscode.window.showWarningMessage("No text selected");
    return false;
  }

  const sel = editor.selection;
  const content = editor.document.getText(sel);
  const filePath = vscode.workspace.asRelativePath(editor.document.uri);

  const lineStart = sel.start.line + 1;  // 1-based
  const lineEnd = sel.end.line + 1;
  const language = editor.document.languageId;

  // Send via gateway-level events route — no instance ID needed
  const { status, data } = await apiCall(conn, "POST", "/api/events/snippet", {
    path: filePath,
    content,
    lineStart,
    lineEnd,
    language,
  });

  if (status === 200) {
    vscode.window.setStatusBarMessage(
      `$(check) Sent to agenteam: ${filePath}:${lineStart}-${lineEnd}`,
      5000,
    );
    return true;
  }

  const err = (data as Record<string, unknown>)?.error ?? `HTTP ${status}`;
  vscode.window.showErrorMessage(`Failed to send to agenteam: ${err}`);
  return false;
}

/** Common send-selection flow shared by command and status bar click. */
async function handleSendSelection(context: vscode.ExtensionContext): Promise<void> {
  const conn = findConnInfo();
  if (!conn) {
    vscode.window.showErrorMessage(
      "Agenteam not found — is the gateway running? (~/.agenteam/gateway.json not found)",
    );
    return;
  }

  // Gateway-level events route — no instance selection needed.
  // Snippet events broadcast to all WS clients (ink-renderer) regardless of instance.
  await sendSelection(conn);
}

// ─── Activation ───

export function activate(context: vscode.ExtensionContext): void {
  console.log("[agenteam] extension activated");

  // ── Register command ──
  const commandDisposable = vscode.commands.registerCommand(
    "agenteam.sendSelection",
    () => handleSendSelection(context),
  );
  context.subscriptions.push(commandDisposable);

  // ── Status bar button: visible only when text is selected ──
  const statusItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusItem.command = "agenteam.sendSelection";
  statusItem.text = "$(symbol-file) Send to Ink";
  statusItem.tooltip = "Send selected code to agenteam ink-renderer";
  context.subscriptions.push(statusItem);

  // Show/hide based on selection state
  function updateStatusBar(): void {
    const editor = vscode.window.activeTextEditor;
    if (editor && !editor.selection.isEmpty) {
      statusItem.show();
    } else {
      statusItem.hide();
    }
  }

  // Initial check
  updateStatusBar();

  // Listen for selection changes
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(updateStatusBar),
  );

  // Listen for editor focus changes (switching tabs etc.)
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(updateStatusBar),
  );

  console.log("[agenteam] status bar button registered");
}

export function deactivate(): void {
  console.log("[agenteam] extension deactivated");
}
