type OperationKind = 'create' | 'retry'
type DonationIdentity = { intent: string; operation?: string; operationKind?: OperationKind }

export function donationIntentStorage(email?: string) {
  const prefix = 'contabilinico.donations.intent.v1'
  const key = email ? `${prefix}:${email}` : prefix

  function read(): DonationIdentity | undefined {
    const raw = localStorage.getItem(key)
    if (!raw) return undefined
    try {
      const value = JSON.parse(raw) as DonationIdentity | null
      if (typeof value?.intent === 'string' && value.intent.length >= 16) return value
    } catch { /* Uma identidade inválida é substituída no próximo uso. */ }
  }

  function save(value: DonationIdentity): DonationIdentity {
    localStorage.setItem(key, JSON.stringify(value))
    return value
  }

  function start(): DonationIdentity {
    return save({ intent: crypto.randomUUID() })
  }

  function current(): DonationIdentity {
    return read() ?? start()
  }

  function operation(kind: OperationKind): { intent: string; operation: string } {
    const identity = current()
    const operation = identity.operationKind === kind && identity.operation ? identity.operation : crypto.randomUUID()
    save({ intent: identity.intent, operation, operationKind: kind })
    return { intent: identity.intent, operation }
  }

  function clearOperation(kind: OperationKind, completed: DonationIdentity): void {
    const stored = read()
    if (stored?.operationKind === kind && stored.intent === completed.intent && stored.operation === completed.operation) {
      save({ intent: stored.intent })
    }
  }

  return { current, start, operation, clearOperation }
}
