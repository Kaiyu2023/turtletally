use std::sync::Arc;

use turtle_tally_application::ports::{SystemClock, UuidIdSource};
use turtle_tally_application::service::FinanceService;
use turtle_tally_auth::oauth::OAuthClient;
use turtle_tally_auth::tokens::TokenVerifier;
use turtle_tally_domain::error::DomainResult;
use turtle_tally_storage::{
    DynamoSessionStore, DynamoStore, KmsTokenCipher, S3ObjectStore, StoreTables,
};

use crate::config::Config;

pub type Finance = FinanceService<DynamoStore, S3ObjectStore>;

pub struct AppState {
    pub finance: Finance,
    pub sessions: DynamoSessionStore,
    pub cipher: KmsTokenCipher,
    pub tokens: TokenVerifier,
    pub oauth: OAuthClient,
    pub http: reqwest::Client,
    pub config: Config,
}

impl AppState {
    pub async fn build(config: Config) -> DomainResult<Arc<Self>> {
        let aws = aws_config::load_defaults(aws_config::BehaviorVersion::latest()).await;
        let dynamo = aws_sdk_dynamodb::Client::new(&aws);

        let finance = FinanceService::new(
            DynamoStore::new(
                dynamo.clone(),
                StoreTables {
                    finance: config.finance_table.clone(),
                    audit: config.audit_table.clone(),
                },
            ),
            S3ObjectStore::new(aws_sdk_s3::Client::new(&aws), config.receipt_bucket.clone()),
            Box::new(SystemClock),
            Box::new(UuidIdSource),
        );

        Ok(Arc::new(Self {
            finance,
            sessions: DynamoSessionStore::new(dynamo, config.session_table.clone()),
            cipher: KmsTokenCipher::new(
                aws_sdk_kms::Client::new(&aws),
                config.session_key_id.clone(),
            ),
            tokens: TokenVerifier::new(
                config.cognito_issuer.clone(),
                vec![config.browser_client_id.clone()],
            )?,
            oauth: OAuthClient {
                authorization_endpoint: config.authorization_endpoint(),
                token_endpoint: config.token_endpoint(),
                client_id: config.browser_client_id.clone(),
                redirect_uri: config.redirect_uri(),
                scopes: vec!["openid".to_owned(), "profile".to_owned()],
            },
            http: reqwest::Client::new(),
            config,
        }))
    }
}
