use std::env::var;

use turtle_tally_domain::error::{DomainError, DomainResult};

/// Everything the function needs to know about the deployment it is running in.
/// A missing value stops the function at start-up rather than at the first
/// request that needed it.
#[derive(Clone, Debug)]
pub struct Config {
    pub finance_table: String,
    pub audit_table: String,
    pub session_table: String,
    pub receipt_bucket: String,
    pub session_key_id: String,
    pub app_origin: String,
    pub cognito_issuer: String,
    pub cognito_domain: String,
    pub browser_client_id: String,
}

impl Config {
    pub fn from_environment() -> DomainResult<Self> {
        Self::read(|name| var(name).ok())
    }

    pub fn read(lookup: impl Fn(&str) -> Option<String>) -> DomainResult<Self> {
        let required = |name: &str| {
            lookup(name)
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| DomainError::validation(format!("{name} is not configured.")))
        };

        Ok(Self {
            finance_table: required("FINANCE_TABLE")?,
            audit_table: required("AUDIT_TABLE")?,
            session_table: required("SESSION_TABLE")?,
            receipt_bucket: required("RECEIPT_BUCKET")?,
            session_key_id: required("SESSION_KEY_ID")?,
            app_origin: required("APP_ORIGIN")?,
            cognito_issuer: required("COGNITO_ISSUER")?,
            cognito_domain: required("COGNITO_DOMAIN")?,
            browser_client_id: required("BROWSER_CLIENT_ID")?,
        })
    }

    pub fn redirect_uri(&self) -> String {
        format!("{}/auth/callback", self.app_origin.trim_end_matches('/'))
    }

    pub fn authorization_endpoint(&self) -> String {
        format!(
            "{}/oauth2/authorize",
            self.cognito_domain.trim_end_matches('/')
        )
    }

    pub fn token_endpoint(&self) -> String {
        format!("{}/oauth2/token", self.cognito_domain.trim_end_matches('/'))
    }

    pub fn logout_endpoint(&self) -> String {
        format!("{}/logout", self.cognito_domain.trim_end_matches('/'))
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
            ("SESSION_TABLE", "sessions"),
            ("RECEIPT_BUCKET", "receipts"),
            ("SESSION_KEY_ID", "key"),
            ("APP_ORIGIN", "https://app.invalid"),
            ("COGNITO_ISSUER", "https://issuer.invalid/pool"),
            ("COGNITO_DOMAIN", "https://login.invalid/"),
            ("BROWSER_CLIENT_ID", "browser-client"),
        ]
        .into_iter()
        .map(|(name, value)| (name.to_owned(), value.to_owned()))
        .collect()
    }

    #[test]
    fn a_missing_or_blank_value_stops_the_function_rather_than_a_request() {
        let mut values = complete();
        values.insert("APP_ORIGIN".to_owned(), "  ".to_owned());
        assert!(Config::read(|name| values.get(name).cloned()).is_err());

        values.remove("APP_ORIGIN");
        assert!(Config::read(|name| values.get(name).cloned()).is_err());
    }

    #[test]
    fn endpoints_are_derived_without_doubling_a_separator() {
        let values = complete();
        let config =
            Config::read(|name| values.get(name).cloned()).expect("a complete configuration");
        assert_eq!(config.redirect_uri(), "https://app.invalid/auth/callback");
        assert_eq!(
            config.authorization_endpoint(),
            "https://login.invalid/oauth2/authorize"
        );
        assert_eq!(
            config.token_endpoint(),
            "https://login.invalid/oauth2/token"
        );
        assert_eq!(config.logout_endpoint(), "https://login.invalid/logout");
    }
}
