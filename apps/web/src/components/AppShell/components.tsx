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
import { NavLink } from 'react-router-dom';
import { commonMessages } from '../../i18n/common';
import { useMessages } from '../../i18n/locale';
import { joinClassNames } from '../../utils/format';
import { Badge, Button, IconButton } from '../Ui';

const navigation = [
  { to: '/dashboard', label: 'overview', icon: LayoutDashboard },
  { to: '/transactions', label: 'transactions', icon: WalletCards },
  { to: '/budgets', label: 'budgets', icon: ChartNoAxesCombined },
  { to: '/schedules', label: 'schedules', icon: CalendarClock },
  { to: '/imports', label: 'imports', icon: FileUp },
  { to: '/settings', label: 'settings', icon: Settings },
] as const;

function NavigationLinks({ onNavigate }: { readonly onNavigate: () => void }) {
  const t = useMessages(commonMessages);

  return navigation.map(({ to, label, icon: Icon }) => (
    <NavLink
      key={to}
      to={to}
      className={({ isActive }) => joinClassNames('nav-link', isActive && 'nav-link--active')}
      onClick={onNavigate}
    >
      <Icon aria-hidden="true" size={20} strokeWidth={1.9} />
      <span>{t(label)}</span>
      <ChevronRight className="nav-link__chevron" aria-hidden="true" size={16} />
    </NavLink>
  ));
}

type AppSidebarProps = {
  readonly onAddTransaction: () => void;
  readonly onNavigate: () => void;
};

export function AppSidebar({ onAddTransaction, onNavigate }: AppSidebarProps) {
  const t = useMessages(commonMessages);

  return (
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
      <nav className="sidebar__nav">
        <NavigationLinks onNavigate={onNavigate} />
      </nav>
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
  );
}

type AppTopBarProps = {
  readonly title: string;
  readonly onOpenNavigation: () => void;
  readonly onShowNotifications: () => void;
};

export function AppTopBar({ title, onOpenNavigation, onShowNotifications }: AppTopBarProps) {
  const t = useMessages(commonMessages);

  return (
    <header className="topbar">
      <IconButton className="mobile-only" aria-label={t('openNavigation')} onClick={onOpenNavigation}>
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
  );
}

type MobileDockProps = {
  readonly onAddTransaction: () => void;
  readonly onOpenNavigation: () => void;
};

function MobileDock({ onAddTransaction, onOpenNavigation }: MobileDockProps) {
  const t = useMessages(commonMessages);

  return (
    <>
      <nav className="bottom-nav" aria-label={t('mobileNavigation')}>
        {navigation.slice(0, 4).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => joinClassNames(isActive && 'active')}>
            <Icon aria-hidden="true" size={20} />
            <span>{t(label)}</span>
          </NavLink>
        ))}
        <button type="button" onClick={onOpenNavigation}>
          <Menu aria-hidden="true" size={20} />
          <span>{t('more')}</span>
        </button>
      </nav>
      <button className="mobile-add" type="button" aria-label={t('addTransaction')} onClick={onAddTransaction}>
        <Plus aria-hidden="true" />
      </button>
    </>
  );
}

type MobileMenuProps = {
  readonly open: boolean;
  readonly onClose: () => void;
};

function MobileMenu({ open, onClose }: MobileMenuProps) {
  const t = useMessages(commonMessages);

  return (
    <div className={joinClassNames('mobile-menu', open && 'mobile-menu--open')} aria-hidden={!open}>
      <button className="mobile-menu__backdrop" type="button" aria-label={t('closeNavigation')} onClick={onClose} />
      <div className="mobile-menu__sheet">
        <header>
          <div>
            <span className="eyebrow">{t('navigate')}</span>
            <h2>Turtle Tally</h2>
          </div>
          <IconButton aria-label={t('closeNavigation')} onClick={onClose}>
            <X aria-hidden="true" />
          </IconButton>
        </header>
        <nav>
          <NavigationLinks onNavigate={onClose} />
        </nav>
      </div>
    </div>
  );
}

type MobileChromeProps = {
  readonly menuOpen: boolean;
  readonly onAddTransaction: () => void;
  readonly onCloseMenu: () => void;
  readonly onOpenMenu: () => void;
};

export function MobileChrome({ menuOpen, onAddTransaction, onCloseMenu, onOpenMenu }: MobileChromeProps) {
  return (
    <>
      <MobileDock onAddTransaction={onAddTransaction} onOpenNavigation={onOpenMenu} />
      <MobileMenu open={menuOpen} onClose={onCloseMenu} />
    </>
  );
}
