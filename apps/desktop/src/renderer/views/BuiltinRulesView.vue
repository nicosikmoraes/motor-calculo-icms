<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { BuiltinRulePackSummary } from '@motor/contracts'

const pack = ref<BuiltinRulePackSummary | null>(null)
const error = ref('')

const conditionLabels: Record<string, string> = {
  originState: 'UF de origem', destinationState: 'UF de destino', cfop: 'CFOP',
  issuerRegime: 'CRT do emitente', cst: 'CST do ICMS', merchandiseOrigin: 'Origem da mercadoria',
  operationType: 'Direção da operação', purpose: 'Finalidade da NF-e',
}

onMounted(async () => {
  try {
    pack.value = await window.desktopApi.getBuiltinRulePack()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível carregar o pacote de regras.'
  }
})
</script>

<template>
  <section class="rules-page">
    <header class="rules-header">
      <p class="eyebrow">Pacote incluído no aplicativo</p>
      <h2>Regras fiscais propostas</h2>
      <p>Os três recortes e suas alíquotas foram aprovados pelo usuário. O aplicativo os avalia automaticamente contra os itens importados. A base, as exceções e o arredondamento ainda exigem revisão; por isso, nenhum cálculo de ICMS é gerado.</p>
    </header>

    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-else-if="!pack" class="empty-state">Carregando propostas…</p>
    <template v-else>
      <div class="pack-meta"><strong>{{ pack.id }}</strong><span>Versão {{ pack.version }}</span><span>{{ pack.rules.length }} propostas</span></div>
      <div class="rule-grid">
        <article v-for="rule in pack.rules" :key="`${rule.id}:${rule.version}`" class="card rule-card">
          <div class="rule-heading"><div><p class="rule-id">{{ rule.id }} · versão {{ rule.version }}</p><h3>{{ rule.name }}</h3></div><span class="draft-badge">Recorte aprovado · cálculo pendente</span></div>
          <p class="rate">{{ rule.proposedRate }}% <small>alíquota revisada em {{ rule.reviewedOn }}</small></p>
          <p class="coverage">Cobertura técnica do pacote a partir de {{ rule.validFrom }}. Essa data não representa o início de vigência da lei.</p>
          <dl class="conditions"><div v-for="(value, key) in rule.conditions" :key="key"><dt>{{ conditionLabels[String(key)] || key }}</dt><dd>{{ value }}</dd></div></dl>
          <div class="rule-source"><strong>Fundamento proposto</strong><p>{{ rule.legalBasis }}</p><small>{{ rule.sourceUrl }}</small></div>
          <p class="review-note"><strong>Para sua revisão:</strong> {{ rule.reviewNote }}</p>
        </article>
      </div>
    </template>
  </section>
</template>

<style scoped>
.rules-page { min-width: 0; }
.rules-header { max-width: 800px; margin-bottom: 24px; }
.rules-header h2 { margin: 8px 0 10px; color: #142238; font-size: clamp(30px, 3vw, 42px); letter-spacing: -.04em; }
.rules-header p:last-child { color: #627188; font-size: 14px; line-height: 1.6; }
.pack-meta { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 18px; color: #53647e; font-size: 12px; }
.pack-meta > * { padding: 7px 10px; border-radius: 8px; background: #eef3fb; }
.rule-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr)); gap: 16px; }
.rule-card { min-width: 0; padding: 22px; overflow-wrap: anywhere; }
.rule-heading { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
.rule-heading h3 { margin: 5px 0 0; color: #1d2d47; font-size: 18px; line-height: 1.3; }
.rule-id { margin: 0; color: #7b88a0; font-size: 11px; }
.draft-badge { flex: none; padding: 5px 8px; border-radius: 99px; color: #87520a; background: #fff1d5; font-size: 11px; font-weight: 800; }
.rate { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; margin: 20px 0 4px; color: #274a87; font-size: 26px; font-weight: 800; }
.rate small { color: #69788c; font-size: 11px; font-weight: 500; }
.coverage { color: #69788c; font-size: 11px; line-height: 1.4; }
.conditions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 18px 0; }
.conditions div { min-width: 0; padding: 9px 10px; border: 1px solid #e4eaf2; border-radius: 8px; background: #f8faff; }
.conditions dt { color: #738198; font-size: 10px; font-weight: 700; }
.conditions dd { margin: 3px 0 0; color: #263b59; font-size: 13px; font-weight: 700; }
.rule-source { padding-top: 14px; border-top: 1px solid #e6ebf2; font-size: 12px; }
.rule-source p { margin: 5px 0; }
.rule-source small { color: #627188; overflow-wrap: anywhere; }
.review-note { margin: 16px 0 0; padding: 12px; border-radius: 8px; background: #fff8eb; color: #76522a; font-size: 12px; line-height: 1.5; }
@media (max-width: 540px) { .conditions { grid-template-columns: 1fr; } }
</style>
