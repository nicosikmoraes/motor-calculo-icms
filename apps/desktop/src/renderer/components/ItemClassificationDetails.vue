<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { FiscalItemSummary, ItemClassificationReason } from '@motor/contracts'

const props = defineProps<{ item: FiscalItemSummary; expanded?: boolean }>()

const reasonText: Record<ItemClassificationReason, string> = {
  COMPANY_MISSING: 'A empresa analisada não está associada a este documento.',
  ISSUER_CNPJ_MISSING: 'O CNPJ do emitente não está disponível para localizar o vínculo do produto.',
  PRODUCT_CODE_MISSING: 'O item não informa o código do produto do fornecedor.',
  PRODUCT_NOT_LINKED: 'Não há vínculo deste produto e fornecedor com um perfil fiscal da empresa.',
  PROFILE_NOT_FOUND: 'O vínculo do produto aponta para um perfil fiscal que não foi encontrado nesta empresa.',
  ISSUE_DATE_MISSING: 'A data de emissão não está disponível para conferir a vigência do perfil.',
  PROFILE_NOT_YET_VALID: 'O perfil vinculado começa a valer depois da emissão da nota.',
  PROFILE_EXPIRED: 'O perfil vinculado deixou de valer antes da emissão da nota.',
  PROFILE_ACTIVE: 'O produto está vinculado a um perfil vigente na data da nota.',
}

const actionText: Record<ItemClassificationReason, string | undefined> = {
  COMPANY_MISSING: 'Confira a empresa atribuída à nota.',
  ISSUER_CNPJ_MISSING: 'Confira o XML original do emitente.',
  PRODUCT_CODE_MISSING: 'Confira o código do item no XML original.',
  PRODUCT_NOT_LINKED: 'Vincule o produto a um perfil fiscal.',
  PROFILE_NOT_FOUND: 'Revise o vínculo do produto no cadastro fiscal.',
  ISSUE_DATE_MISSING: 'Confira a data de emissão no XML original.',
  PROFILE_NOT_YET_VALID: 'Revise a vigência ou o vínculo do perfil fiscal.',
  PROFILE_EXPIRED: 'Revise a vigência ou o vínculo do perfil fiscal.',
  PROFILE_ACTIVE: undefined,
}

const reason = computed(() => props.item.classificationReason)

function displayDate(value: string): string {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}
</script>

<template>
  <div class="item-explanation">
    <strong>{{ item.classification === 'CLASSIFICADO' ? item.fiscalProfileName : item.classification === 'FORA_DA_VIGENCIA' ? 'Fora da vigência' : 'Pendente' }}</strong>
    <details :open="expanded || undefined">
      <summary>Entenda a classificação</summary>
      <div class="explanation-body">
        <p>{{ reasonText[reason] }}</p>
        <p v-if="item.fiscalProfileName" class="profile-context">
          Perfil: {{ item.fiscalProfileName }}
          <span v-if="item.profileValidFrom"> · Vigência: {{ displayDate(item.profileValidFrom) }} até {{ item.profileValidUntil ? displayDate(item.profileValidUntil) : 'sem data final' }}</span>
        </p>
        <p v-if="actionText[reason]" class="next-action">Próxima ação: {{ actionText[reason] }}</p>
        <RouterLink v-if="reason === 'PRODUCT_NOT_LINKED' || reason === 'PROFILE_NOT_FOUND' || reason === 'PROFILE_NOT_YET_VALID' || reason === 'PROFILE_EXPIRED'" to="/perfis">Gerenciar perfis fiscais</RouterLink>
      </div>
    </details>
  </div>
</template>

<style scoped>
.item-explanation { min-width: 0; overflow-wrap: anywhere; }
.item-explanation > strong { color: #263b5d; }
.item-explanation details { margin-top: 7px; }
.item-explanation summary { width: fit-content; color: #3659a0; font-size: 12px; font-weight: 700; cursor: pointer; }
.explanation-body { margin-top: 8px; padding: 10px 12px; border: 1px solid #dce5f2; border-radius: 9px; background: #f8faff; font-size: 12px; line-height: 1.5; }
.explanation-body p { margin: 0 0 7px; }
.explanation-body p:last-child { margin-bottom: 0; }
.profile-context { color: #52637c; }
.next-action { font-weight: 700; }
.explanation-body a { display: inline-block; margin-top: 2px; color: #3659a0; font-weight: 700; }
</style>
