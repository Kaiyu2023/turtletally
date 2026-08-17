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
import { joinClassNames } from '../utils/format';
import { Badge, Button } from './Ui';

const navigation = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', icon: WalletCards },
  { to: '/budgets', label: 'Budgets', icon: ChartNoAxesCombined },
  { to: '/schedules', label: 'Schedules', icon: CalendarClock },
  { to: '/imports', label: 'Imports', icon: FileUp },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

const titles: Readonly<Record<string, string>> = {
  '/dashboard': 'Overview',
  '/transactions': 'Transactions',
  '/budgets': 'Budgets',
  '/schedules': 'Schedules',
  '/imports': 'Imports',
  '/settings': 'Settings',
};

type AppShellProps = {
  readonly children: ReactNode;
  readonly onAddTransaction: () => void;
  readonly onShowNotifications: () => void;
};

export function AppShell({ children, onAddTransaction, onShowNotifications }: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const title = titles[location.pathname] ?? 'Turtle Tally';

  const links = navigation.map(({ to, label, icon: Icon }) => (
    <NavLink
      key={to}
      to={to}
      className={({ isActive }) => joinClassNames('nav-link', isActive && 'nav-link--active')}
      onClick={() => setMobileMenuOpen(false)}
    >
      <Icon aria-hidden="true" size={20} strokeWidth={1.9} />
      <span>{label}</span>
      <ChevronRight className="nav-link__chevron" aria-hidden="true" size={16} />
    </NavLink>
  ));

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Primary navigation">
        <NavLink className="brand" to="/dashboard" aria-label="Turtle Tally overview">
          <img src="/turtle-tally.png" alt="" />
          <span>
            <strong>Turtle Tally</strong>
            <small>Slow and steady finances</small>
          </span>
        </NavLink>
        <Button className="sidebar__add" variant="primary" onClick={onAddTransaction}>
          <Plus aria-hidden="true" size={19} />
          Add transaction
        </Button>
        <nav className="sidebar__nav">{links}</nav>
        <div className="sidebar__footer">
          <div className="owner-avatar" aria-hidden="true">
            TT
          </div>
          <span>
            <strong>Demo owner</strong>
            <small>Private workspace</small>
          </span>
        </div>
      </aside>

      <header className="topbar">
        <button
          className="icon-button mobile-only"
          type="button"
          aria-label="Open navigation"
          onClick={() => setMobileMenuOpen(true)}
        >
          <Menu aria-hidden="true" />
        </button>
        <div className="topbar__title">
          <img className="mobile-only" src="/turtle-tally.png" alt="" />
          <strong>{title}</strong>
        </div>
        <div className="topbar__actions">
          <Badge tone="info">Demo data</Badge>
          <button
            className="icon-button notification-button"
            type="button"
            aria-label="Show notifications"
            onClick={onShowNotifications}
          >
            <Bell aria-hidden="true" size={20} />
          </button>
        </div>
      </header>

      <main id="main-content" className="main-content" tabIndex={-1}>
        {children}
      </main>

      <nav className="bottom-nav" aria-label="Mobile navigation">
        {navigation.slice(0, 4).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => joinClassNames(isActive && 'active')}>
            <Icon aria-hidden="true" size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
        <button type="button" onClick={() => setMobileMenuOpen(true)}>
          <Menu aria-hidden="true" size={20} />
          <span>More</span>
        </button>
      </nav>

      <button className="mobile-add" type="button" aria-label="Add transaction" onClick={onAddTransaction}>
        <Plus aria-hidden="true" />
      </button>

      <div
        className={joinClassNames('mobile-menu', mobileMenuOpen && 'mobile-menu--open')}
        aria-hidden={!mobileMenuOpen}
      >
        <button
          className="mobile-menu__backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileMenuOpen(false)}
        />
        <div className="mobile-menu__sheet">
          <header>
            <div>
              <span className="eyebrow">Navigate</span>
              <h2>Turtle Tally</h2>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="Close navigation"
              onClick={() => setMobileMenuOpen(false)}
            >
              <X aria-hidden="true" />
            </button>
          </header>
          <nav>{links}</nav>
        </div>
      </div>
    </div>
  );
}
