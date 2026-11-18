import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import type { DashboardBatchSummary } from '@motor/contracts'
import { createSnapshotLoader } from '../concerns/ipc/snapshot-loader'

export const useBatchesStore = defineStore('batches', () => {
  const batches = shallowRef<readonly DashboardBatchSummary[]>([])
  const loader = createSnapshotLoader(() => window.desktopApi.getDashboard(), (snapshot) => {
    batches.value = snapshot
  })

  return { batches, refreshBatches: loader.refresh }
})
