use serde::{Deserialize, Serialize};

use crate::calendar::{LocalDate, Month};

/// Every type here mirrors an exported type in `apps/web/src/data/types.ts`,
/// which ADR 0008 makes the source of truth. The committed conformance vector
/// is what proves the two definitions still agree.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub enum Currency {
    #[serde(rename = "GBP")]
    Gbp,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub enum AppLocale {
    #[serde(rename = "en-GB")]
    EnGb,
    #[serde(rename = "zh-CN")]
    ZhCn,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub enum Timezone {
    #[serde(rename = "Europe/London")]
    EuropeLondon,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AccountType {
    Current,
    CreditCard,
    Savings,
    Investment,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum CategoryGroup {
    Shopping,
    Rent,
    Utilities,
    Services,
    Tax,
    Transport,
    Income,
    Investment,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TransactionKind {
    Income,
    Spending,
    Investment,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TransactionFlow {
    Credit,
    Debit,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TransactionOrigin {
    Manual,
    Import,
    Schedule,
    Assistant,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TimePrecision {
    Date,
    Minute,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub enum UploadMediaType {
    #[serde(rename = "application/pdf")]
    ApplicationPdf,
    #[serde(rename = "image/jpeg")]
    ImageJpeg,
    #[serde(rename = "image/png")]
    ImagePng,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Weekday {
    Monday,
    Tuesday,
    Wednesday,
    Thursday,
    Friday,
    Saturday,
    Sunday,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EndOfMonthPolicy {
    Clamp,
    Skip,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ComparisonDirection {
    Up,
    Down,
    Flat,
    NotComparable,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UserPreferences {
    pub locale: AppLocale,
    pub version: u32,
    pub updated_at: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Account {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub account_type: AccountType,
    pub currency: Currency,
    pub balance_minor: i64,
    pub colour: String,
    pub deactivated_at: Option<String>,
    pub version: u32,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub group: CategoryGroup,
    pub colour: String,
    pub deactivated_at: Option<String>,
    pub version: u32,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Receipt {
    pub id: String,
    pub file_name: String,
    pub media_type: UploadMediaType,
    pub size_bytes: u64,
    pub checksum: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Transaction {
    pub id: String,
    pub account_id: String,
    pub account_name: String,
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub description: String,
    pub amount_minor: i64,
    pub currency: Currency,
    pub kind: TransactionKind,
    pub origin: TransactionOrigin,
    pub occurred_at: String,
    pub local_date: LocalDate,
    pub time_precision: TimePrecision,
    pub timezone: Timezone,
    pub schedule_id: Option<String>,
    pub occurrence_date: Option<LocalDate>,
    pub import_row_fingerprint: Option<String>,
    pub receipt: Option<Receipt>,
    pub voided_at: Option<String>,
    pub void_reason: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub version: u32,
}

impl Transaction {
    pub fn is_active(&self) -> bool {
        self.voided_at.is_none()
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Budget {
    pub id: String,
    pub month: Month,
    pub category_id: String,
    pub limit_minor: i64,
    pub version: u32,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BudgetDefault {
    pub id: String,
    pub category_id: String,
    pub limit_minor: i64,
    pub version: u32,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BudgetProgress {
    pub id: String,
    pub month: Month,
    pub category_id: String,
    pub limit_minor: i64,
    pub version: Option<u32>,
    pub category_name: String,
    pub colour: String,
    pub spent_minor: i64,
    pub remaining_minor: i64,
    pub percent_used: i64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "frequency",
    rename_all = "SCREAMING_SNAKE_CASE",
    rename_all_fields = "camelCase"
)]
pub enum ScheduleRecurrence {
    Once {
        date: LocalDate,
    },
    Weekly {
        weekday: Weekday,
        interval_weeks: u32,
    },
    Monthly {
        day: u32,
        end_of_month_policy: EndOfMonthPolicy,
    },
    Yearly {
        month: u32,
        day: u32,
        end_of_month_policy: EndOfMonthPolicy,
    },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Schedule {
    pub id: String,
    pub name: String,
    pub account_id: String,
    pub account_name: String,
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub description: String,
    pub amount_minor: i64,
    pub currency: Currency,
    pub kind: TransactionKind,
    pub recurrence: ScheduleRecurrence,
    pub next_due_date: Option<LocalDate>,
    pub last_generated_date: Option<LocalDate>,
    pub deactivated_at: Option<String>,
    pub version: u32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpendingComparison {
    pub current_minor: i64,
    pub previous_minor: i64,
    pub change_percent: Option<f64>,
    pub direction: ComparisonDirection,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DailySpending {
    pub date: LocalDate,
    pub amount_minor: i64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CategorySpending {
    pub category_id: Option<String>,
    pub category_name: String,
    pub colour: String,
    pub amount_minor: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DashboardSummary {
    pub month: Month,
    pub as_of: String,
    pub income_minor: i64,
    pub spending_minor: i64,
    pub investment_credits_minor: i64,
    pub investment_debits_minor: i64,
    pub net_cash_flow_minor: i64,
    pub budget_total_minor: i64,
    pub budgeted_spending_minor: i64,
    pub budget_remaining_minor: i64,
    pub uncategorised_spending_minor: i64,
    pub transaction_count: usize,
    pub week_over_week: SpendingComparison,
    pub month_over_month: SpendingComparison,
    pub daily_spending: Vec<DailySpending>,
    pub spending_by_category: Vec<CategorySpending>,
    pub budgets: Vec<BudgetProgress>,
    pub recent_transactions: Vec<Transaction>,
}
