use std::sync::Arc;

use axum::extract::{Request, State};
use axum::http::{HeaderMap, Method, header};
use axum::middleware::Next;
use axum::response::Response;
use chrono::Utc;
use turtle_tally_auth::secrets::digest;
use turtle_tally_auth::session::{
    CSRF_HEADER, SESSION_COOKIE, SessionRecord, SessionStore, read_cookie, same_origin,
};
use turtle_tally_domain::error::DomainError;

use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

/// Every API request arrives with an opaque cookie and nothing else. Ownership
/// comes from the stored session, never from the request (API conventions), and
/// a mutation must also prove it came from this application in this browser.
pub async fn require_session(
    State(state): State<Arc<AppState>>,
    mut request: Request,
    next: Next,
) -> ApiResult<Response> {
    let record = authenticate(&state, request.headers()).await?;

    if is_mutation(request.method()) {
        let headers = request.headers();
        if !same_origin(
            header_value(headers, header::ORIGIN.as_str()),
            header_value(headers, "sec-fetch-site"),
            &state.config.app_origin,
        ) {
            return Err(ApiError(DomainError::unauthenticated(
                "That request did not come from this application.",
            )));
        }
        if !record.accepts_csrf(header_value(headers, CSRF_HEADER)) {
            return Err(ApiError(DomainError::unauthenticated(
                "That request is missing its confirmation token.",
            )));
        }
    }

    request.extensions_mut().insert(record.owner());
    Ok(next.run(request).await)
}

pub async fn authenticate(state: &AppState, headers: &HeaderMap) -> ApiResult<SessionRecord> {
    let cookie = read_cookie(
        header_value(headers, header::COOKIE.as_str()),
        SESSION_COOKIE,
    )
    .ok_or_else(|| ApiError(DomainError::unauthenticated("Sign in to continue.")))?;

    let record = state
        .sessions
        .session(&digest(&cookie))
        .await?
        .filter(|record| record.is_live(Utc::now()))
        .ok_or_else(|| {
            ApiError(DomainError::unauthenticated(
                "The session has ended. Sign in again to continue.",
            ))
        })?;

    Ok(record)
}

fn is_mutation(method: &Method) -> bool {
    !matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS)
}

fn header_value<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers.get(name).and_then(|value| value.to_str().ok())
}
