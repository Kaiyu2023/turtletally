use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::{Deserialize, Serialize};

use crate::error::{DomainError, DomainResult};
use crate::types::{Transaction, TransactionSort};

pub const MAX_PAGE_LIMIT: u32 = 100;
pub const DEFAULT_PAGE_LIMIT: u32 = 10;

/// A list resumes from the key it last returned (ADR 0007). The cursor carries
/// the whole sort key, so a reader continues strictly after one position even
/// when rows have been written since.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LedgerCursor {
    pub sort: TransactionSort,
    pub occurred_at: String,
    pub amount_minor: i64,
    pub id: String,
}

impl LedgerCursor {
    pub fn of(transaction: &Transaction, sort: TransactionSort) -> Self {
        Self {
            sort,
            occurred_at: transaction.occurred_at.clone(),
            amount_minor: transaction.amount_minor,
            id: transaction.id.clone(),
        }
    }

    pub fn encode(&self) -> String {
        URL_SAFE_NO_PAD.encode(serde_json::to_vec(self).expect("a cursor serialises"))
    }

    pub fn parse(value: &str, sort: TransactionSort) -> DomainResult<Self> {
        let decoded = URL_SAFE_NO_PAD.decode(value).map_err(|_| {
            DomainError::validation("That page cursor is not readable. Start the list again.")
        })?;
        let cursor: Self = serde_json::from_slice(&decoded).map_err(|_| {
            DomainError::validation("That page cursor is not readable. Start the list again.")
        })?;

        if cursor.sort != sort {
            return Err(DomainError::validation(
                "That page cursor belongs to a different query. Start the list again.",
            ));
        }

        Ok(cursor)
    }
}

/// The ordering is total: every sort ends on the identifier, so one cursor
/// names exactly one position.
pub fn compare_for_sort(
    left: &LedgerCursor,
    right: &LedgerCursor,
    sort: TransactionSort,
) -> std::cmp::Ordering {
    match sort {
        TransactionSort::AmountHigh => right
            .amount_minor
            .cmp(&left.amount_minor)
            .then_with(|| right.id.cmp(&left.id)),
        TransactionSort::AmountLow => left
            .amount_minor
            .cmp(&right.amount_minor)
            .then_with(|| left.id.cmp(&right.id)),
        TransactionSort::Oldest => left
            .occurred_at
            .cmp(&right.occurred_at)
            .then_with(|| left.id.cmp(&right.id)),
        TransactionSort::Newest => right
            .occurred_at
            .cmp(&left.occurred_at)
            .then_with(|| right.id.cmp(&left.id)),
    }
}

pub fn sort_transactions(transactions: &mut [Transaction], sort: TransactionSort) {
    transactions.sort_by(|left, right| {
        compare_for_sort(
            &LedgerCursor::of(left, sort),
            &LedgerCursor::of(right, sort),
            sort,
        )
    });
}

pub fn is_after_cursor(
    transaction: &Transaction,
    cursor: &LedgerCursor,
    sort: TransactionSort,
) -> bool {
    compare_for_sort(&LedgerCursor::of(transaction, sort), cursor, sort)
        == std::cmp::Ordering::Greater
}

pub fn validate_limit(limit: u32) -> DomainResult<u32> {
    if !(1..=MAX_PAGE_LIMIT).contains(&limit) {
        return Err(DomainError::validation(format!(
            "Page limit must be between 1 and {MAX_PAGE_LIMIT}."
        )));
    }
    Ok(limit)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cursor(id: &str, occurred_at: &str, amount_minor: i64) -> LedgerCursor {
        LedgerCursor {
            sort: TransactionSort::Newest,
            occurred_at: occurred_at.to_owned(),
            amount_minor,
            id: id.to_owned(),
        }
    }

    #[test]
    fn a_cursor_survives_a_round_trip() {
        let original = cursor("transaction-1", "2026-08-17T11:00:00.000Z", -4_325);
        let parsed = LedgerCursor::parse(&original.encode(), TransactionSort::Newest)
            .expect("a readable cursor");
        assert_eq!(parsed, original);
    }

    #[test]
    fn a_cursor_belongs_to_the_ordering_that_made_it() {
        let encoded = cursor("transaction-1", "2026-08-17T11:00:00.000Z", -4_325).encode();
        assert!(LedgerCursor::parse(&encoded, TransactionSort::Oldest).is_err());
        assert!(LedgerCursor::parse("not-a-cursor", TransactionSort::Newest).is_err());
    }

    #[test]
    fn equal_sort_values_still_order_by_identifier() {
        let left = cursor("transaction-1", "2026-08-17T11:00:00.000Z", -4_325);
        let right = cursor("transaction-2", "2026-08-17T11:00:00.000Z", -4_325);
        assert_eq!(
            compare_for_sort(&left, &right, TransactionSort::Newest),
            std::cmp::Ordering::Greater
        );
        assert_eq!(
            compare_for_sort(&left, &right, TransactionSort::Oldest),
            std::cmp::Ordering::Less
        );
    }

    #[test]
    fn the_page_limit_is_bounded() {
        assert!(validate_limit(0).is_err());
        assert!(validate_limit(MAX_PAGE_LIMIT + 1).is_err());
        assert_eq!(
            validate_limit(DEFAULT_PAGE_LIMIT).expect("a usable limit"),
            DEFAULT_PAGE_LIMIT
        );
    }
}
