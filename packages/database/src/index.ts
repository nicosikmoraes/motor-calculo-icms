export * from './core-migrations'
export * from './registration-audit-repository'
export * from './versioned-rule-repository'
export * from './fiscal-catalog-repository'
export * from './calculation-repository'
export * from './core-repositories'
export * from './migrations'
export * from './sqlite-database'

export interface UnitOfWork {
  transaction<T>(operation: () => T): T
}

export interface Repository<TEntity extends { id: string }> {
  findById(id: string): TEntity | undefined
  save(entity: TEntity): void
}

export * from './interchange-repository'
