<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { DonationInputError, DonationOrderSummary } from '@motor/contracts'
import { createDonation, loadCurrentDonation, openDonationCheckout, retryDonation, startNewDonationIntent } from '../services/donations'
import { donationCanRetry, donationCreatedNotice, donationRequiresNewIntent, donationStatusMessage } from '../donation-status'

const amount = ref('10,00')
const donation = ref<DonationOrderSummary | null>(null)
const busy = ref(false)
const error = ref('')
const amountError = ref('')
const notice = ref('')
const checkoutUrl = computed(() => donation.value?.checkoutUrl
  ?? donation.value?.attempts?.find((attempt) => attempt.paymentId === donation.value?.paymentId)?.checkoutUrl
  ?? donation.value?.attempts?.[0]?.checkoutUrl ?? null)
const paid = computed(() => donation.value?.status === 'pago')
const attemptStatus = computed(() => donation.value?.attempts?.[0]?.status ?? donation.value?.status ?? '')
const latestReason = computed(() => donation.value?.attempts?.[0]?.reason ?? donation.value?.reason ?? null)
const valueRejected = computed(() => donationRequiresNewIntent(attemptStatus.value, latestReason.value))
const uncertain = computed(() => donation.value?.status === 'indeterminada' || attemptStatus.value === 'indeterminada')

async function refresh(): Promise<void> {
  busy.value = true
  error.value = ''
  try { donation.value = await loadCurrentDonation() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Serviço de doações indisponível. Tente novamente mais tarde' }
  finally { busy.value = false }
}

async function submit(): Promise<void> {
  busy.value = true; error.value = ''; amountError.value = ''; notice.value = ''
  try {
    const result = await createDonation(amount.value.trim().replace(',', '.'))
    if (isDonationInputError(result)) {
      if (result.field === 'amount') amountError.value = result.message
      else error.value = result.message
      return
    }
    donation.value = result
    notice.value = donationCreatedNotice(donation.value.status)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível retomar o pagamento agora'
  } finally { busy.value = false }
}

function isDonationInputError(result: DonationOrderSummary | DonationInputError): result is DonationInputError {
  return 'kind' in result && result.kind === 'invalid_input'
}

async function retry(): Promise<void> {
  if (!donation.value) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    donation.value = await retryDonation(donation.value.orderId)
    notice.value = 'Tentativa atualizada. A situação do pedido vem do servidor.'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível retomar o pagamento agora'
  } finally { busy.value = false }
}

async function openCheckout(): Promise<void> {
  if (!checkoutUrl.value) return
  error.value = ''
  try { await openDonationCheckout(checkoutUrl.value) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível abrir o Checkout' }
}

function newIntent(): void {
  startNewDonationIntent()
  donation.value = null
  amount.value = ''
  error.value = ''
  amountError.value = ''
  notice.value = 'Informe outra quantia para criar uma nova intenção de doação.'
}

onMounted(() => { void refresh() })
</script>

<template>
  <section class="support-page">
    <p class="eyebrow">Apoio ao projeto</p>
    <h1>Apoiar o ContabiliNico</h1>
    <p class="intro">Ajude a manter o desenvolvimento do aplicativo. O pagamento acontece em uma página segura do Stripe, no ambiente de testes.</p>

    <div class="support-card">
      <span class="test-badge">AMBIENTE DE TESTES</span>
      <form v-if="!donation" class="donation-form" @submit.prevent="submit">
        <label for="donation-amount">Valor da doação (BRL)</label>
        <div class="amount-field"><span>R$</span><input id="donation-amount" v-model="amount" inputmode="decimal" autocomplete="off"
          :aria-invalid="Boolean(amountError)" :aria-describedby="amountError ? 'amount-help amount-error' : 'amount-help'" @input="amountError = ''" /></div>
        <small id="amount-help">Mínimo de R$ 0,50 e até duas casas decimais.</small>
        <small v-if="amountError" id="amount-error" class="error" role="alert">{{ amountError }}</small>
        <button class="button primary" type="submit" :disabled="busy">{{ busy ? 'Enviando…' : 'Criar pedido de doação' }}</button>
      </form>

      <template v-else>
        <div class="status-panel" :class="{ confirmed: paid }" role="status">
          <span class="status-label">Situação</span>
          <strong>{{ donationStatusMessage(paid ? donation.status : attemptStatus, latestReason) }}</strong>
          <span>Pedido {{ donation.orderId }}</span>
        </div>
        <dl class="order-details"><div><dt>Valor da doação</dt><dd :aria-describedby="valueRejected ? 'amount-rejection' : undefined" :aria-invalid="valueRejected">R$ {{ donation.amount }}</dd></div><div><dt>Moeda</dt><dd>{{ donation.currency }}</dd></div></dl>
        <p v-if="valueRejected" id="amount-rejection" class="error" role="alert">O campo “Valor da doação” foi recusado pelo serviço de pagamentos. Nenhuma sessão foi aberta. Informe outra quantia para continuar.</p>
        <div class="actions">
          <button v-if="checkoutUrl && !paid" class="button primary" type="button" :disabled="busy" @click="openCheckout">Continuar para o pagamento</button>
          <button v-if="valueRejected" class="button secondary" type="button" :disabled="busy" @click="newIntent">Informar outra quantia</button>
          <button v-else-if="!paid && !uncertain && donationCanRetry(attemptStatus, latestReason)" class="button secondary" type="button" :disabled="busy" @click="retry">Tentar novamente</button>
          <button class="text-button" type="button" :disabled="busy" @click="refresh">{{ busy ? 'Consultando…' : 'Atualizar situação' }}</button>
        </div>
        <p class="privacy-note">O retorno do navegador não confirma o pagamento. A confirmação aparece aqui após o webhook e a consulta ao servidor.</p>
      </template>

      <p v-if="notice" class="notice" role="status">{{ notice }}</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </div>
    <p class="fiscal-note">As ferramentas fiscais continuam disponíveis mesmo quando o serviço de doações está indisponível.</p>
  </section>
</template>

<style scoped>
.support-page { max-width: 780px; margin: 0 auto; }
h1 { margin: 8px 0; color: #172033; font-size: 34px; }
.intro { max-width: 650px; color: #65738a; line-height: 1.65; }
.support-card { margin-top: 28px; padding: 28px; border: 1px solid #dce3ed; border-radius: 16px; background: #fff; box-shadow: 0 12px 32px #18253a0b; }
.test-badge { display: inline-flex; padding: 6px 10px; border-radius: 999px; background: #fff2d9; color: #785000; font-size: 11px; font-weight: 800; letter-spacing: .08em; }
.donation-form { display: grid; gap: 12px; max-width: 380px; margin-top: 24px; }
.donation-form label { color: #28364d; font-weight: 700; }
.amount-field { display: flex; align-items: center; gap: 10px; padding: 0 14px; border: 1px solid #cbd4e1; border-radius: 10px; }
.amount-field span { color: #65738a; }
.amount-field input { width: 100%; padding: 13px 0; border: 0; outline: 0; color: #18243a; font: inherit; font-size: 20px; }
.donation-form small,.privacy-note,.fiscal-note { color: #738198; line-height: 1.55; }
.button { width: fit-content; padding: 11px 16px; border: 0; border-radius: 9px; font: inherit; font-weight: 700; cursor: pointer; }
.button:disabled,.text-button:disabled { opacity: .6; cursor: wait; }
.primary { color: white; background: #455fdb; }
.secondary { color: #31466e; background: #edf1f8; }
.status-panel { display: grid; gap: 8px; margin: 24px 0; padding: 18px; border-radius: 12px; background: #f2f5fa; color: #26364f; }
.status-panel.confirmed { background: #e8f6ed; color: #185c34; }
.status-label { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
.order-details { display: flex; gap: 42px; }
.order-details div { display: grid; gap: 4px; }.order-details dt { color: #738198; font-size: 12px; }.order-details dd { margin: 0; font-weight: 700; }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 22px; }
.text-button { padding: 9px 0; border: 0; background: transparent; color: #455fdb; font: inherit; cursor: pointer; }
.error { color: #a22d35; }.notice { color: #24603a; }.privacy-note { margin-top: 22px; font-size: 13px; }.fiscal-note { margin-top: 22px; font-size: 13px; }
</style>
