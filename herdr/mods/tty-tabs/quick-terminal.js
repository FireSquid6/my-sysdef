import { home, machines, focused, exec, run, shared, setShared, openOverlay, closeOverlay, notify } from "herdr";

export class QuickTerminal {
  machineColor(machine) {
    const host = (machine || this.localHostname || "").split(".")[0];
    return ({ deisslaptop: "#bb9af7", "minibox-one": "#9ece6a", desktop: "#f7768e" })[host] ?? "accent";
  }

  hide() {
    this.wantOpen = false;
    const active = shared("quick.window");
    if (!active) return;
    setShared("quick.window", null);
    closeOverlay(active.id);
    if (active.returnTerminal) run("pane.focus", { terminal: active.returnTerminal });
  }

  toggle(cx) {
    if (this.busy) {
      this.wantOpen = !this.wantOpen;
      if (!this.wantOpen) this.hide();
    } else if (shared("quick.window")) this.hide();
    else this.show("", cx);
  }

  cycle(cx) {
    const active = shared("quick.window"), f = focused();
    // Dialog compositions own the keyboard; focused() can still report the
    // underlying model pane in this Herdr version immediately after opening.
    if (!active) {
      // Outside this window, preserve Ctrl+Tab in terminal programs, including
      // programs that negotiate extended keyboard protocols with the core.
      if (f?.terminal) cx.spawn(async () => {
        await exec("hc", ["keys", f.terminal, "ctrl+tab"]);
      });
      return;
    }
    if (this.busy) return;
    const names = [...new Set(["", ...machines().filter(m => !m.temporary).map(m => m.name ?? ""), active.machine])];
    const machine = names[(names.indexOf(active.machine) + 1) % names.length];
    if (machine !== active.machine) this.show(machine, cx);
  }

  show(machine, cx) {
    this.busy = true; this.wantOpen = true;
    const previous = shared("quick.window");
    const returnTerminal = previous?.returnTerminal ?? focused()?.terminal;
    cx.spawn(async cx => {
      try {
        let terminal = (shared("quick.terminals") ?? {})[machine];
        if (terminal) {
          const result = await exec("hc", ["get", terminal, "--json"]);
          if (result.code !== 0 || JSON.parse(result.stdout).state !== "live") terminal = null;
        }
        if (!terminal) {
          const args = ["run", "--json", "--bg", "--keep", "--no-parent", "--no-notify", "--outlive-parent", "--label", "herdr.quick=tty"];
          if (machine) args.push("--on", machine);
          else args.push("--cwd", home());
          // No command: let the target core choose that user's default shell.
          const result = await exec("hc", args);
          if (result.code !== 0) throw new Error(result.stderr || result.stdout);
          terminal = JSON.parse(result.stdout).address;
          if (!terminal) throw new Error("No terminal address returned");
          setShared("quick.terminals", { ...(shared("quick.terminals") ?? {}), [machine]: terminal });
        }
        // Herdr names the local machine ""; resolve its actual hostname once.
        if (!machine && this.localHostname === undefined) {
          try {
            const result = await exec("sh", ["-c", "hostname"]);
            if (result.code === 0) this.localHostname = result.stdout.trim();
          } catch { /* Unknown hosts retain the theme's accent border. */ }
        }
        if (!this.wantOpen) return;
        if (previous && shared("quick.window")?.id !== previous.id) return;
        const current = shared("quick.window");
        if (current) closeOverlay(current.id);
        const id = openOverlay({ kind: "dialog", frame: "none", width: 0.75, height: 0.6,
          layout: { id: "quick-root", type: "column", background: "background", radius: 0,
            border: { width: 1, color: this.machineColor(machine) }, font: "JetBrains Mono", ui_font: "JetBrains Mono", terminal_padding: [8, 10],
            children: [
              { id: "quick-title", type: "block", size: { px: 32 }, content: { mod: "quick-terminal", props: { machine, terminal } } },
              { id: "quick-shell", type: "block", content: { terminal } },
            ] } });
        setShared("quick.window", { id, machine, terminal, returnTerminal });
      } catch (error) {
        if (this.wantOpen) notify({ title: "Could not open quick terminal", body: String(error), level: "error" });
      } finally { this.busy = false; cx.notify(); }
    });
  }
}
