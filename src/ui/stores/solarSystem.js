import { defineStore } from 'pinia';
import { ref } from 'vue';

/** Whether the solar-system view is open over the globe. */
export const useSolarSystemStore = defineStore('gev-solar-system', () => {
  const open = ref(false);
  return { open, toggle: () => (open.value = !open.value) };
});
