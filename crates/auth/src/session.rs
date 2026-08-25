use std::future::Future;

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use turtle_tally_application::ports::Owner;
use turtle_tally_domain::error::{DomainError, DomainResult};

use crate::secrets::{digest, matches_digest, random_secret};

/// ADR 0002: the browser holds an opaque, revocable cookie and never a token.
/// The `__Host-` prefix binds it to this exact origin with no `Domain`
/// attribute, which a subdomain cannot then set or read.
pub const SESSION_COOKIE: &str = "__Host-finance_session";
pub const LOGIN_COOKIE: &str = "__Host-finance_login";
pub const CSRF_COOKIE: &str = "__Host-finance_csrf";
pub const CSRF_HEADER: &str = "x-csrf-token";

const SESSION_LIFETIME_HOURS: i64 = 12;
const LOGIN_LIFETIME_MINUTES: i64 = 10;

/// What the browser is given, and what the server keeps. The identifier and the
/// CSRF token exist only in the response that creates them; the record holds
/// their digests.
pub struct IssuedSession {
    pub session_id: String,
    pub csrf_token: String,
    pub record: SessionRecord,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecord {
    pub session_digest: String,
    pub subject: String,
    pub csrf_digest: String,
    pub encrypted_refresh_token: String,
    pub created_at: String,
    pub expires_at: String,
    pub ttl: i64,
}

impl SessionRecord {
    pub fn owner(&self) -> Owner {
        Owner::new(self.subject.clone())
    }

    pub fn is_live(&self, now: DateTime<Utc>) -> bool {
        DateTime::parse_from_rfc3339(&self.expires_at).is_ok_and(|expiry| expiry > now)
    }

    /// A mutation must carry the token that belongs to this session. The cookie
    /// alone is not enough, because a cookie travels with a cross-site request
    /// and a header does not.
    pub fn accepts_csrf(&self, presented: Option<&str>) -> bool {
        presented.is_some_and(|token| matches_digest(token, &self.csrf_digest))
    }
}

pub fn issue_session(
    subject: &str,
    encrypted_refresh_token: String,
    now: DateTime<Utc>,
) -> DomainResult<IssuedSession> {
    let session_id = random_secret()?;
    let csrf_token = random_secret()?;
    let expires_at = now + Duration::hours(SESSION_LIFETIME_HOURS);

    Ok(IssuedSession {
        record: SessionRecord {
            session_digest: digest(&session_id),
            subject: subject.to_owned(),
            csrf_digest: digest(&csrf_token),
            encrypted_refresh_token,
            created_at: now.to_rfc3339(),
            expires_at: expires_at.to_rfc3339(),
            ttl: expires_at.timestamp(),
        },
        session_id,
        csrf_token,
    })
}

pub struct LoginAttempt {
    pub attempt_id: String,
    pub record: LoginRecord,
    pub verifier: String,
    pub state: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRecord {
    pub attempt_digest: String,
    pub state: String,
    pub code_verifier: String,
    pub expires_at: String,
    pub ttl: i64,
}

/// The state and the verifier stay on the server. The browser carries only a
/// reference to them, so a callback cannot be forged by supplying its own.
pub fn begin_login(now: DateTime<Utc>) -> DomainResult<LoginAttempt> {
    let attempt_id = random_secret()?;
    let state = random_secret()?;
    let verifier = random_secret()?;
    let expires_at = now + Duration::minutes(LOGIN_LIFETIME_MINUTES);

    Ok(LoginAttempt {
        record: LoginRecord {
            attempt_digest: digest(&attempt_id),
            state: state.clone(),
            code_verifier: verifier.clone(),
            expires_at: expires_at.to_rfc3339(),
            ttl: expires_at.timestamp(),
        },
        attempt_id,
        verifier,
        state,
    })
}

impl LoginRecord {
    pub fn accepts(&self, state: &str, now: DateTime<Utc>) -> DomainResult<()> {
        if !DateTime::parse_from_rfc3339(&self.expires_at).is_ok_and(|expiry| expiry > now) {
            return Err(DomainError::unauthenticated(
                "That sign-in attempt has expired. Start again.",
            ));
        }
        if !matches_digest(state, &digest(&self.state)) {
            return Err(DomainError::unauthenticated(
                "That sign-in attempt does not match. Start again.",
            ));
        }
        Ok(())
    }
}

pub fn session_cookie(session_id: &str) -> String {
    format!("{SESSION_COOKIE}={session_id}; Secure; HttpOnly; SameSite=Strict; Path=/")
}

/// Readable by the application's own script and by nothing else: `SameSite`
/// keeps it off cross-site requests, and the same-origin policy keeps another
/// site from reading it. A mutation must echo it in a header, which a
/// cross-site request cannot set.
pub fn csrf_cookie(csrf_token: &str) -> String {
    format!("{CSRF_COOKIE}={csrf_token}; Secure; SameSite=Strict; Path=/")
}

pub fn cleared_csrf_cookie() -> String {
    format!("{CSRF_COOKIE}=; Secure; SameSite=Strict; Path=/; Max-Age=0")
}

pub fn cleared_session_cookie() -> String {
    format!("{SESSION_COOKIE}=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0")
}

pub fn login_cookie(attempt_id: &str) -> String {
    format!(
        "{LOGIN_COOKIE}={attempt_id}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age={}",
        LOGIN_LIFETIME_MINUTES * 60
    )
}

pub fn cleared_login_cookie() -> String {
    format!("{LOGIN_COOKIE}=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0")
}

pub fn read_cookie(header: Option<&str>, name: &str) -> Option<String> {
    header?
        .split(';')
        .filter_map(|pair| pair.split_once('='))
        .find(|(key, _)| key.trim() == name)
        .map(|(_, value)| value.trim().to_owned())
}

/// A mutation must come from this application in this browser. `Origin` and
/// `Sec-Fetch-Site` are set by the browser and cannot be altered by page script.
pub fn same_origin(origin: Option<&str>, fetch_site: Option<&str>, expected_origin: &str) -> bool {
    let origin_allows = origin.is_none_or(|value| value == expected_origin);
    let site_allows = fetch_site.is_none_or(|value| value == "same-origin" || value == "none");
    origin_allows && site_allows && (origin.is_some() || fetch_site.is_some())
}

/// Sessions and sign-in attempts have their own lifetime, revocation, and table
/// (ADR 0003), so they are stored apart from the ledger.
pub trait SessionStore: Send + Sync {
    fn put_session(&self, record: &SessionRecord) -> impl Future<Output = DomainResult<()>> + Send;
    fn session(
        &self,
        session_digest: &str,
    ) -> impl Future<Output = DomainResult<Option<SessionRecord>>> + Send;
    fn delete_session(&self, session_digest: &str)
    -> impl Future<Output = DomainResult<()>> + Send;
    fn put_login(&self, record: &LoginRecord) -> impl Future<Output = DomainResult<()>> + Send;

    /// Single use: an attempt is consumed by the callback that redeems it, so a
    /// replayed callback finds nothing.
    fn take_login(
        &self,
        attempt_digest: &str,
    ) -> impl Future<Output = DomainResult<Option<LoginRecord>>> + Send;
}

/// A refresh token is the one long-lived credential the server holds, so it is
/// encrypted with a key the table cannot read (ADR 0002).
pub trait TokenCipher: Send + Sync {
    fn encrypt(
        &self,
        plaintext: &str,
        context: &str,
    ) -> impl Future<Output = DomainResult<String>> + Send;
    fn decrypt(
        &self,
        ciphertext: &str,
        context: &str,
    ) -> impl Future<Output = DomainResult<String>> + Send;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn now() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-08-17T12:00:00Z")
            .expect("a valid instant")
            .with_timezone(&Utc)
    }

    #[test]
    fn a_session_keeps_only_digests() {
        let issued =
            issue_session("subject", "cipher".to_owned(), now()).expect("an issued session");
        assert_ne!(issued.record.session_digest, issued.session_id);
        assert_ne!(issued.record.csrf_digest, issued.csrf_token);
        assert!(issued.record.is_live(now()));
        assert!(!issued.record.is_live(now() + Duration::hours(13)));
    }

    #[test]
    fn a_mutation_needs_the_token_that_belongs_to_the_session() {
        let issued =
            issue_session("subject", "cipher".to_owned(), now()).expect("an issued session");
        assert!(issued.record.accepts_csrf(Some(&issued.csrf_token)));
        assert!(!issued.record.accepts_csrf(Some("another token")));
        assert!(!issued.record.accepts_csrf(None));
    }

    #[test]
    fn a_callback_must_match_the_attempt_that_started_it() {
        let attempt = begin_login(now()).expect("a login attempt");
        assert!(attempt.record.accepts(&attempt.state, now()).is_ok());
        assert!(attempt.record.accepts("forged", now()).is_err());
        assert!(
            attempt
                .record
                .accepts(&attempt.state, now() + Duration::minutes(11))
                .is_err()
        );
    }

    #[test]
    fn the_confirmation_cookie_is_readable_but_not_sent_across_sites() {
        let cookie = csrf_cookie("token-value");
        assert!(cookie.starts_with("__Host-finance_csrf=token-value"));
        assert!(cookie.contains("SameSite=Strict"));
        assert!(!cookie.contains("HttpOnly"));
        assert!(!cookie.contains("Domain"));
    }

    #[test]
    fn the_session_cookie_is_host_bound_and_script_free() {
        let cookie = session_cookie("value");
        assert!(cookie.starts_with("__Host-finance_session=value"));
        assert!(cookie.contains("Secure"));
        assert!(cookie.contains("HttpOnly"));
        assert!(cookie.contains("SameSite=Strict"));
        assert!(!cookie.contains("Domain"));
    }

    #[test]
    fn a_cookie_is_read_by_its_own_name() {
        let header = Some("other=1; __Host-finance_session=abc; another=2");
        assert_eq!(read_cookie(header, SESSION_COOKIE).as_deref(), Some("abc"));
        assert_eq!(read_cookie(header, LOGIN_COOKIE), None);
        assert_eq!(read_cookie(None, SESSION_COOKIE), None);
    }

    #[test]
    fn a_cross_site_mutation_is_refused() {
        let expected = "https://example.invalid";
        assert!(same_origin(Some(expected), Some("same-origin"), expected));
        assert!(same_origin(None, Some("same-origin"), expected));
        assert!(!same_origin(
            Some("https://elsewhere.invalid"),
            Some("cross-site"),
            expected
        ));
        assert!(!same_origin(Some(expected), Some("cross-site"), expected));
        assert!(!same_origin(None, None, expected));
    }
}
