use turtle_tally_domain::calendar::{LocalDate, Month};
use turtle_tally_domain::error::{DomainError, DomainResult};
use turtle_tally_domain::money::flow_of;
use turtle_tally_domain::paging::{
    DEFAULT_PAGE_LIMIT, LedgerCursor, is_after_cursor, sort_transactions, validate_limit,
};
use turtle_tally_domain::rollup::{
    RollupSummaryInput, deltas_for_create, deltas_for_update, deltas_for_void,
    summarise_from_rollups,
};
use turtle_tally_domain::time::{instant_at, reanchor};
use turtle_tally_domain::types::{
    CreateTransactionInput, Currency, DashboardSummary, TimePrecision, Timezone, Transaction,
    TransactionFilters, TransactionOrigin, TransactionPage, TransactionSort, TransactionStatus,
    UpdateTransactionInput,
};
use turtle_tally_domain::validation::{valid_amount, valid_name, valid_occurred_at};

use super::{FinanceService, assert_active, assert_version};
use crate::ports::{
    Actor, AuditAction, BalanceDelta, FinanceStore, LedgerWrite, ObjectStore, Owner,
    TransactionWrite,
};

const RECENT_TRANSACTION_COUNT: u32 = 6;
const NOON: &str = "12:00:00";

pub struct ScheduleIdentity {
    pub schedule_id: String,
    pub occurrence_date: LocalDate,
}

impl<S: FinanceStore, O: ObjectStore> FinanceService<S, O> {
    pub async fn list_transactions(
        &self,
        owner: &Owner,
        filters: &TransactionFilters,
    ) -> DomainResult<TransactionPage> {
        let limit = validate_limit(filters.limit.unwrap_or(DEFAULT_PAGE_LIMIT))?;
        let sort = filters.sort.unwrap_or(TransactionSort::Newest);
        let (from, to) = window_of(filters)?;
        let status = filters.status.unwrap_or(TransactionStatus::Active);
        let search = filters
            .search
            .as_ref()
            .map(|value| value.trim().to_lowercase());

        let window = self.store.transactions_between(owner, &from, &to).await?;
        let mut items: Vec<Transaction> = self
            .project(owner, window)
            .await?
            .into_iter()
            .filter(|transaction| matches(transaction, filters, status, search.as_deref()))
            .collect();

        sort_transactions(&mut items, sort);

        if let Some(value) = &filters.cursor {
            let cursor = LedgerCursor::parse(value, sort)?;
            items.retain(|transaction| is_after_cursor(transaction, &cursor, sort));
        }

        let has_more = items.len() > limit as usize;
        items.truncate(limit as usize);
        let next_cursor = if has_more {
            items
                .last()
                .map(|transaction| LedgerCursor::of(transaction, sort).encode())
        } else {
            None
        };

        Ok(TransactionPage {
            items,
            limit,
            next_cursor,
        })
    }

    pub async fn get_transaction(&self, owner: &Owner, id: &str) -> DomainResult<Transaction> {
        let transaction = self
            .store
            .transaction(owner, id)
            .await?
            .ok_or_else(|| DomainError::not_found("Transaction not found."))?;
        Ok(self.project(owner, vec![transaction]).await?.remove(0))
    }

    pub async fn create_transaction(
        &self,
        owner: &Owner,
        actor: Actor,
        input: &CreateTransactionInput,
    ) -> DomainResult<Transaction> {
        // Who wrote a row is a fact the server knows, not a value the caller
        // supplies: a browser request claiming to be the assistant is still the
        // browser.
        let transaction = self
            .build_transaction(owner, input, origin_of(actor), None)
            .await?;
        let audit = self.audit(
            AuditAction::TransactionCreated,
            actor,
            &transaction.id,
            transaction.version,
        );

        self.store
            .commit_ledger(
                owner,
                &LedgerWrite {
                    transactions: vec![TransactionWrite {
                        transaction: transaction.clone(),
                        expected_version: None,
                    }],
                    rollup_deltas: deltas_for_create(&transaction),
                    balance_deltas: vec![BalanceDelta {
                        account_id: transaction.account_id.clone(),
                        amount_minor: transaction.amount_minor,
                    }],
                    schedules: Vec::new(),
                    audit: vec![audit],
                },
            )
            .await?;

        Ok(transaction)
    }

    pub async fn update_transaction(
        &self,
        owner: &Owner,
        actor: Actor,
        id: &str,
        input: &UpdateTransactionInput,
    ) -> DomainResult<Transaction> {
        let before = self
            .store
            .transaction(owner, id)
            .await?
            .ok_or_else(|| DomainError::not_found("Transaction not found."))?;
        assert_version(before.version, input.expected_version)?;
        assert_active(before.voided_at.as_deref(), "Transaction")?;

        let account_changed = input
            .account_id
            .as_deref()
            .is_some_and(|next| next != before.account_id);
        let account = match (&input.account_id, account_changed) {
            (Some(next), true) => self.active_account(owner, next).await?,
            _ => self.account(owner, &before.account_id).await?,
        };

        let category_id = match &input.category_id {
            Some(value) => value.clone(),
            None => before.category_id.clone(),
        };
        let category = match &category_id {
            Some(next) if Some(next) != before.category_id.as_ref() => {
                Some(self.active_category(owner, next).await?)
            }
            Some(next) => Some(self.category(owner, next).await?),
            None => None,
        };

        let description = match &input.description {
            Some(value) => valid_name(value, "Description")?,
            None => before.description.clone(),
        };
        let amount_minor = input.amount_minor.unwrap_or(before.amount_minor);
        valid_amount(amount_minor, "Amount")?;
        let local_date = input
            .local_date
            .clone()
            .unwrap_or_else(|| before.local_date.clone());
        let occurred_at = match (&input.occurred_at, &input.local_date) {
            (Some(value), _) => value.clone(),
            (None, Some(_)) => reanchor(&before.occurred_at, &local_date)?,
            (None, None) => before.occurred_at.clone(),
        };
        valid_occurred_at(&occurred_at, &local_date)?;

        let receipt = match &input.receipt_id {
            Some(Some(receipt_id)) => Some(self.require_receipt(owner, receipt_id).await?),
            Some(None) => None,
            None => before.receipt.clone(),
        };

        let after = Transaction {
            account_id: account.id.clone(),
            account_name: account.name.clone(),
            category_id: category.as_ref().map(|found| found.id.clone()),
            category_name: category.as_ref().map(|found| found.name.clone()),
            description,
            amount_minor,
            kind: input.kind.unwrap_or(before.kind),
            local_date,
            occurred_at,
            time_precision: if input.occurred_at.is_some() {
                TimePrecision::Minute
            } else {
                before.time_precision
            },
            receipt,
            updated_at: self.now(),
            version: before.version + 1,
            ..before.clone()
        };

        let audit = self.audit(
            AuditAction::TransactionUpdated,
            actor,
            &after.id,
            after.version,
        );
        self.store
            .commit_ledger(
                owner,
                &LedgerWrite {
                    transactions: vec![TransactionWrite {
                        transaction: after.clone(),
                        expected_version: Some(before.version),
                    }],
                    rollup_deltas: deltas_for_update(&before, &after),
                    balance_deltas: balance_moves(&before, &after),
                    schedules: Vec::new(),
                    audit: vec![audit],
                },
            )
            .await?;

        Ok(after)
    }

    /// A ledger entry is never deleted. Voiding reverses its effect and keeps
    /// the record.
    pub async fn void_transaction(
        &self,
        owner: &Owner,
        actor: Actor,
        id: &str,
        expected_version: u32,
        reason: Option<&str>,
    ) -> DomainResult<Transaction> {
        let before = self
            .store
            .transaction(owner, id)
            .await?
            .ok_or_else(|| DomainError::not_found("Transaction not found."))?;
        assert_version(before.version, expected_version)?;
        assert_active(before.voided_at.as_deref(), "Transaction")?;

        let void_reason = match reason {
            Some(value) => Some(valid_name(value, "Void reason")?),
            None => None,
        };
        let after = Transaction {
            voided_at: Some(self.now()),
            void_reason,
            updated_at: self.now(),
            version: before.version + 1,
            ..before.clone()
        };

        let audit = self.audit(
            AuditAction::TransactionVoided,
            actor,
            &after.id,
            after.version,
        );
        self.store
            .commit_ledger(
                owner,
                &LedgerWrite {
                    transactions: vec![TransactionWrite {
                        transaction: after.clone(),
                        expected_version: Some(before.version),
                    }],
                    rollup_deltas: deltas_for_void(&before),
                    balance_deltas: vec![BalanceDelta {
                        account_id: before.account_id.clone(),
                        amount_minor: -before.amount_minor,
                    }],
                    schedules: Vec::new(),
                    audit: vec![audit],
                },
            )
            .await?;

        Ok(self.project(owner, vec![after]).await?.remove(0))
    }

    /// Two rollup items and one short ledger read, whatever the month holds.
    pub async fn get_dashboard(
        &self,
        owner: &Owner,
        month: &Month,
    ) -> DomainResult<DashboardSummary> {
        let current = self.store.rollup(owner, month).await?;
        let previous = self.store.rollup(owner, &month.previous()).await?;
        let recent = self
            .store
            .recent_transactions(owner, month, RECENT_TRANSACTION_COUNT)
            .await?;

        summarise_from_rollups(&RollupSummaryInput {
            today: &self.today()?,
            as_of: &self.now(),
            current: &current,
            previous: &previous,
            budgets: &self.store.budgets(owner, month).await?,
            budget_defaults: &self.store.budget_defaults(owner).await?,
            categories: &self.store.categories(owner).await?,
            recent_transactions: &self.project(owner, recent).await?,
        })
    }

    pub(crate) async fn build_transaction(
        &self,
        owner: &Owner,
        input: &CreateTransactionInput,
        origin: TransactionOrigin,
        identity: Option<ScheduleIdentity>,
    ) -> DomainResult<Transaction> {
        let account = self.active_account(owner, &input.account_id).await?;
        let category = match &input.category_id {
            Some(id) => Some(self.active_category(owner, id).await?),
            None => None,
        };
        let description = valid_name(&input.description, "Description")?;
        valid_amount(input.amount_minor, "Amount")?;

        let occurred_at = match &input.occurred_at {
            Some(value) => value.clone(),
            None => instant_at(&input.local_date, NOON)?,
        };
        valid_occurred_at(&occurred_at, &input.local_date)?;

        let receipt = match &input.receipt_id {
            Some(receipt_id) => Some(self.require_receipt(owner, receipt_id).await?),
            None => None,
        };

        let now = self.now();
        Ok(Transaction {
            id: self.ids.next("transaction"),
            account_id: account.id,
            account_name: account.name,
            category_id: category.as_ref().map(|found| found.id.clone()),
            category_name: category.as_ref().map(|found| found.name.clone()),
            description,
            amount_minor: input.amount_minor,
            currency: Currency::Gbp,
            kind: input.kind,
            origin,
            occurred_at,
            local_date: input.local_date.clone(),
            time_precision: if input.occurred_at.is_some() {
                TimePrecision::Minute
            } else {
                TimePrecision::Date
            },
            timezone: Timezone::EuropeLondon,
            schedule_id: identity.as_ref().map(|value| value.schedule_id.clone()),
            occurrence_date: identity.as_ref().map(|value| value.occurrence_date.clone()),
            import_row_fingerprint: None,
            receipt,
            voided_at: None,
            void_reason: None,
            created_at: now.clone(),
            updated_at: now,
            version: 1,
        })
    }
}

fn origin_of(actor: Actor) -> TransactionOrigin {
    match actor {
        Actor::Browser => TransactionOrigin::Manual,
        Actor::Assistant => TransactionOrigin::Assistant,
        Actor::Scheduler => TransactionOrigin::Schedule,
    }
}

fn balance_moves(before: &Transaction, after: &Transaction) -> Vec<BalanceDelta> {
    if before.account_id == after.account_id {
        let moved = after.amount_minor - before.amount_minor;
        if moved == 0 {
            return Vec::new();
        }
        return vec![BalanceDelta {
            account_id: after.account_id.clone(),
            amount_minor: moved,
        }];
    }

    vec![
        BalanceDelta {
            account_id: before.account_id.clone(),
            amount_minor: -before.amount_minor,
        },
        BalanceDelta {
            account_id: after.account_id.clone(),
            amount_minor: after.amount_minor,
        },
    ]
}

/// A read names its partition: a month, or an explicit range. Nothing else is
/// servable inside the capacity ADR 0007 budgets for.
fn window_of(filters: &TransactionFilters) -> DomainResult<(LocalDate, LocalDate)> {
    if let Some(month) = &filters.month {
        return Ok((month.first_day(), month.last_day()));
    }
    match (&filters.from, &filters.to) {
        (Some(from), Some(to)) => Ok((from.clone(), to.clone())),
        _ => Err(DomainError::validation(
            "A transaction query must name a month or a from and to date.",
        )),
    }
}

fn matches(
    transaction: &Transaction,
    filters: &TransactionFilters,
    status: TransactionStatus,
    search: Option<&str>,
) -> bool {
    if filters
        .account_id
        .as_ref()
        .is_some_and(|id| id != &transaction.account_id)
    {
        return false;
    }
    if filters
        .category_id
        .as_ref()
        .is_some_and(|id| Some(id) != transaction.category_id.as_ref())
    {
        return false;
    }
    if filters.kind.is_some_and(|kind| kind != transaction.kind) {
        return false;
    }
    if filters
        .flow
        .is_some_and(|flow| flow != flow_of(transaction.amount_minor))
    {
        return false;
    }
    if filters
        .origin
        .is_some_and(|origin| origin != transaction.origin)
    {
        return false;
    }
    match status {
        TransactionStatus::Active if !transaction.is_active() => return false,
        TransactionStatus::Voided if transaction.is_active() => return false,
        _ => {}
    }

    match search {
        Some(query) if !query.is_empty() => {
            let haystack = format!(
                "{} {} {}",
                transaction.description,
                transaction.account_name,
                transaction.category_name.clone().unwrap_or_default()
            )
            .to_lowercase();
            haystack.contains(query)
        }
        _ => true,
    }
}
