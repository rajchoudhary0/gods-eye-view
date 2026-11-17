import { defineStore } from 'pinia';
import { ref } from 'vue';

// What the shell reports about the globe camera when the view opens, so the
// 3D scene can start from the same view of Earth. Not reactive.
let viewReader = null;

/** Whether the solar-system view is open over the globe. */
export const useSolarSystemStore = defineStore('gev-solar-system', () => {
  const open = ref(false);
  return {
    open,
    toggle: () => (open.value = !open.value),
    /** The shell registers how to read the camera: `() => ({lat, lon, heightM}) | null`. */
    setViewReader: (fn) => (viewReader = fn),
    readView: () => viewReader?.() ?? null,
  };
});
