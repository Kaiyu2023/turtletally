import { useEffect, useMemo, useState, type SubmitEvent } from 'react';
import { CalendarCheck2, CalendarClock, CirclePause, Pencil, Plus, Repeat2 } from 'lucide-react';
import { useApp } from '../app/AppContext';
import type {
  Account,
  Category,
  CreateScheduleInput,
  LocalDate,
  Schedule,
  ScheduleRecurrence,
  TransactionFlow,
  TransactionKind,
} from '../data/types';
import { formatDate, formatMoney, parseGbpInput, toGbpInput } from '../utils/format';
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Skeleton } from '../components/Ui';
import './pages.css';

type ScheduleForm = {
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

const blankSchedule: ScheduleForm = {
  name: '',
  description: '',
  amount: '',
  accountId: '',
  categoryId: '',
  kind: 'SPENDING',
  flow: 'DEBIT',
  frequency: 'MONTHLY',
  nextDueDate: '2026-09-01',
  weekday: 'MONDAY',
  day: '1',
  month: '1',
  endOfMonthPolicy: 'CLAMP',
};

function recurrenceText(recurrence: ScheduleRecurrence): string {
  if (recurrence.frequency === 'ONCE') return `Once on ${formatDate(recurrence.date)}`;
  if (recurrence.frequency === 'WEEKLY')
    return `Every ${recurrence.intervalWeeks === 1 ? '' : `${recurrence.intervalWeeks} weeks on `}${recurrence.weekday.toLowerCase()}`;
  if (recurrence.frequency === 'MONTHLY')
    return `Monthly on day ${recurrence.day}${recurrence.day > 28 ? (recurrence.endOfMonthPolicy === 'CLAMP' ? ', using the last valid day' : ', skipping shorter months') : ''}`;
  return `Yearly on ${recurrence.day}/${recurrence.month}${recurrence.day > 28 ? (recurrence.endOfMonthPolicy === 'CLAMP' ? ', using the last valid day' : ', skipping invalid dates') : ''}`;
}

export function SchedulesPage() {
  const { api, refreshToken, refresh, notify } = useApp();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<Schedule | 'new' | null>(null);
  const [form, setForm] = useState<ScheduleForm>(blankSchedule);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deactivating, setDeactivating] = useState<Schedule | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([api.listSchedules(true), api.listAccounts(), api.listCategories()])
      .then(([nextSchedules, nextAccounts, nextCategories]) => {
        if (!active) return;
        setSchedules(nextSchedules);
        setAccounts(nextAccounts);
        setCategories(nextCategories);
      })
      .catch((reason: unknown) =>
        notify(reason instanceof Error ? reason.message : 'Schedules could not be loaded.', 'error'),
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, notify, refreshToken]);

  const visibleSchedules = useMemo(
    () => schedules.filter((schedule) => showInactive || schedule.deactivatedAt === null),
    [schedules, showInactive],
  );
  const availableCategories = useMemo(
    () =>
      categories.filter((category) => {
        if (form.kind === 'INCOME') return category.group === 'Income';
        if (form.kind === 'INVESTMENT') return category.group === 'Investment';
        return category.group !== 'Income' && category.group !== 'Investment';
      }),
    [categories, form.kind],
  );

  function openEditor(schedule: Schedule | 'new') {
    setEditor(schedule);
    setError('');
    if (schedule === 'new') {
      setForm({ ...blankSchedule, accountId: accounts[0]?.id ?? '' });
      return;
    }
    const recurrence = schedule.recurrence;
    setForm({
      name: schedule.name,
      description: schedule.description,
      amount: toGbpInput(schedule.amountMinor),
      accountId: schedule.accountId,
      categoryId: schedule.categoryId ?? '',
      kind: schedule.kind,
      flow: schedule.flow,
      frequency: recurrence.frequency,
      nextDueDate: schedule.nextDueDate ?? '2026-09-01',
      weekday: recurrence.frequency === 'WEEKLY' ? recurrence.weekday : 'MONDAY',
      day: recurrence.frequency === 'MONTHLY' || recurrence.frequency === 'YEARLY' ? String(recurrence.day) : '1',
      month: recurrence.frequency === 'YEARLY' ? String(recurrence.month) : '1',
      endOfMonthPolicy:
        recurrence.frequency === 'MONTHLY' || recurrence.frequency === 'YEARLY' ? recurrence.endOfMonthPolicy : 'CLAMP',
    });
  }

  function recurrenceFromForm(): ScheduleRecurrence {
    if (form.frequency === 'ONCE') return { frequency: 'ONCE', date: form.nextDueDate as LocalDate };
    if (form.frequency === 'WEEKLY') return { frequency: 'WEEKLY', weekday: form.weekday, intervalWeeks: 1 };
    if (form.frequency === 'MONTHLY')
      return { frequency: 'MONTHLY', day: Number(form.day), endOfMonthPolicy: form.endOfMonthPolicy };
    return {
      frequency: 'YEARLY',
      month: Number(form.month),
      day: Number(form.day),
      endOfMonthPolicy: form.endOfMonthPolicy,
    };
  }

  async function saveSchedule(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountMinor = parseGbpInput(form.amount);
    if (!form.name.trim() || !form.description.trim() || !amountMinor || !form.accountId) {
      setError('Complete the name, description, amount, and account fields.');
      return;
    }

    const input: CreateScheduleInput = {
      name: form.name,
      description: form.description,
      amountMinor,
      accountId: form.accountId,
      categoryId: form.categoryId || null,
      kind: form.kind,
      flow: form.flow,
      recurrence: recurrenceFromForm(),
      nextDueDate: form.nextDueDate as LocalDate,
    };
    setBusy(true);
    try {
      if (editor !== 'new' && editor) {
        await api.updateSchedule(editor.id, { ...input, expectedVersion: editor.version });
        notify('Schedule updated.');
      } else {
        await api.createSchedule(input);
        notify('Schedule created.');
      }
      setEditor(null);
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Schedule could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    if (!deactivating) return;
    setBusy(true);
    try {
      await api.deactivateSchedule(deactivating.id, deactivating.version);
      notify(`${deactivating.name} deactivated.`);
      setDeactivating(null);
      refresh();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Schedule could not be deactivated.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Automate the predictable"
        title="Schedules"
        description="Plan recurring and one-time entries. Every generated transaction remains visible and auditable."
        actions={
          <Button variant="primary" onClick={() => openEditor('new')}>
            <Plus aria-hidden="true" size={18} />
            New schedule
          </Button>
        }
      />
      <div className="toolbar">
        <div className="segmented">
          <button type="button" aria-pressed={!showInactive} onClick={() => setShowInactive(false)}>
            Active
          </button>
          <button type="button" aria-pressed={showInactive} onClick={() => setShowInactive(true)}>
            All
          </button>
        </div>
        <span className="muted">
          {visibleSchedules.length} schedule{visibleSchedules.length === 1 ? '' : 's'}
        </span>
      </div>
      {loading ? (
        <Card>
          <Skeleton lines={7} />
        </Card>
      ) : visibleSchedules.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarClock />}
            title="Nothing scheduled yet"
            description="Add a recurring bill, contribution, or one-time payment."
            action={
              <Button variant="primary" onClick={() => openEditor('new')}>
                Create schedule
              </Button>
            }
          />
        </Card>
      ) : (
        <section className="schedule-grid" aria-label="Scheduled entries">
          {visibleSchedules.map((schedule) => (
            <Card className="schedule-card page-enter" as="article" key={schedule.id}>
              <div className="schedule-card__top">
                <span className="schedule-icon">
                  <Repeat2 aria-hidden="true" />
                </span>
                <Badge tone={schedule.deactivatedAt ? 'neutral' : 'positive'}>
                  {schedule.deactivatedAt ? 'Inactive' : 'Active'}
                </Badge>
              </div>
              <h2>{schedule.name}</h2>
              <p>{schedule.description}</p>
              <strong className="schedule-card__amount">{formatMoney(schedule.amountMinor)}</strong>
              <dl>
                <div>
                  <dt>Entry</dt>
                  <dd>
                    {schedule.kind.toLowerCase()} · {schedule.flow.toLowerCase()}
                  </dd>
                </div>
                <div>
                  <dt>Recurrence</dt>
                  <dd>{recurrenceText(schedule.recurrence)}</dd>
                </div>
                <div>
                  <dt>Next due</dt>
                  <dd>{schedule.nextDueDate ? formatDate(schedule.nextDueDate) : 'No future entry'}</dd>
                </div>
                <div>
                  <dt>From</dt>
                  <dd>{schedule.accountName}</dd>
                </div>
              </dl>
              {schedule.deactivatedAt === null ? (
                <div className="schedule-card__actions">
                  <Button variant="ghost" onClick={() => openEditor(schedule)}>
                    <Pencil aria-hidden="true" size={16} />
                    Edit
                  </Button>
                  <Button variant="ghost" onClick={() => setDeactivating(schedule)}>
                    <CirclePause aria-hidden="true" size={16} />
                    Deactivate
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}
        </section>
      )}

      <Modal
        open={editor !== null}
        title={editor === 'new' ? 'New schedule' : 'Edit schedule'}
        description="Choose a constrained recurrence that stays predictable around month ends."
        size="large"
        onClose={() => setEditor(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditor(null)}>
              Cancel
            </Button>
            <Button type="submit" form="schedule-form" variant="primary" busy={busy}>
              {editor === 'new' ? 'Create schedule' : 'Save changes'}
            </Button>
          </>
        }
      >
        <form id="schedule-form" className="form-grid" onSubmit={(event) => void saveSchedule(event)} noValidate>
          {error ? (
            <div className="form-error field--wide" role="alert">
              {error}
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="schedule-name">Name</label>
            <input
              id="schedule-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="schedule-amount">Amount</label>
            <div className="input-prefix">
              <span>£</span>
              <input
                id="schedule-amount"
                inputMode="decimal"
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
              />
            </div>
          </div>
          <div className="field field--wide">
            <label htmlFor="schedule-description">Description</label>
            <input
              id="schedule-description"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="schedule-account">Account</label>
            <select
              id="schedule-account"
              value={form.accountId}
              onChange={(event) => setForm({ ...form, accountId: event.target.value })}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="schedule-category">Category</label>
            <select
              id="schedule-category"
              value={form.categoryId}
              onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
            >
              <option value="">Uncategorised</option>
              {availableCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="schedule-kind">Kind</label>
            <select
              id="schedule-kind"
              value={form.kind}
              onChange={(event) => {
                const kind = event.target.value as TransactionKind;
                setForm({ ...form, kind, flow: kind === 'INCOME' ? 'CREDIT' : 'DEBIT', categoryId: '' });
              }}
            >
              <option value="SPENDING">Spending</option>
              <option value="INCOME">Income</option>
              <option value="INVESTMENT">Investment</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="schedule-flow">Money flow</label>
            <select
              id="schedule-flow"
              value={form.flow}
              onChange={(event) => setForm({ ...form, flow: event.target.value as TransactionFlow })}
            >
              <option value="DEBIT">Debit</option>
              <option value="CREDIT">Credit</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="schedule-frequency">Repeats</label>
            <select
              id="schedule-frequency"
              value={form.frequency}
              onChange={(event) => setForm({ ...form, frequency: event.target.value as ScheduleForm['frequency'] })}
            >
              <option value="ONCE">Once</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="YEARLY">Yearly</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="schedule-next-date">Next due</label>
            <input
              id="schedule-next-date"
              type="date"
              value={form.nextDueDate}
              onChange={(event) => setForm({ ...form, nextDueDate: event.target.value })}
            />
          </div>
          {form.frequency === 'WEEKLY' ? (
            <div className="field">
              <label htmlFor="schedule-weekday">Weekday</label>
              <select
                id="schedule-weekday"
                value={form.weekday}
                onChange={(event) => setForm({ ...form, weekday: event.target.value as ScheduleForm['weekday'] })}
              >
                {['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map((day) => (
                  <option key={day} value={day}>
                    {day.charAt(0) + day.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {form.frequency === 'MONTHLY' || form.frequency === 'YEARLY' ? (
            <div className="field">
              <label htmlFor="schedule-day">Day of month</label>
              <input
                id="schedule-day"
                type="number"
                min="1"
                max="31"
                value={form.day}
                onChange={(event) => setForm({ ...form, day: event.target.value })}
              />
            </div>
          ) : null}
          {form.frequency === 'YEARLY' ? (
            <div className="field">
              <label htmlFor="schedule-month">Month</label>
              <select
                id="schedule-month"
                value={form.month}
                onChange={(event) => setForm({ ...form, month: event.target.value })}
              >
                {Array.from({ length: 12 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {new Intl.DateTimeFormat('en-GB', { month: 'long' }).format(new Date(2026, index, 1))}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {form.frequency === 'MONTHLY' || form.frequency === 'YEARLY' ? (
            <div className="field">
              <label htmlFor="schedule-month-end">If the date does not exist</label>
              <select
                id="schedule-month-end"
                value={form.endOfMonthPolicy}
                onChange={(event) =>
                  setForm({ ...form, endOfMonthPolicy: event.target.value as ScheduleForm['endOfMonthPolicy'] })
                }
              >
                <option value="CLAMP">Use the last valid day</option>
                <option value="SKIP">Skip that month</option>
              </select>
            </div>
          ) : null}
          <div className="future-note field--wide">
            <CalendarCheck2 aria-hidden="true" />
            <div>
              <strong>{recurrenceText(recurrenceFromForm())}</strong>
              <p>The first demo entry is due {formatDate(form.nextDueDate as LocalDate)}.</p>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={deactivating !== null}
        title="Deactivate schedule?"
        description="Existing generated transactions stay in the ledger."
        size="small"
        onClose={() => setDeactivating(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeactivating(null)}>
              Keep active
            </Button>
            <Button variant="danger" busy={busy} onClick={() => void deactivate()}>
              Deactivate
            </Button>
          </>
        }
      >
        <p>
          <strong>{deactivating?.name}</strong> will stop creating future entries. This is not a hard delete.
        </p>
      </Modal>
    </div>
  );
}
