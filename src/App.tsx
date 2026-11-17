import { Layout } from './components/Layout';
import { AppProvider, useApp } from './context/AppContext';
import { AccountsContactsView } from './views/AccountsContactsView';
import { ActivitiesTicketsView } from './views/ActivitiesTicketsView';
import { CatalogQuotesView } from './views/CatalogQuotesView';
import { ContractsEngagementsView } from './views/ContractsEngagementsView';
import { DashboardView } from './views/DashboardView';
import { DealsPipelineView } from './views/DealsPipelineView';
import { LeadsView } from './views/LeadsView';
import { LoginView } from './views/LoginView';
import { MarketingView } from './views/MarketingView';
import { ReportsView } from './views/ReportsView';
import { SecurityAdminView } from './views/SecurityAdminView';

function AppShell() {
  const { user, authLoading, activeModule } = useApp();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-xs font-mono text-slate-500">
        Initializing SentinelShield Cyber CRM...
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  const renderModule = () => {
    switch (activeModule) {
      case 'dashboard':
        return <DashboardView />;
      case 'leads':
        return <LeadsView />;
      case 'accounts':
        return <AccountsContactsView defaultTab="accounts" />;
      case 'contacts':
        return <AccountsContactsView defaultTab="contacts" />;
      case 'deals':
        return <DealsPipelineView />;
      case 'catalog':
        return <CatalogQuotesView defaultTab="catalog" />;
      case 'quotes':
        return <CatalogQuotesView defaultTab="quotes" />;
      case 'contracts':
        return <ContractsEngagementsView defaultTab="contracts" />;
      case 'engagements':
        return <ContractsEngagementsView defaultTab="engagements" />;
      case 'marketing':
        return <MarketingView />;
      case 'activities':
        return <ActivitiesTicketsView defaultMode="activities" />;
      case 'tickets':
        return <ActivitiesTicketsView defaultMode="tickets" />;
      case 'reports':
        return <ReportsView />;
      case 'security':
        return <SecurityAdminView />;
      default:
        return <DashboardView />;
    }
  };

  return <Layout>{renderModule()}</Layout>;
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
