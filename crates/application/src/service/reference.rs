use turtle_tally_domain::error::{DomainError, DomainResult};
use turtle_tally_domain::reference::{sort_accounts, sort_categories};
use turtle_tally_domain::types::{
    Account, AppLocale, Category, CreateAccountInput, CreateCategoryInput, Currency,
    UpdateAccountInput, UpdateCategoryInput, UpdateUserPreferencesInput, UserPreferences,
};
use turtle_tally_domain::validation::{valid_colour, valid_name};

use super::{FinanceService, assert_active, assert_version};
use crate::ports::{Actor, AuditAction, EntityWrite, FinanceStore, ObjectStore, Owner};

impl<S: FinanceStore, O: ObjectStore> FinanceService<S, O> {
    pub async fn get_user_preferences(&self, owner: &Owner) -> DomainResult<UserPreferences> {
        Ok(self
            .store
            .preferences(owner)
            .await?
            .unwrap_or(UserPreferences {
                locale: AppLocale::EnGb,
                version: 0,
                updated_at: self.now(),
            }))
    }

    pub async fn update_user_preferences(
        &self,
        owner: &Owner,
        actor: Actor,
        input: &UpdateUserPreferencesInput,
    ) -> DomainResult<UserPreferences> {
        let current = self.get_user_preferences(owner).await?;
        assert_version(current.version, input.expected_version)?;

        let updated = UserPreferences {
            locale: input.locale,
            version: current.version + 1,
            updated_at: self.now(),
        };
        let audit = self.audit(
            AuditAction::PreferencesUpdated,
            actor,
            owner.as_str(),
            updated.version,
        );
        self.store
            .put_preferences(
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

    pub async fn list_accounts(
        &self,
        owner: &Owner,
        include_inactive: bool,
    ) -> DomainResult<Vec<Account>> {
        let mut accounts: Vec<Account> = self
            .store
            .accounts(owner)
            .await?
            .into_iter()
            .filter(|account| include_inactive || account.deactivated_at.is_none())
            .collect();
        sort_accounts(&mut accounts);
        Ok(accounts)
    }

    pub async fn create_account(
        &self,
        owner: &Owner,
        actor: Actor,
        input: &CreateAccountInput,
    ) -> DomainResult<Account> {
        let name = valid_name(&input.name, "Account name")?;
        valid_colour(&input.colour)?;
        self.assert_account_name_free(owner, &name, None).await?;

        let account = Account {
            id: self.ids.next("account"),
            name,
            account_type: input.account_type,
            currency: Currency::Gbp,
            balance_minor: input.opening_balance_minor,
            colour: input.colour.clone(),
            deactivated_at: None,
            version: 1,
        };
        let audit = self.audit(
            AuditAction::AccountCreated,
            actor,
            &account.id,
            account.version,
        );
        self.store
            .put_account(
                owner,
                EntityWrite {
                    entity: &account,
                    expected_version: None,
                    audit: &audit,
                },
            )
            .await?;
        Ok(account)
    }

    pub async fn update_account(
        &self,
        owner: &Owner,
        actor: Actor,
        id: &str,
        input: &UpdateAccountInput,
    ) -> DomainResult<Account> {
        let account = self.account(owner, id).await?;
        assert_version(account.version, input.expected_version)?;
        assert_active(account.deactivated_at.as_deref(), "Account")?;

        let name = match &input.name {
            Some(value) => valid_name(value, "Account name")?,
            None => account.name.clone(),
        };
        let colour = input
            .colour
            .clone()
            .unwrap_or_else(|| account.colour.clone());
        valid_colour(&colour)?;
        self.assert_account_name_free(owner, &name, Some(id))
            .await?;

        let updated = Account {
            name,
            account_type: input.account_type.unwrap_or(account.account_type),
            colour,
            version: account.version + 1,
            ..account
        };
        let audit = self.audit(
            AuditAction::AccountUpdated,
            actor,
            &updated.id,
            updated.version,
        );
        self.store
            .put_account(
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

    /// Deactivation instead of deletion: history keeps its account.
    pub async fn deactivate_account(
        &self,
        owner: &Owner,
        actor: Actor,
        id: &str,
        expected_version: u32,
    ) -> DomainResult<Account> {
        let account = self.account(owner, id).await?;
        assert_version(account.version, expected_version)?;
        assert_active(account.deactivated_at.as_deref(), "Account")?;

        let updated = Account {
            deactivated_at: Some(self.now()),
            version: account.version + 1,
            ..account
        };
        let audit = self.audit(
            AuditAction::AccountDeactivated,
            actor,
            &updated.id,
            updated.version,
        );
        self.store
            .put_account(
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

    pub async fn list_categories(
        &self,
        owner: &Owner,
        include_inactive: bool,
    ) -> DomainResult<Vec<Category>> {
        let mut categories: Vec<Category> = self
            .store
            .categories(owner)
            .await?
            .into_iter()
            .filter(|category| include_inactive || category.deactivated_at.is_none())
            .collect();
        sort_categories(&mut categories);
        Ok(categories)
    }

    pub async fn create_category(
        &self,
        owner: &Owner,
        actor: Actor,
        input: &CreateCategoryInput,
    ) -> DomainResult<Category> {
        let name = valid_name(&input.name, "Category name")?;
        valid_colour(&input.colour)?;
        self.assert_category_name_free(owner, &name, input.group, None)
            .await?;

        let category = Category {
            id: self.ids.next("category"),
            name,
            group: input.group,
            colour: input.colour.clone(),
            deactivated_at: None,
            version: 1,
        };
        let audit = self.audit(
            AuditAction::CategoryCreated,
            actor,
            &category.id,
            category.version,
        );
        self.store
            .put_category(
                owner,
                EntityWrite {
                    entity: &category,
                    expected_version: None,
                    audit: &audit,
                },
            )
            .await?;
        Ok(category)
    }

    pub async fn update_category(
        &self,
        owner: &Owner,
        actor: Actor,
        id: &str,
        input: &UpdateCategoryInput,
    ) -> DomainResult<Category> {
        let category = self.category(owner, id).await?;
        assert_version(category.version, input.expected_version)?;
        assert_active(category.deactivated_at.as_deref(), "Category")?;

        let name = match &input.name {
            Some(value) => valid_name(value, "Category name")?,
            None => category.name.clone(),
        };
        let group = input.group.unwrap_or(category.group);
        let colour = input
            .colour
            .clone()
            .unwrap_or_else(|| category.colour.clone());
        valid_colour(&colour)?;
        self.assert_category_name_free(owner, &name, group, Some(id))
            .await?;

        let updated = Category {
            name,
            group,
            colour,
            version: category.version + 1,
            ..category
        };
        let audit = self.audit(
            AuditAction::CategoryUpdated,
            actor,
            &updated.id,
            updated.version,
        );
        self.store
            .put_category(
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

    pub async fn deactivate_category(
        &self,
        owner: &Owner,
        actor: Actor,
        id: &str,
        expected_version: u32,
    ) -> DomainResult<Category> {
        let category = self.category(owner, id).await?;
        assert_version(category.version, expected_version)?;
        assert_active(category.deactivated_at.as_deref(), "Category")?;

        let updated = Category {
            deactivated_at: Some(self.now()),
            version: category.version + 1,
            ..category
        };
        let audit = self.audit(
            AuditAction::CategoryDeactivated,
            actor,
            &updated.id,
            updated.version,
        );
        self.store
            .put_category(
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

    async fn assert_account_name_free(
        &self,
        owner: &Owner,
        name: &str,
        except: Option<&str>,
    ) -> DomainResult<()> {
        let taken = self
            .store
            .accounts(owner)
            .await?
            .into_iter()
            .any(|account| {
                account.deactivated_at.is_none()
                    && Some(account.id.as_str()) != except
                    && account.name.to_lowercase() == name.to_lowercase()
            });
        if taken {
            return Err(DomainError::conflict(
                "An active account already uses that name.",
            ));
        }
        Ok(())
    }

    async fn assert_category_name_free(
        &self,
        owner: &Owner,
        name: &str,
        group: turtle_tally_domain::types::CategoryGroup,
        except: Option<&str>,
    ) -> DomainResult<()> {
        let taken = self
            .store
            .categories(owner)
            .await?
            .into_iter()
            .any(|category| {
                category.deactivated_at.is_none()
                    && Some(category.id.as_str()) != except
                    && category.group == group
                    && category.name.to_lowercase() == name.to_lowercase()
            });
        if taken {
            return Err(DomainError::conflict(
                "An active category already uses that name in this group.",
            ));
        }
        Ok(())
    }
}
