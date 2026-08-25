use serde::Deserialize;
use turtle_tally_domain::aggregates::{
    BudgetProgressInput, MonthSummaryInput, ledger_window_for, spending_by_category,
    summarise_month,
};
use turtle_tally_domain::calendar::{LocalDate, Month};
use turtle_tally_domain::fingerprint::{SourceRow, batch_content_hash, row_fingerprint};
use turtle_tally_domain::recurrence::next_occurrence;
use turtle_tally_domain::reference::{sort_accounts, sort_categories};
use turtle_tally_domain::rollup::{
    MonthlyRollup, RollupSummaryInput, deltas_for_batch, deltas_for_create, deltas_for_update,
    deltas_for_void, rebuild_month, summarise_from_rollups,
};
use turtle_tally_domain::time::{instant_at, zoned_date, zoned_time};
use turtle_tally_domain::types::{
    Account, Budget, BudgetDefault, BudgetProgress, Category, DashboardSummary, Schedule,
    ScheduleRecurrence, Transaction,
};

/// ADR 0008: the TypeScript contract is the source of truth. This vector is
/// exported from its fixtures by `npm run contract:vector`, and a field added
/// on one side without the other fails here rather than in production.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Vector {
    today: LocalDate,
    now: String,
    accounts: Vec<Account>,
    categories: Vec<Category>,
    budgets: Vec<Budget>,
    budget_defaults: Vec<BudgetDefault>,
    transactions: Vec<Transaction>,
    schedules: Vec<Schedule>,
    expected: Expected,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Expected {
    dashboards: Vec<DashboardCase>,
    budget_progress: Vec<BudgetProgressCase>,
    recurrences: Vec<RecurrenceCase>,
    fingerprints: Vec<FingerprintCase>,
    batch_hashes: Vec<BatchHashCase>,
    zoned_times: Vec<ZonedTimeCase>,
    instants: Vec<InstantCase>,
    reference_order: ReferenceOrder,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DashboardCase {
    month: Month,
    window: Window,
    summary: DashboardSummary,
}

#[derive(Deserialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Window {
    from: LocalDate,
    to: LocalDate,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BudgetProgressCase {
    month: Month,
    rows: Vec<BudgetProgress>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecurrenceCase {
    recurrence: ScheduleRecurrence,
    current_due: LocalDate,
    next: Option<LocalDate>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FingerprintCase {
    row: FingerprintRow,
    fingerprint: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FingerprintRow {
    account_id: String,
    local_date: LocalDate,
    description: String,
    amount_minor: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BatchHashCase {
    file_name: String,
    fingerprints: Vec<String>,
    hash: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ZonedTimeCase {
    instant: String,
    local_date: LocalDate,
    local_time: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InstantCase {
    local_date: LocalDate,
    time_of_day: String,
    instant: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReferenceOrder {
    account_ids: Vec<String>,
    category_ids: Vec<String>,
}

fn vector() -> Vector {
    serde_json::from_str(include_str!("conformance-vector.json"))
        .expect("the committed vector matches the contract")
}

fn active_within(
    transactions: &[Transaction],
    from: &LocalDate,
    to: &LocalDate,
) -> Vec<Transaction> {
    transactions
        .iter()
        .filter(|transaction| transaction.is_active() && &transaction.local_date >= from)
        .filter(|transaction| &transaction.local_date <= to)
        .cloned()
        .collect()
}

#[test]
fn dashboard_summaries_match_the_contract() {
    let vector = vector();

    for case in &vector.expected.dashboards {
        let window = ledger_window_for(&case.month, &vector.today);
        assert_eq!(
            Window {
                from: window.from.clone(),
                to: window.to.clone()
            },
            case.window,
            "ledger window for {}",
            case.month
        );

        let summary = summarise_month(&MonthSummaryInput {
            month: &case.month,
            today: &vector.today,
            as_of: &vector.now,
            ledger_window: &active_within(&vector.transactions, &window.from, &window.to),
            budgets: &vector.budgets,
            budget_defaults: &vector.budget_defaults,
            categories: &vector.categories,
        })
        .expect("the fixtures resolve every category");

        assert_eq!(
            summary, case.summary,
            "dashboard summary for {}",
            case.month
        );
    }
}

#[test]
fn budget_progress_matches_the_contract() {
    let vector = vector();

    for case in &vector.expected.budget_progress {
        let month_transactions = active_within(
            &vector.transactions,
            &case.month.first_day(),
            &case.month.last_day(),
        );
        let rows = budget_progress_for(&vector, &case.month, &month_transactions);
        assert_eq!(rows, case.rows, "budget progress for {}", case.month);
    }
}

fn budget_progress_for(
    vector: &Vector,
    month: &Month,
    transactions: &[Transaction],
) -> Vec<BudgetProgress> {
    turtle_tally_domain::aggregates::budget_progress(&BudgetProgressInput {
        month,
        budgets: &vector.budgets,
        budget_defaults: &vector.budget_defaults,
        categories: &vector.categories,
        spent_by_category: &spending_by_category(transactions),
    })
    .expect("the fixtures resolve every budgeted category")
}

#[test]
fn recurrence_steps_match_the_contract() {
    for case in &vector().expected.recurrences {
        assert_eq!(
            next_occurrence(&case.recurrence, &case.current_due),
            case.next,
            "next occurrence after {}",
            case.current_due
        );
    }
}

#[test]
fn import_fingerprints_match_the_contract() {
    let vector = vector();

    for case in &vector.expected.fingerprints {
        let fingerprint = row_fingerprint(&SourceRow {
            account_id: &case.row.account_id,
            local_date: &case.row.local_date,
            description: &case.row.description,
            amount_minor: case.row.amount_minor,
        });
        assert_eq!(
            fingerprint, case.fingerprint,
            "fingerprint for {}",
            case.row.description
        );
    }

    for case in &vector.expected.batch_hashes {
        assert_eq!(
            batch_content_hash(&case.file_name, &case.fingerprints),
            case.hash
        );
    }
}

#[test]
fn london_wall_clock_matches_the_contract() {
    let vector = vector();

    for case in &vector.expected.zoned_times {
        assert_eq!(
            zoned_date(&case.instant).expect("a valid instant"),
            case.local_date
        );
        assert_eq!(
            zoned_time(&case.instant).expect("a valid instant"),
            case.local_time
        );
    }

    for case in &vector.expected.instants {
        assert_eq!(
            instant_at(&case.local_date, &case.time_of_day).expect("a valid wall clock reading"),
            case.instant
        );
    }
}

#[test]
fn reference_list_order_matches_the_contract() {
    let vector = vector();

    let mut accounts = vector.accounts.clone();
    sort_accounts(&mut accounts);
    assert_eq!(
        accounts
            .iter()
            .map(|account| account.id.clone())
            .collect::<Vec<_>>(),
        vector.expected.reference_order.account_ids
    );

    let mut categories = vector.categories.clone();
    sort_categories(&mut categories);
    assert_eq!(
        categories
            .iter()
            .map(|category| category.id.clone())
            .collect::<Vec<_>>(),
        vector.expected.reference_order.category_ids
    );
}

#[test]
fn the_vector_carries_the_schedules_the_contract_defines() {
    let vector = vector();
    assert!(!vector.schedules.is_empty());
    assert!(
        vector
            .schedules
            .iter()
            .all(|schedule| schedule.currency == turtle_tally_domain::types::Currency::Gbp)
    );
}

fn rollup_for(vector: &Vector, month: &Month) -> turtle_tally_domain::rollup::MonthlyRollup {
    turtle_tally_domain::rollup::rebuild_month(month, &vector.transactions)
}

#[test]
fn a_rollup_serves_the_same_dashboard_as_the_ledger() {
    let vector = vector();

    for case in &vector.expected.dashboards {
        let current = rollup_for(&vector, &case.month);
        let previous = rollup_for(&vector, &case.month.previous());
        let recent = active_within(
            &vector.transactions,
            &case.month.first_day(),
            &case.month.last_day(),
        );

        let summary = summarise_from_rollups(&RollupSummaryInput {
            today: &vector.today,
            as_of: &vector.now,
            current: &current,
            previous: &previous,
            budgets: &vector.budgets,
            budget_defaults: &vector.budget_defaults,
            categories: &vector.categories,
            recent_transactions: &recent,
        })
        .expect("the fixtures resolve every category");

        assert_eq!(
            summary, case.summary,
            "rollup-served dashboard for {}",
            case.month
        );
    }
}

#[test]
fn incremental_maintenance_matches_a_rebuild() {
    let vector = vector();
    let month = Month::parse("2026-08").expect("a valid month");
    let mut rollup = MonthlyRollup::empty(month.clone());
    let mut ledger: Vec<Transaction> = Vec::new();

    for transaction in vector
        .transactions
        .iter()
        .filter(|entry| month.contains(&entry.local_date))
    {
        if !transaction.is_active() {
            continue;
        }
        for delta in deltas_for_create(transaction) {
            if delta.month == month {
                rollup.apply(&delta);
            }
        }
        ledger.push(transaction.clone());
        assert_eq!(
            rollup,
            rebuild_month(&month, &ledger),
            "after adding {}",
            transaction.id
        );
    }

    // An edit is a reversal and an addition, and a void is a reversal alone.
    let mut edited = ledger
        .first()
        .cloned()
        .expect("the fixture month has a ledger");
    let before = edited.clone();
    edited.amount_minor -= 1_234;
    edited.category_id = None;
    edited.local_date = LocalDate::parse("2026-08-02").expect("a valid date");
    for delta in deltas_for_update(&before, &edited) {
        if delta.month == month {
            rollup.apply(&delta);
        }
    }
    ledger[0] = edited.clone();
    assert_eq!(rollup, rebuild_month(&month, &ledger));

    for delta in deltas_for_void(&edited) {
        if delta.month == month {
            rollup.apply(&delta);
        }
    }
    ledger.remove(0);
    assert_eq!(rollup, rebuild_month(&month, &ledger));
}

#[test]
fn an_edit_that_moves_a_month_produces_one_delta_for_each() {
    let vector = vector();
    let before = vector
        .transactions
        .iter()
        .find(|transaction| transaction.is_active())
        .cloned()
        .expect("the fixtures carry an active transaction");
    let mut after = before.clone();
    after.local_date = LocalDate::parse("2026-07-04").expect("a valid date");

    let deltas = deltas_for_update(&before, &after);
    assert_eq!(deltas.len(), 2);
    assert_eq!(
        deltas
            .iter()
            .map(|delta| delta.transaction_count)
            .sum::<i64>(),
        0
    );
    assert!(
        deltas
            .iter()
            .any(|delta| delta.month == before.local_date.month())
    );
    assert!(
        deltas
            .iter()
            .any(|delta| delta.month == after.local_date.month())
    );
}

#[test]
fn a_batch_commits_one_delta_for_each_month_it_touches() {
    let vector = vector();
    let batch: Vec<Transaction> = vector
        .transactions
        .iter()
        .filter(|entry| entry.is_active())
        .cloned()
        .collect();
    let deltas = deltas_for_batch(&batch);

    let months: Vec<Month> = batch
        .iter()
        .map(|transaction| transaction.local_date.month())
        .collect();
    let distinct: std::collections::BTreeSet<String> =
        months.iter().map(ToString::to_string).collect();
    assert_eq!(deltas.len(), distinct.len());

    for delta in &deltas {
        let mut rollup = MonthlyRollup::empty(delta.month.clone());
        rollup.apply(delta);
        assert_eq!(
            rollup,
            rebuild_month(&delta.month, &batch),
            "batch delta for {}",
            delta.month
        );
    }
}
