import { truncateHead, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type Todo = { id: number; text: string; done: boolean; evidence?: string };
type Plan = {
  version: 1;
  description: string;
  phase: "planning" | "executing" | "blocked" | "complete" | "cancelled";
  todos: Todo[];
  blocker?: { reason: string; attempted: string; needed: string };
};
const ENTRY = "persistent-plan-v1";
const TOOL = "plan_todos";
const text = Type.String({ minLength: 1, maxLength: 2000 });
const parameters = Type.Object({
  action: Type.Union(["list", "create", "add", "complete", "block", "ask"].map((value) => Type.Literal(value))),
  todos: Type.Optional(Type.Array(text, { minItems: 1, maxItems: 100 })),
  id: Type.Optional(Type.Integer({ minimum: 1 })),
  evidence: Type.Optional(text),
  reason: Type.Optional(text),
  attempted: Type.Optional(text),
  needed: Type.Optional(text),
  question: Type.Optional(text),
});

const instructions = `You are executing a persistent /plan request.
1. Explore the relevant code and repository instructions first. Do not change project files before recording the plan.
2. Resolve material ambiguities with plan_todos action=ask, one focused question at a time. Do not ask questions that code inspection can answer. Then continue automatically.
3. Use plan_todos action=create to record concrete, ordered implementation AND verification todos, then execute them without waiting for separate approval.
4. Use action=complete with an id and concrete evidence only after doing and verifying that todo. Add discovered work with action=add; never silently drop scope. Prose claims do not complete todos.
5. Keep working until every todo is complete. An ordinary failing test, complexity, or more work remaining is not a blocker. Attempt reasonable fixes and alternatives.
6. Only use action=block for a genuine external impediment, missing essential user decision, unavailable access, or an unsafe action requiring permission. Supply the reason, what you attempted, and exactly what is needed to proceed. Never bypass safety or permissions. When the authoritative phase is blocked, report the blocker and unfinished work, then stop until the user resumes.
7. Once complete, summarize changes and actual verification results. A user interrupt/cancellation always takes precedence.
This command does not authorize subagent workflows or change the repository's delegation policy.`;

export default function planExtension(pi: ExtensionAPI) {
  let plan: Plan | undefined;

  function render(ctx: ExtensionContext) {
    if (!ctx.hasUI) return;
    ctx.ui.setStatus("persistent-plan", plan ? `plan: ${plan.phase} ${plan.todos.filter((t) => t.done).length}/${plan.todos.length}` : undefined);
    ctx.ui.setWidget("persistent-plan", plan ? [
      `Plan: ${plan.description}`,
      ...plan.todos.map((t) => `${t.done ? "[x]" : "[ ]"} #${t.id} ${t.text}`),
      ...(plan.blocker ? [`Blocked: ${plan.blocker.reason}`, `Needed: ${plan.blocker.needed}`] : []),
    ] : undefined);
  }

  function save(ctx: ExtensionContext) {
    pi.appendEntry(ENTRY, structuredClone(plan));
    render(ctx);
  }

  function restore(ctx: ExtensionContext) {
    plan = undefined;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === ENTRY) {
        const data = entry.data as Plan | undefined;
        if (data?.version === 1) plan = structuredClone(data);
      }
    }
    render(ctx);
  }
  pi.on("session_start", (_event, ctx) => restore(ctx));
  pi.on("session_tree", (_event, ctx) => restore(ctx));

  function activateTool() {
    pi.setActiveTools([...new Set([...pi.getActiveTools(), TOOL])]);
  }

  pi.registerCommand("plan", {
    description: "Explore, clarify, create todos, and execute: /plan <description>",
    handler: async (args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify("Interrupt the current run before starting a plan.", "warning");
        return;
      }
      const description = args.trim();
      if (!description) {
        ctx.ui.notify("Usage: /plan <description>. See /plan-status, /plan-resume, /plan-cancel.", "info");
        return;
      }
      if (plan && !["complete", "cancelled"].includes(plan.phase)) {
        ctx.ui.notify("An unfinished plan exists. Use /plan-resume or /plan-cancel first.", "warning");
        return;
      }
      plan = { version: 1, description, phase: "planning", todos: [] };
      activateTool();
      save(ctx);
      pi.sendUserMessage(`Plan and implement this request:\n${description}`);
    },
  });

  pi.registerCommand("plan-status", {
    description: "Show the persistent plan and todo evidence",
    handler: async (_args, ctx) => {
      pi.sendMessage({ customType: "plan-status", content: JSON.stringify(plan ?? "No plan", null, 2), display: true });
      render(ctx);
    },
  });

  pi.registerCommand("plan-cancel", {
    description: "Cancel plan enforcement, retaining todo history (does not undo changes)",
    handler: async (_args, ctx) => {
      if (!plan) return;
      plan.phase = "cancelled";
      save(ctx);
      ctx.abort();
    },
  });

  pi.registerCommand("plan-resume", {
    description: "Resume an interrupted or blocked plan after resolving its blocker",
    handler: async (_args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify("Interrupt the current run before resuming.", "warning");
        return;
      }
      if (!plan || ["complete", "cancelled"].includes(plan.phase)) {
        ctx.ui.notify("No unfinished plan to resume.", "info");
        return;
      }
      plan.phase = plan.todos.length ? "executing" : "planning";
      delete plan.blocker;
      activateTool();
      save(ctx);
      pi.sendUserMessage("Resume the persistent plan. Recheck any prior blocker and continue the remaining todos.");
    },
  });

  pi.registerTool({
    name: TOOL,
    label: "Plan todos",
    description: "Manage /plan todos. create records the initial list; add appends work; complete requires evidence; block requires reason/attempted/needed. ask requests essential clarification. list shows state. Text output is limited to 2000 lines/50KB.",
    parameters,
    executionMode: "sequential",
    async execute(_id, params, signal, _update, ctx) {
      signal?.throwIfAborted();
      if (!plan) throw new Error("Start a plan with /plan <description> first.");
      const required = (value: string | undefined, name: string) => {
        if (!value?.trim()) throw new Error(`${name} is required.`);
        return value.trim();
      };
      if (params.action !== "list") {
        if (!["planning", "executing"].includes(plan.phase)) throw new Error("Plan is not active. Use /plan-resume if blocked.");
        switch (params.action) {
          case "create":
          case "add": {
            if (params.action === "create" && plan.todos.length) throw new Error("Plan already exists; add todos instead of replacing them.");
            if (!params.todos?.length) throw new Error("A non-empty todo list is required.");
            const todos = params.todos.map((item) => required(item, "todo"));
            for (const item of todos) plan.todos.push({ id: plan.todos.length + 1, text: item, done: false });
            plan.phase = "executing";
            break;
          }
          case "complete": {
            const todo = plan.todos.find((item) => item.id === params.id);
            if (!todo) throw new Error("Unknown todo id.");
            todo.evidence = required(params.evidence, "evidence");
            todo.done = true;
            if (plan.todos.every((item) => item.done)) plan.phase = "complete";
            break;
          }
          case "block": {
            const blocker = {
              reason: required(params.reason, "reason"),
              attempted: required(params.attempted, "attempted"),
              needed: required(params.needed, "needed"),
            };
            plan.blocker = blocker;
            plan.phase = "blocked";
            break;
          }
          case "ask": {
            const question = required(params.question, "question");
            const answer = ctx.hasUI ? await ctx.ui.input(question) : undefined;
            signal?.throwIfAborted();
            if (!["planning", "executing"].includes(plan.phase)) throw new Error("Plan was stopped while awaiting clarification.");
            if (answer?.trim()) {
              return { content: [{ type: "text", text: `User answer: ${answer.trim()}` }], details: structuredClone(plan) };
            }
            plan.blocker = { reason: question, attempted: "Requested essential clarification; no answer received.", needed: "Provide the answer and use /plan-resume." };
            plan.phase = "blocked";
            break;
          }
        }
        save(ctx);
      }
      const output = truncateHead(JSON.stringify(plan, null, 2));
      return {
        content: [{ type: "text", text: output.content + (output.truncated ? "\n[Output truncated; full plan remains in session state and /plan-status.]" : "") }],
        details: structuredClone(plan),
      };
    },
  });

  // Context injection runs for EVERY provider call, including continuation and
  // post-compaction requests. Custom state entries alone are not model context.
  pi.on("context", (event) => {
    if (!plan || ["complete", "cancelled"].includes(plan.phase)) return;
    return { messages: [...event.messages, {
      role: "custom" as const,
      customType: "persistent-plan-context",
      content: `${instructions}\n\nCurrent authoritative state:\n${JSON.stringify(plan)}`,
      display: false,
      timestamp: Date.now(),
    }] };
  });

  pi.on("agent_before_settle", (event) => {
    if (!plan || !["planning", "executing"].includes(plan.phase)) return;
    return {
      entries: [...event.entries, {
        type: "custom_message" as const,
        customType: "persistent-plan-continue",
        content: `The plan is unfinished. Do not wrap up. ${plan.todos.length ? "Execute and verify the remaining todos, updating plan_todos." : "Finish exploration/clarification and create todos with plan_todos, then execute them."} If genuinely blocked, record reason, attempted remedies, and needed action using plan_todos action=block.`,
        display: false,
      }],
      continue: true,
    };
  });
}
