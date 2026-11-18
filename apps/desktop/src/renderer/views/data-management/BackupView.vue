<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { BackupStatus } from '@motor/contracts'
const status = ref<BackupStatus>()
const working = ref(false)
const error = ref('')
const success = ref('')
const retention = ref(7)
const retentionLoaded = ref(false)
let timer: ReturnType<typeof setInterval> | undefined
async function refresh(): Promise<void> {
  try {
    status.value = await window.desktopApi.getBackupStatus()
    if (!retentionLoaded.value) { retention.value = status.value.automaticCopiesToKeep; retentionLoaded.value = true }
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível consultar o backup.' }
}
async function create(): Promise<void> {
  working.value = true
  error.value = ''; success.value = ''
  try {
    const result = await window.desktopApi.createBackup()
    if (result) { status.value = result; success.value = 'Backup validado. O agendamento diário está ativo nesta pasta.' }
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível criar o backup.' }
  finally { working.value = false; await refresh() }
}
async function saveRetention(): Promise<void> {
  working.value = true; error.value = ''; success.value = ''
  try {
    status.value = await window.desktopApi.setBackupRetention(retention.value)
    success.value = 'Retenção salva. Será aplicada nas próximas limpezas.'
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível salvar a retenção.' }
  finally { working.value = false; await refresh() }
}
async function restore(): Promise<void> {
  working.value = true; error.value = ''; success.value = ''
  try { await window.desktopApi.restoreBackup() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível restaurar o backup.' }
  finally { working.value = false; await refresh() }
}
onMounted(() => { void refresh(); timer = setInterval(() => { void refresh() }, 10_000) })
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>
<template>
  <section>
    <p class="eyebrow">Proteção dos dados</p>
    <h1>Backup</h1>
    <p>Faça a primeira cópia manual para ativar o backup diário na pasta escolhida.</p>
    <div class="backup-card">
      <p><strong>Backup automático:</strong> {{ status?.enabled ? `ativo, diariamente às ${status.hour}h` : 'aguardando o primeiro backup manual' }}</p>
      <p>O horário segue o relógio deste computador. Se o aplicativo estiver fechado, a cópia pendente será feita na próxima abertura. Após suspensão, será feita quando o aplicativo retomar.</p>
      <p v-if="status?.destination"><strong>Pasta:</strong> {{ status.destination }}</p>
      <p v-if="status?.lastBackupAt"><strong>Último backup:</strong> {{ new Date(status.lastBackupAt).toLocaleString('pt-BR') }}</p>
      <p v-if="status?.lastBackupPath" class="path">{{ status.lastBackupPath }}</p>
      <p>Inclui empresas, cadastros, regras, lotes, documentos normalizados e histórico armazenados no banco. XMLs e ZIPs de origem, relatórios externos e temporários não entram nesta cópia.</p>
      <p>Escolha uma pasta externa ou sincronizada se quiser proteção contra falha do computador. Cópias manuais e de segurança anteriores à restauração são preservadas.</p>
      <button type="button" class="button primary" :disabled="working || status?.busy" @click="create">
        {{ working || status?.busy ? 'Backup em andamento…' : 'Criar backup manual' }}
      </button>
      <button type="button" class="button secondary" :disabled="working || status?.busy" @click="restore">Restaurar backup…</button>
      <hr />
      <h2>Retenção e limpeza</h2>
      <p>Manter as {{ status?.automaticCopiesToKeep || 'todas as' }} cópias automáticas{{ status?.automaticCopiesToKeep ? ' mais recentes' : '' }}. A limpeza só considera cópias reconhecidas desta instalação; arquivos alheios, cópias manuais e pacotes antigos sem identificação são preservados.</p>
      <label for="backup-retention">Quantidade de backups automáticos (0 = não apagar)</label>
      <input id="backup-retention" v-model.number="retention" type="number" min="0" max="365" step="1" :disabled="working || status?.busy" />
      <button type="button" class="button secondary" :disabled="working || status?.busy" @click="saveRetention">Salvar retenção</button>
      <p>Limpeza após backups e na verificação diária: temporários incompletos abandonados há mais de 24h e pontos de lotes já gravados. Importações pendentes são preservadas para retomada.</p>
      <p v-if="status?.lastCleanupAt">Última limpeza: {{ new Date(status.lastCleanupAt).toLocaleString('pt-BR') }} · {{ status.lastCleanupRemoved ?? 0 }} remoção(ões)</p>
      <p v-if="status?.cleanupError" role="alert">Limpeza pendente: {{ status.cleanupError }}</p>
      <p v-if="success" role="status">{{ success }}</p>
      <p v-if="error || status?.lastError" role="alert">{{ error || status?.lastError }}</p>
    </div>
  </section>
</template>
<style scoped>
h1 { font-size: 32px; }
h2 { font-size: 20px; }
input { width: 90px; padding: 8px; margin: 12px; }
button { margin: 8px 8px 8px 0; }
hr { margin: 24px 0; border: 0; border-top: 1px solid #dce2ea; }
.backup-card { padding: 24px; border: 1px solid #dce2ea; border-radius: 14px; background: white; margin-top: 24px; }
p { line-height: 1.6; overflow-wrap: anywhere; }
.path { font-size: 13px; }
[role="alert"] { color: #a32727; }
[role="status"] { color: #216447; }
</style>
