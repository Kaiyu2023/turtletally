mod api_routes;
mod config;
mod error;
mod session_layer;
mod state;

use std::sync::Arc;

use axum::http::{HeaderValue, header};
use axum::routing::{get, patch, post};
use axum::{Router, middleware};
use lambda_http::{Error, run};

use crate::config::Config;
use crate::state::AppState;

mod auth_routes;

#[tokio::main]
async fn main() -> Result<(), Error> {
    let config = Config::from_environment().map_err(|error| Error::from(error.message))?;
    let state = AppState::build(config)
        .await
        .map_err(|error| Error::from(error.message))?;

    run(router(state)).await
}

/// One binary serves both the browser's session endpoints and its API (ADR
/// 0009). Everything under `/api` requires a session; the sign-in routes are
/// what create one.
fn router(state: Arc<AppState>) -> Router {
    let api = Router::new()
        .route(
            "/preferences",
            get(api_routes::get_preferences).put(api_routes::update_preferences),
        )
        .route(
            "/accounts",
            get(api_routes::list_accounts).post(api_routes::create_account),
        )
        .route("/accounts/{id}", patch(api_routes::update_account))
        .route(
            "/accounts/{id}/deactivate",
            post(api_routes::deactivate_account),
        )
        .route(
            "/categories",
            get(api_routes::list_categories).post(api_routes::create_category),
        )
        .route("/categories/{id}", patch(api_routes::update_category))
        .route(
            "/categories/{id}/deactivate",
            post(api_routes::deactivate_category),
        )
        .route(
            "/transactions",
            get(api_routes::list_transactions).post(api_routes::create_transaction),
        )
        .route(
            "/transactions/{id}",
            get(api_routes::get_transaction).patch(api_routes::update_transaction),
        )
        .route(
            "/transactions/{id}/void",
            post(api_routes::void_transaction),
        )
        .route(
            "/budgets",
            get(api_routes::list_budgets).put(api_routes::set_budget),
        )
        .route(
            "/budget-defaults",
            get(api_routes::list_budget_defaults).put(api_routes::set_budget_default),
        )
        .route("/dashboard", get(api_routes::get_dashboard))
        .route(
            "/schedules",
            get(api_routes::list_schedules).post(api_routes::create_schedule),
        )
        .route("/schedules/{id}", patch(api_routes::update_schedule))
        .route(
            "/schedules/{id}/deactivate",
            post(api_routes::deactivate_schedule),
        )
        .route(
            "/receipts/uploads",
            post(api_routes::request_receipt_upload),
        )
        .route(
            "/receipts/uploads/{id}/complete",
            post(api_routes::complete_receipt_upload),
        )
        .route("/receipts/{id}/download", get(api_routes::receipt_download))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            session_layer::require_session,
        ));

    Router::new()
        .nest("/api", api)
        .route("/api/session", get(auth_routes::session))
        .route("/auth/login", get(auth_routes::login))
        .route("/auth/callback", get(auth_routes::callback))
        .route("/auth/logout", post(auth_routes::logout))
        .layer(middleware::map_response(private_headers))
        .with_state(state)
}

/// Authentication and finance responses are never stored by a cache, and the
/// browser is told not to guess a content type or frame the response.
async fn private_headers(mut response: axum::response::Response) -> axum::response::Response {
    let headers = response.headers_mut();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(header::X_FRAME_OPTIONS, HeaderValue::from_static("DENY"));
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    response
}
