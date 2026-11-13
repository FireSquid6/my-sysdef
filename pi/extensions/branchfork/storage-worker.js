// Transportable filesystem operations; private state lives outside sysdef and the Git checkout.
export function storageWorker(request) {
  const fs = require("node:fs");
  const path = require("node:path");
  const os = require("node:os");
  const root = path.join(process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi/agent"), "branchfork");
  const safeId = id => {
    if (typeof id !== "string" || !/^[a-zA-Z0-9](?:[a-zA-Z0-9_.-]*[a-zA-Z0-9])?$/.test(id)) throw new Error("Invalid branchfork state ID");
    return id;
  };
  const privateDir = dir => fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
  if (request.action === "lock" || request.action === "unlock") {
    const dir = path.join(root, "locks", safeId(request.key));
    if (request.action === "lock") {
      privateDir(path.dirname(dir));
      try { fs.mkdirSync(dir, { mode: 0o700 }); }
      catch (error) { if (error.code === "EEXIST") throw new Error(`Another branchfork owns ${dir}. Recommended fix: wait for it to finish; if it crashed, inspect resources before manually removing this lock.`); throw error; }
      fs.writeFileSync(path.join(dir, "owner.json"), JSON.stringify({ token: request.token, createdAt: new Date().toISOString() }), { mode: 0o600 });
    } else if (fs.existsSync(dir) && read(path.join(dir, "owner.json")).token === request.token) fs.rmSync(dir, { recursive: true });
    return { ok: true };
  }
  if (request.action === "prerequisites") {
    const entry = path.join(path.dirname(root), "extensions", "branchfork", "index.ts");
    if (!fs.existsSync(entry)) throw new Error("Branchfork is not installed in the destination Pi extensions directory. Recommended fix: sync the sysdef Pi module on that host, then retry.");
    return { ok: true };
  }
  if (request.action === "executable") {
    const program = request.program;
    if (typeof program !== "string" || !program || program.includes("\0")) throw new Error("Invalid executable name");
    const candidates = path.isAbsolute(program) ? [program] : (process.env.PATH || "").split(path.delimiter).filter(Boolean).map(dir => path.resolve(dir, program));
    for (const file of candidates) {
      try { fs.accessSync(file, fs.constants.X_OK); if (fs.statSync(file).isFile()) return fs.realpathSync(file); }
      catch { /* Try the next PATH entry. */ }
    }
    throw new Error(`Required executable not found: ${program}. Install/configure it on the destination and retry.`);
  }
  if (request.action === "identity") return { hostname: os.hostname(), home: os.homedir() };
  if (request.action === "canonical") return fs.realpathSync(request.path);
  if (request.action === "agents") {
    const live = path.join(root, "live");
    if (!fs.existsSync(live)) return [];
    return fs.readdirSync(live).filter(name => name.endsWith(".json")).flatMap(name => {
      const file = path.join(live, name);
      try {
        const agent = read(file);
        if (Date.now() - fs.statSync(file).mtimeMs > 15000) return [];
        process.kill(agent.pid, 0);
        return [agent];
      } catch { return []; }
    });
  }
  if (request.action === "snapshot") {
    const dir = path.join(root, "snapshots");
    privateDir(dir);
    const file = path.join(dir, `${safeId(request.id)}.jsonl`);
    try { fs.writeFileSync(file, request.content, { flag: "wx", mode: 0o600 }); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    return file;
  }
  if (request.action === "handoff-status") {
    const inbox = path.join(root, "inbox", safeId(request.sessionId), `${safeId(request.id)}.json`);
    const receipt = path.join(root, "receipts", safeId(request.sessionId), `${safeId(request.id)}.json`);
    return { exists: fs.existsSync(inbox) || fs.existsSync(receipt) };
  }
  if (request.action === "queue") {
    const dir = path.join(root, "inbox", safeId(request.sessionId));
    privateDir(dir);
    const file = path.join(dir, `${safeId(request.id)}.json`);
    // Same handoff ID is immutable and idempotent, even after delivery/reloads.
    if (fs.existsSync(file)) return { queued: true, duplicate: true };
    const receipt = path.join(root, "receipts", safeId(request.sessionId), `${safeId(request.id)}.json`);
    if (fs.existsSync(receipt)) return { queued: false, duplicate: true };
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(request.message), { mode: 0o600 });
    fs.renameSync(temp, file);
    return { queued: true, duplicate: false };
  }
  throw new Error("Unknown branchfork storage operation");
}
