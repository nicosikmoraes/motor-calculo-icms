<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { ReceivedDonationSummary } from '@motor/contracts'
import { listReceivedDonations } from '../services/admin-donations'

const donations = ref<readonly ReceivedDonationSummary[]>([])
const busy = ref(false)
const error = ref('')
const loaded = ref(false)

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const statusLabel: Record<string, string> = { pago: 'Pago', pendente: 'Pendente' }

async function load(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    donations.value = await listReceivedDonations()
    loaded.value = true
  } catch (cause) {
    // Um 403 chega aqui como mensagem de permissão; a sessão continua aberta.
    error.value = cause instanceof Error ? cause.message : 'Não foi possível carregar as doações agora.'
  } finally {
    busy.value = false
  }
}

onMounted(() => { void load() })
</script>

<template>
  <section class="received-page">
    <p class="eyebrow">Administração</p>
    <h1>Doações recebidas</h1>
    <p class="intro">Os 100 pedidos de doação mais recentes. Pedidos feitos antes de existir conta aparecem sem e-mail.</p>

    <div class="received-card">
      <div class="toolbar">
        <span class="test-badge">AMBIENTE DE TESTES</span>
        <button class="text-button" type="button" :disabled="busy" @click="load">{{ busy ? 'Carregando…' : 'Atualizar' }}</button>
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-else-if="loaded && !donations.length" class="empty">Nenhuma doação ainda.</p>
      <table v-else-if="donations.length">
        <thead><tr><th scope="col">Data</th><th scope="col">Valor</th><th scope="col">Situação</th><th scope="col">Quem doou</th></tr></thead>
        <tbody>
          <tr v-for="donation in donations" :key="donation.orderId">
            <td>{{ date.format(new Date(donation.createdAt)) }}</td>
            <td>{{ money.format(Number(donation.amount)) }}</td>
            <td><span class="status" :class="donation.status">{{ statusLabel[donation.status] ?? donation.status }}</span></td>
            <td>{{ donation.ownerEmail ?? 'Sem conta (pedido antigo)' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.received-page { max-width: 900px; margin: 0 auto; }
h1 { margin: 8px 0; color: #172033; font-size: 34px; }
.intro { max-width: 650px; color: #65738a; line-height: 1.65; }
.received-card { margin-top: 28px; padding: 24px 28px; border: 1px solid #dce3ed; border-radius: 16px; background: #fff; box-shadow: 0 12px 32px #18253a0b; }
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.test-badge { display: inline-flex; padding: 6px 10px; border-radius: 999px; background: #fff2d9; color: #785000; font-size: 11px; font-weight: 800; letter-spacing: .08em; }
.text-button { padding: 6px 0; border: 0; background: transparent; color: #455fdb; font: inherit; cursor: pointer; }
.text-button:disabled { opacity: .6; cursor: wait; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th { padding: 10px 8px; border-bottom: 1px solid #dce3ed; color: #738198; font-size: 12px; font-weight: 700; text-align: left; text-transform: uppercase; letter-spacing: .04em; }
td { padding: 12px 8px; border-bottom: 1px solid #eef2f7; color: #26364f; }
.status { padding: 3px 8px; border-radius: 999px; background: #f2f5fa; font-size: 12px; font-weight: 700; }
.status.pago { background: #e8f6ed; color: #185c34; }
.error { color: #a22d35; }
.empty { color: #738198; }
</style>
