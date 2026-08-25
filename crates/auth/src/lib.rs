//! Authentication for both ingresses: the browser's server-side session
//! (ADR 0002) and the token verification an MCP client's access token needs
//! (ADR 0004). Nothing here reaches a database or a transport; both are ports
//! the binaries wire up.

pub mod oauth;
pub mod secrets;
pub mod session;
pub mod tokens;

pub use session::{SessionRecord, session_cookie};
