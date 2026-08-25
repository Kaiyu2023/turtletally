use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Serialize;
use turtle_tally_domain::error::{DomainError, ErrorCode};

/// The closed error set the API conventions define. Clients branch on the code,
/// so the message carries no financial value, filename, or token.
pub struct ApiError(pub DomainError);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorBody {
    code: ErrorCode,
    message: String,
}

impl From<DomainError> for ApiError {
    fn from(error: DomainError) -> Self {
        Self(error)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = match self.0.code {
            ErrorCode::Validation => StatusCode::BAD_REQUEST,
            ErrorCode::NotFound => StatusCode::NOT_FOUND,
            ErrorCode::Conflict => StatusCode::CONFLICT,
            ErrorCode::Unauthenticated => StatusCode::UNAUTHORIZED,
        };

        (
            status,
            Json(ErrorBody {
                code: self.0.code,
                message: self.0.message,
            }),
        )
            .into_response()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
