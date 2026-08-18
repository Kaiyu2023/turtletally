import { useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { commonMessages } from '../../i18n/common';
import { useMessages } from '../../i18n/locale';
import { AppSidebar, AppTopBar, MobileChrome } from './components';

const titles = {
  '/dashboard': 'overview',
  '/transactions': 'transactions',
  '/budgets': 'budgets',
  '/schedules': 'schedules',
  '/imports': 'imports',
  '/settings': 'settings',
} as const;

type AppShellProps = {
  readonly children: ReactNode;
  readonly onAddTransaction: () => void;
  readonly onShowNotifications: () => void;
};

export function AppShell({ children, onAddTransaction, onShowNotifications }: AppShellProps) {
  const t = useMessages(commonMessages);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const titleKey = titles[location.pathname as keyof typeof titles];
  const title = titleKey ? t(titleKey) : 'Turtle Tally';
  const openMobileMenu = () => setMobileMenuOpen(true);
  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {t('skipToContent')}
      </a>
      <AppSidebar onAddTransaction={onAddTransaction} onNavigate={closeMobileMenu} />
      <AppTopBar title={title} onOpenNavigation={openMobileMenu} onShowNotifications={onShowNotifications} />
      <main id="main-content" className="main-content" tabIndex={-1}>
        {children}
      </main>
      <MobileChrome
        menuOpen={mobileMenuOpen}
        onAddTransaction={onAddTransaction}
        onCloseMenu={closeMobileMenu}
        onOpenMenu={openMobileMenu}
      />
    </div>
  );
}
