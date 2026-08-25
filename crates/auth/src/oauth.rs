use serde::Deserialize;
use turtle_tally_domain::error::{DomainError, DomainResult};

use crate::secrets::code_challenge;

/// The endpoints and client this deployment authenticates against. Every value
/// comes from configuration; nothing is defaulted to a guess.
#[derive(Clone, Debug)]
pub struct OAuthClient {
    pub authorization_endpoint: String,
    pub token_endpoint: String,
    pub client_id: String,
    pub redirect_uri: String,
    pub scopes: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    #[serde(default)]
    pub id_token: Option<String>,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub expires_in: Option<i64>,
}

impl OAuthClient {
    pub fn authorization_url(&self, state: &str, verifier: &str) -> String {
        let scopes = self.scopes.join(" ");
        format!(
            "{}?response_type=code&client_id={}&redirect_uri={}&state={}&code_challenge_method=S256&code_challenge={}&scope={}",
            self.authorization_endpoint,
            encode(&self.client_id),
            encode(&self.redirect_uri),
            encode(state),
            encode(&code_challenge(verifier)),
            encode(&scopes),
        )
    }

    /// The verifier proves this is the same client that started the flow, so a
    /// stolen code cannot be redeemed elsewhere.
    pub async fn exchange_code(
        &self,
        http: &reqwest::Client,
        code: &str,
        verifier: &str,
    ) -> DomainResult<TokenResponse> {
        let form = [
            ("grant_type", "authorization_code"),
            ("client_id", self.client_id.as_str()),
            ("redirect_uri", self.redirect_uri.as_str()),
            ("code", code),
            ("code_verifier", verifier),
        ];

        let response = http
            .post(&self.token_endpoint)
            .form(&form)
            .send()
            .await
            .map_err(|_| DomainError::unauthenticated("The sign-in could not be completed."))?;

        if !response.status().is_success() {
            return Err(DomainError::unauthenticated(
                "The sign-in could not be completed.",
            ));
        }

        response
            .json::<TokenResponse>()
            .await
            .map_err(|_| DomainError::unauthenticated("The sign-in could not be completed."))
    }

    pub async fn refresh(
        &self,
        http: &reqwest::Client,
        refresh_token: &str,
    ) -> DomainResult<TokenResponse> {
        let form = [
            ("grant_type", "refresh_token"),
            ("client_id", self.client_id.as_str()),
            ("refresh_token", refresh_token),
        ];

        let response = http
            .post(&self.token_endpoint)
            .form(&form)
            .send()
            .await
            .map_err(|_| DomainError::unauthenticated("The session could not be renewed."))?;

        if !response.status().is_success() {
            return Err(DomainError::unauthenticated(
                "The session could not be renewed.",
            ));
        }

        response
            .json::<TokenResponse>()
            .await
            .map_err(|_| DomainError::unauthenticated("The session could not be renewed."))
    }
}

/// Percent-encoding for the characters a query value may not carry. The values
/// here are identifiers, URLs, and random tokens, so the unreserved set is what
/// passes through.
fn encode(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                String::from(char::from(byte))
            }
            _ => format!("%{byte:02X}"),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn client() -> OAuthClient {
        OAuthClient {
            authorization_endpoint: "https://login.invalid/oauth2/authorize".to_owned(),
            token_endpoint: "https://login.invalid/oauth2/token".to_owned(),
            client_id: "browser-client".to_owned(),
            redirect_uri: "https://app.invalid/auth/callback".to_owned(),
            scopes: vec!["openid".to_owned(), "email".to_owned()],
        }
    }

    #[test]
    fn an_authorisation_url_carries_the_challenge_and_never_the_verifier() {
        let url = client().authorization_url("state-value", "verifier-value");
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains(&format!(
            "code_challenge={}",
            encode(&code_challenge("verifier-value"))
        )));
        assert!(!url.contains("verifier-value"));
        assert!(url.contains("redirect_uri=https%3A%2F%2Fapp.invalid%2Fauth%2Fcallback"));
        assert!(url.contains("scope=openid%20email"));
    }
}
