use std::sync::Arc;

use turtle_tally_application::assistant::AssistantService;
use turtle_tally_application::ports::{SystemClock, UuidIdSource};
use turtle_tally_application::service::FinanceService;
use turtle_tally_auth::tokens::TokenVerifier;
use turtle_tally_domain::error::{DomainError, DomainResult};
use turtle_tally_storage::{DynamoStore, S3ObjectStore, StoreTables};

pub type Assistant = AssistantService<DynamoStore, S3ObjectStore, DynamoStore>;

/// Everything this ingress needs to know about its deployment. A missing value
/// stops the function at start-up rather than at the first request.
#[derive(Clone, Debug)]
pub struct Config {
    pub finance_table: String,
    pub audit_table: String,
    pub receipt_bucket: String,
    pub resource_url: String,
    pub authorization_server: String,
    pub required_scope: String,
    pub accepted_audiences: Vec<String>,
}

impl Config {
    pub fn from_environment() -> DomainResult<Self> {
        Self::read(|name| std::env::var(name).ok())
    }

    pub fn read(lookup: impl Fn(&str) -> Option<String>) -> DomainResult<Self> {
        let required = |name: &str| {
            lookup(name)
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| DomainError::validation(format!("{name} is not configured.")))
        };

        let audiences: Vec<String> = required("ACCEPTED_AUDIENCES")?
            .split(',')
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())
            .collect();
        if audiences.is_empty() {
            return Err(DomainError::validation(
                "ACCEPTED_AUDIENCES is not configured.",
            ));
        }

        Ok(Self {
            finance_table: required("FINANCE_TABLE")?,
            audit_table: required("AUDIT_TABLE")?,
            receipt_bucket: required("RECEIPT_BUCKET")?,
            resource_url: required("RESOURCE_URL")?,
            authorization_server: required("AUTHORIZATION_SERVER")?,
            required_scope: required("REQUIRED_SCOPE")?,
            accepted_audiences: audiences,
        })
    }

    /// RFC 9728: a client that gets a 401 reads this document to learn which
    /// authorization server to use and which scopes this resource wants.
    pub fn metadata_url(&self) -> String {
        format!(
            "{}/.well-known/oauth-protected-resource",
            self.resource_url.trim_end_matches('/')
        )
    }
}

pub struct McpState {
    pub assistant: Arc<Assistant>,
    pub tokens: TokenVerifier,
    pub config: Config,
}

impl McpState {
    pub async fn build(config: Config) -> DomainResult<Arc<Self>> {
        let aws = aws_config::load_defaults(aws_config::BehaviorVersion::latest()).await;
        let dynamo = aws_sdk_dynamodb::Client::new(&aws);
        let tables = StoreTables {
            finance: config.finance_table.clone(),
            audit: config.audit_table.clone(),
        };

        let finance = FinanceService::new(
            DynamoStore::new(dynamo.clone(), tables.clone()),
            S3ObjectStore::new(aws_sdk_s3::Client::new(&aws), config.receipt_bucket.clone()),
            Box::new(SystemClock),
            Box::new(UuidIdSource),
        );

        Ok(Arc::new(Self {
            assistant: Arc::new(AssistantService::new(
                finance,
                DynamoStore::new(dynamo, tables),
                Box::new(SystemClock),
            )),
            tokens: TokenVerifier::new(
                config.authorization_server.clone(),
                config.accepted_audiences.clone(),
            )?,
            config,
        }))
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;

    fn complete() -> HashMap<String, String> {
        [
            ("FINANCE_TABLE", "finance"),
            ("AUDIT_TABLE", "audit"),
            ("RECEIPT_BUCKET", "receipts"),
            ("RESOURCE_URL", "https://mcp.invalid/"),
            ("AUTHORIZATION_SERVER", "https://issuer.invalid/pool"),
            ("REQUIRED_SCOPE", "finance/assistant"),
            ("ACCEPTED_AUDIENCES", "client-one, client-two"),
        ]
        .into_iter()
        .map(|(name, value)| (name.to_owned(), value.to_owned()))
        .collect()
    }

    #[test]
    fn every_accepted_audience_is_named_explicitly() {
        let values = complete();
        let config =
            Config::read(|name| values.get(name).cloned()).expect("a complete configuration");
        assert_eq!(
            config.accepted_audiences,
            vec!["client-one".to_owned(), "client-two".to_owned()]
        );
        assert_eq!(
            config.metadata_url(),
            "https://mcp.invalid/.well-known/oauth-protected-resource"
        );
    }

    #[test]
    fn an_empty_audience_list_is_a_configuration_error_rather_than_a_wildcard() {
        let mut values = complete();
        values.insert("ACCEPTED_AUDIENCES".to_owned(), " , ".to_owned());
        assert!(Config::read(|name| values.get(name).cloned()).is_err());
    }
}
