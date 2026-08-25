use turtle_tally_domain::calendar::LocalDate;
use turtle_tally_domain::error::{DomainError, DomainResult};
use turtle_tally_domain::ordering::compare_text;
use turtle_tally_domain::recurrence::{next_occurrence, validate};
use turtle_tally_domain::rollup::deltas_for_batch;
use turtle_tally_domain::types::{
    CreateScheduleInput, CreateTransactionInput, Currency, Schedule, Transaction,
    TransactionOrigin, UpdateScheduleInput,
};
use turtle_tally_domain::validation::{valid_amount, valid_name};

use super::ledger::ScheduleIdentity;
use super::{FinanceService, assert_active, assert_version};
use crate::ports::{
    Actor, AuditAction, BalanceDelta, EntityWrite, FinanceStore, LedgerWrite, ObjectStore, Owner,
    ScheduleWrite, TransactionWrite,
};

/// A catch-up run is bounded. The worker runs daily, so a longer gap is a
/// recovery case that repeats on the next run rather than one unbounded write.
const MAX_GENERATED_PER_RUN: usize = 25;

impl<S: FinanceStore, O: ObjectStore> FinanceService<S, O> {
    pub async fn list_schedules(
        &self,
        owner: &Owner,
        include_inactive: bool,
    ) -> DomainResult<Vec<Schedule>> {
        let accounts = self.store.accounts(owner).await?;
        let categories = self.store.categories(owner).await?;
        let mut schedules: Vec<Schedule> = self
            .store
            .schedules(owner)
            .await?
            .into_iter()
            .filter(|schedule| include_inactive || schedule.deactivated_at.is_none())
            .map(|mut schedule| {
                schedule.account_name = accounts
                    .iter()
                    .find(|account| account.id == schedule.account_id)
                    .map_or_else(String::new, |account| account.name.clone());
                schedule.category_name = schedule.category_id.as_ref().and_then(|id| {
                    categories
                        .iter()
                        .find(|category| &category.id == id)
                        .map(|category| category.name.clone())
                });
                schedule
            })
            .collect();

        schedules.sort_by(|left, right| {
            let due = |schedule: &Schedule| {
                schedule
                    .next_due_date
                    .as_ref()
                    .map_or_else(|| "9999-12-31".to_owned(), ToString::to_string)
            };
            compare_text(&due(left), &due(right))
        });
        Ok(schedules)
    }

    pub async fn create_schedule(
        &self,
        owner: &Owner,
        actor: Actor,
        input: &CreateScheduleInput,
    ) -> DomainResult<Schedule> {
        let account = self.active_account(owner, &input.account_id).await?;
        let category = match &input.category_id {
            Some(id) => Some(self.active_category(owner, id).await?),
            None => None,
        };
        let name = valid_name(&input.name, "Schedule name")?;
        let description = valid_name(&input.description, "Description")?;
        valid_amount(input.amount_minor, "Amount")?;
        validate(&input.recurrence)?;

        let schedule = Schedule {
            id: self.ids.next("schedule"),
            name,
            account_id: account.id,
            account_name: account.name,
            category_id: category.as_ref().map(|found| found.id.clone()),
            category_name: category.as_ref().map(|found| found.name.clone()),
            description,
            amount_minor: input.amount_minor,
            currency: Currency::Gbp,
            kind: input.kind,
            recurrence: input.recurrence.clone(),
            next_due_date: Some(input.next_due_date.clone()),
            last_generated_date: None,
            deactivated_at: None,
            version: 1,
        };

        let audit = self.audit(
            AuditAction::ScheduleCreated,
            actor,
            &schedule.id,
            schedule.version,
        );
        self.store
            .put_schedule(
                owner,
                EntityWrite {
                    entity: &schedule,
                    expected_version: None,
                    audit: &audit,
                },
            )
            .await?;
        Ok(schedule)
    }

    pub async fn update_schedule(
        &self,
        owner: &Owner,
        actor: Actor,
        id: &str,
        input: &UpdateScheduleInput,
    ) -> DomainResult<Schedule> {
        let schedule = self.schedule(owner, id).await?;
        assert_version(schedule.version, input.expected_version)?;
        assert_active(schedule.deactivated_at.as_deref(), "Schedule")?;

        let account = match &input.account_id {
            Some(next) => self.active_account(owner, next).await?,
            None => self.active_account(owner, &schedule.account_id).await?,
        };
        let category_id = match &input.category_id {
            Some(value) => value.clone(),
            None => schedule.category_id.clone(),
        };
        let category = match &category_id {
            Some(next) => Some(self.active_category(owner, next).await?),
            None => None,
        };

        let name = match &input.name {
            Some(value) => valid_name(value, "Schedule name")?,
            None => schedule.name.clone(),
        };
        let description = match &input.description {
            Some(value) => valid_name(value, "Description")?,
            None => schedule.description.clone(),
        };
        let amount_minor = input.amount_minor.unwrap_or(schedule.amount_minor);
        valid_amount(amount_minor, "Amount")?;
        let recurrence = input
            .recurrence
            .clone()
            .unwrap_or_else(|| schedule.recurrence.clone());
        validate(&recurrence)?;
        let next_due_date = input
            .next_due_date
            .clone()
            .or_else(|| schedule.next_due_date.clone())
            .ok_or_else(|| DomainError::validation("An active schedule needs a next due date."))?;

        let updated = Schedule {
            name,
            account_id: account.id,
            account_name: account.name,
            category_id,
            category_name: category.as_ref().map(|found| found.name.clone()),
            description,
            amount_minor,
            kind: input.kind.unwrap_or(schedule.kind),
            recurrence,
            next_due_date: Some(next_due_date),
            version: schedule.version + 1,
            ..schedule
        };

        let audit = self.audit(
            AuditAction::ScheduleUpdated,
            actor,
            &updated.id,
            updated.version,
        );
        self.store
            .put_schedule(
                owner,
                EntityWrite {
                    entity: &updated,
                    expected_version: Some(input.expected_version),
                    audit: &audit,
                },
            )
            .await?;
        Ok(updated)
    }

    pub async fn deactivate_schedule(
        &self,
        owner: &Owner,
        actor: Actor,
        id: &str,
        expected_version: u32,
    ) -> DomainResult<Schedule> {
        let schedule = self.schedule(owner, id).await?;
        assert_version(schedule.version, expected_version)?;
        assert_active(schedule.deactivated_at.as_deref(), "Schedule")?;

        let updated = Schedule {
            next_due_date: None,
            deactivated_at: Some(self.now()),
            version: schedule.version + 1,
            ..schedule
        };
        let audit = self.audit(
            AuditAction::ScheduleDeactivated,
            actor,
            &updated.id,
            updated.version,
        );
        self.store
            .put_schedule(
                owner,
                EntityWrite {
                    entity: &updated,
                    expected_version: Some(expected_version),
                    audit: &audit,
                },
            )
            .await?;
        Ok(updated)
    }

    /// Generating an occurrence twice is the failure this guards against: a
    /// schedule and its occurrence date identify the row, and a run that has
    /// already produced one skips it.
    pub async fn run_due_schedules(
        &self,
        owner: &Owner,
        actor: Actor,
        as_of: &LocalDate,
    ) -> DomainResult<Vec<Transaction>> {
        let schedules = self.store.schedules(owner).await?;
        let earliest = schedules
            .iter()
            .filter(|schedule| schedule.deactivated_at.is_none())
            .filter_map(|schedule| schedule.next_due_date.clone())
            .min()
            .unwrap_or_else(|| as_of.clone());
        let existing = self
            .store
            .transactions_between(owner, &earliest, as_of)
            .await?;

        let mut created: Vec<Transaction> = Vec::new();
        let mut schedule_writes: Vec<ScheduleWrite> = Vec::new();
        let mut audit = Vec::new();

        for schedule in schedules {
            if schedule.deactivated_at.is_some() {
                continue;
            }

            let mut due = schedule.next_due_date.clone();
            let mut last_generated = schedule.last_generated_date.clone();
            let mut advanced = false;

            while let Some(occurrence) = due.clone() {
                if &occurrence > as_of || created.len() >= MAX_GENERATED_PER_RUN {
                    break;
                }

                let already_generated = existing.iter().chain(created.iter()).any(|transaction| {
                    transaction.schedule_id.as_deref() == Some(schedule.id.as_str())
                        && transaction.occurrence_date.as_ref() == Some(&occurrence)
                });

                if !already_generated {
                    let transaction = self
                        .build_transaction(
                            owner,
                            &CreateTransactionInput {
                                account_id: schedule.account_id.clone(),
                                category_id: schedule.category_id.clone(),
                                description: schedule.description.clone(),
                                amount_minor: schedule.amount_minor,
                                kind: schedule.kind,
                                local_date: occurrence.clone(),
                                occurred_at: None,
                                origin: None,
                                receipt_id: None,
                            },
                            TransactionOrigin::Schedule,
                            Some(ScheduleIdentity {
                                schedule_id: schedule.id.clone(),
                                occurrence_date: occurrence.clone(),
                            }),
                        )
                        .await?;
                    audit.push(self.audit(
                        AuditAction::TransactionCreated,
                        actor,
                        &transaction.id,
                        1,
                    ));
                    created.push(transaction);
                }

                last_generated = Some(occurrence.clone());
                advanced = true;
                due = next_occurrence(&schedule.recurrence, &occurrence);
            }

            if advanced {
                let version = schedule.version;
                audit.push(self.audit(AuditAction::ScheduleRun, actor, &schedule.id, version + 1));
                schedule_writes.push(ScheduleWrite {
                    schedule: Schedule {
                        next_due_date: due,
                        last_generated_date: last_generated,
                        version: version + 1,
                        ..schedule
                    },
                    expected_version: Some(version),
                });
            }
        }

        if created.is_empty() && schedule_writes.is_empty() {
            return Ok(created);
        }

        self.store
            .commit_ledger(
                owner,
                &LedgerWrite {
                    transactions: created
                        .iter()
                        .map(|transaction| TransactionWrite {
                            transaction: transaction.clone(),
                            expected_version: None,
                        })
                        .collect(),
                    rollup_deltas: deltas_for_batch(&created),
                    balance_deltas: balance_totals(&created),
                    schedules: schedule_writes,
                    audit,
                },
            )
            .await?;

        Ok(created)
    }

    async fn schedule(&self, owner: &Owner, id: &str) -> DomainResult<Schedule> {
        self.store
            .schedules(owner)
            .await?
            .into_iter()
            .find(|schedule| schedule.id == id)
            .ok_or_else(|| DomainError::not_found("Schedule not found."))
    }
}

fn balance_totals(transactions: &[Transaction]) -> Vec<BalanceDelta> {
    let mut totals: Vec<BalanceDelta> = Vec::new();
    for transaction in transactions {
        match totals
            .iter_mut()
            .find(|delta| delta.account_id == transaction.account_id)
        {
            Some(delta) => delta.amount_minor += transaction.amount_minor,
            None => totals.push(BalanceDelta {
                account_id: transaction.account_id.clone(),
                amount_minor: transaction.amount_minor,
            }),
        }
    }
    totals
}
