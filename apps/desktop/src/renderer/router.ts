import { createRouter, createWebHashHistory } from 'vue-router'
import DashboardView from './views/DashboardView.vue'
import CompaniesView from './views/CompaniesView.vue'
import NewBatchView from './views/NewBatchView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: DashboardView },
    { path: '/empresas', component: CompaniesView },
    { path: '/lotes/novo', component: NewBatchView },
  ],
})
