import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useApp } from '../../app/AppContext';
import { Button, PageHeader } from '../../components/Ui';
import type { Account, Category, CreateScheduleInput, LocalDate, Schedule, ScheduleRecurrence } from '../../data/types';
import { useMessages } from '../../i18n/locale';
import { parseGbpInput, toGbpInput } from '../../utils/format';
import { DeactivateScheduleDialog, ScheduleEditorDialog, SchedulesCollection, type ScheduleForm } from './components';
import { schedulesMessages } from './messages';
import './styles.css';

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

export function SchedulesPage() {
  const { api, refreshToken, refresh, notify } = useApp();
  const t = useMessages(schedulesMessages);
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
      .catch(() => notify(t('loadError'), 'error'))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, notify, refreshToken, t]);

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

  async function saveSchedule() {
    const amountMinor = parseGbpInput(form.amount);
    if (!form.name.trim() || !form.description.trim() || !amountMinor || !form.accountId) {
      setError(t('requiredFields'));
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
        notify(t('updated'));
      } else {
        await api.createSchedule(input);
        notify(t('created'));
      }
      setEditor(null);
      refresh();
    } catch {
      setError(t('saveError'));
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    if (!deactivating) return;
    setBusy(true);
    try {
      await api.deactivateSchedule(deactivating.id, deactivating.version);
      notify(t('deactivatedNotice', { name: deactivating.name }));
      setDeactivating(null);
      refresh();
    } catch {
      notify(t('deactivateError'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('pageDescription')}
        actions={
          <Button variant="primary" onClick={() => openEditor('new')}>
            <Plus aria-hidden="true" size={18} />
            {t('newSchedule')}
          </Button>
        }
      />

      <SchedulesCollection
        schedules={visibleSchedules}
        loading={loading}
        showInactive={showInactive}
        onShowInactiveChange={setShowInactive}
        onCreate={() => openEditor('new')}
        onEdit={openEditor}
        onDeactivate={setDeactivating}
      />

      <ScheduleEditorDialog
        mode={editor === null ? null : editor === 'new' ? 'new' : 'edit'}
        form={form}
        accounts={accounts}
        categories={availableCategories}
        previewRecurrence={recurrenceFromForm()}
        error={error}
        busy={busy}
        onFormChange={setForm}
        onClose={() => setEditor(null)}
        onSubmit={saveSchedule}
      />

      <DeactivateScheduleDialog
        schedule={deactivating}
        busy={busy}
        onClose={() => setDeactivating(null)}
        onConfirm={deactivate}
      />
    </div>
  );
}
