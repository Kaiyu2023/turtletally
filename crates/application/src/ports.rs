use std::future::Future;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use turtle_tally_domain::calendar::{LocalDate, Month};
use turtle_tally_domain::error::DomainResult;
use turtle_tally_domain::rollup::{MonthlyRollup, RollupDelta};
use turtle_tally_domain::types::{
    Account, Budget, BudgetDefault, Category, Receipt, Schedule, Transaction, UploadMediaType,
    UserPreferences,
};

/// The authenticated Cognito subject. Every stored record is partitioned by it,
/// so an owner is required to reach any of them.
#[derive(Clone, Debug, Eq, PartialEq, Hash)]
pub struct Owner(String);

impl Owner {
    pub fn new(subject: impl Into<String>) -> Self {
        Self(subject.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Actor {
    Browser,
    Assistant,
    Scheduler,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AuditAction {
    AccountCreated,
    AccountUpdated,
    AccountDeactivated,
    CategoryCreated,
    CategoryUpdated,
    CategoryDeactivated,
    BudgetSet,
    BudgetDefaultSet,
    ScheduleCreated,
    ScheduleUpdated,
    ScheduleDeactivated,
    ScheduleRun,
    TransactionCreated,
    TransactionUpdated,
    TransactionVoided,
    PreferencesUpdated,
    ReceiptAttached,
}

/// Append-only and server-internal (ADR 0003). No endpoint returns these, so
/// what they record can change without breaking the contract.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEvent {
    pub id: String,
    pub recorded_at: String,
    pub action: AuditAction,
    pub actor: Actor,
    pub entity_id: String,
    pub entity_version: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BalanceDelta {
    pub account_id: String,
    pub amount_minor: i64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TransactionWrite {
    pub transaction: Transaction,
    pub expected_version: Option<u32>,
}

/// One atomic unit: the ledger rows, the rollup deltas they imply, the account
/// balances they move, and the audit events that record them. ADR 0007 requires
/// that a mutation and its aggregate commit or fail together.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct LedgerWrite {
    pub transactions: Vec<TransactionWrite>,
    pub rollup_deltas: Vec<RollupDelta>,
    pub balance_deltas: Vec<BalanceDelta>,
    pub schedules: Vec<ScheduleWrite>,
    pub audit: Vec<AuditEvent>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScheduleWrite {
    pub schedule: Schedule,
    pub expected_version: Option<u32>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingUpload {
    pub id: String,
    pub key: String,
    pub file_name: String,
    pub media_type: UploadMediaType,
    pub size_bytes: u64,
    pub expires_at: String,
}

/// Every mutation carries its audit event so a store can commit the two
/// together, which is what ADR 0003 requires.
pub struct EntityWrite<'a, T> {
    pub entity: &'a T,
    pub expected_version: Option<u32>,
    pub audit: &'a AuditEvent,
}

pub trait FinanceStore: Send + Sync {
    fn preferences(
        &self,
        owner: &Owner,
    ) -> impl Future<Output = DomainResult<Option<UserPreferences>>> + Send;
    fn put_preferences(
        &self,
        owner: &Owner,
        write: EntityWrite<'_, UserPreferences>,
    ) -> impl Future<Output = DomainResult<()>> + Send;

    fn accounts(&self, owner: &Owner) -> impl Future<Output = DomainResult<Vec<Account>>> + Send;
    fn put_account(
        &self,
        owner: &Owner,
        write: EntityWrite<'_, Account>,
    ) -> impl Future<Output = DomainResult<()>> + Send;

    fn categories(&self, owner: &Owner)
    -> impl Future<Output = DomainResult<Vec<Category>>> + Send;
    fn put_category(
        &self,
        owner: &Owner,
        write: EntityWrite<'_, Category>,
    ) -> impl Future<Output = DomainResult<()>> + Send;

    fn budgets(
        &self,
        owner: &Owner,
        month: &Month,
    ) -> impl Future<Output = DomainResult<Vec<Budget>>> + Send;
    fn put_budget(
        &self,
        owner: &Owner,
        write: EntityWrite<'_, Budget>,
    ) -> impl Future<Output = DomainResult<()>> + Send;

    fn budget_defaults(
        &self,
        owner: &Owner,
    ) -> impl Future<Output = DomainResult<Vec<BudgetDefault>>> + Send;
    fn put_budget_default(
        &self,
        owner: &Owner,
        write: EntityWrite<'_, BudgetDefault>,
    ) -> impl Future<Output = DomainResult<()>> + Send;

    fn schedules(&self, owner: &Owner) -> impl Future<Output = DomainResult<Vec<Schedule>>> + Send;
    fn put_schedule(
        &self,
        owner: &Owner,
        write: EntityWrite<'_, Schedule>,
    ) -> impl Future<Output = DomainResult<()>> + Send;

    fn transaction(
        &self,
        owner: &Owner,
        id: &str,
    ) -> impl Future<Output = DomainResult<Option<Transaction>>> + Send;

    /// One bounded window per request (ADR 0007). The caller names the range.
    fn transactions_between(
        &self,
        owner: &Owner,
        from: &LocalDate,
        to: &LocalDate,
    ) -> impl Future<Output = DomainResult<Vec<Transaction>>> + Send;

    fn recent_transactions(
        &self,
        owner: &Owner,
        month: &Month,
        limit: u32,
    ) -> impl Future<Output = DomainResult<Vec<Transaction>>> + Send;

    fn rollup(
        &self,
        owner: &Owner,
        month: &Month,
    ) -> impl Future<Output = DomainResult<MonthlyRollup>> + Send;

    fn commit_ledger(
        &self,
        owner: &Owner,
        write: &LedgerWrite,
    ) -> impl Future<Output = DomainResult<()>> + Send;

    fn rebuild_rollup(
        &self,
        owner: &Owner,
        month: &Month,
    ) -> impl Future<Output = DomainResult<MonthlyRollup>> + Send;

    fn receipt(
        &self,
        owner: &Owner,
        id: &str,
    ) -> impl Future<Output = DomainResult<Option<Receipt>>> + Send;
    fn put_receipt(
        &self,
        owner: &Owner,
        write: EntityWrite<'_, Receipt>,
    ) -> impl Future<Output = DomainResult<()>> + Send;

    fn put_pending_upload(
        &self,
        owner: &Owner,
        upload: &PendingUpload,
    ) -> impl Future<Output = DomainResult<()>> + Send;

    /// Single use: an upload grant that has been redeemed cannot be redeemed
    /// again.
    fn take_pending_upload(
        &self,
        owner: &Owner,
        id: &str,
    ) -> impl Future<Output = DomainResult<Option<PendingUpload>>> + Send;
}

pub struct GrantedUrl {
    pub url: String,
    pub expires_at: DateTime<Utc>,
}

/// Bytes never pass through the API (ADR 0003): the client writes to a granted
/// URL and the server verifies what the store actually holds.
pub trait ObjectStore: Send + Sync {
    fn upload_grant(
        &self,
        key: &str,
        media_type: UploadMediaType,
        size_bytes: u64,
    ) -> impl Future<Output = DomainResult<GrantedUrl>> + Send;

    fn download_grant(&self, key: &str) -> impl Future<Output = DomainResult<GrantedUrl>> + Send;

    fn stored_checksum(
        &self,
        key: &str,
    ) -> impl Future<Output = DomainResult<Option<String>>> + Send;
}

pub trait Clock: Send + Sync {
    fn now(&self) -> DateTime<Utc>;
}

pub trait IdSource: Send + Sync {
    fn next(&self, prefix: &str) -> String;
}

pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> DateTime<Utc> {
        Utc::now()
    }
}

/// Version 7 identifiers sort by creation time, which keeps a stored key's
/// ordering close to the order records were written.
pub struct UuidIdSource;

impl IdSource for UuidIdSource {
    fn next(&self, prefix: &str) -> String {
        format!("{prefix}-{}", uuid::Uuid::now_v7())
    }
}
