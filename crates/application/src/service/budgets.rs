use turtle_tally_domain::aggregates::{BudgetProgressInput, budget_progress};
use turtle_tally_domain::calendar::Month;
use turtle_tally_domain::error::{DomainError, DomainResult};
use turtle_tally_domain::ordering::compare_names;
use turtle_tally_domain::types::{
    Budget, BudgetDefault, BudgetProgress, CategoryGroup, SetBudgetDefaultInput, SetBudgetInput,
};
use turtle_tally_domain::validation::valid_minor;

use super::{FinanceService, assert_version};
use crate::ports::{Actor, AuditAction, EntityWrite, FinanceStore, ObjectStore, Owner};

impl<S: FinanceStore, O: ObjectStore> FinanceService<S, O> {
    /// A month's spending comes from its rollup, so a budget list costs one
    /// item read rather than a month query per budgeted category.
    pub async fn list_budgets(
        &self,
        owner: &Owner,
        month: &Month,
    ) -> DomainResult<Vec<BudgetProgress>> {
        budget_progress(&BudgetProgressInput {
            month,
            budgets: &self.store.budgets(owner, month).await?,
            budget_defaults: &self.store.budget_defaults(owner).await?,
            categories: &self.store.categories(owner).await?,
            spent_by_category: &self.store.rollup(owner, month).await?.spent_by_category(),
        })
    }

    pub async fn list_budget_defaults(&self, owner: &Owner) -> DomainResult<Vec<BudgetDefault>> {
        let categories = self.store.categories(owner).await?;
        let mut defaults = self.store.budget_defaults(owner).await?;
        defaults.sort_by(|left, right| {
            let name_of = |id: &str| {
                categories
                    .iter()
                    .find(|category| category.id == id)
                    .map_or_else(String::new, |category| category.name.clone())
            };
            compare_names(&name_of(&left.category_id), &name_of(&right.category_id))
        });
        Ok(defaults)
    }

    pub async fn set_budget(
        &self,
        owner: &Owner,
        actor: Actor,
        input: &SetBudgetInput,
    ) -> DomainResult<Budget> {
        valid_minor(input.limit_minor, "Budget", true)?;
        self.spending_category(owner, &input.category_id).await?;

        let existing = self
            .store
            .budgets(owner, &input.month)
            .await?
            .into_iter()
            .find(|budget| budget.category_id == input.category_id);

        let budget = match (existing, input.expected_version) {
            (Some(_), None) => {
                return Err(DomainError::conflict(
                    "The budget already exists. Refresh and try again.",
                ));
            }
            (None, Some(_)) => {
                return Err(DomainError::conflict(
                    "The budget does not exist. Refresh and try again.",
                ));
            }
            (Some(current), Some(expected)) => {
                assert_version(current.version, expected)?;
                Budget {
                    limit_minor: input.limit_minor,
                    version: current.version + 1,
                    ..current
                }
            }
            (None, None) => Budget {
                id: self.ids.next("budget"),
                month: input.month.clone(),
                category_id: input.category_id.clone(),
                limit_minor: input.limit_minor,
                version: 1,
            },
        };

        let audit = self.audit(AuditAction::BudgetSet, actor, &budget.id, budget.version);
        self.store
            .put_budget(
                owner,
                EntityWrite {
                    entity: &budget,
                    expected_version: input.expected_version,
                    audit: &audit,
                },
            )
            .await?;
        Ok(budget)
    }

    pub async fn set_budget_default(
        &self,
        owner: &Owner,
        actor: Actor,
        input: &SetBudgetDefaultInput,
    ) -> DomainResult<BudgetDefault> {
        valid_minor(input.limit_minor, "Default budget", true)?;
        self.spending_category(owner, &input.category_id).await?;

        let existing = self
            .store
            .budget_defaults(owner)
            .await?
            .into_iter()
            .find(|budget| budget.category_id == input.category_id);

        let budget_default = match (existing, input.expected_version) {
            (Some(_), None) => {
                return Err(DomainError::conflict(
                    "The default budget already exists. Refresh and try again.",
                ));
            }
            (None, Some(_)) => {
                return Err(DomainError::conflict(
                    "The default budget does not exist. Refresh and try again.",
                ));
            }
            (Some(current), Some(expected)) => {
                assert_version(current.version, expected)?;
                BudgetDefault {
                    limit_minor: input.limit_minor,
                    version: current.version + 1,
                    ..current
                }
            }
            (None, None) => BudgetDefault {
                id: self.ids.next("budget-default"),
                category_id: input.category_id.clone(),
                limit_minor: input.limit_minor,
                version: 1,
            },
        };

        let audit = self.audit(
            AuditAction::BudgetDefaultSet,
            actor,
            &budget_default.id,
            budget_default.version,
        );
        self.store
            .put_budget_default(
                owner,
                EntityWrite {
                    entity: &budget_default,
                    expected_version: input.expected_version,
                    audit: &audit,
                },
            )
            .await?;
        Ok(budget_default)
    }

    async fn spending_category(&self, owner: &Owner, id: &str) -> DomainResult<()> {
        let category = self.active_category(owner, id).await?;
        if matches!(
            category.group,
            CategoryGroup::Income | CategoryGroup::Investment
        ) {
            return Err(DomainError::validation(
                "Budgets can only be set for spending categories.",
            ));
        }
        Ok(())
    }
}
