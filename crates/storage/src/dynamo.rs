use std::collections::HashMap;

use aws_sdk_dynamodb::Client;
use aws_sdk_dynamodb::error::SdkError;
use aws_sdk_dynamodb::operation::put_item::PutItemError;
use aws_sdk_dynamodb::operation::transact_write_items::TransactWriteItemsError;
use aws_sdk_dynamodb::types::{AttributeValue, Put, TransactWriteItem, Update};
use serde::Serialize;
use serde::de::DeserializeOwned;
use turtle_tally_application::ports::{
    AuditEvent, EntityWrite, FinanceStore, LedgerWrite, Owner, PendingUpload,
};
use turtle_tally_domain::calendar::{LocalDate, Month};
use turtle_tally_domain::error::{DomainError, DomainResult};
use turtle_tally_domain::rollup::{MonthlyRollup, RollupDelta, rebuild_month};
use turtle_tally_domain::types::{
    Account, Budget, BudgetDefault, Category, Receipt, Schedule, Transaction, UserPreferences,
};

use crate::attribute::{from_item, number, text, to_item};

/// The key attributes belong to the table, not to the contract, so they are
/// removed before a record is read back into its own type.
fn entity_from<T: DeserializeOwned>(mut item: HashMap<String, AttributeValue>) -> DomainResult<T> {
    for attribute in [PARTITION, SORT, LOOKUP_PARTITION, LOOKUP_SORT] {
        item.remove(attribute);
    }
    from_item(item)
}

use crate::keys;

/// A transactional write is capped at one hundred items. Every path that can
/// grow with input is bounded before it reaches this, and exceeding it is a
/// refusal rather than a partial write.
const MAX_TRANSACT_ITEMS: usize = 100;
const PARTITION: &str = "PK";
const SORT: &str = "SK";
const LOOKUP_PARTITION: &str = "GSI1PK";
const LOOKUP_SORT: &str = "GSI1SK";
const TRANSACTION_LOOKUP_INDEX: &str = "TransactionById";
const MAX_RECENT_PAGES: usize = 5;

#[derive(Clone, Debug)]
pub struct StoreTables {
    pub finance: String,
    pub audit: String,
}

pub struct DynamoStore {
    client: Client,
    tables: StoreTables,
}

impl DynamoStore {
    pub fn new(client: Client, tables: StoreTables) -> Self {
        Self { client, tables }
    }

    async fn get<T: DeserializeOwned>(
        &self,
        partition: &str,
        sort: &str,
    ) -> DomainResult<Option<T>> {
        let response = self
            .client
            .get_item()
            .table_name(&self.tables.finance)
            .key(PARTITION, text(partition))
            .key(SORT, text(sort))
            .send()
            .await
            .map_err(read_failed)?;

        response.item.map(entity_from).transpose()
    }

    async fn query_prefix<T: DeserializeOwned>(
        &self,
        partition: &str,
        prefix: &str,
    ) -> DomainResult<Vec<T>> {
        let mut items = Vec::new();
        let mut start: Option<HashMap<String, AttributeValue>> = None;

        loop {
            let response = self
                .client
                .query()
                .table_name(&self.tables.finance)
                .key_condition_expression("#partition = :partition AND begins_with(#sort, :prefix)")
                .expression_attribute_names("#partition", PARTITION)
                .expression_attribute_names("#sort", SORT)
                .expression_attribute_values(":partition", text(partition))
                .expression_attribute_values(":prefix", text(prefix))
                .set_exclusive_start_key(start)
                .send()
                .await
                .map_err(read_failed)?;

            for item in response.items.unwrap_or_default() {
                items.push(entity_from(item)?);
            }

            start = response.last_evaluated_key;
            if start.is_none() {
                return Ok(items);
            }
        }
    }

    async fn put_entity<T: Serialize>(
        &self,
        owner: &Owner,
        sort: &str,
        write: EntityWrite<'_, T>,
    ) -> DomainResult<()> {
        let item = self.entity_item(&keys::owner_partition(owner), sort, write.entity)?;
        let put = version_condition(
            Put::builder()
                .table_name(&self.tables.finance)
                .set_item(Some(item)),
            write.expected_version,
        );

        self.commit(vec![
            TransactWriteItem::builder()
                .put(put.build().map_err(build_failed)?)
                .build(),
            self.audit_item(owner, write.audit)?,
        ])
        .await
    }

    fn entity_item<T: Serialize>(
        &self,
        partition: &str,
        sort: &str,
        entity: &T,
    ) -> DomainResult<HashMap<String, AttributeValue>> {
        let mut item = to_item(entity)?;
        item.insert(PARTITION.to_owned(), text(partition));
        item.insert(SORT.to_owned(), text(sort));
        Ok(item)
    }

    fn audit_item(&self, owner: &Owner, audit: &AuditEvent) -> DomainResult<TransactWriteItem> {
        let mut item = to_item(audit)?;
        item.insert(PARTITION.to_owned(), text(keys::audit_partition(owner)));
        item.insert(
            SORT.to_owned(),
            text(keys::audit_key(&audit.recorded_at, &audit.id)),
        );

        let put = Put::builder()
            .table_name(&self.tables.audit)
            .set_item(Some(item))
            .condition_expression("attribute_not_exists(#partition)")
            .expression_attribute_names("#partition", PARTITION)
            .build()
            .map_err(build_failed)?;
        Ok(TransactWriteItem::builder().put(put).build())
    }

    async fn commit(&self, items: Vec<TransactWriteItem>) -> DomainResult<()> {
        if items.len() > MAX_TRANSACT_ITEMS {
            return Err(DomainError::validation(
                "That change is too large to commit in one transaction.",
            ));
        }

        self.client
            .transact_write_items()
            .set_transact_items(Some(items))
            .send()
            .await
            .map_err(commit_failed)
            .map(|_| ())
    }

    /// The rollup's two maps must exist before a nested addition can name a key
    /// inside them, and DynamoDB cannot both create a map and write into it in
    /// one expression.
    async fn ensure_rollup(&self, owner: &Owner, month: &Month) -> DomainResult<()> {
        self.client
            .update_item()
            .table_name(&self.tables.finance)
            .key(PARTITION, text(keys::owner_partition(owner)))
            .key(SORT, text(keys::rollup_key(month)))
            .update_expression(
                "SET #month = :month, #category = if_not_exists(#category, :empty), #daily = if_not_exists(#daily, :empty)",
            )
            .expression_attribute_names("#month", "month")
            .expression_attribute_names("#category", "spendingByCategory")
            .expression_attribute_names("#daily", "dailySpending")
            .expression_attribute_values(":month", text(month.to_string()))
            .expression_attribute_values(":empty", AttributeValue::M(HashMap::new()))
            .send()
            .await
            .map_err(write_failed)
            .map(|_| ())
    }

    fn rollup_update(&self, owner: &Owner, delta: &RollupDelta) -> DomainResult<TransactWriteItem> {
        let mut names: HashMap<String, String> = HashMap::new();
        let mut values: HashMap<String, AttributeValue> = HashMap::new();
        let mut additions: Vec<String> = Vec::new();
        let mut sets: Vec<String> = Vec::new();

        for (attribute, amount) in [
            ("incomeMinor", delta.income_minor),
            ("spendingMinor", delta.spending_minor),
            ("investmentCreditsMinor", delta.investment_credits_minor),
            ("investmentDebitsMinor", delta.investment_debits_minor),
            ("netCashFlowMinor", delta.net_cash_flow_minor),
            ("transactionCount", delta.transaction_count),
        ] {
            let placeholder = format!(":{attribute}");
            additions.push(format!("{attribute} {placeholder}"));
            values.insert(placeholder, number(amount));
        }

        values.insert(":zero".to_owned(), number(0));
        names.insert("#category".to_owned(), "spendingByCategory".to_owned());
        names.insert("#daily".to_owned(), "dailySpending".to_owned());

        for (index, (category_id, amount)) in delta.spending_by_category.iter().enumerate() {
            let name = format!("#c{index}");
            let value = format!(":c{index}");
            names.insert(name.clone(), category_id.clone());
            values.insert(value.clone(), number(*amount));
            sets.push(format!(
                "#category.{name} = if_not_exists(#category.{name}, :zero) + {value}"
            ));
        }

        for (index, (day, amount)) in delta.daily_spending.iter().enumerate() {
            let name = format!("#d{index}");
            let value = format!(":d{index}");
            names.insert(name.clone(), day.to_string());
            values.insert(value.clone(), number(*amount));
            sets.push(format!(
                "#daily.{name} = if_not_exists(#daily.{name}, :zero) + {value}"
            ));
        }

        let mut expression = format!("ADD {}", additions.join(", "));
        if !sets.is_empty() {
            expression = format!("{expression} SET {}", sets.join(", "));
        }

        let update = Update::builder()
            .table_name(&self.tables.finance)
            .key(PARTITION, text(keys::owner_partition(owner)))
            .key(SORT, text(keys::rollup_key(&delta.month)))
            .update_expression(expression)
            .set_expression_attribute_names(Some(names))
            .set_expression_attribute_values(Some(values))
            .build()
            .map_err(build_failed)?;
        Ok(TransactWriteItem::builder().update(update).build())
    }

    fn balance_update(
        &self,
        owner: &Owner,
        account_id: &str,
        amount_minor: i64,
    ) -> DomainResult<TransactWriteItem> {
        let update = Update::builder()
            .table_name(&self.tables.finance)
            .key(PARTITION, text(keys::owner_partition(owner)))
            .key(SORT, text(keys::account_key(account_id)))
            .update_expression("ADD balanceMinor :amount")
            .condition_expression("attribute_exists(#partition)")
            .expression_attribute_names("#partition", PARTITION)
            .expression_attribute_values(":amount", number(amount_minor))
            .build()
            .map_err(build_failed)?;
        Ok(TransactWriteItem::builder().update(update).build())
    }

    fn transaction_item(
        &self,
        owner: &Owner,
        transaction: &Transaction,
    ) -> DomainResult<HashMap<String, AttributeValue>> {
        let mut item = self.entity_item(
            &keys::ledger_partition(owner, &transaction.local_date.month()),
            &keys::transaction_key(transaction),
            transaction,
        )?;
        item.insert(
            LOOKUP_PARTITION.to_owned(),
            text(keys::transaction_lookup_partition(owner)),
        );
        item.insert(LOOKUP_SORT.to_owned(), text(transaction.id.clone()));
        Ok(item)
    }

    async fn month_partition(
        &self,
        owner: &Owner,
        month: &Month,
    ) -> DomainResult<Vec<Transaction>> {
        self.query_prefix(
            &keys::ledger_partition(owner, month),
            keys::TRANSACTION_PREFIX,
        )
        .await
    }
}

impl FinanceStore for DynamoStore {
    async fn preferences(&self, owner: &Owner) -> DomainResult<Option<UserPreferences>> {
        self.get(&keys::owner_partition(owner), keys::PREFERENCES_KEY)
            .await
    }

    async fn put_preferences(
        &self,
        owner: &Owner,
        write: EntityWrite<'_, UserPreferences>,
    ) -> DomainResult<()> {
        self.put_entity(owner, keys::PREFERENCES_KEY, write).await
    }

    async fn accounts(&self, owner: &Owner) -> DomainResult<Vec<Account>> {
        self.query_prefix(&keys::owner_partition(owner), keys::ACCOUNT_PREFIX)
            .await
    }

    async fn put_account(
        &self,
        owner: &Owner,
        write: EntityWrite<'_, Account>,
    ) -> DomainResult<()> {
        let sort = keys::account_key(&write.entity.id);
        self.put_entity(owner, &sort, write).await
    }

    async fn categories(&self, owner: &Owner) -> DomainResult<Vec<Category>> {
        self.query_prefix(&keys::owner_partition(owner), keys::CATEGORY_PREFIX)
            .await
    }

    async fn put_category(
        &self,
        owner: &Owner,
        write: EntityWrite<'_, Category>,
    ) -> DomainResult<()> {
        let sort = keys::category_key(&write.entity.id);
        self.put_entity(owner, &sort, write).await
    }

    async fn budgets(&self, owner: &Owner, month: &Month) -> DomainResult<Vec<Budget>> {
        self.query_prefix(
            &keys::owner_partition(owner),
            &format!("{}{month}#", keys::BUDGET_PREFIX),
        )
        .await
    }

    async fn put_budget(&self, owner: &Owner, write: EntityWrite<'_, Budget>) -> DomainResult<()> {
        let sort = keys::budget_key(&write.entity.month, &write.entity.category_id);
        self.put_entity(owner, &sort, write).await
    }

    async fn budget_defaults(&self, owner: &Owner) -> DomainResult<Vec<BudgetDefault>> {
        self.query_prefix(&keys::owner_partition(owner), keys::BUDGET_DEFAULT_PREFIX)
            .await
    }

    async fn put_budget_default(
        &self,
        owner: &Owner,
        write: EntityWrite<'_, BudgetDefault>,
    ) -> DomainResult<()> {
        let sort = keys::budget_default_key(&write.entity.category_id);
        self.put_entity(owner, &sort, write).await
    }

    async fn schedules(&self, owner: &Owner) -> DomainResult<Vec<Schedule>> {
        self.query_prefix(&keys::owner_partition(owner), keys::SCHEDULE_PREFIX)
            .await
    }

    async fn put_schedule(
        &self,
        owner: &Owner,
        write: EntityWrite<'_, Schedule>,
    ) -> DomainResult<()> {
        let sort = keys::schedule_key(&write.entity.id);
        self.put_entity(owner, &sort, write).await
    }

    async fn transaction(&self, owner: &Owner, id: &str) -> DomainResult<Option<Transaction>> {
        let response = self
            .client
            .query()
            .table_name(&self.tables.finance)
            .index_name(TRANSACTION_LOOKUP_INDEX)
            .key_condition_expression("#partition = :partition AND #sort = :id")
            .expression_attribute_names("#partition", LOOKUP_PARTITION)
            .expression_attribute_names("#sort", LOOKUP_SORT)
            .expression_attribute_values(
                ":partition",
                text(keys::transaction_lookup_partition(owner)),
            )
            .expression_attribute_values(":id", text(id))
            .limit(1)
            .send()
            .await
            .map_err(read_failed)?;

        response
            .items
            .unwrap_or_default()
            .into_iter()
            .next()
            .map(entity_from)
            .transpose()
    }

    async fn transactions_between(
        &self,
        owner: &Owner,
        from: &LocalDate,
        to: &LocalDate,
    ) -> DomainResult<Vec<Transaction>> {
        let mut transactions = Vec::new();
        let mut month = from.month();

        while month.as_str() <= to.month().as_str() {
            transactions.extend(
                self.month_partition(owner, &month)
                    .await?
                    .into_iter()
                    .filter(|transaction| {
                        &transaction.local_date >= from && &transaction.local_date <= to
                    }),
            );
            month = month.next();
        }

        Ok(transactions)
    }

    /// The ledger sort key already orders by instant, so the newest rows are the
    /// first page read backwards. Voided rows are skipped as they are read
    /// rather than by widening the query.
    async fn recent_transactions(
        &self,
        owner: &Owner,
        month: &Month,
        limit: u32,
    ) -> DomainResult<Vec<Transaction>> {
        let mut collected: Vec<Transaction> = Vec::new();
        let mut start: Option<HashMap<String, AttributeValue>> = None;

        for _ in 0..MAX_RECENT_PAGES {
            let response = self
                .client
                .query()
                .table_name(&self.tables.finance)
                .key_condition_expression("#partition = :partition AND begins_with(#sort, :prefix)")
                .expression_attribute_names("#partition", PARTITION)
                .expression_attribute_names("#sort", SORT)
                .expression_attribute_values(
                    ":partition",
                    text(keys::ledger_partition(owner, month)),
                )
                .expression_attribute_values(":prefix", text(keys::TRANSACTION_PREFIX))
                .scan_index_forward(false)
                .limit(i32::try_from(limit * 2).unwrap_or(i32::MAX))
                .set_exclusive_start_key(start)
                .send()
                .await
                .map_err(read_failed)?;

            for item in response.items.unwrap_or_default() {
                let transaction: Transaction = entity_from(item)?;
                if transaction.is_active() {
                    collected.push(transaction);
                }
                if collected.len() == limit as usize {
                    return Ok(collected);
                }
            }

            start = response.last_evaluated_key;
            if start.is_none() {
                break;
            }
        }

        Ok(collected)
    }

    async fn rollup(&self, owner: &Owner, month: &Month) -> DomainResult<MonthlyRollup> {
        Ok(self
            .get::<MonthlyRollup>(&keys::owner_partition(owner), &keys::rollup_key(month))
            .await?
            .unwrap_or_else(|| MonthlyRollup::empty(month.clone())))
    }

    async fn commit_ledger(&self, owner: &Owner, write: &LedgerWrite) -> DomainResult<()> {
        for delta in &write.rollup_deltas {
            self.ensure_rollup(owner, &delta.month).await?;
        }

        let mut items: Vec<TransactWriteItem> = Vec::new();

        for entry in &write.transactions {
            let item = self.transaction_item(owner, &entry.transaction)?;
            let put = version_condition(
                Put::builder()
                    .table_name(&self.tables.finance)
                    .set_item(Some(item)),
                entry.expected_version,
            );
            items.push(
                TransactWriteItem::builder()
                    .put(put.build().map_err(build_failed)?)
                    .build(),
            );
        }

        for entry in &write.schedules {
            let item = self.entity_item(
                &keys::owner_partition(owner),
                &keys::schedule_key(&entry.schedule.id),
                &entry.schedule,
            )?;
            let put = version_condition(
                Put::builder()
                    .table_name(&self.tables.finance)
                    .set_item(Some(item)),
                entry.expected_version,
            );
            items.push(
                TransactWriteItem::builder()
                    .put(put.build().map_err(build_failed)?)
                    .build(),
            );
        }

        for delta in &write.rollup_deltas {
            items.push(self.rollup_update(owner, delta)?);
        }

        for delta in &write.balance_deltas {
            items.push(self.balance_update(owner, &delta.account_id, delta.amount_minor)?);
        }

        for event in &write.audit {
            items.push(self.audit_item(owner, event)?);
        }

        self.commit(items).await
    }

    async fn rebuild_rollup(&self, owner: &Owner, month: &Month) -> DomainResult<MonthlyRollup> {
        let rebuilt = rebuild_month(month, &self.month_partition(owner, month).await?);
        let item = self.entity_item(
            &keys::owner_partition(owner),
            &keys::rollup_key(month),
            &rebuilt,
        )?;

        self.client
            .put_item()
            .table_name(&self.tables.finance)
            .set_item(Some(item))
            .send()
            .await
            .map_err(put_failed)?;
        Ok(rebuilt)
    }

    async fn receipt(&self, owner: &Owner, id: &str) -> DomainResult<Option<Receipt>> {
        self.get(&keys::owner_partition(owner), &keys::receipt_key(id))
            .await
    }

    async fn put_receipt(
        &self,
        owner: &Owner,
        write: EntityWrite<'_, Receipt>,
    ) -> DomainResult<()> {
        let sort = keys::receipt_key(&write.entity.id);
        self.put_entity(owner, &sort, write).await
    }

    async fn put_pending_upload(&self, owner: &Owner, upload: &PendingUpload) -> DomainResult<()> {
        let mut item = to_item(&StoredUpload::from(upload))?;
        item.insert(PARTITION.to_owned(), text(keys::owner_partition(owner)));
        item.insert(SORT.to_owned(), text(keys::upload_key(&upload.id)));

        self.client
            .put_item()
            .table_name(&self.tables.finance)
            .set_item(Some(item))
            .send()
            .await
            .map_err(put_failed)
            .map(|_| ())
    }

    /// Deleting the record is what makes the grant single use: a second
    /// redemption finds nothing to return.
    async fn take_pending_upload(
        &self,
        owner: &Owner,
        id: &str,
    ) -> DomainResult<Option<PendingUpload>> {
        let response = self
            .client
            .delete_item()
            .table_name(&self.tables.finance)
            .key(PARTITION, text(keys::owner_partition(owner)))
            .key(SORT, text(keys::upload_key(id)))
            .return_values(aws_sdk_dynamodb::types::ReturnValue::AllOld)
            .send()
            .await
            .map_err(write_failed)?;

        response
            .attributes
            .map(|item| entity_from::<StoredUpload>(item).map(PendingUpload::from))
            .transpose()
    }
}

#[derive(Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StoredUpload {
    id: String,
    key: String,
    file_name: String,
    media_type: turtle_tally_domain::types::UploadMediaType,
    size_bytes: i64,
    expires_at: String,
    /// The table's time-to-live attribute, so an unredeemed grant disappears
    /// without a cleanup job.
    ttl: i64,
}

impl From<&PendingUpload> for StoredUpload {
    fn from(upload: &PendingUpload) -> Self {
        let ttl = chrono::DateTime::parse_from_rfc3339(&upload.expires_at)
            .map(|value| value.timestamp())
            .unwrap_or_default();
        Self {
            id: upload.id.clone(),
            key: upload.key.clone(),
            file_name: upload.file_name.clone(),
            media_type: upload.media_type,
            size_bytes: i64::try_from(upload.size_bytes).unwrap_or(i64::MAX),
            expires_at: upload.expires_at.clone(),
            ttl,
        }
    }
}

impl From<StoredUpload> for PendingUpload {
    fn from(stored: StoredUpload) -> Self {
        Self {
            id: stored.id,
            key: stored.key,
            file_name: stored.file_name,
            media_type: stored.media_type,
            size_bytes: u64::try_from(stored.size_bytes).unwrap_or_default(),
            expires_at: stored.expires_at,
        }
    }
}

fn version_condition(
    put: aws_sdk_dynamodb::types::builders::PutBuilder,
    expected_version: Option<u32>,
) -> aws_sdk_dynamodb::types::builders::PutBuilder {
    match expected_version {
        Some(version) => put
            .condition_expression("#version = :expected")
            .expression_attribute_names("#version", "version")
            .expression_attribute_values(":expected", number(i64::from(version))),
        None => put
            .condition_expression("attribute_not_exists(#partition)")
            .expression_attribute_names("#partition", PARTITION),
    }
}

fn read_failed<E, R>(error: SdkError<E, R>) -> DomainError {
    DomainError::validation(format!("The store could not be read: {}", kind_of(&error)))
}

fn write_failed<E, R>(error: SdkError<E, R>) -> DomainError {
    DomainError::validation(format!("The store rejected the write: {}", kind_of(&error)))
}

/// A failed condition is a stale write, not a server fault: the caller loaded an
/// older version, or the row it expected to create already exists. ADR 0007
/// commits the ledger row, its rollup delta, and its audit event together, so a
/// single failed condition cancels all of them.
fn commit_failed(error: SdkError<TransactWriteItemsError>) -> DomainError {
    if let SdkError::ServiceError(service) = &error
        && let TransactWriteItemsError::TransactionCanceledException(cancelled) = service.err()
        && cancelled
            .cancellation_reasons()
            .iter()
            .any(|reason| reason.code() == Some("ConditionalCheckFailed"))
    {
        return DomainError::conflict(
            "This item changed since it was loaded. Refresh and try again.",
        );
    }

    write_failed(error)
}

fn put_failed(error: SdkError<PutItemError>) -> DomainError {
    if let SdkError::ServiceError(service) = &error
        && matches!(
            service.err(),
            PutItemError::ConditionalCheckFailedException(_)
        )
    {
        return DomainError::conflict(
            "This item changed since it was loaded. Refresh and try again.",
        );
    }

    write_failed(error)
}

fn build_failed(error: aws_sdk_dynamodb::error::BuildError) -> DomainError {
    DomainError::validation(format!("A stored item could not be built: {error}"))
}

fn kind_of<E, R>(error: &SdkError<E, R>) -> &'static str {
    match error {
        SdkError::ConstructionFailure(_) => "the request could not be built",
        SdkError::TimeoutError(_) => "the request timed out",
        SdkError::DispatchFailure(_) => "the request could not be sent",
        SdkError::ResponseError(_) => "the response could not be read",
        SdkError::ServiceError(_) => "the service refused the request",
        _ => "the request failed",
    }
}
