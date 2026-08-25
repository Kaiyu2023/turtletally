use std::fmt::{Display, Formatter, Result as FmtResult};

use serde::{Deserialize, Serialize};

/// The contract's error vocabulary. `apps/web/src/data/types.ts` defines the
/// same four codes, and the API surface maps each to one status.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    NotFound,
    Conflict,
    Validation,
    Unauthenticated,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DomainError {
    pub code: ErrorCode,
    pub message: String,
}

impl DomainError {
    pub fn not_found(message: impl Into<String>) -> Self {
        Self {
            code: ErrorCode::NotFound,
            message: message.into(),
        }
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self {
            code: ErrorCode::Conflict,
            message: message.into(),
        }
    }

    pub fn validation(message: impl Into<String>) -> Self {
        Self {
            code: ErrorCode::Validation,
            message: message.into(),
        }
    }

    pub fn unauthenticated(message: impl Into<String>) -> Self {
        Self {
            code: ErrorCode::Unauthenticated,
            message: message.into(),
        }
    }
}

impl Display for DomainError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> FmtResult {
        write!(formatter, "{}", self.message)
    }
}

impl std::error::Error for DomainError {}

pub type DomainResult<T> = Result<T, DomainError>;
