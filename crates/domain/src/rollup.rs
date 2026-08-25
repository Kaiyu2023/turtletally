use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::aggregates::{
    BudgetProgressInput, SpendingByCategory, budget_progress, category_spending, comparison,
};
use crate::calendar::{LocalDate, Month};
use crate::error::DomainResult;
use crate::types::{
    Budget, BudgetDefault, Category, DailySpending, DashboardSummary, Transaction, TransactionKind,
};

/// A transaction with no category still spends money, and a rollup map needs a
/// key for it. Category identifiers are server-issued and prefixed, so this
/// cannot collide with one.
pub const UNCATEGORISED_KEY: &str = "UNCATEGORISED";

const RECENT_TRANSACTION_COUNT: usize = 6;

/// ADR 0007: one derived item per owner and month, maintained inside the same
/// transaction that writes the ledger row, so a mutation and its aggregate
/// commit or fail together.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MonthlyRollup {
    pub month: Month,
    pub income_minor: i64,
    pub spending_minor: i64,
    pub investment_credits_minor: i64,
    pub investment_debits_minor: i64,
    pub net_cash_flow_minor: i64,
    pub transaction_count: i64,
    pub spending_by_category: BTreeMap<String, i64>,
    pub daily_spending: BTreeMap<u32, i64>,
}

/// The signed change a single mutation makes to one month. Storage applies it
/// with atomic addition, which is why every field is a difference rather than a
/// value.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RollupDelta {
    pub month: Month,
    pub income_minor: i64,
    pub spending_minor: i64,
    pub investment_credits_minor: i64,
    pub investment_debits_minor: i64,
    pub net_cash_flow_minor: i64,
    pub transaction_count: i64,
    pub spending_by_category: BTreeMap<String, i64>,
    pub daily_spending: BTreeMap<u32, i64>,
}

impl MonthlyRollup {
    pub fn empty(month: Month) -> Self {
        Self {
            month,
            income_minor: 0,
            spending_minor: 0,
            investment_credits_minor: 0,
            investment_debits_minor: 0,
            net_cash_flow_minor: 0,
            transaction_count: 0,
            spending_by_category: BTreeMap::new(),
            daily_spending: BTreeMap::new(),
        }
    }

    pub fn apply(&mut self, delta: &RollupDelta) {
        self.income_minor += delta.income_minor;
        self.spending_minor += delta.spending_minor;
        self.investment_credits_minor += delta.investment_credits_minor;
        self.investment_debits_minor += delta.investment_debits_minor;
        self.net_cash_flow_minor += delta.net_cash_flow_minor;
        self.transaction_count += delta.transaction_count;
        add_into(&mut self.spending_by_category, &delta.spending_by_category);
        add_into(&mut self.daily_spending, &delta.daily_spending);
    }

    pub fn spent_by_category(&self) -> SpendingByCategory {
        let mut spending = SpendingByCategory::default();
        for (key, amount) in &self.spending_by_category {
            let category_id = if key == UNCATEGORISED_KEY {
                None
            } else {
                Some(key.as_str())
            };
            spending.add(category_id, *amount);
        }
        spending
    }

    fn spending_on(&self, date: &LocalDate) -> i64 {
        if date.month() != self.month {
            return 0;
        }
        self.daily_spending
            .get(&date.day())
            .copied()
            .unwrap_or_default()
    }
}

impl RollupDelta {
    /// `sign` is `1` to add a transaction to its month and `-1` to reverse it.
    /// An edit is a reversal of the old value and an addition of the new one,
    /// which is also what moves a transaction between months.
    pub fn of(transaction: &Transaction, sign: i64) -> Self {
        let amount = transaction.amount_minor * sign;
        let spending = if transaction.kind == TransactionKind::Spending {
            -amount
        } else {
            0
        };

        let mut spending_by_category = BTreeMap::new();
        let mut daily_spending = BTreeMap::new();
        if spending != 0 {
            let key = transaction
                .category_id
                .clone()
                .unwrap_or_else(|| UNCATEGORISED_KEY.to_owned());
            spending_by_category.insert(key, spending);
            daily_spending.insert(transaction.local_date.day(), spending);
        }

        Self {
            month: transaction.local_date.month(),
            income_minor: if transaction.kind == TransactionKind::Income {
                amount
            } else {
                0
            },
            spending_minor: spending,
            investment_credits_minor: if transaction.kind == TransactionKind::Investment
                && transaction.amount_minor > 0
            {
                amount
            } else {
                0
            },
            investment_debits_minor: if transaction.kind == TransactionKind::Investment
                && transaction.amount_minor < 0
            {
                -amount
            } else {
                0
            },
            net_cash_flow_minor: amount,
            transaction_count: sign,
            spending_by_category,
            daily_spending,
        }
    }

    pub fn merge(&mut self, other: &Self) {
        self.income_minor += other.income_minor;
        self.spending_minor += other.spending_minor;
        self.investment_credits_minor += other.investment_credits_minor;
        self.investment_debits_minor += other.investment_debits_minor;
        self.net_cash_flow_minor += other.net_cash_flow_minor;
        self.transaction_count += other.transaction_count;
        add_into(&mut self.spending_by_category, &other.spending_by_category);
        add_into(&mut self.daily_spending, &other.daily_spending);
    }
}

pub fn deltas_for_create(transaction: &Transaction) -> Vec<RollupDelta> {
    vec![RollupDelta::of(transaction, 1)]
}

pub fn deltas_for_void(transaction: &Transaction) -> Vec<RollupDelta> {
    vec![RollupDelta::of(transaction, -1)]
}

pub fn deltas_for_update(before: &Transaction, after: &Transaction) -> Vec<RollupDelta> {
    combine(vec![RollupDelta::of(before, -1), RollupDelta::of(after, 1)])
}

/// An import commits one pre-summed delta per month rather than one per row.
pub fn deltas_for_batch(transactions: &[Transaction]) -> Vec<RollupDelta> {
    combine(
        transactions
            .iter()
            .map(|transaction| RollupDelta::of(transaction, 1))
            .collect(),
    )
}

/// Recompute a month from the ledger. ADR 0007 makes this the control that a
/// missed delta is repairable rather than permanent.
pub fn rebuild_month(month: &Month, transactions: &[Transaction]) -> MonthlyRollup {
    let mut rollup = MonthlyRollup::empty(month.clone());
    for transaction in transactions {
        if !transaction.is_active() || !month.contains(&transaction.local_date) {
            continue;
        }
        rollup.apply(&RollupDelta::of(transaction, 1));
    }
    rollup
}

pub struct RollupSummaryInput<'a> {
    pub today: &'a LocalDate,
    pub as_of: &'a str,
    pub current: &'a MonthlyRollup,
    pub previous: &'a MonthlyRollup,
    pub budgets: &'a [Budget],
    pub budget_defaults: &'a [BudgetDefault],
    pub categories: &'a [Category],
    pub recent_transactions: &'a [Transaction],
}

/// Serve the overview from the current and previous rollup items rather than a
/// ledger query. The only ledger read left is the short list of recent rows the
/// contract shows, which is bounded by its own limit.
pub fn summarise_from_rollups(input: &RollupSummaryInput<'_>) -> DomainResult<DashboardSummary> {
    let month = &input.current.month;
    let spent_by_category = input.current.spent_by_category();

    let budgets = budget_progress(&BudgetProgressInput {
        month,
        budgets: input.budgets,
        budget_defaults: input.budget_defaults,
        categories: input.categories,
        spent_by_category: &spent_by_category,
    })?;
    let budget_total_minor: i64 = budgets.iter().map(|budget| budget.limit_minor).sum();
    let budgeted_spending_minor: i64 = budgets.iter().map(|budget| budget.spent_minor).sum();

    let last_comparable_date = if month == &input.today.month() {
        input.today.add_days(-1)
    } else {
        month.last_day()
    };
    let current_week_start = last_comparable_date.add_days(-6);
    let previous_week_end = current_week_start.add_days(-1);
    let previous_week_start = previous_week_end.add_days(-6);

    let mut recent_transactions = input.recent_transactions.to_vec();
    recent_transactions.sort_by(|left, right| {
        right
            .occurred_at
            .cmp(&left.occurred_at)
            .then_with(|| right.id.cmp(&left.id))
    });
    recent_transactions.truncate(RECENT_TRANSACTION_COUNT);

    let final_date = if month == &input.today.month() {
        input.today.clone()
    } else {
        month.last_day()
    };
    let daily_spending = (1..=final_date.day())
        .map(|day| DailySpending {
            date: LocalDate::from_naive(
                chrono::NaiveDate::from_ymd_opt(month.year(), month.number(), day)
                    .expect("a day inside the month exists"),
            ),
            amount_minor: input
                .current
                .daily_spending
                .get(&day)
                .copied()
                .unwrap_or_default(),
        })
        .collect();

    Ok(DashboardSummary {
        month: month.clone(),
        as_of: input.as_of.to_owned(),
        income_minor: input.current.income_minor,
        spending_minor: input.current.spending_minor,
        investment_credits_minor: input.current.investment_credits_minor,
        investment_debits_minor: input.current.investment_debits_minor,
        net_cash_flow_minor: input.current.net_cash_flow_minor,
        budget_total_minor,
        budgeted_spending_minor,
        budget_remaining_minor: budget_total_minor - budgeted_spending_minor,
        uncategorised_spending_minor: spent_by_category.get(None),
        transaction_count: usize::try_from(input.current.transaction_count).unwrap_or_default(),
        week_over_week: comparison(
            spending_between(input, &current_week_start, &last_comparable_date),
            spending_between(input, &previous_week_start, &previous_week_end),
        ),
        month_over_month: comparison(input.current.spending_minor, input.previous.spending_minor),
        daily_spending,
        spending_by_category: category_spending(&spent_by_category, input.categories)?,
        budgets,
        recent_transactions,
    })
}

/// A comparison window reaches at most thirteen days back, so the current and
/// previous rollups always cover it.
fn spending_between(input: &RollupSummaryInput<'_>, from: &LocalDate, to: &LocalDate) -> i64 {
    let mut date = from.clone();
    let mut total = 0;
    while &date <= to {
        total += input.current.spending_on(&date) + input.previous.spending_on(&date);
        date = date.add_days(1);
    }
    total
}

fn combine(deltas: Vec<RollupDelta>) -> Vec<RollupDelta> {
    let mut combined: Vec<RollupDelta> = Vec::new();
    for delta in deltas {
        match combined
            .iter_mut()
            .find(|existing| existing.month == delta.month)
        {
            Some(existing) => existing.merge(&delta),
            None => combined.push(delta),
        }
    }
    combined
}

fn add_into<Key: Ord + Clone>(target: &mut BTreeMap<Key, i64>, source: &BTreeMap<Key, i64>) {
    for (key, amount) in source {
        let running = target.entry(key.clone()).or_default();
        *running += *amount;
        if *running == 0 {
            target.remove(key);
        }
    }
}
