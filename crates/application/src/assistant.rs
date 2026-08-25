use std::future::Future;

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use turtle_tally_domain::error::{DomainError, DomainResult};
use turtle_tally_domain::types::{
    Budget, CreateTransactionInput, SetBudgetInput, Transaction, TransactionKind,
};

use crate::ports::{Actor, Clock, FinanceStore, ObjectStore, Owner};
use crate::service::FinanceService;

/// A preview is short lived on purpose: it is a statement about the ledger as
/// it was, and the longer it survives the less that statement is worth.
const PREVIEW_LIFETIME_MINUTES: i64 = 10;

/// ADR 0005: a conversational client proposes, and a separate call commits what
/// was proposed. Commit takes the identifier and the hash of the operation
/// rather than a payload, so a retry cannot quietly become a different change.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AssistantOperation {
    AddTransaction {
        input: CreateTransactionInput,
    },
    VoidTransaction {
        transaction_id: String,
        expected_version: u32,
        reason: Option<String>,
    },
    SetBudget {
        input: SetBudgetInput,
    },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredOperation {
    pub id: String,
    pub hash: String,
    pub operation: AssistantOperation,
    pub created_at: String,
    pub expires_at: String,
    pub ttl: i64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposedChange {
    pub field: String,
    pub from: Option<String>,
    pub to: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationPreview {
    pub operation_id: String,
    pub expected_hash: String,
    pub expires_at: String,
    pub summary: String,
    pub warnings: Vec<String>,
    pub changes: Vec<ProposedChange>,
}

pub trait OperationStore: Send + Sync {
    fn put_operation(
        &self,
        owner: &Owner,
        operation: &StoredOperation,
    ) -> impl Future<Output = DomainResult<()>> + Send;

    /// Single use: the commit that redeems an operation removes it, so a replay
    /// finds nothing to apply.
    fn take_operation(
        &self,
        owner: &Owner,
        id: &str,
    ) -> impl Future<Output = DomainResult<Option<StoredOperation>>> + Send;
}

pub struct AssistantService<S: FinanceStore, O: ObjectStore, P: OperationStore> {
    finance: FinanceService<S, O>,
    operations: P,
    clock: Box<dyn Clock>,
}

impl<S: FinanceStore, O: ObjectStore, P: OperationStore> AssistantService<S, O, P> {
    pub fn new(finance: FinanceService<S, O>, operations: P, clock: Box<dyn Clock>) -> Self {
        Self {
            finance,
            operations,
            clock,
        }
    }

    pub fn finance(&self) -> &FinanceService<S, O> {
        &self.finance
    }

    /// Validates and normalises the proposal against the current ledger, then
    /// stores exactly what a commit would apply.
    pub async fn preview(
        &self,
        owner: &Owner,
        operation: AssistantOperation,
    ) -> DomainResult<OperationPreview> {
        let (summary, warnings, changes) = match &operation {
            AssistantOperation::AddTransaction { input } => {
                self.describe_new_transaction(owner, input).await?
            }
            AssistantOperation::VoidTransaction {
                transaction_id,
                expected_version,
                reason,
            } => {
                self.describe_void(owner, transaction_id, *expected_version, reason.as_deref())
                    .await?
            }
            AssistantOperation::SetBudget { input } => self.describe_budget(owner, input).await?,
        };

        let now = self.clock.now();
        let expires_at = now + Duration::minutes(PREVIEW_LIFETIME_MINUTES);
        let hash = hash_of(&operation)?;
        let stored = StoredOperation {
            id: format!("operation-{}", uuid::Uuid::now_v7()),
            hash: hash.clone(),
            operation,
            created_at: instant(now),
            expires_at: instant(expires_at),
            ttl: expires_at.timestamp(),
        };

        self.operations.put_operation(owner, &stored).await?;

        Ok(OperationPreview {
            operation_id: stored.id,
            expected_hash: hash,
            expires_at: stored.expires_at,
            summary,
            warnings,
            changes,
        })
    }

    /// Verifies ownership, expiry, single use, and that the operation is still
    /// the one that was previewed, then applies it. Everything else — entity
    /// versions, active accounts, budget rules — is checked again by the use
    /// case itself.
    pub async fn commit(
        &self,
        owner: &Owner,
        operation_id: &str,
        expected_hash: &str,
    ) -> DomainResult<CommittedOperation> {
        let stored = self
            .operations
            .take_operation(owner, operation_id)
            .await?
            .ok_or_else(|| {
                DomainError::not_found("That proposal has expired or was already applied.")
            })?;

        if stored.hash != expected_hash || hash_of(&stored.operation)? != stored.hash {
            return Err(DomainError::conflict(
                "That proposal changed since it was previewed. Preview it again.",
            ));
        }
        if !DateTime::parse_from_rfc3339(&stored.expires_at)
            .is_ok_and(|expiry| expiry > self.clock.now())
        {
            return Err(DomainError::conflict(
                "That proposal has expired. Preview it again.",
            ));
        }

        match stored.operation {
            AssistantOperation::AddTransaction { input } => {
                Ok(CommittedOperation::Transaction(Box::new(
                    self.finance
                        .create_transaction(owner, Actor::Assistant, &input)
                        .await?,
                )))
            }
            AssistantOperation::VoidTransaction {
                transaction_id,
                expected_version,
                reason,
            } => Ok(CommittedOperation::Transaction(Box::new(
                self.finance
                    .void_transaction(
                        owner,
                        Actor::Assistant,
                        &transaction_id,
                        expected_version,
                        reason.as_deref(),
                    )
                    .await?,
            ))),
            AssistantOperation::SetBudget { input } => Ok(CommittedOperation::Budget(Box::new(
                self.finance
                    .set_budget(owner, Actor::Assistant, &input)
                    .await?,
            ))),
        }
    }

    async fn describe_new_transaction(
        &self,
        owner: &Owner,
        input: &CreateTransactionInput,
    ) -> DomainResult<(String, Vec<String>, Vec<ProposedChange>)> {
        let proposed = self
            .finance
            .build_transaction(
                owner,
                input,
                turtle_tally_domain::types::TransactionOrigin::Assistant,
                None,
            )
            .await?;

        let mut warnings = Vec::new();
        if proposed.category_id.is_none() && proposed.kind == TransactionKind::Spending {
            warnings.push(
                "This spending has no category, so it will not count towards a budget.".to_owned(),
            );
        }

        Ok((
            format!("Add {} to {}", proposed.description, proposed.account_name),
            warnings,
            vec![
                ProposedChange {
                    field: "amountMinor".to_owned(),
                    from: None,
                    to: proposed.amount_minor.to_string(),
                },
                ProposedChange {
                    field: "localDate".to_owned(),
                    from: None,
                    to: proposed.local_date.to_string(),
                },
                ProposedChange {
                    field: "category".to_owned(),
                    from: None,
                    to: proposed
                        .category_name
                        .unwrap_or_else(|| "Uncategorised".to_owned()),
                },
            ],
        ))
    }

    async fn describe_void(
        &self,
        owner: &Owner,
        transaction_id: &str,
        expected_version: u32,
        reason: Option<&str>,
    ) -> DomainResult<(String, Vec<String>, Vec<ProposedChange>)> {
        let existing = self.finance.get_transaction(owner, transaction_id).await?;
        if existing.version != expected_version {
            return Err(DomainError::conflict(
                "That entry changed since it was read. Read it again.",
            ));
        }
        if !existing.is_active() {
            return Err(DomainError::conflict("That entry is already void."));
        }

        Ok((
            format!("Void {}", existing.description),
            vec![
                "Voiding reverses the entry's effect on the balance and keeps the record."
                    .to_owned(),
            ],
            vec![
                ProposedChange {
                    field: "amountMinor".to_owned(),
                    from: Some(existing.amount_minor.to_string()),
                    to: "0".to_owned(),
                },
                ProposedChange {
                    field: "voidReason".to_owned(),
                    from: None,
                    to: reason.unwrap_or("none given").to_owned(),
                },
            ],
        ))
    }

    async fn describe_budget(
        &self,
        owner: &Owner,
        input: &SetBudgetInput,
    ) -> DomainResult<(String, Vec<String>, Vec<ProposedChange>)> {
        let current = self
            .finance
            .list_budgets(owner, &input.month)
            .await?
            .into_iter()
            .find(|budget| budget.category_id == input.category_id);

        let from = current
            .as_ref()
            .map(|budget| budget.limit_minor.to_string());
        let mut warnings = Vec::new();
        if let Some(budget) = &current
            && budget.spent_minor > input.limit_minor
        {
            warnings.push("The month has already spent more than the proposed limit.".to_owned());
        }

        Ok((
            format!(
                "Set the {} budget for {}",
                current
                    .as_ref()
                    .map_or("category", |budget| budget.category_name.as_str()),
                input.month
            ),
            warnings,
            vec![ProposedChange {
                field: "limitMinor".to_owned(),
                from,
                to: input.limit_minor.to_string(),
            }],
        ))
    }
}

#[derive(Debug)]
pub enum CommittedOperation {
    Transaction(Box<Transaction>),
    Budget(Box<Budget>),
}

/// The hash covers the canonical form of the operation, so an altered preview
/// fails closed rather than committing something else.
fn hash_of(operation: &AssistantOperation) -> DomainResult<String> {
    let canonical = serde_json::to_vec(operation)
        .map_err(|_| DomainError::validation("That proposal could not be recorded."))?;
    let mut hasher = Sha256::new();
    hasher.update(&canonical);
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn instant(value: DateTime<Utc>) -> String {
    value.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
