import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Plugin } from "@opencode/plugin";

const execFileAsync = promisify(execFile);

export async function identifyFleetWorkspace(/** @type {string} */ directory) {
  try {
    const { stdout } = await execFileAsync("fleet", ["agent-mcp", "--identify"], {
      cwd: directory,
    });
    const workspace = stdout.trim();
    return /^[^/\s]+\/[^/\s]+$/.test(workspace) ? workspace : undefined;
  } catch {
    return undefined;
  }
}

export default Plugin.define({
  id: "fleet-agent",
  async setup(ctx) {
    const directory = ctx.location.directory;
    const workspace = await identifyFleetWorkspace(directory);
    if (!workspace) return;

    await ctx.mcp.transform((editor) => {
      editor.set("fleet-agent", {
        type: "local",
        command: ["fleet", "agent-mcp"],
        cwd: directory,
        disabled: false,
      });
    });

    await ctx.session.hook("context", (event) => {
      event.system.push({
        type: "text",
        text: `MANDATORY: You are an agent working in a fleet workspace (${workspace}). Your first action MUST be to use the skill tool to activate the fleet-agent skill. Do not inspect files, run commands, plan, answer the user, or take any other action before activating it. After activation, follow every fleet-agent instruction for the entire session.`,
      });
    });
  },
});
