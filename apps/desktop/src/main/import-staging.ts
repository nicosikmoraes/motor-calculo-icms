import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { NormalizedDocumentArtifact, NormalizedNfe } from '@motor/domain'

/** Guarda a nota normalizada fora da memória enquanto o lote ainda é inventariado. */
export class ImportStaging {
  private constructor(private readonly directory: string) {}

  static async create(root = tmpdir()): Promise<ImportStaging> {
    await mkdir(root, { recursive: true, mode: 0o700 })
    return new ImportStaging(await mkdtemp(join(root, 'contabilinico-import-')))
  }

  /** O chamador aguarda esta gravação antes de ler a próxima entrada do ZIP. */
  private async write(value: NormalizedNfe | NormalizedDocumentArtifact): Promise<string> {
    const path = join(this.directory, `${randomUUID()}.json`)
    await writeFile(path, JSON.stringify(value), { flag: 'wx', mode: 0o600 })
    return path
  }

  async stage(note: NormalizedNfe): Promise<string> { return this.write(note) }
  async stageArtifact(artifact: NormalizedDocumentArtifact): Promise<string> { return this.write(artifact) }

  /** Lê somente um item por vez durante validação e persistência. */
  read(path: string): NormalizedNfe {
    return JSON.parse(readFileSync(path, 'utf8')) as NormalizedNfe
  }

  readArtifact(path: string): NormalizedDocumentArtifact {
    return JSON.parse(readFileSync(path, 'utf8')) as NormalizedDocumentArtifact
  }

  async dispose(): Promise<void> {
    await rm(this.directory, { recursive: true, force: true })
  }
}
