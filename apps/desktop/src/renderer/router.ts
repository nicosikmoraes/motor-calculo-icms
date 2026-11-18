import { createRouter, createWebHashHistory } from 'vue-router'
import InterchangeView from './views/data-management/InterchangeView.vue'
import MonthlyConferenceView from './views/reports/MonthlyConferenceView.vue'
import DocumentConflictsView from './views/documents/DocumentConflictsView.vue'
import DocumentReviewView from './views/documents/DocumentReviewView.vue'
import BackupView from './views/data-management/BackupView.vue'
import DashboardView from './views/dashboard/DashboardView.vue'
import CompaniesView from './views/registrations/CompaniesView.vue'
import FiscalCatalogView from './views/fiscal/FiscalCatalogView.vue'
import BatchHistoryView from './views/batches/BatchHistoryView.vue'
import BatchDetailView from './views/batches/BatchDetailView.vue'
import NewBatchView from './views/batches/NewBatchView.vue'
import BuiltinRulesView from './views/fiscal/BuiltinRulesView.vue'
import RegistrationAuditView from './views/registrations/RegistrationAuditView.vue'
import SupportProjectView from './views/donations/SupportProjectView.vue'
import SignInView from './views/auth/SignInView.vue'
import ReceivedDonationsView from './views/donations/ReceivedDonationsView.vue'
import { requireRole, requireSession } from './concerns/auth/navigation'

export const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior(to, from) {
    // A busca do histórico atualiza a URL sem deslocar o campo em edição.
    if (to.path === '/lotes' && from.path === to.path) return false
    return { top: 0 }
  },
  routes: [
    { path: '/conflitos-notas', component: DocumentConflictsView },
    { path: '/revisao-documental', component: DocumentReviewView },
    { path: '/conferencia-mensal', component: MonthlyConferenceView },
    { path: '/backup', component: BackupView },
    // Só o que usa a API pede conta; o fluxo fiscal é local e continua aberto.
    { path: '/apoio', component: SupportProjectView, beforeEnter: requireSession, meta: { requiresSession: true } },
    { path: '/entrar', component: SignInView },
    { path: '/admin/doacoes', component: ReceivedDonationsView, beforeEnter: requireRole('ADMIN'), meta: { requiresSession: true } },
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
