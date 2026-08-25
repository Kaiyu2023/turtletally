use std::collections::BTreeMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering as AtomicOrdering};

use chrono::{DateTime, Duration, Utc};
use turtle_tally_domain::calendar::{LocalDate, Month};
use turtle_tally_domain::error::{DomainError, DomainResult};
use turtle_tally_domain::ordering::compare_text;
use turtle_tally_domain::rollup::{MonthlyRollup, rebuild_month};
use turtle_tally_domain::types::{
    Account, Budget, BudgetDefault, Category, Receipt, Schedule, Transaction, UploadMediaType,
    UserPreferences,
};

use crate::ports::{
    AuditEvent, Clock, EntityWrite, FinanceStore, GrantedUrl, IdSource, LedgerWrite, ObjectStore,
    Owner, PendingUpload,
};

/// A complete store that keeps everything in memory. It exists so the use cases
/// can be tested without AWS, and it enforces the same version conditions and
/// single-use rules the persistent store must.
#[derive(Default)]
pub struct InMemoryStore {
    owners: Mutex<BTreeMap<String, State>>,
}

#[derive(Default)]
struct State {
    preferences: Option<UserPreferences>,
    accounts: Vec<Account>,
    categories: Vec<Category>,
    budgets: Vec<Budget>,
    budget_defaults: Vec<BudgetDefault>,
    schedules: Vec<Schedule>,
    transactions: Vec<Transaction>,
    rollups: BTreeMap<String, MonthlyRollup>,
    receipts: Vec<Receipt>,
    uploads: Vec<PendingUpload>,
    audit: Vec<AuditEvent>,
}

impl InMemoryStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn seed(&self, owner: &Owner, seed: Seed) {
        let mut owners = self.owners.lock().expect("the store is not poisoned");
        let state = owners.entry(owner.as_str().to_owned()).or_default();
        state.accounts = seed.accounts;
        state.categories = seed.categories;
        state.budgets = seed.budgets;
        state.budget_defaults = seed.budget_defaults;
        state.schedules = seed.schedules;
        state.transactions = seed.transactions.clone();

        for transaction in &seed.transactions {
            let month = transaction.local_date.month();
            state
                .rollups
                .entry(month.to_string())
                .or_insert_with(|| rebuild_month(&month, &seed.transactions));
        }
    }

    pub fn audit_events(&self, owner: &Owner) -> Vec<AuditEvent> {
        self.with(owner, |state| state.audit.clone())
    }

    pub fn stored_rollup(&self, owner: &Owner, month: &Month) -> Option<MonthlyRollup> {
        self.with(owner, |state| state.rollups.get(month.as_str()).cloned())
    }

    fn with<T>(&self, owner: &Owner, read: impl FnOnce(&State) -> T) -> T {
        let mut owners = self.owners.lock().expect("the store is not poisoned");
        read(owners.entry(owner.as_str().to_owned()).or_default())
    }

    fn mutate<T>(&self, owner: &Owner, write: impl FnOnce(&mut State) -> T) -> T {
        let mut owners = self.owners.lock().expect("the store is not poisoned");
        write(owners.entry(owner.as_str().to_owned()).or_default())
    }
}

#[derive(Default)]
pub struct Seed {
    pub accounts: Vec<Account>,
    pub categories: Vec<Category>,
    pub budgets: Vec<Budget>,
    pub budget_defaults: Vec<BudgetDefault>,
    pub schedules: Vec<Schedule>,
    pub transactions: Vec<Transaction>,
}

fn check_version(existing: Option<u32>, expected: Option<u32>) -> DomainResult<()> {
    if existing.unwrap_or_default() != expected.unwrap_or_default() {
        return Err(DomainError::conflict(
            "This item changed since it was loaded. Refresh and try again.",
        ));
    }
    Ok(())
}

fn replace<T>(items: &mut Vec<T>, updated: T, matches: impl Fn(&T) -> bool) {
    match items.iter().position(matches) {
        Some(index) => items[index] = updated,
        None => items.push(updated),
    }
}

impl FinanceStore for InMemoryStore {
    async fn preferences(&self, owner: &Owner) -> DomainResult<Option<UserPreferences>> {
        Ok(self.with(owner, |state| state.preferences.clone()))
    }

    async fn put_preferences(
        &self,
        owner: &Owner,
        write: EntityWrite<'_, UserPreferences>,
    ) -> DomainResult<()> {
        self.mutate(owner, |state| {
            check_version(
                state.preferences.as_ref().map(|current| current.version),
                write.expected_version,
            )?;
            state.preferences = Some(write.entity.clone());
            state.audit.push(write.audit.clone());
            Ok(())
        })
    }

    async fn accounts(&self, owner: &Owner) -> DomainResult<Vec<Account>> {
        Ok(self.with(owner, |state| state.accounts.clone()))
    }

    async fn put_account(
        &self,
        owner: &Owner,
        write: EntityWrite<'_, Account>,
    ) -> DomainResult<()> {
        self.mutate(owner, |state| {
            let existing = state
                .accounts
                .iter()
                .find(|account| account.id == write.entity.id);
            check_version(
                existing.map(|account| account.version),
                write.expected_version,
            )?;
            replace(&mut state.accounts, write.entity.clone(), |account| {
                account.id == write.entity.id
            });
            state.audit.push(write.audit.clone());
            Ok(())
        })
    }

    async fn categories(&self, owner: &Owner) -> DomainResult<Vec<Category>> {
        Ok(self.with(owner, |state| state.categories.clone()))
    }

    async fn put_category(
        &self,
        owner: &Owner,
        write: EntityWrite<'_, Category>,
    ) -> DomainResult<()> {
        self.mutate(owner, |state| {
            let existing = state
                .categories
                .iter()
                .find(|category| category.id == write.entity.id);
            check_version(
                existing.map(|category| category.version),
                write.expected_version,
            )?;
            replace(&mut state.categories, write.entity.clone(), |category| {
                category.id == write.entity.id
            });
            state.audit.push(write.audit.clone());
            Ok(())
        })
    }

    async fn budgets(&self, owner: &Owner, month: &Month) -> DomainResult<Vec<Budget>> {
        Ok(self.with(owner, |state| {
            state
                .budgets
                .iter()
                .filter(|budget| &budget.month == month)
                .cloned()
                .collect()
        }))
    }

    async fn put_budget(&self, owner: &Owner, write: EntityWrite<'_, Budget>) -> DomainResult<()> {
        self.mutate(owner, |state| {
            let existing = state.budgets.iter().find(|budget| {
                budget.month == write.entity.month && budget.category_id == write.entity.category_id
            });
            check_version(
                existing.map(|budget| budget.version),
                write.expected_version,
            )?;
            replace(&mut state.budgets, write.entity.clone(), |budget| {
                budget.month == write.entity.month && budget.category_id == write.entity.category_id
            });
            state.audit.push(write.audit.clone());
            Ok(())
        })
    }

    async fn budget_defaults(&self, owner: &Owner) -> DomainResult<Vec<BudgetDefault>> {
        Ok(self.with(owner, |state| state.budget_defaults.clone()))
    }

    async fn put_budget_default(
        &self,
        owner: &Owner,
        write: EntityWrite<'_, BudgetDefault>,
    ) -> DomainResult<()> {
        self.mutate(owner, |state| {
            let existing = state
                .budget_defaults
                .iter()
                .find(|budget| budget.category_id == write.entity.category_id);
            check_version(
                existing.map(|budget| budget.version),
                write.expected_version,
            )?;
            replace(&mut state.budget_defaults, write.entity.clone(), |budget| {
                budget.category_id == write.entity.category_id
            });
            state.audit.push(write.audit.clone());
            Ok(())
        })
    }

    async fn schedules(&self, owner: &Owner) -> DomainResult<Vec<Schedule>> {
        Ok(self.with(owner, |state| state.schedules.clone()))
    }

    async fn put_schedule(
        &self,
        owner: &Owner,
        write: EntityWrite<'_, Schedule>,
    ) -> DomainResult<()> {
        self.mutate(owner, |state| {
            let existing = state
                .schedules
                .iter()
                .find(|schedule| schedule.id == write.entity.id);
            check_version(
                existing.map(|schedule| schedule.version),
                write.expected_version,
            )?;
            replace(&mut state.schedules, write.entity.clone(), |schedule| {
                schedule.id == write.entity.id
            });
            state.audit.push(write.audit.clone());
            Ok(())
        })
    }

    async fn transaction(&self, owner: &Owner, id: &str) -> DomainResult<Option<Transaction>> {
        Ok(self.with(owner, |state| {
            state
                .transactions
                .iter()
                .find(|entry| entry.id == id)
                .cloned()
        }))
    }

    async fn transactions_between(
        &self,
        owner: &Owner,
        from: &LocalDate,
        to: &LocalDate,
    ) -> DomainResult<Vec<Transaction>> {
        Ok(self.with(owner, |state| {
            state
                .transactions
                .iter()
                .filter(|entry| &entry.local_date >= from && &entry.local_date <= to)
                .cloned()
                .collect()
        }))
    }

    async fn recent_transactions(
        &self,
        owner: &Owner,
        month: &Month,
        limit: u32,
    ) -> DomainResult<Vec<Transaction>> {
        Ok(self.with(owner, |state| {
            let mut items: Vec<Transaction> = state
                .transactions
                .iter()
                .filter(|entry| entry.is_active() && month.contains(&entry.local_date))
                .cloned()
                .collect();
            items.sort_by(|left, right| {
                compare_text(&right.occurred_at, &left.occurred_at)
                    .then_with(|| compare_text(&right.id, &left.id))
            });
            items.truncate(limit as usize);
            items
        }))
    }

    async fn rollup(&self, owner: &Owner, month: &Month) -> DomainResult<MonthlyRollup> {
        Ok(self.with(owner, |state| {
            state
                .rollups
                .get(month.as_str())
                .cloned()
                .unwrap_or_else(|| MonthlyRollup::empty(month.clone()))
        }))
    }

    async fn commit_ledger(&self, owner: &Owner, write: &LedgerWrite) -> DomainResult<()> {
        self.mutate(owner, |state| {
            for entry in &write.transactions {
                let existing = state
                    .transactions
                    .iter()
                    .find(|current| current.id == entry.transaction.id);
                check_version(
                    existing.map(|current| current.version),
                    entry.expected_version,
                )?;
            }
            for entry in &write.schedules {
                let existing = state
                    .schedules
                    .iter()
                    .find(|current| current.id == entry.schedule.id);
                check_version(
                    existing.map(|current| current.version),
                    entry.expected_version,
                )?;
            }
            for delta in &write.balance_deltas {
                if !state
                    .accounts
                    .iter()
                    .any(|account| account.id == delta.account_id)
                {
                    return Err(DomainError::not_found("Account not found."));
                }
            }

            for entry in &write.transactions {
                replace(
                    &mut state.transactions,
                    entry.transaction.clone(),
                    |current| current.id == entry.transaction.id,
                );
            }
            for entry in &write.schedules {
                replace(&mut state.schedules, entry.schedule.clone(), |current| {
                    current.id == entry.schedule.id
                });
            }
            for delta in &write.rollup_deltas {
                let rollup = state
                    .rollups
                    .entry(delta.month.to_string())
                    .or_insert_with(|| MonthlyRollup::empty(delta.month.clone()));
                rollup.apply(delta);
            }
            for delta in &write.balance_deltas {
                if let Some(account) = state
                    .accounts
                    .iter_mut()
                    .find(|account| account.id == delta.account_id)
                {
                    account.balance_minor += delta.amount_minor;
                }
            }
            state.audit.extend(write.audit.iter().cloned());
            Ok(())
        })
    }

    async fn rebuild_rollup(&self, owner: &Owner, month: &Month) -> DomainResult<MonthlyRollup> {
        self.mutate(owner, |state| {
            let rebuilt = rebuild_month(month, &state.transactions);
            state.rollups.insert(month.to_string(), rebuilt.clone());
            Ok(rebuilt)
        })
    }

    async fn receipt(&self, owner: &Owner, id: &str) -> DomainResult<Option<Receipt>> {
        Ok(self.with(owner, |state| {
            state
                .receipts
                .iter()
                .find(|receipt| receipt.id == id)
                .cloned()
        }))
    }

    async fn put_receipt(
        &self,
        owner: &Owner,
        write: EntityWrite<'_, Receipt>,
    ) -> DomainResult<()> {
        self.mutate(owner, |state| {
            replace(&mut state.receipts, write.entity.clone(), |receipt| {
                receipt.id == write.entity.id
            });
            state.audit.push(write.audit.clone());
            Ok(())
        })
    }

    async fn put_pending_upload(&self, owner: &Owner, upload: &PendingUpload) -> DomainResult<()> {
        self.mutate(owner, |state| {
            state.uploads.push(upload.clone());
            Ok(())
        })
    }

    async fn take_pending_upload(
        &self,
        owner: &Owner,
        id: &str,
    ) -> DomainResult<Option<PendingUpload>> {
        Ok(self.mutate(owner, |state| {
            state
                .uploads
                .iter()
                .position(|upload| upload.id == id)
                .map(|index| state.uploads.remove(index))
        }))
    }
}

/// An object store that records what was written rather than writing it. A test
/// calls `store_object` to stand in for the client's upload.
#[derive(Default)]
pub struct InMemoryObjects {
    objects: Mutex<BTreeMap<String, String>>,
}

impl InMemoryObjects {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn store_object(&self, key: &str, checksum: &str) {
        self.objects
            .lock()
            .expect("the object store is not poisoned")
            .insert(key.to_owned(), checksum.to_owned());
    }
}

impl ObjectStore for InMemoryObjects {
    async fn upload_grant(
        &self,
        key: &str,
        _media_type: UploadMediaType,
        _size_bytes: u64,
    ) -> DomainResult<GrantedUrl> {
        Ok(GrantedUrl {
            url: format!("memory://uploads/{key}"),
            expires_at: Utc::now() + Duration::minutes(15),
        })
    }

    async fn download_grant(&self, key: &str) -> DomainResult<GrantedUrl> {
        Ok(GrantedUrl {
            url: format!("memory://objects/{key}"),
            expires_at: Utc::now() + Duration::minutes(5),
        })
    }

    async fn stored_checksum(&self, key: &str) -> DomainResult<Option<String>> {
        Ok(self
            .objects
            .lock()
            .expect("the object store is not poisoned")
            .get(key)
            .cloned())
    }
}

pub struct FixedClock(pub DateTime<Utc>);

impl Clock for FixedClock {
    fn now(&self) -> DateTime<Utc> {
        self.0
    }
}

pub struct SequentialIds {
    next: AtomicU64,
}

impl Default for SequentialIds {
    fn default() -> Self {
        Self {
            next: AtomicU64::new(1),
        }
    }
}

impl IdSource for SequentialIds {
    fn next(&self, prefix: &str) -> String {
        format!(
            "{prefix}-{:04}",
            self.next.fetch_add(1, AtomicOrdering::Relaxed)
        )
    }
}
