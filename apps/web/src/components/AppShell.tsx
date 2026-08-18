import { useState, type ReactNode } from 'react';
import {
  Bell,
  CalendarClock,
  ChartNoAxesCombined,
  ChevronRight,
  FileUp,
  LayoutDashboard,
  Menu,
  Plus,
  Settings,
  WalletCards,
  X,
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { commonMessages } from '../i18n/common';
import { useMessages } from '../i18n/locale';
import { joinClassNames } from '../utils/format';
import { Badge, Button, IconButton } from './Ui';

const navigation = [
  { to: '/dashboard', label: 'overview', icon: LayoutDashboard },
  { to: '/transactions', label: 'transactions', icon: WalletCards },
  { to: '/budgets', label: 'budgets', icon: ChartNoAxesCombined },
  { to: '/schedules', label: 'schedules', icon: CalendarClock },
  { to: '/imports', label: 'imports', icon: FileUp },
  { to: '/settings', label: 'settings', icon: Settings },
] as const;

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

  const links = navigation.map(({ to, label, icon: Icon }) => (
    <NavLink
      key={to}
      to={to}
      className={({ isActive }) => joinClassNames('nav-link', isActive && 'nav-link--active')}
      onClick={() => setMobileMenuOpen(false)}
    >
      <Icon aria-hidden="true" size={20} strokeWidth={1.9} />
      <span>{t(label)}</span>
      <ChevronRight className="nav-link__chevron" aria-hidden="true" size={16} />
    </NavLink>
  ));

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {t('skipToContent')}
      </a>
      <aside className="sidebar" aria-label={t('primaryNavigation')}>
        <NavLink className="brand" to="/dashboard" aria-label={t('turtleTallyOverview')}>
          <img src="/turtle-tally.png" alt="" />
          <span>
            <strong>Turtle Tally</strong>
            <small>{t('tagline')}</small>
          </span>
        </NavLink>
        <Button className="sidebar__add" variant="primary" aria-label={t('addTransaction')} onClick={onAddTransaction}>
          <Plus aria-hidden="true" size={19} />
          <span className="sidebar__add-label">{t('addTransaction')}</span>
        </Button>
        <nav className="sidebar__nav">{links}</nav>
        <div className="sidebar__footer">
          <div className="owner-avatar" aria-hidden="true">
            TT
          </div>
          <span>
            <strong>{t('demoOwner')}</strong>
            <small>{t('privateWorkspace')}</small>
          </span>
        </div>
      </aside>

      <header className="topbar">
        <IconButton className="mobile-only" aria-label={t('openNavigation')} onClick={() => setMobileMenuOpen(true)}>
          <Menu aria-hidden="true" />
        </IconButton>
        <div className="topbar__title">
          <img className="mobile-only" src="/turtle-tally.png" alt="" />
          <strong>{title}</strong>
        </div>
        <div className="topbar__actions">
          <Badge tone="info">{t('demoData')}</Badge>
          <IconButton className="notification-button" aria-label={t('showNotifications')} onClick={onShowNotifications}>
            <Bell aria-hidden="true" size={20} />
          </IconButton>
        </div>
      </header>

      <main id="main-content" className="main-content" tabIndex={-1}>
        {children}
      </main>

      <nav className="bottom-nav" aria-label={t('mobileNavigation')}>
        {navigation.slice(0, 4).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => joinClassNames(isActive && 'active')}>
            <Icon aria-hidden="true" size={20} />
            <span>{t(label)}</span>
          </NavLink>
        ))}
        <button type="button" onClick={() => setMobileMenuOpen(true)}>
          <Menu aria-hidden="true" size={20} />
          <span>{t('more')}</span>
        </button>
      </nav>

      <button className="mobile-add" type="button" aria-label={t('addTransaction')} onClick={onAddTransaction}>
        <Plus aria-hidden="true" />
      </button>

      <div
        className={joinClassNames('mobile-menu', mobileMenuOpen && 'mobile-menu--open')}
        aria-hidden={!mobileMenuOpen}
      >
        <button
          className="mobile-menu__backdrop"
          type="button"
          aria-label={t('closeNavigation')}
          onClick={() => setMobileMenuOpen(false)}
        />
        <div className="mobile-menu__sheet">
          <header>
            <div>
              <span className="eyebrow">{t('navigate')}</span>
              <h2>Turtle Tally</h2>
            </div>
            <IconButton aria-label={t('closeNavigation')} onClick={() => setMobileMenuOpen(false)}>
              <X aria-hidden="true" />
            </IconButton>
          </header>
          <nav>{links}</nav>
        </div>
      </div>
    </div>
  );
}
