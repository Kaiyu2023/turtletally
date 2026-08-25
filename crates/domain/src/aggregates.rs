use crate::calendar::{LocalDate, Month};
use crate::error::{DomainError, DomainResult};
use crate::types::{
    Budget, BudgetDefault, BudgetProgress, Category, CategorySpending, ComparisonDirection,
    DailySpending, DashboardSummary, SpendingComparison, Transaction, TransactionKind,
};

const UNCATEGORISED_COLOUR: &str = "#a8adb7";
const UNCATEGORISED_NAME: &str = "Uncategorised";
const RECENT_TRANSACTION_COUNT: usize = 6;

/// Spending per category in the order the categories were first seen, which is
/// the insertion order the TypeScript `Map` preserves. Ordering matters because
/// the sorts that follow are stable and tie on equal amounts.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct SpendingByCategory(Vec<(Option<String>, i64)>);

impl SpendingByCategory {
    pub fn get(&self, category_id: Option<&str>) -> i64 {
        self.0
            .iter()
            .find(|(key, _)| key.as_deref() == category_id)
            .map_or(0, |(_, amount)| *amount)
    }

    pub fn entries(&self) -> &[(Option<String>, i64)] {
        &self.0
    }

    pub fn add(&mut self, category_id: Option<&str>, amount_minor: i64) {
        match self
            .0
            .iter_mut()
            .find(|(key, _)| key.as_deref() == category_id)
        {
            Some((_, running)) => *running += amount_minor,
            None => self.0.push((category_id.map(str::to_owned), amount_minor)),
        }
    }
}

/// Amounts are signed, so a total is a plain sum. Spending and investment read
/// naturally as positive magnitudes, which is the only place a sign is flipped.
pub fn total_by_kind(transactions: &[Transaction], kind: TransactionKind) -> i64 {
    let total: i64 = transactions
        .iter()
        .filter(|transaction| transaction.kind == kind)
        .map(|transaction| transaction.amount_minor)
        .sum();
    if kind == TransactionKind::Income {
        total
    } else {
        -total
    }
}

pub fn total_amount(transactions: &[Transaction]) -> i64 {
    transactions
        .iter()
        .map(|transaction| transaction.amount_minor)
        .sum()
}

pub fn spending_within(transactions: &[Transaction], from: &LocalDate, to: &LocalDate) -> i64 {
    let within: Vec<Transaction> = transactions
        .iter()
        .filter(|transaction| &transaction.local_date >= from && &transaction.local_date <= to)
        .cloned()
        .collect();
    total_by_kind(&within, TransactionKind::Spending)
}

pub fn spending_by_category(transactions: &[Transaction]) -> SpendingByCategory {
    let mut totals = SpendingByCategory::default();
    for transaction in transactions {
        if transaction.kind != TransactionKind::Spending {
            continue;
        }
        totals.add(
            transaction.category_id.as_deref(),
            -transaction.amount_minor,
        );
    }
    totals
}

pub fn comparison(current_minor: i64, previous_minor: i64) -> SpendingComparison {
    if previous_minor == 0 {
        return SpendingComparison {
            current_minor,
            previous_minor,
            change_percent: None,
            direction: ComparisonDirection::NotComparable,
        };
    }

    let change_percent =
        js_round((current_minor - previous_minor) as f64 / previous_minor as f64 * 1_000.0) / 10.0;
    let direction = if change_percent == 0.0 {
        ComparisonDirection::Flat
    } else if change_percent > 0.0 {
        ComparisonDirection::Up
    } else {
        ComparisonDirection::Down
    };

    SpendingComparison {
        current_minor,
        previous_minor,
        change_percent: Some(change_percent),
        direction,
    }
}

pub fn daily_spending(
    month: &Month,
    today: &LocalDate,
    transactions: &[Transaction],
) -> Vec<DailySpending> {
    let final_date = if month == &today.month() {
        today.clone()
    } else {
        month.last_day()
    };
    let mut totals: Vec<(LocalDate, i64)> = Vec::new();

    for transaction in transactions {
        if transaction.kind != TransactionKind::Spending {
            continue;
        }
        match totals
            .iter_mut()
            .find(|(date, _)| date == &transaction.local_date)
        {
            Some((_, running)) => *running -= transaction.amount_minor,
            None => totals.push((transaction.local_date.clone(), -transaction.amount_minor)),
        }
    }

    (1..=final_date.day())
        .map(|day| {
            let date = LocalDate::from_naive(
                chrono::NaiveDate::from_ymd_opt(month.year(), month.number(), day)
                    .expect("a day inside the month exists"),
            );
            let amount_minor = totals
                .iter()
                .find(|(known, _)| known == &date)
                .map_or(0, |(_, amount)| *amount);
            DailySpending { date, amount_minor }
        })
        .collect()
}

pub fn category_spending(
    spent_by_category: &SpendingByCategory,
    categories: &[Category],
) -> DomainResult<Vec<CategorySpending>> {
    let mut rows = Vec::with_capacity(spent_by_category.entries().len());

    for (category_id, amount_minor) in spent_by_category.entries() {
        let category = match category_id {
            Some(id) => Some(require_category(categories, id)?),
            None => None,
        };
        rows.push(CategorySpending {
            category_id: category_id.clone(),
            category_name: category
                .map_or_else(|| UNCATEGORISED_NAME.to_owned(), |found| found.name.clone()),
            colour: category.map_or_else(
                || UNCATEGORISED_COLOUR.to_owned(),
                |found| found.colour.clone(),
            ),
            amount_minor: *amount_minor,
        });
    }

    rows.sort_by(|left, right| {
        right.amount_minor.cmp(&left.amount_minor).then_with(|| {
            left.category_id
                .as_deref()
                .unwrap_or_default()
                .cmp(right.category_id.as_deref().unwrap_or_default())
        })
    });
    Ok(rows)
}

pub struct BudgetProgressInput<'a> {
    pub month: &'a Month,
    pub budgets: &'a [Budget],
    pub budget_defaults: &'a [BudgetDefault],
    pub categories: &'a [Category],
    pub spent_by_category: &'a SpendingByCategory,
}

pub fn budget_progress(input: &BudgetProgressInput<'_>) -> DomainResult<Vec<BudgetProgress>> {
    struct Row {
        id: String,
        category_id: String,
        limit_minor: i64,
        version: Option<u32>,
    }

    let mut rows: Vec<Row> = input
        .budgets
        .iter()
        .filter(|budget| &budget.month == input.month)
        .map(|budget| Row {
            id: budget.id.clone(),
            category_id: budget.category_id.clone(),
            limit_minor: budget.limit_minor,
            version: Some(budget.version),
        })
        .collect();

    for budget_default in input.budget_defaults {
        if rows
            .iter()
            .any(|row| row.category_id == budget_default.category_id)
        {
            continue;
        }
        rows.push(Row {
            id: format!("budget-{}-{}", input.month, budget_default.category_id),
            category_id: budget_default.category_id.clone(),
            limit_minor: budget_default.limit_minor,
            version: None,
        });
    }

    let mut progress = Vec::with_capacity(rows.len());
    for row in rows {
        let category = require_category(input.categories, &row.category_id)?;
        let spent_minor = input.spent_by_category.get(Some(&row.category_id));
        progress.push(BudgetProgress {
            id: row.id,
            month: input.month.clone(),
            category_id: row.category_id,
            limit_minor: row.limit_minor,
            version: row.version,
            category_name: category.name.clone(),
            colour: category.colour.clone(),
            spent_minor,
            remaining_minor: row.limit_minor - spent_minor,
            percent_used: percent_used(spent_minor, row.limit_minor),
        });
    }

    progress.sort_by(|left, right| {
        right
            .spent_minor
            .cmp(&left.spent_minor)
            .then_with(|| left.category_id.cmp(&right.category_id))
    });
    Ok(progress)
}

pub struct LedgerWindow {
    pub from: LocalDate,
    pub to: LocalDate,
}

/// One bounded window per request (ADR 0007): everything the dashboard shows is
/// derived from a single read of this range.
pub fn ledger_window_for(month: &Month, today: &LocalDate) -> LedgerWindow {
    let windows = comparison_windows(month, today);
    let prior_month_start = month.previous().first_day();
    let from = if windows.previous_week_start < prior_month_start {
        windows.previous_week_start
    } else {
        prior_month_start
    };
    LedgerWindow {
        from,
        to: windows.month_end,
    }
}

pub struct MonthSummaryInput<'a> {
    pub month: &'a Month,
    pub today: &'a LocalDate,
    pub as_of: &'a str,
    pub ledger_window: &'a [Transaction],
    pub budgets: &'a [Budget],
    pub budget_defaults: &'a [BudgetDefault],
    pub categories: &'a [Category],
}

pub fn summarise_month(input: &MonthSummaryInput<'_>) -> DomainResult<DashboardSummary> {
    let month = input.month;
    let prior_month = month.previous();
    let windows = comparison_windows(month, input.today);

    let transactions: Vec<Transaction> = input
        .ledger_window
        .iter()
        .filter(|transaction| month.contains(&transaction.local_date))
        .cloned()
        .collect();
    let prior_month_transactions: Vec<Transaction> = input
        .ledger_window
        .iter()
        .filter(|transaction| prior_month.contains(&transaction.local_date))
        .cloned()
        .collect();
    let spent_by_category = spending_by_category(&transactions);

    let spending_minor = total_by_kind(&transactions, TransactionKind::Spending);
    let budgets = budget_progress(&BudgetProgressInput {
        month,
        budgets: input.budgets,
        budget_defaults: input.budget_defaults,
        categories: input.categories,
        spent_by_category: &spent_by_category,
    })?;
    let budget_total_minor: i64 = budgets.iter().map(|budget| budget.limit_minor).sum();
    let budgeted_spending_minor: i64 = budgets.iter().map(|budget| budget.spent_minor).sum();

    let investment_credits: Vec<Transaction> = transactions
        .iter()
        .filter(|transaction| {
            transaction.kind == TransactionKind::Investment && transaction.amount_minor > 0
        })
        .cloned()
        .collect();
    let investment_debits: Vec<Transaction> = transactions
        .iter()
        .filter(|transaction| {
            transaction.kind == TransactionKind::Investment && transaction.amount_minor < 0
        })
        .cloned()
        .collect();

    let mut recent_transactions = transactions.clone();
    recent_transactions.sort_by(|left, right| {
        right
            .occurred_at
            .cmp(&left.occurred_at)
            .then_with(|| right.id.cmp(&left.id))
    });
    recent_transactions.truncate(RECENT_TRANSACTION_COUNT);

    Ok(DashboardSummary {
        month: month.clone(),
        as_of: input.as_of.to_owned(),
        income_minor: total_by_kind(&transactions, TransactionKind::Income),
        spending_minor,
        investment_credits_minor: total_amount(&investment_credits),
        investment_debits_minor: -total_amount(&investment_debits),
        net_cash_flow_minor: total_amount(&transactions),
        budget_total_minor,
        budgeted_spending_minor,
        budget_remaining_minor: budget_total_minor - budgeted_spending_minor,
        uncategorised_spending_minor: spent_by_category.get(None),
        transaction_count: transactions.len(),
        week_over_week: comparison(
            spending_within(
                input.ledger_window,
                &windows.current_week_start,
                &windows.last_comparable_date,
            ),
            spending_within(
                input.ledger_window,
                &windows.previous_week_start,
                &windows.previous_week_end,
            ),
        ),
        month_over_month: comparison(
            spending_minor,
            total_by_kind(&prior_month_transactions, TransactionKind::Spending),
        ),
        daily_spending: daily_spending(month, input.today, &transactions),
        spending_by_category: category_spending(&spent_by_category, input.categories)?,
        budgets,
        recent_transactions,
    })
}

struct ComparisonWindows {
    month_end: LocalDate,
    last_comparable_date: LocalDate,
    current_week_start: LocalDate,
    previous_week_end: LocalDate,
    previous_week_start: LocalDate,
}

fn comparison_windows(month: &Month, today: &LocalDate) -> ComparisonWindows {
    let month_end = month.last_day();
    let last_comparable_date = if month == &today.month() {
        today.add_days(-1)
    } else {
        month_end.clone()
    };
    let current_week_start = last_comparable_date.add_days(-6);
    let previous_week_end = current_week_start.add_days(-1);
    let previous_week_start = previous_week_end.add_days(-6);
    ComparisonWindows {
        month_end,
        last_comparable_date,
        current_week_start,
        previous_week_end,
        previous_week_start,
    }
}

fn require_category<'a>(categories: &'a [Category], id: &str) -> DomainResult<&'a Category> {
    categories
        .iter()
        .find(|category| category.id == id)
        .ok_or_else(|| DomainError::not_found("Category not found."))
}

fn percent_used(spent_minor: i64, limit_minor: i64) -> i64 {
    if limit_minor == 0 {
        return if spent_minor == 0 { 0 } else { 100 };
    }
    js_round(spent_minor as f64 / limit_minor as f64 * 100.0) as i64
}

/// JavaScript rounds a half upwards rather than away from zero, and the
/// contract's percentages are produced there.
fn js_round(value: f64) -> f64 {
    (value + 0.5).floor()
}
