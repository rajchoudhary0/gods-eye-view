<script setup>
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';
import { t } from '../../../i18n/index.js';
import { useGlobeActionsStore } from '../../stores/globeActions.js';
import { useSolarSystemStore } from '../../stores/solarSystem.js';
import GlobeCompass from './GlobeCompass.vue';

// The top-center camera and share actions. The shell answers the buttons
// through the store and publishes a clear under way, which keeps the button
// focusable and marks it busy, and the camera's tilt and heading. The heading
// changes on every frame a rotating camera draws, so only the compass reads
// it; the bar renders again only when the tilt changes.
const globe = useGlobeActionsStore();
const { clearBusy, resetBusy, camera } = storeToRefs(globe);
const { act } = globe;
const solar = useSolarSystemStore();
const labelsOn = ref(true);
const tilted = computed(() => Boolean(camera.value?.tilted));
</script>

<template>
<nav id="top-center-actions" :aria-label="t('Globe actions')">
  <button id="clear-selected-layers" type="button" :aria-label="clearBusy ? t('Clearing selected data layers') : t('Clear selected data layers')" :aria-disabled="clearBusy == null ? undefined : String(clearBusy)" :aria-busy="clearBusy == null ? undefined : String(clearBusy)" :title="t('Turn off all selected data layers')" @click="act('clear')">
    <span class="material-symbols-outlined" aria-hidden="true">layers_clear</span>
  </button>
  <button id="share-btn" type="button" :aria-label="t('Copy share link')" :title="t('Copy share link')" @click="act('share')">
    <span class="share-icon" aria-hidden="true">&#x1F517;</span>
  </button>
  <button id="tilt-map-view" type="button" :aria-label="tilted ? t('Return map to straight-down view') : t('Tilt map to oblique view')" :aria-pressed="String(tilted)" :title="t('Toggle straight-down and tilted map views')" @click="act('tilt')">
    <span class="material-symbols-outlined" aria-hidden="true">view_in_ar</span>
  </button>
  <button id="toggle-place-labels" type="button" :aria-label="t('Show or hide place labels')" :aria-pressed="String(labelsOn)" :title="t('Show or hide place labels')" @click="labelsOn = !labelsOn; act('labels')">
    <span class="material-symbols-outlined" aria-hidden="true">label</span>
  </button>
  <button id="open-solar-system" type="button" :aria-label="t('Open solar system view')" :title="t('Open solar system view')" @click="solar.toggle()">
    <span class="material-symbols-outlined" aria-hidden="true">travel_explore</span>
  </button>
  <GlobeCompass @click="act('northUp')" />
  <button id="reset-globe-view" type="button" :aria-label="resetBusy ? t('Resetting to full globe view') : t('Reset to full globe view')" :title="t('Reset camera and return to full globe view')" @click="act('reset')">
    <span class="material-symbols-outlined" aria-hidden="true">public</span>
  </button>
</nav>
</template>
