use std::sync::Arc;

use axum::Json;
use axum::extract::{Query, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use turtle_tally_auth::secrets::digest;
use turtle_tally_auth::session::{
    LOGIN_COOKIE, SESSION_COOKIE, SessionStore, TokenCipher, begin_login, cleared_csrf_cookie,
    cleared_login_cookie, cleared_session_cookie, csrf_cookie, issue_session, login_cookie,
    read_cookie, session_cookie,
};
use turtle_tally_domain::error::DomainError;

use crate::error::{ApiError, ApiResult};
use crate::session_layer::authenticate;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct CallbackQuery {
    #[serde(default)]
    code: Option<String>,
    #[serde(default)]
    state: Option<String>,
    #[serde(default)]
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionView {
    pub expires_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedOut {
    /// Ending the server session leaves the identity provider's own session
    /// alive, so the application is told where to send the browser to end that
    /// one too.
    pub sign_out_url: String,
}

/// The state and verifier are held server-side; the browser leaves with a
/// reference to them and nothing it could forge (ADR 0002).
pub async fn login(State(state): State<Arc<AppState>>) -> ApiResult<Response> {
    let attempt = begin_login(Utc::now())?;
    state.sessions.put_login(&attempt.record).await?;

    let destination = state
        .oauth
        .authorization_url(&attempt.state, &attempt.verifier);
    Ok((
        StatusCode::FOUND,
        [
            (header::LOCATION, destination),
            (header::SET_COOKIE, login_cookie(&attempt.attempt_id)),
            (header::CACHE_CONTROL, "no-store".to_owned()),
        ],
    )
        .into_response())
}

pub async fn callback(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<CallbackQuery>,
) -> ApiResult<Response> {
    if query.error.is_some() {
        return Err(ApiError(DomainError::unauthenticated(
            "The sign-in was not completed.",
        )));
    }

    let attempt_id = read_cookie(
        header_value(&headers, header::COOKIE.as_str()),
        LOGIN_COOKIE,
    )
    .ok_or_else(|| {
        ApiError(DomainError::unauthenticated(
            "That sign-in attempt has expired. Start again.",
        ))
    })?;
    let record = state
        .sessions
        .take_login(&digest(&attempt_id))
        .await?
        .ok_or_else(|| {
            ApiError(DomainError::unauthenticated(
                "That sign-in attempt has expired. Start again.",
            ))
        })?;

    let presented_state = query.state.ok_or_else(|| {
        ApiError(DomainError::unauthenticated(
            "That sign-in attempt does not match. Start again.",
        ))
    })?;
    record.accepts(&presented_state, Utc::now())?;

    let code = query.code.ok_or_else(|| {
        ApiError(DomainError::unauthenticated(
            "The sign-in was not completed.",
        ))
    })?;
    let tokens = state
        .oauth
        .exchange_code(&state.http, &code, &record.code_verifier)
        .await?;

    let subject = state
        .tokens
        .verify(&tokens.access_token, Utc::now())
        .await?
        .sub;
    let refresh_token = tokens.refresh_token.ok_or_else(|| {
        ApiError(DomainError::unauthenticated(
            "The sign-in did not return a renewable session.",
        ))
    })?;

    // The ciphertext is bound to the subject, so a row moved between sessions
    // cannot be decrypted into a working token.
    let encrypted = state.cipher.encrypt(&refresh_token, &subject).await?;
    let issued = issue_session(&subject, encrypted, Utc::now())?;
    state.sessions.put_session(&issued.record).await?;

    Ok((
        StatusCode::FOUND,
        [
            (header::LOCATION, state.config.app_origin.clone()),
            (header::CACHE_CONTROL, "no-store".to_owned()),
        ],
        [
            (header::SET_COOKIE, session_cookie(&issued.session_id)),
            (header::SET_COOKIE, csrf_cookie(&issued.csrf_token)),
            (header::SET_COOKIE, cleared_login_cookie()),
        ],
    )
        .into_response())
}

/// A session ends on the server. Clearing the cookie alone would leave a usable
/// record behind.
pub async fn logout(State(state): State<Arc<AppState>>, headers: HeaderMap) -> ApiResult<Response> {
    if let Some(cookie) = read_cookie(
        header_value(&headers, header::COOKIE.as_str()),
        SESSION_COOKIE,
    ) {
        state.sessions.delete_session(&digest(&cookie)).await?;
    }

    Ok((
        StatusCode::OK,
        [
            (header::SET_COOKIE, cleared_session_cookie()),
            (header::SET_COOKIE, cleared_csrf_cookie()),
        ],
        Json(SignedOut {
            sign_out_url: state.config.logout_endpoint(),
        }),
    )
        .into_response())
}

/// Tells the application whether it still has a session and when it ends. The
/// confirmation token it must echo arrives in its own readable cookie, which a
/// cross-site request can neither read nor set as a header.
pub async fn session(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> ApiResult<Json<SessionView>> {
    let record = authenticate(&state, &headers).await?;
    Ok(Json(SessionView {
        expires_at: record.expires_at,
    }))
}

fn header_value<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers.get(name).and_then(|value| value.to_str().ok())
}
