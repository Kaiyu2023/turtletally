use std::collections::HashMap;
use std::sync::Mutex;

use chrono::{DateTime, Duration, Utc};
use jsonwebtoken::jwk::{AlgorithmParameters, JwkSet};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};
use serde::Deserialize;
use turtle_tally_application::ports::Owner;
use turtle_tally_domain::error::{DomainError, DomainResult};

const KEY_REFRESH_MINUTES: i64 = 60;

/// The claims this product depends on. Anything else Cognito sends is ignored
/// rather than trusted.
#[derive(Clone, Debug, Deserialize)]
pub struct AccessClaims {
    pub sub: String,
    pub iss: String,
    pub exp: i64,
    #[serde(default)]
    pub scope: String,
    #[serde(default)]
    pub client_id: Option<String>,
    #[serde(default)]
    pub token_use: Option<String>,
}

impl AccessClaims {
    pub fn owner(&self) -> Owner {
        Owner::new(self.sub.clone())
    }

    pub fn scopes(&self) -> Vec<&str> {
        self.scope.split_whitespace().collect()
    }

    pub fn has_scope(&self, scope: &str) -> bool {
        self.scopes().contains(&scope)
    }
}

pub struct TokenVerifier {
    issuer: String,
    audience: Vec<String>,
    keys_url: String,
    http: reqwest::Client,
    cached: Mutex<Option<CachedKeys>>,
}

struct CachedKeys {
    keys: HashMap<String, DecodingKey>,
    fetched_at: DateTime<Utc>,
}

impl TokenVerifier {
    /// `audience` is the value the token must be issued for: the browser's app
    /// client, or the resource an MCP client asked for. An empty list is a
    /// configuration error rather than a wildcard.
    pub fn new(issuer: impl Into<String>, audience: Vec<String>) -> DomainResult<Self> {
        let issuer = issuer.into();
        if audience.is_empty() {
            return Err(DomainError::validation(
                "A token verifier needs at least one accepted audience.",
            ));
        }

        Ok(Self {
            keys_url: format!("{}/.well-known/jwks.json", issuer.trim_end_matches('/')),
            issuer,
            audience,
            http: reqwest::Client::new(),
            cached: Mutex::new(None),
        })
    }

    pub async fn verify(&self, token: &str, now: DateTime<Utc>) -> DomainResult<AccessClaims> {
        let header = decode_header(token).map_err(|_| unauthenticated())?;
        let key_id = header.kid.ok_or_else(unauthenticated)?;

        let key = match self.cached_key(&key_id, now) {
            Some(key) => key,
            None => {
                self.refresh_keys(now).await?;
                self.cached_key(&key_id, now).ok_or_else(unauthenticated)?
            }
        };

        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&[self.issuer.as_str()]);
        validation.set_audience(&self.audience);
        validation.validate_exp = true;

        let mut token_data = decode::<AccessClaims>(token, &key, &validation);

        // Cognito access tokens carry the client identifier rather than an
        // audience claim, so the same check is made against `client_id` when the
        // token has no audience of its own.
        if token_data.is_err() {
            let mut without_audience = Validation::new(Algorithm::RS256);
            without_audience.set_issuer(&[self.issuer.as_str()]);
            without_audience.validate_aud = false;
            without_audience.validate_exp = true;
            token_data = decode::<AccessClaims>(token, &key, &without_audience);

            if let Ok(decoded) = &token_data
                && !decoded
                    .claims
                    .client_id
                    .as_ref()
                    .is_some_and(|id| self.audience.contains(id))
            {
                return Err(unauthenticated());
            }
        }

        Ok(token_data.map_err(|_| unauthenticated())?.claims)
    }

    fn cached_key(&self, key_id: &str, now: DateTime<Utc>) -> Option<DecodingKey> {
        let cached = self.cached.lock().ok()?;
        let entry = cached.as_ref()?;
        if now - entry.fetched_at > Duration::minutes(KEY_REFRESH_MINUTES) {
            return None;
        }
        entry.keys.get(key_id).cloned()
    }

    async fn refresh_keys(&self, now: DateTime<Utc>) -> DomainResult<()> {
        let set: JwkSet = self
            .http
            .get(&self.keys_url)
            .send()
            .await
            .map_err(|_| DomainError::unauthenticated("The signing keys could not be read."))?
            .json()
            .await
            .map_err(|_| DomainError::unauthenticated("The signing keys could not be read."))?;

        let mut keys = HashMap::new();
        for key in set.keys {
            let Some(key_id) = key.common.key_id.clone() else {
                continue;
            };
            if let AlgorithmParameters::RSA(rsa) = &key.algorithm
                && let Ok(decoding) = DecodingKey::from_rsa_components(&rsa.n, &rsa.e)
            {
                keys.insert(key_id, decoding);
            }
        }

        if let Ok(mut cached) = self.cached.lock() {
            *cached = Some(CachedKeys {
                keys,
                fetched_at: now,
            });
        }
        Ok(())
    }
}

fn unauthenticated() -> DomainError {
    DomainError::unauthenticated("That token is not usable here.")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_verifier_needs_an_audience_to_check_against() {
        assert!(TokenVerifier::new("https://issuer.invalid", Vec::new()).is_err());
        assert!(TokenVerifier::new("https://issuer.invalid", vec!["client".to_owned()]).is_ok());
    }

    #[test]
    fn scopes_are_read_as_a_set_rather_than_a_string() {
        let claims = AccessClaims {
            sub: "subject".to_owned(),
            iss: "https://issuer.invalid".to_owned(),
            exp: 0,
            scope: "finance/read finance/write".to_owned(),
            client_id: None,
            token_use: Some("access".to_owned()),
        };
        assert!(claims.has_scope("finance/read"));
        assert!(!claims.has_scope("finance"));
        assert_eq!(claims.owner().as_str(), "subject");
    }
}
