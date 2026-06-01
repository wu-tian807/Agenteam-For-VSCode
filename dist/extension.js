"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode = __toESM(require("vscode"));
var fs = __toESM(require("node:fs"));
var os = __toESM(require("node:os"));
var path = __toESM(require("node:path"));
var http = __toESM(require("node:http"));
function findConnInfo() {
  const envDir = process.env.AGENTEAM_STATE ?? process.env.AGENTEAM_STATE_DIR;
  if (envDir) {
    try {
      const raw = fs.readFileSync(path.join(envDir, "gateway.json"), "utf-8");
      const cfg = JSON.parse(raw);
      return { token: cfg.token ?? "", host: cfg.host ?? "127.0.0.1", port: cfg.port ?? 3700 };
    } catch {
    }
  }
  try {
    const raw = fs.readFileSync(path.join(os.homedir(), ".agenteam", "gateway.json"), "utf-8");
    const cfg = JSON.parse(raw);
    return { token: cfg.token ?? "", host: cfg.host ?? "127.0.0.1", port: cfg.port ?? 3700 };
  } catch {
    return null;
  }
}
function apiCall(conn, method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : void 0;
    const headers = {};
    if (conn.token) headers["Authorization"] = `Bearer ${conn.token}`;
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = String(Buffer.byteLength(payload));
    }
    const req = http.request(
      { hostname: conn.host, port: conn.port, path: apiPath, method, headers, timeout: 1e4 },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data;
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
          resolve({ status: res.statusCode ?? 0, data });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error("Request timed out"));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}
async function sendSelection(conn) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    vscode.window.showWarningMessage("No text selected");
    return false;
  }
  const sel = editor.selection;
  const content = editor.document.getText(sel);
  const filePath = vscode.workspace.asRelativePath(editor.document.uri);
  const lineStart = sel.start.line + 1;
  const lineEnd = sel.end.line + 1;
  const language = editor.document.languageId;
  const { status, data } = await apiCall(conn, "POST", "/api/events/snippet", {
    path: filePath,
    content,
    lineStart,
    lineEnd,
    language
  });
  if (status === 200) {
    vscode.window.setStatusBarMessage(
      `$(check) Sent to agenteam: ${filePath}:${lineStart}-${lineEnd}`,
      5e3
    );
    return true;
  }
  const err = data?.error ?? `HTTP ${status}`;
  vscode.window.showErrorMessage(`Failed to send to agenteam: ${err}`);
  return false;
}
async function handleSendSelection(context) {
  const conn = findConnInfo();
  if (!conn) {
    vscode.window.showErrorMessage(
      "Agenteam not found \u2014 is the gateway running? (~/.agenteam/gateway.json not found)"
    );
    return;
  }
  await sendSelection(conn);
}
function activate(context) {
  console.log("[agenteam] extension activated");
  const commandDisposable = vscode.commands.registerCommand(
    "agenteam.sendSelection",
    () => handleSendSelection(context)
  );
  context.subscriptions.push(commandDisposable);
  const statusItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusItem.command = "agenteam.sendSelection";
  statusItem.text = "$(symbol-file) Send to Ink";
  statusItem.tooltip = "Send selected code to agenteam ink-renderer";
  context.subscriptions.push(statusItem);
  function updateStatusBar() {
    const editor = vscode.window.activeTextEditor;
    if (editor && !editor.selection.isEmpty) {
      statusItem.show();
    } else {
      statusItem.hide();
    }
  }
  updateStatusBar();
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(updateStatusBar)
  );
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(updateStatusBar)
  );
  console.log("[agenteam] status bar button registered");
}
function deactivate() {
  console.log("[agenteam] extension deactivated");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
