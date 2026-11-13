export type CaffeineState = {
  enabled: boolean;
  busy: boolean;
  available: boolean;
  lidClosed: boolean;
  error: string;
};
export const EMPTY_CAFFEINE: CaffeineState = { enabled: false, busy: false, available: false, lidClosed: false, error: "" };

// Own exactly one inhibitor. Invalidated asynchronous acquisitions must release
// their handle too (toggle-off and shutdown can race with the D-Bus reply).
export function createCaffeineModel(acquire: () => Promise<() => void>, publish: (state: CaffeineState) => void) {
  let state = { ...EMPTY_CAFFEINE };
  let generation = 0;
  let disposed = false;
  let release: (() => void) | null = null;
  const update = (patch: Partial<CaffeineState>) => { state = { ...state, ...patch }; publish(state); };
  function disable() {
    generation++;
    release?.(); release = null;
    update({ enabled: false, busy: false });
  }
  return {
    state: () => state,
    ready(lidClosed: boolean) {
      if (disposed) return;
      update({ available: true, lidClosed, error: "" });
    },
    unavailable(error: string) {
      if (disposed) return;
      disable(); update({ available: false, error });
    },
    async toggle() {
      if (disposed) return;
      if (state.enabled || state.busy) { disable(); return; }
      if (!state.available) return;
      const token = ++generation;
      update({ busy: true, error: "" });
      try {
        const handle = await acquire();
        if (disposed || generation !== token) { handle(); return; }
        release = handle;
        update({ enabled: true, busy: false });
      } catch (error) {
        if (!disposed && generation === token) update({ enabled: false, busy: false, error: `Caffeine unavailable: ${String(error)}` });
      }
    },
    stop() { if (disposed) return; disposed = true; disable(); },
  };
}
