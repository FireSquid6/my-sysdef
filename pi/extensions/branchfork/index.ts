import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerInbox } from "./inbox.ts";
import { branchfork } from "./orchestrator.ts";

export default function (pi: ExtensionAPI) {
  registerInbox(pi);
  let running = false;
  pi.registerCommand("branchfork", {
    description: "Fork context into a Core terminal and clean Git worktree: /branchfork <branch> [host] [--headless]",
    handler: async (args, ctx) => {
      if (running) { ctx.ui.notify("A branchfork is already running in this Pi session. Wait for it to finish.", "warning"); return; }
      running = true;
      ctx.ui.setStatus("branchfork", "Checking Git and preparing branchfork…");
      try {
        ctx.ui.notify(await branchfork(args, ctx), "info");
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const text = `Branchfork stopped:\n${detail}\n${detail.includes("Recommended fix:") ? "" : "Recommended fix: resolve the reported blocker explicitly (verify Git status/origin, host connectivity, and Herdr/Pi setup as applicable), then rerun the same command."}\nWhat would you like to do next?`;
        // Make the blocker visible to both user and current agent without starting work.
        pi.sendMessage({ customType: "branchfork-status", content: text, display: true }, { triggerTurn: false });
        ctx.ui.notify(text, "error");
      } finally {
        ctx.ui.setStatus("branchfork", undefined);
        running = false;
      }
    },
  });
}
