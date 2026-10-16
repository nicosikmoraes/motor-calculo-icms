<script setup lang="ts">
withDefaults(defineProps<{ name?: string }>(), { name: 'document-check' })
const paths: Record<string, readonly string[]> = {
  'document-check': ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z', 'M14 2v6h6', 'm9 15 2 2 4-4'],
  dashboard: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h7v7h-7z'],
  companies: ['M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18', 'M6 10H3v12h18V10h-3', 'M10 6h4M10 10h4M10 14h4M10 22v-4h4v4'],
  history: ['M3 11a9 9 0 1 1 2.5 7', 'M3 4v7h7', 'M12 7v5l3 2'],
  calendar: ['M8 2v4M16 2v4', 'M3 10h18', 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z', 'm9 16 2 2 4-4'],
  settings: ['M4 5h9M17 5h3M4 12h3M11 12h9M4 19h11M19 19h1', 'M13 3v4M7 10v4M15 17v4'],
  plus: ['M12 5v14M5 12h14'],
  search: ['M21 21l-5-5', 'M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0'],
  pencil: ['m16 3 5 5-12 12-6 1 1-6Z', 'm14 5 5 5'],
  archive: ['M3 3h18v4H3z', 'M5 7v14h14V7', 'M10 11h4'],
  check: ['M21 12a9 9 0 1 1-6-8.5', 'm8 11 4 4 9-10'],
  briefcase: ['M8 6V3h8v3', 'M3 6h18v15H3z', 'M3 11c5 4 13 4 18 0', 'M10 12h4v3h-4z'],
  refresh: ['M20 7a8 8 0 0 0-13-3L3 8', 'M3 3v5h5', 'M4 17a8 8 0 0 0 13 3l4-4', 'M16 16h5v5'],
  info: ['M12 8h.01M11 12h1v4h1', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'],
}
</script>
<template><svg class="app-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path v-for="(path, index) in paths[name] || paths['document-check']" :key="index" :d="path" /></svg></template>
<style scoped>.app-icon { display: inline-block; width: 18px; height: 18px; flex-shrink: 0; vertical-align: middle; }</style>
