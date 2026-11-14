// Core's documented line-delimited JSON-RPC connection (no framed terminal I/O).
// Transported to the destination so neither a GUI nor a reverse route is needed.
export function coreRpcWorker(request) {
  const { spawn } = require("node:child_process");
  return new Promise((resolve, reject) => {
    const child = spawn("hc", ["connect"], { stdio: "pipe" });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    let output = "", errors = "", settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdin.destroy();
      child.kill(); // Only our short-lived RPC client, never the core or a terminal.
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error("Core RPC timed out; inspect retained resources before retrying")), 10000);
    child.on("error", error => finish(error));
    child.on("close", () => finish(new Error(`Core RPC closed without a reply: ${errors}`)));
    child.stderr.on("data", chunk => { errors = (errors + chunk).slice(-4096); });
    child.stdin.on("error", error => finish(error));
    child.stdout.on("data", chunk => {
      output += chunk.toString();
      if (Buffer.byteLength(output) > 2 * 1024 * 1024) { finish(new Error("Core RPC response too large")); return; }
      while (output.includes("\n")) {
        const end = output.indexOf("\n"), line = output.slice(0, end);
        output = output.slice(end + 1);
        try {
          const reply = JSON.parse(line);
          if (reply.id !== 1) continue;
          if (reply.error) {
            // Preserve conflict classification across the JSON worker transport.
            finish(null, { error: { kind: reply.error.data?.kind, message: reply.error.data?.hint || reply.error.message || "Core RPC failed" } });
          } else finish(null, { result: reply.result });
        } catch (error) { finish(error); }
      }
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: request.method, params: request.params }) + "\n");
  });
}
