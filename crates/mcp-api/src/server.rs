use std::sync::Arc;

use rmcp::model::{
    CallToolRequestParams, CallToolResponse, CallToolResult, Implementation, InitializeResult,
    ListToolsResult, PaginatedRequestParams, ProtocolVersion, ServerCapabilities, ServerInfo,
};
use rmcp::service::RequestContext;
use rmcp::{ErrorData as McpError, RoleServer, ServerHandler};
use serde::Deserialize;
use serde_json::{Value, json};
use turtle_tally_application::assistant::{AssistantOperation, CommittedOperation};
use turtle_tally_application::ports::Owner;
use turtle_tally_domain::calendar::Month;
use turtle_tally_domain::error::DomainError;
use turtle_tally_domain::types::{
    CreateTransactionInput, SetBudgetInput, TransactionFilters, TransactionKind,
};

use crate::state::Assistant;
use crate::tools;

/// The conversational surface. It reaches the same use cases the browser does,
/// through its own ingress and its own actor (ADR 0004), and every mutation is
/// a preview the owner can read and a commit that applies exactly that
/// (ADR 0005).
#[derive(Clone)]
pub struct TurtleTallyServer {
    assistant: Arc<Assistant>,
}

impl TurtleTallyServer {
    pub fn new(assistant: Arc<Assistant>) -> Self {
        Self { assistant }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MonthArgument {
    month: Month,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ListArgument {
    month: Month,
    #[serde(default)]
    search: Option<String>,
    #[serde(default)]
    limit: Option<u32>,
    #[serde(default)]
    cursor: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AddEntryArgument {
    account_id: String,
    #[serde(default)]
    category_id: Option<String>,
    description: String,
    amount_minor: i64,
    kind: TransactionKind,
    local_date: turtle_tally_domain::calendar::LocalDate,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct VoidEntryArgument {
    transaction_id: String,
    expected_version: u32,
    #[serde(default)]
    reason: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SetBudgetArgument {
    month: Month,
    category_id: String,
    limit_minor: i64,
    #[serde(default)]
    expected_version: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CommitArgument {
    operation_id: String,
    expected_hash: String,
}

impl ServerHandler for TurtleTallyServer {
    fn get_info(&self) -> ServerInfo {
        InitializeResult::new(ServerCapabilities::builder().enable_tools().build())
            .with_protocol_version(ProtocolVersion::LATEST)
            .with_server_info(Implementation::new(
                "turtle-tally",
                env!("CARGO_PKG_VERSION"),
            ))
            .with_instructions(
                "One person's ledger. Reads name the month they cover. Every change is proposed \
                 with a preview tool, shown to the owner, and then applied with the matching \
                 commit tool using the identifier and hash the preview returned.",
            )
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, McpError> {
        Ok(ListToolsResult::with_all_items(tools::catalogue()))
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, McpError> {
        let owner = owner_of(&context)?;
        let arguments = Value::Object(request.arguments.unwrap_or_default());

        let outcome = match request.name.as_ref() {
            "get_month_overview" => self.month_overview(&owner, arguments).await,
            "list_transactions" => self.transactions(&owner, arguments).await,
            "list_budgets" => self.budgets(&owner, arguments).await,
            "list_accounts" => self.accounts(&owner).await,
            "list_categories" => self.categories(&owner).await,
            "preview_add_entry" => self.preview_add(&owner, arguments).await,
            "preview_void_entry" => self.preview_void(&owner, arguments).await,
            "preview_set_budget" => self.preview_budget(&owner, arguments).await,
            "commit_add_entry" | "commit_void_entry" | "commit_set_budget" => {
                self.commit(&owner, arguments).await
            }
            unknown => {
                return Err(McpError::invalid_params(
                    format!("There is no tool called {unknown}."),
                    None,
                ));
            }
        };

        Ok(match outcome {
            Ok(value) => CallToolResult::structured(value),
            // A refusal is the tool's answer, not a protocol failure: the model
            // and the owner both need to read why.
            Err(error) => {
                CallToolResult::error(vec![rmcp::model::ContentBlock::text(error.message)])
            }
        }
        .into())
    }
}

type ToolOutcome = Result<Value, DomainError>;

impl TurtleTallyServer {
    async fn month_overview(&self, owner: &Owner, arguments: Value) -> ToolOutcome {
        let request: MonthArgument = parse(arguments)?;
        let summary = self
            .assistant
            .finance()
            .get_dashboard(owner, &request.month)
            .await?;
        to_value(&summary)
    }

    async fn transactions(&self, owner: &Owner, arguments: Value) -> ToolOutcome {
        let request: ListArgument = parse(arguments)?;
        let page = self
            .assistant
            .finance()
            .list_transactions(
                owner,
                &TransactionFilters {
                    month: Some(request.month),
                    search: request.search,
                    limit: request.limit,
                    cursor: request.cursor,
                    ..TransactionFilters::default()
                },
            )
            .await?;
        to_value(&page)
    }

    async fn budgets(&self, owner: &Owner, arguments: Value) -> ToolOutcome {
        let request: MonthArgument = parse(arguments)?;
        to_value(
            &self
                .assistant
                .finance()
                .list_budgets(owner, &request.month)
                .await?,
        )
    }

    async fn accounts(&self, owner: &Owner) -> ToolOutcome {
        to_value(&self.assistant.finance().list_accounts(owner, false).await?)
    }

    async fn categories(&self, owner: &Owner) -> ToolOutcome {
        to_value(
            &self
                .assistant
                .finance()
                .list_categories(owner, false)
                .await?,
        )
    }

    async fn preview_add(&self, owner: &Owner, arguments: Value) -> ToolOutcome {
        let request: AddEntryArgument = parse(arguments)?;
        let preview = self
            .assistant
            .preview(
                owner,
                AssistantOperation::AddTransaction {
                    input: CreateTransactionInput {
                        account_id: request.account_id,
                        category_id: request.category_id,
                        description: request.description,
                        amount_minor: request.amount_minor,
                        kind: request.kind,
                        local_date: request.local_date,
                        occurred_at: None,
                        origin: None,
                        receipt_id: None,
                    },
                },
            )
            .await?;
        to_value(&preview)
    }

    async fn preview_void(&self, owner: &Owner, arguments: Value) -> ToolOutcome {
        let request: VoidEntryArgument = parse(arguments)?;
        let preview = self
            .assistant
            .preview(
                owner,
                AssistantOperation::VoidTransaction {
                    transaction_id: request.transaction_id,
                    expected_version: request.expected_version,
                    reason: request.reason,
                },
            )
            .await?;
        to_value(&preview)
    }

    async fn preview_budget(&self, owner: &Owner, arguments: Value) -> ToolOutcome {
        let request: SetBudgetArgument = parse(arguments)?;
        let preview = self
            .assistant
            .preview(
                owner,
                AssistantOperation::SetBudget {
                    input: SetBudgetInput {
                        month: request.month,
                        category_id: request.category_id,
                        limit_minor: request.limit_minor,
                        expected_version: request.expected_version,
                    },
                },
            )
            .await?;
        to_value(&preview)
    }

    async fn commit(&self, owner: &Owner, arguments: Value) -> ToolOutcome {
        let request: CommitArgument = parse(arguments)?;
        match self
            .assistant
            .commit(owner, &request.operation_id, &request.expected_hash)
            .await?
        {
            CommittedOperation::Transaction(transaction) => {
                Ok(json!({ "applied": "transaction", "transaction": to_value(&transaction)? }))
            }
            CommittedOperation::Budget(budget) => {
                Ok(json!({ "applied": "budget", "budget": to_value(&budget)? }))
            }
        }
    }
}

/// The owner comes from the verified token this request carried, never from the
/// arguments a model supplied.
fn owner_of(context: &RequestContext<RoleServer>) -> Result<Owner, McpError> {
    context
        .extensions
        .get::<http::request::Parts>()
        .and_then(|parts| parts.extensions.get::<Owner>())
        .cloned()
        .ok_or_else(|| McpError::invalid_request("This request carries no verified owner.", None))
}

fn parse<T: serde::de::DeserializeOwned>(arguments: Value) -> Result<T, DomainError> {
    serde_json::from_value(arguments).map_err(|error| {
        DomainError::validation(format!("Those arguments are not usable: {error}"))
    })
}

fn to_value<T: serde::Serialize>(value: &T) -> ToolOutcome {
    serde_json::to_value(value)
        .map_err(|_| DomainError::validation("That result could not be returned."))
}
