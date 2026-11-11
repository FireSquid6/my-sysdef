import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export const stateRoot = () => path.join(process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi/agent"), "branchfork");
export interface Handoff { id: string; text: string }

// Receivers append context only while fully idle. No terminal input, steering, or turn trigger.
export function receiveInbox(pi: Pick<ExtensionAPI, "sendMessage">, ctx: ExtensionContext, root = stateRoot()) {
  if (!ctx.isIdle()) return 0;
  const sessionId = ctx.sessionManager.getSessionId();
  const inbox = path.join(root, "inbox", sessionId);
  if (!fs.existsSync(inbox)) return 0;
  let count = 0;
  for (const name of fs.readdirSync(inbox).filter(name => /^[a-zA-Z0-9_-]+\.json$/.test(name)).sort()) {
    if (!ctx.isIdle()) break;
    const file = path.join(inbox, name);
    const message = JSON.parse(fs.readFileSync(file, "utf8")) as Handoff;
    if (!message || typeof message.text !== "string" || message.id !== name.slice(0, -5)) throw new Error(`Invalid branchfork handoff: ${file}`);
    const receiptDir = path.join(root, "receipts", sessionId);
    const receipt = path.join(receiptDir, name);
    const inHistory = ctx.sessionManager.getBranch().some(entry => entry.type === "custom_message" && entry.customType === "branchfork-handoff" && (entry.details as { id?: string } | undefined)?.id === message.id);
    if (!inHistory && !fs.existsSync(receipt)) {
      pi.sendMessage({ customType: "branchfork-handoff", content: message.text, display: true, details: { id: message.id } }, { triggerTurn: false });
      // Idle sendMessage appends synchronously before its promise resolves in Pi 1.5.2.
      if (!ctx.sessionManager.getBranch().some(entry => entry.type === "custom_message" && entry.customType === "branchfork-handoff" && (entry.details as { id?: string } | undefined)?.id === message.id)) {
        throw new Error("Pi did not persist the handoff; leaving it queued. Reload a supported Pi version.");
      }
      count++;
    }
    fs.mkdirSync(receiptDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(receipt, JSON.stringify({ id: message.id, deliveredAt: new Date().toISOString() }), { mode: 0o600 });
    fs.unlinkSync(file);
  }
  return count;
}

export function registerInbox(pi: ExtensionAPI) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let live: string | undefined;
  let context: ExtensionContext | undefined;
  let lastError = "";
  const cleanup = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
    if (live) fs.rmSync(live, { force: true });
    live = undefined;
    context = undefined;
  };
  const tick = () => {
    if (!context || !live) return;
    try {
      const registration = {
        sessionId: context.sessionManager.getSessionId(), pid: process.pid,
        cwd: fs.realpathSync(context.cwd), terminal: process.env.HC_TERMINAL_ID || process.env.HERDR_TERMINAL_ID || "",
        tab: process.env.HERDR_TAB_ID || "",
        received: context.sessionManager.getBranch().flatMap(entry => entry.type === "custom_message" && entry.customType === "branchfork-handoff" && typeof (entry.details as { id?: string } | undefined)?.id === "string" ? [(entry.details as { id: string }).id] : []),
      };
      const temp = `${live}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(registration), { mode: 0o600 });
      fs.renameSync(temp, live);
      receiveInbox(pi, context);
      lastError = "";
    } catch (error) {
      const message = String(error);
      if (message !== lastError) context.ui.notify(`Branchfork inbox: ${message}`, "error");
      lastError = message;
    }
  };
  pi.on("session_start", (_event, ctx) => {
    cleanup();
    context = ctx;
    const dir = path.join(stateRoot(), "live");
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    live = path.join(dir, `${ctx.sessionManager.getSessionId()}.json`);
    tick();
    timer = setInterval(tick, 3000);
    timer.unref();
  });
  pi.on("agent_settled", (_event, ctx) => { context = ctx; tick(); });
  pi.on("session_shutdown", cleanup);
}
