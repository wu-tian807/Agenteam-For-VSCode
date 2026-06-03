/**
 * @desc IDE Bridge — local WebSocket server for editor → ink-renderer snippet delivery.
 *       Discovery via ~/.agenteam/ide/{port}.lock (Claude Code /ide pattern).
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import type * as vscode from "vscode";
import { WebSocket, WebSocketServer } from "ws";

// ─── Types ───

export interface SnippetPayload {
  path: string;
  content: string;
  lineStart: number;
  lineEnd: number;
  language: string;
}

interface ClientRecord {
  ws: WebSocket;
  clientId: string;
  focusedAt: number;
  registeredAt: number;
}

const MAX_SNIPPET_BYTES = 1_000_000;
const LOCK_DIR = path.join(os.homedir(), ".agenteam", "ide");
const LOCK_HEARTBEAT_MS = 15_000;

// ─── Server ───

export class IdeBridgeServer {
  private httpServer: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private port = 0;
  private token = "";
  private lockPath = "";
  private readonly clients = new Map<string, ClientRecord>();
  private readonly authed = new WeakSet<WebSocket>();
  private readonly wsToClientId = new WeakMap<WebSocket, string>();
  private lockHeartbeat: ReturnType<typeof setInterval> | null = null;
  private lockPayload: Record<string, unknown> | null = null;

  async start(workspaceFolders: readonly vscode.WorkspaceFolder[]): Promise<void> {
    if (this.wss) return;

    this.token = crypto.randomUUID();
    const folders = workspaceFolders.map((f) => f.uri.fsPath);

    await new Promise<void>((resolve, reject) => {
      this.httpServer = http.createServer();
      this.wss = new WebSocketServer({ server: this.httpServer });

      this.wss.on("connection", (ws) => this.onConnection(ws));

      this.httpServer.on("error", reject);
      this.httpServer.listen(0, "127.0.0.1", () => {
        const addr = this.httpServer!.address();
        if (!addr || typeof addr === "string") {
          reject(new Error("Failed to bind IDE bridge"));
          return;
        }
        this.port = addr.port;
        resolve();
      });
    });

    fs.mkdirSync(LOCK_DIR, { recursive: true });
    this.lockPath = path.join(LOCK_DIR, `${this.port}.lock`);
    this.lockPayload = {
      port: this.port,
      token: this.token,
      pid: process.pid,
      workspaceFolders: folders,
      updatedAt: Date.now(),
    };
    this.writeLock();
    this.lockHeartbeat = setInterval(() => this.writeLock(), LOCK_HEARTBEAT_MS);
    console.log(`[agenteam] IDE bridge listening on 127.0.0.1:${this.port}`);
  }

  private writeLock(): void {
    if (!this.lockPath || !this.lockPayload) return;
    this.lockPayload.updatedAt = Date.now();
    fs.writeFileSync(this.lockPath, JSON.stringify(this.lockPayload, null, 2));
  }

  stop(): void {
    if (this.lockHeartbeat) {
      clearInterval(this.lockHeartbeat);
      this.lockHeartbeat = null;
    }
    for (const { ws } of this.clients.values()) {
      try { ws.close(1000); } catch { /* ignore */ }
    }
    this.clients.clear();
    this.wss?.close();
    this.httpServer?.close();
    this.wss = null;
    this.httpServer = null;
    if (this.lockPath) {
      try { fs.unlinkSync(this.lockPath); } catch { /* ignore */ }
      this.lockPath = "";
    }
    this.lockPayload = null;
  }

  /** Send snippet to the ink-renderer that was most recently focused. */
  sendSnippet(payload: SnippetPayload): { ok: true } | { ok: false; error: string } {
    if (Buffer.byteLength(payload.content, "utf-8") > MAX_SNIPPET_BYTES) {
      return { ok: false, error: `Content too large (max ${MAX_SNIPPET_BYTES / 1_000_000} MB)` };
    }

    const target = this.pickTargetClient();
    if (!target) {
      return {
        ok: false,
        error: `No ink-renderer connected (${this.clients.size} registered on port ${this.port}) — restart agenteam in a terminal under this workspace`,
      };
    }

    target.ws.send(JSON.stringify({ type: "snippet", ...payload }));
    return { ok: true };
  }

  get connectedCount(): number {
    return this.clients.size;
  }

  private pickTargetClient(): ClientRecord | null {
    let best: ClientRecord | null = null;
    for (const rec of this.clients.values()) {
      if (rec.ws.readyState !== WebSocket.OPEN) continue;
      if (!best || rec.focusedAt > best.focusedAt) best = rec;
    }
    return best;
  }

  private onConnection(ws: WebSocket): void {
    ws.on("message", (raw) => {
      let frame: Record<string, unknown>;
      try {
        frame = JSON.parse(raw.toString());
      } catch {
        this.send(ws, { type: "error", message: "Invalid JSON" });
        return;
      }

      switch (frame.type) {
        case "auth":
          this.handleAuth(ws, frame);
          break;
        case "register":
          this.handleRegister(ws, frame);
          break;
        case "focus_state":
          this.handleFocusState(ws, frame);
          break;
        default:
          this.send(ws, { type: "error", message: `Unknown type: ${frame.type}` });
      }
    });

    ws.on("close", () => {
      const id = this.wsToClientId.get(ws);
      if (id) this.clients.delete(id);
    });
  }

  private handleAuth(ws: WebSocket, frame: Record<string, unknown>): void {
    if (frame.token !== this.token) {
      this.send(ws, { type: "error", message: "Invalid token" });
      ws.close(4003, "Invalid token");
      return;
    }
    this.authed.add(ws);
    this.send(ws, { type: "auth_ok" });
  }

  private handleRegister(ws: WebSocket, frame: Record<string, unknown>): void {
    if (!this.authed.has(ws)) {
      this.send(ws, { type: "error", message: "Not authenticated" });
      return;
    }
    const clientId = crypto.randomUUID();
    const now = Date.now();
    const rec: ClientRecord = {
      ws,
      clientId,
      focusedAt: now,
      registeredAt: now,
    };
    this.clients.set(clientId, rec);
    this.wsToClientId.set(ws, clientId);
    this.send(ws, { type: "registered", clientId });
  }

  private handleFocusState(ws: WebSocket, frame: Record<string, unknown>): void {
    if (!this.authed.has(ws)) return;
    const id = this.wsToClientId.get(ws);
    if (!id) return;
    const rec = this.clients.get(id);
    if (!rec) return;
    if (frame.focused === true) {
      rec.focusedAt = typeof frame.ts === "number" ? frame.ts : Date.now();
    }
  }

  private send(ws: WebSocket, data: Record<string, unknown>): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }
}
