import { createHash } from "node:crypto";
import { CoreRpcError, type CoreTerminal, type Herdr } from "./herdr.ts";
import { storageWorker } from "./storage-worker.js";

export interface LayoutNode { id?: string; type?: string; content?: { terminal?: string }; children?: LayoutNode[]; floating?: Array<{ content?: { terminal?: string } }>; [key: string]: unknown }
interface LayoutTab { id: string; name: string; root: LayoutNode; [key: string]: unknown }
interface LayoutSpace { id: string; name: string; folder: string; tabs: LayoutTab[]; [key: string]: unknown }
export interface Layout { spaces: LayoutSpace[]; [key: string]: unknown }
interface Document { version: number; value: Layout | null }
const id = (kind: string, value: string) => `${kind}${createHash("sha256").update(value).digest("hex").slice(0, 28)}`;
export function terminalsIn(node: LayoutNode): string[] {
  return [node.content?.terminal, ...(node.floating ?? []).map(float => float.content?.terminal), ...(node.children ?? []).flatMap(terminalsIn)].filter((t): t is string => typeof t === "string");
}
export function validateLayout(value: unknown): Layout {
  if (!value || typeof value !== "object" || !Array.isArray((value as Layout).spaces)) throw new Error("Unrecognized Herdr layout document; refusing to overwrite it");
  const layout = value as Layout;
  for (const space of layout.spaces) {
    if (!space || typeof space.id !== "string" || typeof space.folder !== "string" || !Array.isArray(space.tabs)
      || space.tabs.some(tab => !tab || typeof tab.id !== "string" || typeof tab.name !== "string" || !tab.root || typeof tab.root !== "object")) {
      throw new Error("Unrecognized Herdr space/tab document; refusing to overwrite it");
    }
  }
  return layout;
}

// Optional presentation, using the GUI's machine-owned, versioned core document.
// No GUI socket, window creation, selection commands, or duplicate Pi launch.
export async function present(core: Herdr, machine: string, folder: string, key: string, name: string, agent: CoreTerminal) {
  const owned = [...await core.terminals(machine)];
  for (let attempt = 0; attempt < 5; attempt++) {
    const doc = await core.rpc<Document>(machine, "doc.get", { name: "herdr-app" });
    const layout = doc.value === null ? { spaces: [] } : structuredClone(validateLayout(doc.value));
    const matches: LayoutSpace[] = [];
    for (const space of layout.spaces) {
      let canonical: string;
      try { canonical = await core.worker<string>(machine, storageWorker, { action: "canonical", path: space.folder }); }
      catch (error) { if (space.folder === folder) throw error; continue; }
      if (canonical === folder) matches.push(space);
    }
    if (matches.length > 1) throw new Error("Multiple Herdr spaces match this worktree; resolve the layout ambiguity before retrying presentation");
    let space = matches[0];
    if (!space) {
      space = { id: id("sp", key), name, folder, tabs: [] };
      if (layout.spaces.some(other => other.id === space!.id)) throw new Error("Branchfork space ID collision");
      layout.spaces.push(space);
    }
    const add = (role: string, terminal: CoreTerminal) => {
      const tabId = id("tb", `${key}:${role}`);
      if (layout.spaces.some(s => s.tabs.some(t => t.id === tabId))) throw new Error(`Branchfork ${role} tab ID collision`);
      space!.tabs.push({ id: tabId, name: role, root: { id: id("p", `${key}:${role}:${terminal.address}`), type: "block", content: { terminal: terminal.address } } });
    };
    const placed = layout.spaces.flatMap(s => s.tabs.filter(t => terminalsIn(t.root).includes(agent.address)).map(t => ({ space: s, tab: t })));
    if (placed.length > 1 || (placed[0] && placed[0].space.id !== space.id)) throw new Error("Destination agent is already shown in a different or ambiguous space; not moving it");
    if (!placed[0]) {
      // Never replace an existing user-owned agent tab or its panes.
      if (space.tabs.some(t => t.name === "agent")) throw new Error("Existing agent tab has no destination Pi; inspect it before retrying presentation");
      add("agent", agent);
    }
    for (const role of ["editor", "term1", "term2"]) {
      if (space.tabs.some(tab => tab.name === role)) continue;
      const existing = owned.filter(t => t.labels?.["branchfork.key"] === key && t.labels?.["branchfork.role"] === role);
      if (existing.length > 1) throw new Error(`Multiple retained ${role} terminals; inspect them before retrying`);
      if (existing[0]) {
        const placements = layout.spaces.flatMap(s => s.tabs.filter(t => terminalsIn(t.root).includes(existing[0]!.address)).map(t => ({ space: s, tab: t })));
        if (placements.length > 1 || (placements[0] && placements[0].space.id !== space.id)) throw new Error(`Retained ${role} terminal is shown in another or ambiguous space; not moving it`);
        if (placements[0]) continue; // A person renamed/rearranged this companion.
      }
      const terminal = existing[0] ?? await core.launch(machine, folder, key, role, role === "editor" ? ["nvim"] : []);
      if (!existing[0]) owned.push(terminal);
      add(role, terminal);
    }
    try {
      await core.rpc(machine, "doc.set", { name: "herdr-app", version: doc.version, value: layout });
    } catch (error) {
      if (error instanceof CoreRpcError && error.kind === "conflict") continue;
      throw error;
    }
    // Persist the complete layout first, so auto-adoption cannot create unnamed
    // spaces/tabs while the presentation is still being assembled.
    const ours = new Set([agent.address, ...owned.filter(t => t.labels?.["branchfork.key"] === key).map(t => t.address)]);
    for (const tab of space.tabs) {
      for (const terminal of terminalsIn(tab.root).filter(address => ours.has(address))) {
        await core.label(machine, terminal, { "herdr.space": space.id, "herdr.tab": tab.id });
      }
    }
    return `Herdr workspace ready: ${name} (shared by this host's core; visible to connected GUIs).`;
  }
  throw new Error("Herdr layout changed during all 5 merge attempts; terminals retained, retry presentation when layout edits settle");
}
