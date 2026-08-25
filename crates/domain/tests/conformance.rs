use serde::Deserialize;
use turtle_tally_domain::aggregates::{
    BudgetProgressInput, MonthSummaryInput, ledger_window_for, spending_by_category,
    summarise_month,
};
use turtle_tally_domain::calendar::{LocalDate, Month};
use turtle_tally_domain::fingerprint::{SourceRow, batch_content_hash, row_fingerprint};
use turtle_tally_domain::recurrence::next_occurrence;
use turtle_tally_domain::reference::{sort_accounts, sort_categories};
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
