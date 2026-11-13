import { spawn } from "node:child_process";

export interface ProcessResult { code: number; stdout: string; stderr: string }
export type Run = (program: string, argv: string[], options?: { input?: string; cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv }) => Promise<ProcessResult>;

export const run: Run = (program, argv, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(program, argv, { cwd: options.cwd, env: options.env ? { ...process.env, ...options.env } : process.env, stdio: "pipe" });
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  let bytes = 0, failure: Error | undefined;
  const timer = setTimeout(() => { failure = new Error(`${program} timed out`); child.kill("SIGKILL"); }, options.timeout ?? 190000);
  child.on("error", error => { clearTimeout(timer); reject(error); });
  for (const [stream, chunks] of [[child.stdout, stdout], [child.stderr, stderr]] as const) {
    stream.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 64 * 1024 * 1024) { failure = new Error(`${program} output exceeded 64 MiB; refusing truncated results`); child.kill("SIGKILL"); }
      else chunks.push(chunk);
    });
  }
  child.stdin.on("error", () => {}); // A failed program can close stdin before accepting the payload.
  child.stdin.end(options.input ?? "");
  child.on("close", code => {
    clearTimeout(timer);
    if (failure) reject(failure);
    else resolve({ code: code ?? 1, stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString() });
  });
});

export async function checked(run: Run, program: string, argv: string[], options?: Parameters<Run>[2]) {
  const result = await run(program, argv, options);
  if (result.code !== 0) throw new Error(`${program} failed (${result.code}): ${result.stderr || result.stdout}`);
  return result.stdout;
}

// Large/sensitive session payloads travel on stdin, not command lines or shell interpolation.
export async function onHost(run: Run, host: string, program: string, argv: string[], input = "") {
  if (!host) return checked(run, program, argv, { input });
  const raw = await checked(run, "hc", ["exec", "--json", "--on", host, "--timeout", "180", "--stdin", "--", program, ...argv], { input });
  const result = JSON.parse(raw) as ProcessResult & { truncated?: boolean; timed_out?: boolean };
  const stdout = Buffer.from(result.stdout, "base64").toString();
  const stderr = Buffer.from(result.stderr, "base64").toString();
  if (result.truncated || result.timed_out) throw new Error(`${program} on ${host} timed out or returned truncated output; inspect the destination before retrying`);
  if (result.code !== 0) throw new Error(`${program} on ${host} failed (${result.code}): ${stderr || stdout}`);
  return stdout;
}

export async function callWorker<T>(run: Run, host: string, worker: Function, request: unknown): Promise<T> {
  const script = `const request=JSON.parse(require("node:fs").readFileSync(0,"utf8")); Promise.resolve((${worker.toString()})(request)).then(r=>process.stdout.write(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1});`;
  return JSON.parse(await onHost(run, host, "node", ["-e", script], JSON.stringify(request))) as T;
}
