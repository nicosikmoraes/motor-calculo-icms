import { createRouter, createWebHashHistory } from 'vue-router'
import InterchangeView from './views/InterchangeView.vue'
import DashboardView from './views/DashboardView.vue'
import CompaniesView from './views/CompaniesView.vue'
import FiscalCatalogView from './views/FiscalCatalogView.vue'
import BatchHistoryView from './views/BatchHistoryView.vue'
import BatchDetailView from './views/BatchDetailView.vue'
import NewBatchView from './views/NewBatchView.vue'
import BuiltinRulesView from './views/BuiltinRulesView.vue'
import RegistrationAuditView from './views/RegistrationAuditView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: DashboardView },
    { path: '/empresas', component: CompaniesView },
    { path: '/transferencia', component: InterchangeView },
    { path: '/auditoria', component: RegistrationAuditView },
    { path: '/perfis', component: FiscalCatalogView },
    { path: '/regras', component: BuiltinRulesView },
    { path: '/lotes', component: BatchHistoryView },
    { path: '/lotes/:id', component: BatchDetailView },
    { path: '/lotes/novo', component: NewBatchView },
  ],
})
