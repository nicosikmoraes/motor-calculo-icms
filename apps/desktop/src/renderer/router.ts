import { createRouter, createWebHashHistory } from 'vue-router'
import DashboardView from './views/DashboardView.vue'
import CompaniesView from './views/CompaniesView.vue'
import FiscalCatalogView from './views/FiscalCatalogView.vue'
import BatchHistoryView from './views/BatchHistoryView.vue'
import BatchDetailView from './views/BatchDetailView.vue'
import NewBatchView from './views/NewBatchView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: DashboardView },
    { path: '/empresas', component: CompaniesView },
    { path: '/perfis', component: FiscalCatalogView },
    { path: '/lotes', component: BatchHistoryView },
    { path: '/lotes/:id', component: BatchDetailView },
    { path: '/lotes/novo', component: NewBatchView },
  ],
})
