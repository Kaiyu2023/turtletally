import { CalendarCheck2, CalendarClock, CirclePause, Pencil, Repeat2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Modal, Skeleton } from '../../components/Ui';
import type {
  Account,
  Category,
  LocalDate,
  Schedule,
  ScheduleRecurrence,
  TransactionFlow,
  TransactionKind,
} from '../../data/types';
import { useLocale, useMessages, type LocaleFormatters } from '../../i18n/locale';
import { schedulesMessages } from './messages';

export type ScheduleForm = {
  name: string;
  description: string;
  amount: string;
  accountId: string;
  categoryId: string;
  kind: TransactionKind;
  flow: TransactionFlow;
  frequency: ScheduleRecurrence['frequency'];
  nextDueDate: string;
  weekday: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
  day: string;
  month: string;
  endOfMonthPolicy: 'CLAMP' | 'SKIP';
};

const weekdays: readonly ScheduleForm['weekday'][] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

type ScheduleMessageKey = keyof (typeof schedulesMessages)['en-GB'];
type Translate = (key: ScheduleMessageKey, values?: Readonly<Record<string, string | number>>) => string;

function weekdayText(weekday: ScheduleForm['weekday'], t: Translate): string {
  const keys: Record<ScheduleForm['weekday'], ScheduleMessageKey> = {
    MONDAY: 'monday',
    TUESDAY: 'tuesday',
    WEDNESDAY: 'wednesday',
    THURSDAY: 'thursday',
    FRIDAY: 'friday',
    SATURDAY: 'saturday',
    SUNDAY: 'sunday',
  };
  return t(keys[weekday]);
}

function kindText(kind: TransactionKind, t: Translate): string {
  const keys: Record<TransactionKind, ScheduleMessageKey> = {
    SPENDING: 'spending',
    INCOME: 'income',
    INVESTMENT: 'investment',
  };
  return t(keys[kind]);
}

function flowText(flow: TransactionFlow, t: Translate): string {
  return t(flow === 'CREDIT' ? 'credit' : 'debit');
}

function recurrenceText(recurrence: ScheduleRecurrence, t: Translate, format: LocaleFormatters): string {
  if (recurrence.frequency === 'ONCE') {
    return t('onceOn', { date: format.date(recurrence.date) });
  }
  if (recurrence.frequency === 'WEEKLY') {
    const weekday = weekdayText(recurrence.weekday, t).toLocaleLowerCase();
    return recurrence.intervalWeeks === 1
      ? t('everyWeek', { weekday })
      : t('everyWeeks', { count: format.number(recurrence.intervalWeeks), weekday });
  }
  if (recurrence.frequency === 'MONTHLY') {
    const day = format.number(recurrence.day);
    if (recurrence.day <= 28) return t('monthlyDay', { day });
    return t(recurrence.endOfMonthPolicy === 'CLAMP' ? 'monthlyDayClamp' : 'monthlyDaySkip', { day });
  }
  const values = {
    day: format.number(recurrence.day),
    month: format.number(recurrence.month),
  };
  if (recurrence.day <= 28) return t('yearlyDate', values);
  return t(recurrence.endOfMonthPolicy === 'CLAMP' ? 'yearlyDateClamp' : 'yearlyDateSkip', values);
}

type SchedulesCollectionProps = {
  readonly schedules: readonly Schedule[];
  readonly loading: boolean;
  readonly showInactive: boolean;
  readonly onShowInactiveChange: (showInactive: boolean) => void;
  readonly onCreate: () => void;
  readonly onEdit: (schedule: Schedule) => void;
  readonly onDeactivate: (schedule: Schedule) => void;
};

export function SchedulesCollection({
  schedules,
  loading,
  showInactive,
  onShowInactiveChange,
  onCreate,
  onEdit,
  onDeactivate,
}: SchedulesCollectionProps) {
  const t = useMessages(schedulesMessages);
  const { format } = useLocale();

  return (
    <>
      <div className="toolbar">
        <div className="segmented">
          <button type="button" aria-pressed={!showInactive} onClick={() => onShowInactiveChange(false)}>
            {t('active')}
          </button>
          <button type="button" aria-pressed={showInactive} onClick={() => onShowInactiveChange(true)}>
            {t('all')}
          </button>
        </div>
        <span className="muted">
          {schedules.length === 1 ? t('oneSchedule') : t('schedulesCount', { count: format.number(schedules.length) })}
        </span>
      </div>
      {loading ? (
        <Card>
          <Skeleton lines={7} />
        </Card>
      ) : schedules.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarClock />}
            title={t('nothingScheduled')}
            description={t('emptyDescription')}
            action={
              <Button variant="primary" onClick={onCreate}>
                {t('createSchedule')}
              </Button>
            }
          />
        </Card>
      ) : (
        <section className="schedule-grid" aria-label={t('scheduledEntries')}>
          {schedules.map((schedule) => (
            <ScheduleCard key={schedule.id} schedule={schedule} onEdit={onEdit} onDeactivate={onDeactivate} />
          ))}
        </section>
      )}
    </>
  );
}

function ScheduleCard({
  schedule,
  onEdit,
  onDeactivate,
}: {
  readonly schedule: Schedule;
  readonly onEdit: (schedule: Schedule) => void;
  readonly onDeactivate: (schedule: Schedule) => void;
}) {
  const t = useMessages(schedulesMessages);
  const { format } = useLocale();

  return (
    <Card className="schedule-card page-enter" as="article">
      <div className="schedule-card__top">
        <span className="schedule-icon">
          <Repeat2 aria-hidden="true" />
        </span>
        <Badge tone={schedule.deactivatedAt ? 'neutral' : 'positive'}>
          {schedule.deactivatedAt ? t('inactive') : t('active')}
        </Badge>
      </div>
      <h2>{schedule.name}</h2>
      <p>{schedule.description}</p>
      <strong className="schedule-card__amount">{format.money(schedule.amountMinor)}</strong>
      <dl>
        <div>
          <dt>{t('entry')}</dt>
          <dd>
            {kindText(schedule.kind, t).toLocaleLowerCase()} · {flowText(schedule.flow, t).toLocaleLowerCase()}
          </dd>
        </div>
        <div>
          <dt>{t('recurrence')}</dt>
          <dd>{recurrenceText(schedule.recurrence, t, format)}</dd>
        </div>
        <div>
          <dt>{t('nextDue')}</dt>
          <dd>{schedule.nextDueDate ? format.date(schedule.nextDueDate) : t('noFutureEntry')}</dd>
        </div>
        <div>
          <dt>{t('from')}</dt>
          <dd>{schedule.accountName}</dd>
        </div>
      </dl>
      {schedule.deactivatedAt === null ? (
        <div className="schedule-card__actions">
          <Button variant="ghost" onClick={() => onEdit(schedule)}>
            <Pencil aria-hidden="true" size={16} />
            {t('edit')}
          </Button>
          <Button variant="ghost" onClick={() => onDeactivate(schedule)}>
            <CirclePause aria-hidden="true" size={16} />
            {t('deactivate')}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

type ScheduleEditorDialogProps = {
  readonly mode: 'new' | 'edit' | null;
  readonly form: ScheduleForm;
  readonly accounts: readonly Account[];
  readonly categories: readonly Category[];
  readonly previewRecurrence: ScheduleRecurrence;
  readonly error: string;
  readonly busy: boolean;
  readonly onFormChange: (form: ScheduleForm) => void;
  readonly onClose: () => void;
  readonly onSubmit: () => Promise<void>;
};

export function ScheduleEditorDialog({
  mode,
  form,
  accounts,
  categories,
  previewRecurrence,
  error,
  busy,
  onFormChange,
  onClose,
  onSubmit,
}: ScheduleEditorDialogProps) {
  const t = useMessages(schedulesMessages);
  const { format } = useLocale();

  return (
    <Modal
      open={mode !== null}
      title={mode === 'new' ? t('newSchedule') : t('editSchedule')}
      description={t('editorDescription')}
      size="large"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" form="schedule-form" variant="primary" busy={busy}>
            {mode === 'new' ? t('createSchedule') : t('saveChanges')}
          </Button>
        </>
      }
    >
      <form
        id="schedule-form"
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit();
        }}
        noValidate
      >
        {error ? (
          <div className="form-error field--wide" role="alert">
            {error}
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="schedule-name">{t('name')}</label>
          <input
            id="schedule-name"
            value={form.name}
            onChange={(event) => onFormChange({ ...form, name: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="schedule-amount">{t('amount')}</label>
          <div className="input-prefix">
            <span>£</span>
            <input
              id="schedule-amount"
              inputMode="decimal"
              value={form.amount}
              onChange={(event) => onFormChange({ ...form, amount: event.target.value })}
            />
          </div>
        </div>
        <div className="field field--wide">
          <label htmlFor="schedule-description">{t('description')}</label>
          <input
            id="schedule-description"
            value={form.description}
            onChange={(event) => onFormChange({ ...form, description: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="schedule-account">{t('account')}</label>
          <select
            id="schedule-account"
            value={form.accountId}
            onChange={(event) => onFormChange({ ...form, accountId: event.target.value })}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="schedule-category">{t('category')}</label>
          <select
            id="schedule-category"
            value={form.categoryId}
            onChange={(event) => onFormChange({ ...form, categoryId: event.target.value })}
          >
            <option value="">{t('uncategorised')}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="schedule-kind">{t('kind')}</label>
          <select
            id="schedule-kind"
            value={form.kind}
            onChange={(event) => {
              const kind = event.target.value as TransactionKind;
              onFormChange({ ...form, kind, flow: kind === 'INCOME' ? 'CREDIT' : 'DEBIT', categoryId: '' });
            }}
          >
            <option value="SPENDING">{t('spending')}</option>
            <option value="INCOME">{t('income')}</option>
            <option value="INVESTMENT">{t('investment')}</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="schedule-flow">{t('moneyFlow')}</label>
          <select
            id="schedule-flow"
            value={form.flow}
            onChange={(event) => onFormChange({ ...form, flow: event.target.value as TransactionFlow })}
          >
            <option value="DEBIT">{t('debit')}</option>
            <option value="CREDIT">{t('credit')}</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="schedule-frequency">{t('repeats')}</label>
          <select
            id="schedule-frequency"
            value={form.frequency}
            onChange={(event) => onFormChange({ ...form, frequency: event.target.value as ScheduleForm['frequency'] })}
          >
            <option value="ONCE">{t('once')}</option>
            <option value="WEEKLY">{t('weekly')}</option>
            <option value="MONTHLY">{t('monthly')}</option>
            <option value="YEARLY">{t('yearly')}</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="schedule-next-date">{t('nextDue')}</label>
          <input
            id="schedule-next-date"
            type="date"
            value={form.nextDueDate}
            onChange={(event) => onFormChange({ ...form, nextDueDate: event.target.value })}
          />
        </div>
        {form.frequency === 'WEEKLY' ? (
          <div className="field">
            <label htmlFor="schedule-weekday">{t('weekday')}</label>
            <select
              id="schedule-weekday"
              value={form.weekday}
              onChange={(event) => onFormChange({ ...form, weekday: event.target.value as ScheduleForm['weekday'] })}
            >
              {weekdays.map((day) => (
                <option key={day} value={day}>
                  {weekdayText(day, t)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {form.frequency === 'MONTHLY' || form.frequency === 'YEARLY' ? (
          <div className="field">
            <label htmlFor="schedule-day">{t('dayOfMonth')}</label>
            <input
              id="schedule-day"
              type="number"
              min="1"
              max="31"
              value={form.day}
              onChange={(event) => onFormChange({ ...form, day: event.target.value })}
            />
          </div>
        ) : null}
        {form.frequency === 'YEARLY' ? (
          <div className="field">
            <label htmlFor="schedule-month">{t('month')}</label>
            <select
              id="schedule-month"
              value={form.month}
              onChange={(event) => onFormChange({ ...form, month: event.target.value })}
            >
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  {format.shortMonth(`2026-${String(index + 1).padStart(2, '0')}-01`)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {form.frequency === 'MONTHLY' || form.frequency === 'YEARLY' ? (
          <div className="field">
            <label htmlFor="schedule-month-end">{t('missingDate')}</label>
            <select
              id="schedule-month-end"
              value={form.endOfMonthPolicy}
              onChange={(event) =>
                onFormChange({
                  ...form,
                  endOfMonthPolicy: event.target.value as ScheduleForm['endOfMonthPolicy'],
                })
              }
            >
              <option value="CLAMP">{t('useLastDay')}</option>
              <option value="SKIP">{t('skipMonth')}</option>
            </select>
          </div>
        ) : null}
        <div className="future-note field--wide">
          <CalendarCheck2 aria-hidden="true" />
          <div>
            <strong>{recurrenceText(previewRecurrence, t, format)}</strong>
            <p>{t('firstEntryDue', { date: format.date(form.nextDueDate as LocalDate) })}</p>
          </div>
        </div>
      </form>
    </Modal>
  );
}

type DeactivateScheduleDialogProps = {
  readonly schedule: Schedule | null;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => Promise<void>;
};

export function DeactivateScheduleDialog({ schedule, busy, onClose, onConfirm }: DeactivateScheduleDialogProps) {
  const t = useMessages(schedulesMessages);

  return (
    <Modal
      open={schedule !== null}
      title={t('deactivateTitle')}
      description={t('deactivateDescription')}
      size="small"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('keepActive')}
          </Button>
          <Button variant="danger" busy={busy} onClick={() => void onConfirm()}>
            {t('deactivate')}
          </Button>
        </>
      }
    >
      <p>
        <strong>{schedule?.name}</strong> {t('deactivateBody')}
      </p>
    </Modal>
  );
}
