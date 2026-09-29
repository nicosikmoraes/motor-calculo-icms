/** Códigos persistidos para problemas encontrados durante a importação. */
export enum ImportIssueCode {
  XML_NAO_IDENTIFICADO = 'XML_NAO_IDENTIFICADO',
  XML_TOO_LARGE = 'XML_TOO_LARGE',
  ZIP_REJEITADO = 'ZIP_REJEITADO',
  LOTE_SEM_DOCUMENTOS = 'LOTE_SEM_DOCUMENTOS',
  IMPORTACAO_CANCELADA = 'IMPORTACAO_CANCELADA',
}

/** Mensagens visíveis dos diagnósticos de importação. */
export enum ImportIssueMessage {
  XML_NOT_RECOGNIZED = 'XML não reconhecido.',
  XML_INVALID = 'XML inválido.',
  XML_TOO_LARGE = 'XML excede 10 MB.',
  ZIP_REJECTED = 'ZIP rejeitado.',
  BATCH_WITHOUT_DOCUMENTS = 'Nenhum XML de NF-e/NFC-e pôde ser normalizado neste lote.',
  IMPORT_CANCELLED = 'Importação cancelada após {completed} de {total} entrada(s). O restante não foi processado.',
}

export function formatImportIssueMessage(
  message: ImportIssueMessage,
  params: Readonly<Record<string, number>>,
): string {
  return message.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`))
}
