import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Override prompt metadata, not the installed plugin's implementation. In
// particular, its default research/specialist guidelines otherwise require
// delegation even when the custom Agent description recommends direct work.
export default function directWorkPolicy(pi: ExtensionAPI) {
  pi.on("before_agent_start", (event) => {
    const options = event.systemPromptOptions;
    if (options.selectedTools?.includes("Agent")) {
      options.toolGuidelines.Agent = [
        "Work directly by default: use your own tools for searches, exploration, research, diagnosis, planning, implementation, and tests. Neither task complexity nor matching a specialist description alone justifies spawning Agent.",
        "Use Agent when the user explicitly requests delegation, substantial independent work can run usefully alongside your own work, or an independent review materially improves confidence. Weigh briefing, latency, token cost, and verification overhead; briefly state the concrete benefit. Do not delegate the entire user task merely to save context.",
        "Keep ownership of understanding, integration, and verification. Do not duplicate delegated work; inspect actual changes and run checks before reporting delegated edits as done.",
        "Background Agent completions arrive automatically. Do not poll or sleep waiting; continue useful work where possible, and never predict results before completion.",
      ];
      options.toolSnippets.Agent = "Delegate bounded work when parallelism or independent review offers a clear benefit";
    }
    if (options.selectedTools?.includes("SubagentWorkflow")) {
      options.toolGuidelines.SubagentWorkflow = [
        "Use SubagentWorkflow only when the user explicitly requests a workflow or multi-agent orchestration. Multiple steps, research breadth, or task complexity alone do not justify orchestration; normally work directly.",
        "When orchestration is explicitly requested, prefer pipeline over barriers for independent multi-stage items. Workflow completion is notified automatically; do not poll or sleep waiting.",
      ];
    }
  });
}
