import { randomUUID } from 'node:crypto'

export interface PackPreviewSession { json: string; fingerprint: string; owner: number; expiresAt: number }
/** Uma prévia por janela, validade de 15 minutos e pacote retido somente no processo principal. */
export class PackPreviewSessions {
  private readonly entries = new Map<string, PackPreviewSession>()
  constructor(private readonly now = () => Date.now(), private readonly id = randomUUID) {}
  create(owner: number, json: string, fingerprint: string): string {
    for (const [token, session] of this.entries) if (session.owner === owner || session.expiresAt <= this.now()) this.entries.delete(token)
    const token = this.id()
    this.entries.set(token, { owner, json, fingerprint, expiresAt: this.now() + 15 * 60 * 1000 })
    return token
  }
  get(token: unknown, owner: number): PackPreviewSession {
    if (typeof token !== 'string') throw new Error('Prévia inválida. Selecione novamente o pacote.')
    const session = this.entries.get(token)
    if (!session || session.owner !== owner || session.expiresAt <= this.now()) {
      if (session?.owner === owner) this.entries.delete(token)
      throw new Error('Prévia expirada ou inválida. Selecione novamente o pacote.')
    }
    return session
  }
  discard(token: unknown, owner: number): void {
    if (typeof token === 'string' && this.entries.get(token)?.owner === owner) this.entries.delete(token)
  }
  clearOwner(owner: number): void {
    for (const [token, session] of this.entries) if (session.owner === owner) this.entries.delete(token)
  }
}
