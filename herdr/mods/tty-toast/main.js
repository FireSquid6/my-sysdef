// Replace in-app toasts with desktop notifications. Herdr retains sound ownership.
import { View, div } from "gpui-kit";
import { props, closeOverlay, exec, appHome, focused, window } from "herdr";
import { notification } from "./notification.js";

export default class Toast extends View {
  init(_props, cx) {
    const p = props() ?? {};
    if (!p.overlay) return; // Native mod checks have no actual notification to dispatch.
    const message = notification(p, window()?.active ?? false, focused());
    if (!message) { closeOverlay(p.overlay); return; }
    cx.spawn(async () => {
      try {
        const result = await exec("bun", [`${appHome()}/mods/tty-toast/desktop-notify.ts`, "--launch", JSON.stringify(message)], { cwd: appHome() });
        if (result.code !== 0) console.error(`Desktop notification launch failed: ${result.stderr}`);
      } catch (error) { console.error(`Desktop notification launch failed: ${String(error)}`); }
      finally { closeOverlay(p.overlay); }
    });
  }
  // No repeated side effects during render, and no in-app toast content.
  render() { return div().size(0); }
}
