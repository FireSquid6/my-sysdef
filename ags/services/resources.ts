import Gio from "gi://Gio";
import GLib from "gi://GLib";
import { cpuDelta, formatBytes, parseCpu, parseMemory, type CpuSample } from "../sidebar-model";

function read(path: string, cancellable: Gio.Cancellable): Promise<string> {
  const file = Gio.File.new_for_path(path);
  return new Promise((resolve, reject) => file.load_contents_async(cancellable, (_file, result) => {
    try { const [ok, data] = file.load_contents_finish(result); if (!ok) throw Error("Read failed"); resolve(new TextDecoder().decode(data)); } catch (error) { reject(error); }
  }));
}
export type ResourceSnapshot = { cpu: string; memory: string; load: string; disk: string; error: string };
export const EMPTY_RESOURCES: ResourceSnapshot = { cpu: "CPU: sampling…", memory: "RAM: loading…", load: "Load: loading…", disk: "Root disk: loading…", error: "" };
/** One sampler per sidebar; the caller owns scheduling and cancellation. */
export function createResourceSampler() {
  let previous: CpuSample | null = null;
  return { reset() { previous = null; }, async sample(cancellable: Gio.Cancellable): Promise<ResourceSnapshot> {
    const results = await Promise.allSettled([
      read("/proc/stat", cancellable), read("/proc/meminfo", cancellable), read("/proc/loadavg", cancellable),
      new Promise<Gio.FileInfo>((resolve, reject) => {
        const root = Gio.File.new_for_path("/");
        root.query_filesystem_info_async("filesystem::size,filesystem::free", GLib.PRIORITY_DEFAULT, cancellable, (_file, result) => {
          try { resolve(root.query_filesystem_info_finish(result)); } catch (error) { reject(error); }
        });
      }),
    ]);
    const [cpu, memory, load, disk] = results;
    const current = cpu.status === "fulfilled" ? parseCpu(cpu.value) : null;
    const percent = cpuDelta(previous, current); previous = current;
    const ram = memory.status === "fulfilled" ? parseMemory(memory.value) : null;
    const loads = load.status === "fulfilled" ? load.value.trim().split(/\s+/).slice(0, 3).map(Number) : [];
    const size = disk.status === "fulfilled" ? disk.value.get_attribute_uint64("filesystem::size") : 0;
    const free = disk.status === "fulfilled" ? disk.value.get_attribute_uint64("filesystem::free") : 0;
    return { cpu: current ? percent === null ? "CPU: sampling…" : `CPU: ${percent.toFixed(1)}%` : "CPU: unavailable",
      memory: ram ? `RAM: ${formatBytes(ram.used)} / ${formatBytes(ram.total)}` : "RAM: unavailable",
      load: loads.length === 3 && loads.every(Number.isFinite) ? `Load: ${loads.map(n => n.toFixed(2)).join(" / ")}` : "Load: unavailable",
      disk: size > 0 && free <= size ? `Root disk: ${formatBytes(size - free)} / ${formatBytes(size)}` : "Root disk: unavailable",
      error: results.some(r => r.status === "rejected") ? "Some system resources could not be read" : "" };
  } };
}
