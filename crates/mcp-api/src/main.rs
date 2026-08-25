mod bearer;
mod server;
mod state;
mod tools;

use std::sync::Arc;

use axum::routing::get;
use axum::{Router, middleware};
use lambda_http::{Error, run};
use rmcp::transport::streamable_http_server::StreamableHttpService;
use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use rmcp::transport::streamable_http_server::tower::StreamableHttpServerConfig;

use crate::server::TurtleTallyServer;
use crate::state::{Config, McpState};

#[tokio::main]
async fn main() -> Result<(), Error> {
    let config = Config::from_environment().map_err(|error| Error::from(error.message))?;
    let state = McpState::build(config)
        .await
        .map_err(|error| Error::from(error.message))?;

    run(router(state)).await
}

/// One endpoint, one transport, one authorization scheme. Nothing here knows
/// which client or which model is on the other side of it.
fn router(state: Arc<McpState>) -> Router {
    let assistant = state.assistant.clone();
    let mut transport = StreamableHttpServerConfig::default();
    // Each request carries its own token and stands alone, which is what a
    // function that may not serve the next one requires.
    transport.legacy_session_mode = false;
    transport.json_response = true;
    // Answer only for the host this deployment is published under, so a request
    // that reached the function under another name is refused.
    transport.allowed_hosts = vec![host_of(&state.config.resource_url)];

    let mcp = StreamableHttpService::new(
        move || Ok(TurtleTallyServer::new(assistant.clone())),
        Arc::new(LocalSessionManager::default()),
        transport,
    );

    Router::new()
        .route(
            "/.well-known/oauth-protected-resource",
            get(bearer::protected_resource_metadata),
        )
        .nest_service(
            "/mcp",
            Router::new()
                .fallback_service(mcp)
                .layer(middleware::from_fn_with_state(
                    state.clone(),
                    bearer::require_token,
                ))
                .with_state(state.clone()),
        )
        .with_state(state)
}

fn host_of(resource_url: &str) -> String {
    resource_url
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .split('/')
        .next()
        .unwrap_or_default()
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_allowed_host_is_the_one_the_resource_is_published_under() {
        assert_eq!(
            host_of("https://mcp.example.invalid/mcp"),
            "mcp.example.invalid"
        );
        assert_eq!(
            host_of("https://mcp.example.invalid"),
            "mcp.example.invalid"
        );
    }
}
