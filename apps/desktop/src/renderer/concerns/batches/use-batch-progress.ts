import type { BatchOperationProgress } from '@motor/contracts'
import { onMounted, onUnmounted, shallowRef, type Ref } from 'vue'

export function useBatchProgress(operationId: Readonly<Ref<string>>) {
  const progress = shallowRef<BatchOperationProgress | null>(null)
  let unsubscribe: (() => void) | undefined

  onMounted(() => {
    unsubscribe = window.desktopApi.onBatchProgress((event) => {
      if (event.operationId === operationId.value) progress.value = event
    })
  })
  onUnmounted(() => unsubscribe?.())

  return progress
}
