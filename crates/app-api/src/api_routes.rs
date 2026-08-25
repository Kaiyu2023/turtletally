use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::{Extension, Json};
use serde::Deserialize;
use turtle_tally_application::ports::{Actor, Owner};
use turtle_tally_domain::calendar::Month;
use turtle_tally_domain::types::{
    Account, BudgetDefault, BudgetProgress, Category, CreateAccountInput, CreateCategoryInput,
    CreateScheduleInput, CreateTransactionInput, DashboardSummary, DownloadGrant, Receipt,
    RequestUploadInput, Schedule, SetBudgetDefaultInput, SetBudgetInput, Transaction,
    TransactionFilters, TransactionPage, UpdateAccountInput, UpdateCategoryInput,
    UpdateScheduleInput, UpdateTransactionInput, UpdateUserPreferencesInput, UserPreferences,
};

use crate::error::ApiResult;
use crate::state::AppState;

/// The browser is the actor behind every request this ingress serves. An MCP
/// client reaches the same use cases through its own ingress and its own actor.
const ACTOR: Actor = Actor::Browser;

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ListQuery {
    #[serde(default)]
    include_inactive: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MonthQuery {
    month: Month,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExpectedVersion {
    expected_version: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VoidRequest {
    expected_version: u32,
    #[serde(default)]
    reason: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompleteUpload {
    checksum: String,
}

pub async fn get_preferences(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
) -> ApiResult<Json<UserPreferences>> {
    Ok(Json(state.finance.get_user_preferences(&owner).await?))
}

pub async fn update_preferences(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
    Json(input): Json<UpdateUserPreferencesInput>,
) -> ApiResult<Json<UserPreferences>> {
    Ok(Json(
        state
            .finance
            .update_user_preferences(&owner, ACTOR, &input)
            .await?,
    ))
}

pub async fn list_accounts(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
    Query(query): Query<ListQuery>,
) -> ApiResult<Json<Vec<Account>>> {
    Ok(Json(
        state
            .finance
            .list_accounts(&owner, query.include_inactive.unwrap_or_default())
            .await?,
    ))
}

pub async fn create_account(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
    Json(input): Json<CreateAccountInput>,
) -> ApiResult<Json<Account>> {
    Ok(Json(
        state.finance.create_account(&owner, ACTOR, &input).await?,
    ))
}

pub async fn update_account(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
    Path(id): Path<String>,
    Json(input): Json<UpdateAccountInput>,
) -> ApiResult<Json<Account>> {
    Ok(Json(
        state
            .finance
            .update_account(&owner, ACTOR, &id, &input)
            .await?,
    ))
}

pub async fn deactivate_account(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
    Path(id): Path<String>,
    Json(input): Json<ExpectedVersion>,
) -> ApiResult<Json<Account>> {
    Ok(Json(
        state
            .finance
            .deactivate_account(&owner, ACTOR, &id, input.expected_version)
            .await?,
    ))
}

pub async fn list_categories(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
    Query(query): Query<ListQuery>,
) -> ApiResult<Json<Vec<Category>>> {
    Ok(Json(
        state
            .finance
            .list_categories(&owner, query.include_inactive.unwrap_or_default())
            .await?,
    ))
}

pub async fn create_category(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
    Json(input): Json<CreateCategoryInput>,
) -> ApiResult<Json<Category>> {
    Ok(Json(
        state.finance.create_category(&owner, ACTOR, &input).await?,
    ))
}

pub async fn update_category(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
    Path(id): Path<String>,
    Json(input): Json<UpdateCategoryInput>,
) -> ApiResult<Json<Category>> {
    Ok(Json(
        state
            .finance
            .update_category(&owner, ACTOR, &id, &input)
            .await?,
    ))
}

pub async fn deactivate_category(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
    Path(id): Path<String>,
    Json(input): Json<ExpectedVersion>,
) -> ApiResult<Json<Category>> {
    Ok(Json(
        state
            .finance
            .deactivate_category(&owner, ACTOR, &id, input.expected_version)
            .await?,
    ))
}

pub async fn list_transactions(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
    Query(filters): Query<TransactionFilters>,
) -> ApiResult<Json<TransactionPage>> {
    Ok(Json(
        state.finance.list_transactions(&owner, &filters).await?,
    ))
}

pub async fn get_transaction(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
    Path(id): Path<String>,
) -> ApiResult<Json<Transaction>> {
    Ok(Json(state.finance.get_transaction(&owner, &id).await?))
}

pub async fn create_transaction(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
    Json(input): Json<CreateTransactionInput>,
) -> ApiResult<Json<Transaction>> {
    Ok(Json(
        state
            .finance
            .create_transaction(&owner, ACTOR, &input)
            .await?,
    ))
}

pub async fn update_transaction(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
    Path(id): Path<String>,
    Json(input): Json<UpdateTransactionInput>,
) -> ApiResult<Json<Transaction>> {
    Ok(Json(
        state
            .finance
            .update_transaction(&owner, ACTOR, &id, &input)
            .await?,
    ))
}

pub async fn void_transaction(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
    Path(id): Path<String>,
    Json(input): Json<VoidRequest>,
) -> ApiResult<Json<Transaction>> {
    Ok(Json(
        state
            .finance
            .void_transaction(
                &owner,
                ACTOR,
                &id,
                input.expected_version,
                input.reason.as_deref(),
            )
            .await?,
    ))
}

pub async fn list_budgets(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
    Query(query): Query<MonthQuery>,
) -> ApiResult<Json<Vec<BudgetProgress>>> {
    Ok(Json(
        state.finance.list_budgets(&owner, &query.month).await?,
    ))
}

pub async fn set_budget(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
    Json(input): Json<SetBudgetInput>,
) -> ApiResult<Json<turtle_tally_domain::types::Budget>> {
    Ok(Json(state.finance.set_budget(&owner, ACTOR, &input).await?))
}

pub async fn list_budget_defaults(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
) -> ApiResult<Json<Vec<BudgetDefault>>> {
    Ok(Json(state.finance.list_budget_defaults(&owner).await?))
}

pub async fn set_budget_default(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
    Json(input): Json<SetBudgetDefaultInput>,
) -> ApiResult<Json<BudgetDefault>> {
    Ok(Json(
        state
            .finance
            .set_budget_default(&owner, ACTOR, &input)
            .await?,
    ))
}

pub async fn get_dashboard(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
    Query(query): Query<MonthQuery>,
) -> ApiResult<Json<DashboardSummary>> {
    Ok(Json(
        state.finance.get_dashboard(&owner, &query.month).await?,
    ))
}

pub async fn list_schedules(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
    Query(query): Query<ListQuery>,
) -> ApiResult<Json<Vec<Schedule>>> {
    Ok(Json(
        state
            .finance
            .list_schedules(&owner, query.include_inactive.unwrap_or_default())
            .await?,
    ))
}

pub async fn create_schedule(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
    Json(input): Json<CreateScheduleInput>,
) -> ApiResult<Json<Schedule>> {
    Ok(Json(
        state.finance.create_schedule(&owner, ACTOR, &input).await?,
    ))
}

pub async fn update_schedule(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
    Path(id): Path<String>,
    Json(input): Json<UpdateScheduleInput>,
) -> ApiResult<Json<Schedule>> {
    Ok(Json(
        state
            .finance
            .update_schedule(&owner, ACTOR, &id, &input)
            .await?,
    ))
}

pub async fn deactivate_schedule(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
    Path(id): Path<String>,
    Json(input): Json<ExpectedVersion>,
) -> ApiResult<Json<Schedule>> {
    Ok(Json(
        state
            .finance
            .deactivate_schedule(&owner, ACTOR, &id, input.expected_version)
            .await?,
    ))
}

pub async fn request_receipt_upload(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
    Json(input): Json<RequestUploadInput>,
) -> ApiResult<Json<turtle_tally_domain::types::UploadGrant>> {
    Ok(Json(
        state.finance.request_receipt_upload(&owner, &input).await?,
    ))
}

pub async fn complete_receipt_upload(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
    Path(upload_id): Path<String>,
    Json(input): Json<CompleteUpload>,
) -> ApiResult<Json<Receipt>> {
    Ok(Json(
        state
            .finance
            .complete_receipt_upload(&owner, ACTOR, &upload_id, &input.checksum)
            .await?,
    ))
}

pub async fn receipt_download(
    State(state): State<Arc<AppState>>,
    Extension(owner): Extension<Owner>,
    Path(receipt_id): Path<String>,
) -> ApiResult<Json<DownloadGrant>> {
    Ok(Json(
        state
            .finance
            .receipt_download_url(&owner, &receipt_id)
            .await?,
    ))
}
