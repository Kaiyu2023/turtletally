use std::sync::Arc;

use axum::Json;
use axum::extract::{Request, State};
use axum::http::{HeaderValue, StatusCode, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use chrono::Utc;
use serde_json::json;
use turtle_tally_application::ports::Owner;

use crate::state::McpState;

/// RFC 9728: an unauthenticated request is answered with the address of the
/// document that says how to authenticate. That is what lets any compliant MCP
/// client — whichever model is behind it — discover this server's authorization
/// server without being told out of band.
pub async fn require_token(
    State(state): State<Arc<McpState>>,
    mut request: Request,
    next: Next,
) -> Response {
    let Some(token) = bearer(&request) else {
        return challenge(&state, "a bearer token is required");
    };

    let Ok(claims) = state.tokens.verify(&token, Utc::now()).await else {
        return challenge(&state, "the token could not be verified");
    };

    if !claims.has_scope(&state.config.required_scope) {
        return challenge(&state, "the token does not carry the required scope");
    }

    request
        .extensions_mut()
        .insert(Owner::new(claims.sub.clone()));
    next.run(request).await
}

pub async fn protected_resource_metadata(
    State(state): State<Arc<McpState>>,
) -> Json<serde_json::Value> {
    Json(json!({
        "resource": state.config.resource_url,
        "authorization_servers": [state.config.authorization_server],
        "scopes_supported": [state.config.required_scope],
        "bearer_methods_supported": ["header"],
    }))
}

fn bearer(request: &Request) -> Option<String> {
    request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .map(ToOwned::to_owned)
}

fn challenge(state: &McpState, reason: &str) -> Response {
    let header = format!(
        "Bearer resource_metadata=\"{}\", scope=\"{}\", error=\"invalid_token\"",
        state.config.metadata_url(),
        state.config.required_scope
    );

    (
        StatusCode::UNAUTHORIZED,
        [(
            header::WWW_AUTHENTICATE,
            HeaderValue::from_str(&header).unwrap_or_else(|_| HeaderValue::from_static("Bearer")),
        )],
        Json(json!({ "error": "invalid_token", "error_description": reason })),
    )
        .into_response()
}
