/** Agrupa leituras simultâneas e descarta respostas anteriores a uma alteração local. */
export function createSnapshotLoader<T>(read: () => Promise<T>, apply: (snapshot: T) => void) {
  let generation = 0
  let pending: Promise<void> | undefined

  function refresh(): Promise<void> {
    if (pending) return pending
    const requestedGeneration = generation
    const request = Promise.resolve().then(read).then((snapshot) => {
      if (requestedGeneration === generation) apply(snapshot)
    }).finally(() => {
      if (pending === request) pending = undefined
    })
    pending = request
    return request
  }

  function invalidate(): void {
    generation += 1
    pending = undefined
  }

  return { refresh, invalidate }
}
