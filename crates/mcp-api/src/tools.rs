use rmcp::model::{Tool, ToolAnnotations};
use serde_json::{Map, Value, json};

/// ADR 0004 keeps the tool surface action-specific and bounded: no generic
/// query, no patch, no delete, and no database. ADR 0005 makes every mutation a
/// preview the client can show and a commit that applies exactly what was
/// previewed.
pub fn catalogue() -> Vec<Tool> {
    vec![
        read_tool(
            "get_month_overview",
            "Totals, budgets, and the most recent entries for one month of the owner's ledger.",
            object(
                &[("month", string("The month to summarise, as YYYY-MM."))],
                &["month"],
            ),
        ),
        read_tool(
            "list_transactions",
            "One page of ledger entries inside a named month, newest first. Ask for the next page with the cursor the previous page returned.",
            object(
                &[
                    ("month", string("The month to read, as YYYY-MM.")),
                    (
                        "search",
                        string(
                            "Optional text to match against description, account, and category.",
                        ),
                    ),
                    (
                        "limit",
                        integer("How many entries to return, from 1 to 100. Defaults to 10."),
                    ),
                    (
                        "cursor",
                        string("The cursor returned by the previous page."),
                    ),
                ],
                &["month"],
            ),
        ),
        read_tool(
            "list_budgets",
            "The owner's budgets for one month, with what has been spent against each.",
            object(
                &[("month", string("The month to read, as YYYY-MM."))],
                &["month"],
            ),
        ),
        read_tool(
            "list_accounts",
            "The owner's active accounts and their balances.",
            object(&[], &[]),
        ),
        read_tool(
            "list_categories",
            "The owner's active categories and the group each belongs to.",
            object(&[], &[]),
        ),
        preview_tool(
            "preview_add_entry",
            "Describe the ledger entry that adding this would create, without adding it. Show the result to the owner, then call commit_add_entry with the identifier and hash returned here.",
            object(
                &[
                    ("accountId", string("The account the entry belongs to.")),
                    (
                        "categoryId",
                        string("The category the entry belongs to, if any."),
                    ),
                    ("description", string("What the entry is for.")),
                    (
                        "amountMinor",
                        integer(
                            "Signed pence: negative for money out, positive for money in. Never zero.",
                        ),
                    ),
                    (
                        "kind",
                        enumeration(
                            "Which part of the ledger this belongs to.",
                            &["INCOME", "SPENDING", "INVESTMENT"],
                        ),
                    ),
                    (
                        "localDate",
                        string("The date the owner sees, as YYYY-MM-DD."),
                    ),
                ],
                &[
                    "accountId",
                    "description",
                    "amountMinor",
                    "kind",
                    "localDate",
                ],
            ),
        ),
        commit_tool(
            "commit_add_entry",
            "Add the entry that preview_add_entry described. The hash must be the one that preview returned, and each proposal can be committed once.",
        ),
        preview_tool(
            "preview_void_entry",
            "Describe what voiding an entry would reverse, without voiding it. Voiding keeps the record and reverses its effect.",
            object(
                &[
                    ("transactionId", string("The entry to void.")),
                    (
                        "expectedVersion",
                        integer("The version the entry had when it was read."),
                    ),
                    (
                        "reason",
                        string("Why it is being voided, if the owner gave one."),
                    ),
                ],
                &["transactionId", "expectedVersion"],
            ),
        ),
        commit_tool(
            "commit_void_entry",
            "Void the entry that preview_void_entry described. The hash must be the one that preview returned, and each proposal can be committed once.",
        ),
        preview_tool(
            "preview_set_budget",
            "Describe the budget change without making it, including what the month has already spent.",
            object(
                &[
                    (
                        "month",
                        string("The month the budget applies to, as YYYY-MM."),
                    ),
                    (
                        "categoryId",
                        string("The spending category the budget is for."),
                    ),
                    (
                        "limitMinor",
                        integer(
                            "The limit in pence. Zero removes the allowance without deleting the budget.",
                        ),
                    ),
                    (
                        "expectedVersion",
                        integer(
                            "The version the budget had when it was read. Omit when no budget exists yet.",
                        ),
                    ),
                ],
                &["month", "categoryId", "limitMinor"],
            ),
        ),
        commit_tool(
            "commit_set_budget",
            "Apply the budget change that preview_set_budget described. The hash must be the one that preview returned, and each proposal can be committed once.",
        ),
    ]
}

fn read_tool(name: &'static str, description: &'static str, schema: Map<String, Value>) -> Tool {
    Tool::new(name, description, schema).annotate(ToolAnnotations::from_raw(
        None,
        Some(true),
        Some(false),
        Some(true),
        Some(false),
    ))
}

/// A preview writes only a short-lived proposal, so it changes nothing the
/// owner would notice and can be repeated safely.
fn preview_tool(name: &'static str, description: &'static str, schema: Map<String, Value>) -> Tool {
    Tool::new(name, description, schema).annotate(ToolAnnotations::from_raw(
        None,
        Some(false),
        Some(false),
        Some(false),
        Some(false),
    ))
}

fn commit_tool(name: &'static str, description: &'static str) -> Tool {
    let schema = object(
        &[
            (
                "operationId",
                string("The identifier the matching preview returned."),
            ),
            (
                "expectedHash",
                string("The hash the matching preview returned."),
            ),
        ],
        &["operationId", "expectedHash"],
    );

    // A commit applies one proposal exactly once: a repeat finds the proposal
    // gone rather than applying it again.
    Tool::new(name, description, schema).annotate(ToolAnnotations::from_raw(
        None,
        Some(false),
        Some(false),
        Some(true),
        Some(false),
    ))
}

fn object(properties: &[(&str, Value)], required: &[&str]) -> Map<String, Value> {
    let mut fields = Map::new();
    for (name, schema) in properties {
        fields.insert((*name).to_owned(), schema.clone());
    }

    let mut schema = Map::new();
    schema.insert("type".to_owned(), json!("object"));
    schema.insert("properties".to_owned(), Value::Object(fields));
    schema.insert("required".to_owned(), json!(required));
    schema.insert("additionalProperties".to_owned(), json!(false));
    schema
}

fn string(description: &str) -> Value {
    json!({ "type": "string", "description": description })
}

fn integer(description: &str) -> Value {
    json!({ "type": "integer", "description": description })
}

fn enumeration(description: &str, values: &[&str]) -> Value {
    json!({ "type": "string", "description": description, "enum": values })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_mutation_is_a_preview_and_a_commit() {
        let names: Vec<String> = catalogue()
            .iter()
            .map(|tool| tool.name.to_string())
            .collect();

        for name in &names {
            if let Some(action) = name.strip_prefix("preview_") {
                assert!(
                    names.contains(&format!("commit_{action}")),
                    "{name} has no commit"
                );
            }
            if let Some(action) = name.strip_prefix("commit_") {
                assert!(
                    names.contains(&format!("preview_{action}")),
                    "{name} has no preview"
                );
            }
        }
    }

    #[test]
    fn no_tool_offers_a_generic_query_or_a_delete() {
        for tool in catalogue() {
            let name = tool.name.to_string();
            assert!(!name.contains("query"), "{name} is not action-specific");
            assert!(!name.contains("delete"), "{name} removes rather than voids");
            assert!(!name.contains("sql"), "{name} exposes the store");
        }
    }

    #[test]
    fn a_read_says_it_reads_and_a_write_does_not() {
        for tool in catalogue() {
            let annotations = tool.annotations.expect("every tool is annotated");
            let expected_read_only =
                tool.name.starts_with("get_") || tool.name.starts_with("list_");
            assert_eq!(
                annotations.read_only_hint,
                Some(expected_read_only),
                "{}",
                tool.name
            );
            assert_eq!(annotations.open_world_hint, Some(false), "{}", tool.name);
        }
    }
}
