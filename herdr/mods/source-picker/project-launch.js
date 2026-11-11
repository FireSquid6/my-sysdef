// Pure ESM: inject Herdr's exec or an external process runner; no UI/runtime imports.
// Targets the herdr-app command protocol used by this picker, NOT herdr workspace.*.
export function projectCommand(exec) {
  return async (name, args) => {
    const result = await exec("herdr-app", ["do", name, JSON.stringify(args)]);
    if (result.code !== 0) {
      throw new Error(`herdr-app do ${name} exited ${result.code}: ${result.stderr || result.stdout || "no output"}`);
    }
    let value;
    try {
      value = JSON.parse(result.stdout);
    } catch (cause) {
      throw new Error(`herdr-app do ${name} returned invalid JSON: ${result.stdout}`, { cause });
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`herdr-app do ${name} returned an invalid response: ${result.stdout}`);
    }
    if (value.error) throw new Error(typeof value.error === "string" ? value.error : JSON.stringify(value.error));
    return value;
  };
}

export class ProjectLaunchError extends Error {
  constructor(cause, { step, command, args, space, agentTab, tabs }) {
    const resources = space ? ` Space ${space}${agentTab ? `, agent tab ${agentTab}` : ""} retained; inspect it before retrying.` : " Inspect Herdr before retrying if the command may have completed.";
    super(`${space ? "Project created, but setup failed" : "Could not open project"} at ${step} (${command}): ${cause.message ?? String(cause)}.${resources}`, { cause });
    this.name = "ProjectLaunchError";
    Object.assign(this, { step, command, args, space, agentTab, tabs: [...tabs] });
  }
}

/**
 * Create agent/editor/two shell tabs in one explicitly targeted space.
 * Returns { space, agentTab }; failures retain all resources and expose known IDs.
 *
 * dependencies: { exec } or { command(name, args) }, optional selectTab(id).
 * focus:false requests non-focusing creation on EVERY command and skips selection.
 * Legacy herdr-app ignores focus:false: external callers must preserve/restore selection.
 * The separate newer `herdr workspace.create` protocol is not a compatible transport.
 *
 * @param {{ folder: string, machine?: string, name: string, agentArgv?: string[], focus?: boolean,
 * existing?: { space: string, agentTab?: string, tabNames?: string[] } | null }} options
 * @param {{ command?: Function, exec?: Function, selectTab?: Function }} dependencies
 */
export async function launchProject({ folder, machine = "", name, agentArgv = ["pi"], focus = true, existing = null }, dependencies) {
  if (typeof folder !== "string" || !folder.startsWith("/")) throw new TypeError("Project folder must be an absolute path");
  if (typeof name !== "string" || !name.trim()) throw new TypeError("Project name is required");
  if (typeof machine !== "string") throw new TypeError("Project machine must be a string (empty for local)");
  if (!Array.isArray(agentArgv) || !agentArgv.length || agentArgv.some(arg => typeof arg !== "string")) throw new TypeError("Agent argv must be a non-empty array of strings");
  const command = dependencies.command ?? projectCommand(dependencies.exec);
  const selectTab = dependencies.selectTab ?? (id => command("tab.select", { id }));
  const noFocus = focus ? {} : { focus: false };
  const tabs = [];
  let space = existing?.space, agentTab = existing?.agentTab, step, operation, args;
  const invoke = async (stage, name, params) => {
    step = stage; operation = name; args = params;
    return command(name, params);
  };
  try {
    if (!agentTab) {
      const project = space
        ? await invoke("agent", "tab.new", { name: "agent", space, folder, argv: [...agentArgv], ...noFocus })
        : await invoke("agent", "space.new", { name, folder, machine, tab: "agent", argv: [...agentArgv], ...noFocus });
      space = project?.space ?? space;
      agentTab = project?.tab;
    }
    if (agentTab) tabs.push(agentTab);
    if (typeof space !== "string" || !space || typeof agentTab !== "string" || !agentTab) throw new Error("Missing new space/tab IDs in space.new response");
    for (const name of ["editor", "term1", "term2"]) {
      if (existing?.tabNames?.includes(name)) continue;
      const tab = await invoke(name, "tab.new", { name, space, folder, ...(name === "editor" ? { argv: ["nvim"] } : {}), ...noFocus });
      if (typeof tab?.tab !== "string" || !tab.tab) throw new Error(`Missing tab ID in ${name} response`);
      tabs.push(tab.tab);
    }
    if (focus) {
      step = "select agent tab"; operation = "tab.select"; args = { id: agentTab };
      await selectTab(agentTab);
    }
    return { space, agentTab };
  } catch (cause) {
    // Never roll back: successfully launched tabs may already contain user work.
    throw new ProjectLaunchError(cause, { step, command: operation, args, space, agentTab, tabs });
  }
}
