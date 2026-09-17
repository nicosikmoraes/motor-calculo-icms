/**
 * Unidade transacional abstrata. A biblioteca SQLite e o schema físico ainda
 * dependem das decisões de persistência do MVP.
 */
export interface UnitOfWork {
  transaction<T>(operation: () => Promise<T>): Promise<T>
}

export interface Repository<TEntity extends { id: string }> {
  findById(id: string): Promise<TEntity | undefined>
  save(entity: TEntity): Promise<void>
}
