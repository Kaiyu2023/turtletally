mod budgets;
mod ledger;
mod receipts;
mod reference;
mod schedules;

use chrono::SecondsFormat;
use turtle_tally_domain::calendar::LocalDate;
use turtle_tally_domain::error::{DomainError, DomainResult};
use turtle_tally_domain::time::zoned_date;
use turtle_tally_domain::types::{Account, Category, Transaction};

use crate::ports::{
    Actor, AuditAction, AuditEvent, Clock, FinanceStore, IdSource, ObjectStore, Owner,
};

/// The use cases the contract exposes. Both ingresses (ADR 0004) call these,
/// so authorisation, validation, and aggregate maintenance live in one place
/// rather than in each transport.
pub struct FinanceService<S: FinanceStore, O: ObjectStore> {
    store: S,
    objects: O,
    clock: Box<dyn Clock>,
    ids: Box<dyn IdSource>,
}

impl<S: FinanceStore, O: ObjectStore> FinanceService<S, O> {
    pub fn new(store: S, objects: O, clock: Box<dyn Clock>, ids: Box<dyn IdSource>) -> Self {
        Self {
            store,
            objects,
            clock,
            ids,
        }
    }

    pub fn store(&self) -> &S {
        &self.store
    }

    pub fn objects(&self) -> &O {
        &self.objects
    }

    pub(crate) fn now(&self) -> String {
        self.clock
            .now()
            .to_rfc3339_opts(SecondsFormat::Millis, true)
    }

    pub(crate) fn today(&self) -> DomainResult<LocalDate> {
        zoned_date(&self.now())
    }

    pub(crate) fn audit(
        &self,
        action: AuditAction,
        actor: Actor,
        entity_id: &str,
        entity_version: u32,
    ) -> AuditEvent {
        AuditEvent {
            id: self.ids.next("audit"),
            recorded_at: self.now(),
            action,
            actor,
            entity_id: entity_id.to_owned(),
            entity_version,
        }
    }

    pub(crate) async fn account(&self, owner: &Owner, id: &str) -> DomainResult<Account> {
        self.store
            .accounts(owner)
            .await?
            .into_iter()
            .find(|account| account.id == id)
            .ok_or_else(|| DomainError::not_found("Account not found."))
    }

    pub(crate) async fn active_account(&self, owner: &Owner, id: &str) -> DomainResult<Account> {
        let account = self.account(owner, id).await?;
        assert_active(account.deactivated_at.as_deref(), "Account")?;
        Ok(account)
    }

    pub(crate) async fn category(&self, owner: &Owner, id: &str) -> DomainResult<Category> {
        self.store
            .categories(owner)
            .await?
            .into_iter()
            .find(|category| category.id == id)
            .ok_or_else(|| DomainError::not_found("Category not found."))
    }

    pub(crate) async fn active_category(&self, owner: &Owner, id: &str) -> DomainResult<Category> {
        let category = self.category(owner, id).await?;
        assert_active(category.deactivated_at.as_deref(), "Category")?;
        Ok(category)
    }

    /// A display name is a projection of the current entity (ADR 0003), so a
    /// rename is visible everywhere at once and no propagation job exists.
    pub(crate) async fn project(
        &self,
        owner: &Owner,
        transactions: Vec<Transaction>,
    ) -> DomainResult<Vec<Transaction>> {
        let accounts = self.store.accounts(owner).await?;
        let categories = self.store.categories(owner).await?;

        Ok(transactions
            .into_iter()
            .map(|mut transaction| {
                transaction.account_name = accounts
                    .iter()
                    .find(|account| account.id == transaction.account_id)
                    .map_or_else(String::new, |account| account.name.clone());
                transaction.category_name = transaction.category_id.as_ref().and_then(|id| {
                    categories
                        .iter()
                        .find(|category| &category.id == id)
                        .map(|category| category.name.clone())
                });
                transaction
            })
            .collect())
    }
}

pub(crate) fn assert_version(actual: u32, expected: u32) -> DomainResult<()> {
    if actual != expected {
        return Err(DomainError::conflict(
            "This item changed since it was loaded. Refresh and try again.",
        ));
    }
    Ok(())
}

pub(crate) fn assert_active(deactivated_at: Option<&str>, label: &str) -> DomainResult<()> {
    if deactivated_at.is_some() {
        return Err(DomainError::conflict(format!(
            "{label} is already inactive."
        )));
    }
    Ok(())
}
