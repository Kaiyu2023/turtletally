use aws_sdk_dynamodb::Client;
use aws_sdk_dynamodb::types::ReturnValue;
use turtle_tally_auth::session::{LoginRecord, SessionRecord, SessionStore};
use turtle_tally_domain::error::{DomainError, DomainResult};

use crate::attribute::{from_item, text, to_item};

const PARTITION: &str = "PK";
const SESSION_PREFIX: &str = "SESSION#";
const LOGIN_PREFIX: &str = "LOGIN#";

/// Sessions live in their own table with their own lifetime and time-to-live,
/// so revoking or expiring one never touches the ledger (ADR 0003).
pub struct DynamoSessionStore {
    client: Client,
    table: String,
}

impl DynamoSessionStore {
    pub fn new(client: Client, table: impl Into<String>) -> Self {
        Self {
            client,
            table: table.into(),
        }
    }

    async fn put(
        &self,
        key: String,
        item: std::collections::HashMap<String, aws_sdk_dynamodb::types::AttributeValue>,
    ) -> DomainResult<()> {
        let mut item = item;
        item.insert(PARTITION.to_owned(), text(key));

        self.client
            .put_item()
            .table_name(&self.table)
            .set_item(Some(item))
            .send()
            .await
            .map_err(|_| DomainError::validation("The session could not be stored."))
            .map(|_| ())
    }
}

impl SessionStore for DynamoSessionStore {
    async fn put_session(&self, record: &SessionRecord) -> DomainResult<()> {
        let item = to_item(record)?;
        self.put(format!("{SESSION_PREFIX}{}", record.session_digest), item)
            .await
    }

    async fn session(&self, session_digest: &str) -> DomainResult<Option<SessionRecord>> {
        let response = self
            .client
            .get_item()
            .table_name(&self.table)
            .key(PARTITION, text(format!("{SESSION_PREFIX}{session_digest}")))
            .send()
            .await
            .map_err(|_| DomainError::unauthenticated("The session could not be read."))?;

        response.item.map(strip_key).map(from_item).transpose()
    }

    async fn delete_session(&self, session_digest: &str) -> DomainResult<()> {
        self.client
            .delete_item()
            .table_name(&self.table)
            .key(PARTITION, text(format!("{SESSION_PREFIX}{session_digest}")))
            .send()
            .await
            .map_err(|_| DomainError::validation("The session could not be ended."))
            .map(|_| ())
    }

    async fn put_login(&self, record: &LoginRecord) -> DomainResult<()> {
        let item = to_item(record)?;
        self.put(format!("{LOGIN_PREFIX}{}", record.attempt_digest), item)
            .await
    }

    async fn take_login(&self, attempt_digest: &str) -> DomainResult<Option<LoginRecord>> {
        let response = self
            .client
            .delete_item()
            .table_name(&self.table)
            .key(PARTITION, text(format!("{LOGIN_PREFIX}{attempt_digest}")))
            .return_values(ReturnValue::AllOld)
            .send()
            .await
            .map_err(|_| DomainError::unauthenticated("That sign-in attempt could not be read."))?;

        response
            .attributes
            .map(strip_key)
            .map(from_item)
            .transpose()
    }
}

fn strip_key(
    mut item: std::collections::HashMap<String, aws_sdk_dynamodb::types::AttributeValue>,
) -> std::collections::HashMap<String, aws_sdk_dynamodb::types::AttributeValue> {
    item.remove(PARTITION);
    item
}
