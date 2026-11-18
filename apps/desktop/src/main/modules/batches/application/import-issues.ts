/** Códigos persistidos para problemas encontrados durante a importação. */
export enum ImportIssueCode {
  XML_NAO_IDENTIFICADO = 'XML_NAO_IDENTIFICADO',
  XML_TOO_LARGE = 'XML_TOO_LARGE',
  ZIP_REJEITADO = 'ZIP_REJEITADO',
  LOTE_SEM_DOCUMENTOS = 'LOTE_SEM_DOCUMENTOS',
  IMPORTACAO_CANCELADA = 'IMPORTACAO_CANCELADA',
  PROTOCOL_KEY_MISMATCH = 'PROTOCOL_KEY_MISMATCH',
  ARTIFACT_AMBIGUOUS_DOCUMENT = 'ARTIFACT_AMBIGUOUS_DOCUMENT',
  ARTIFACT_ORPHAN = 'ARTIFACT_ORPHAN',
  EVENT_RESPONSE_MISMATCH = 'EVENT_RESPONSE_MISMATCH',
  ARTIFACT_ENVIRONMENT_MISMATCH = 'ARTIFACT_ENVIRONMENT_MISMATCH',
}

/** Mensagens visíveis dos diagnósticos de importação. */
export enum ImportIssueMessage {
  XML_NOT_RECOGNIZED = 'XML não reconhecido.',
  XML_INVALID = 'XML inválido.',
  XML_TOO_LARGE = 'XML excede 10 MB.',
  ZIP_REJECTED = 'ZIP rejeitado.',
  BATCH_WITHOUT_DOCUMENTS = 'Nenhum XML fiscal suportado pôde ser normalizado neste lote.',
  PROTOCOL_KEY_MISMATCH = 'A chave do protocolo embutido difere da chave da nota.',
  ARTIFACT_AMBIGUOUS_DOCUMENT = 'Há notas conflitantes para a chave do protocolo ou evento.',
  ARTIFACT_ORPHAN = 'Protocolo ou evento sem nota correspondente neste lote.',
  EVENT_RESPONSE_MISMATCH = 'O retorno do evento diverge da solicitação.',
  ARTIFACT_ENVIRONMENT_MISMATCH = 'O ambiente do protocolo ou evento diverge do ambiente confirmado para o lote.',
  IMPORT_CANCELLED = 'Importação cancelada após {completed} de {total} entrada(s). O restante não foi processado.',
}

export function formatImportIssueMessage(
  message: ImportIssueMessage,
  params: Readonly<Record<string, number>>,
): string {
  return message.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`))
}
