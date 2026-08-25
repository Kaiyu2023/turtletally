use turtle_tally_application::ports::Owner;
use turtle_tally_domain::calendar::Month;
use turtle_tally_domain::types::Transaction;

/// ADR 0003 partitions every record by the authenticated subject and reaches it
/// through a typed sort key. Reference records share one owner partition, while
/// the ledger takes a partition per month so a window read is bounded by
/// construction.
pub fn owner_partition(owner: &Owner) -> String {
    format!("OWNER#{}", owner.as_str())
}

pub fn ledger_partition(owner: &Owner, month: &Month) -> String {
    format!("OWNER#{}#LEDGER#{month}", owner.as_str())
}

pub const PREFERENCES_KEY: &str = "PREFERENCES";
pub const ACCOUNT_PREFIX: &str = "ACCOUNT#";
pub const CATEGORY_PREFIX: &str = "CATEGORY#";
pub const BUDGET_PREFIX: &str = "BUDGET#";
pub const BUDGET_DEFAULT_PREFIX: &str = "BUDGET_DEFAULT#";
pub const SCHEDULE_PREFIX: &str = "SCHEDULE#";
pub const RECEIPT_PREFIX: &str = "RECEIPT#";
pub const UPLOAD_PREFIX: &str = "UPLOAD#";
pub const OPERATION_PREFIX: &str = "OPERATION#";
pub const ROLLUP_PREFIX: &str = "ROLLUP#";
pub const TRANSACTION_PREFIX: &str = "TX#";

pub fn account_key(id: &str) -> String {
    format!("{ACCOUNT_PREFIX}{id}")
}

pub fn category_key(id: &str) -> String {
    format!("{CATEGORY_PREFIX}{id}")
}

/// A month and a category identify a budget, so setting the same budget twice
/// cannot produce two rows.
pub fn budget_key(month: &Month, category_id: &str) -> String {
    format!("{BUDGET_PREFIX}{month}#{category_id}")
}

pub fn budget_default_key(category_id: &str) -> String {
    format!("{BUDGET_DEFAULT_PREFIX}{category_id}")
}

pub fn schedule_key(id: &str) -> String {
    format!("{SCHEDULE_PREFIX}{id}")
}

pub fn receipt_key(id: &str) -> String {
    format!("{RECEIPT_PREFIX}{id}")
}

pub fn upload_key(id: &str) -> String {
    format!("{UPLOAD_PREFIX}{id}")
}

/// A proposed operation an assistant may later commit (ADR 0005). It expires
/// on its own and is removed by the commit that redeems it.
pub fn operation_key(id: &str) -> String {
    format!("{OPERATION_PREFIX}{id}")
}

pub fn rollup_key(month: &Month) -> String {
    format!("{ROLLUP_PREFIX}{month}")
}

/// The ledger sort key is the instant and then the identifier, which is the
/// same total order the cursor uses.
pub fn transaction_key(transaction: &Transaction) -> String {
    format!(
        "{TRANSACTION_PREFIX}{}#{}",
        transaction.occurred_at, transaction.id
    )
}

/// The lookup index resolves a transaction by identifier without knowing which
/// month partition holds it.
pub fn transaction_lookup_partition(owner: &Owner) -> String {
    format!("OWNER#{}#TX", owner.as_str())
}

pub fn audit_partition(owner: &Owner) -> String {
    format!("OWNER#{}", owner.as_str())
}

pub fn audit_key(recorded_at: &str, id: &str) -> String {
    format!("{recorded_at}#{id}")
}

#[cfg(test)]
mod tests {
    use turtle_tally_domain::calendar::Month;

    use super::*;

    #[test]
    fn a_ledger_partition_names_its_month() {
        let owner = Owner::new("subject");
        let month = Month::parse("2026-08").expect("a valid month");
        assert_eq!(
            ledger_partition(&owner, &month),
            "OWNER#subject#LEDGER#2026-08"
        );
        assert_ne!(ledger_partition(&owner, &month), owner_partition(&owner));
    }

    #[test]
    fn typed_prefixes_keep_reference_records_apart() {
        assert!(account_key("a").starts_with(ACCOUNT_PREFIX));
        assert!(!account_key("a").starts_with(CATEGORY_PREFIX));
        // A month's budget query must not sweep up the defaults, which is why
        // the two prefixes are separated by their own delimiter.
        let month = Month::parse("2026-08").expect("a valid month");
        assert!(budget_key(&month, "c").starts_with(&format!("{BUDGET_PREFIX}{month}#")));
        assert!(!budget_default_key("c").starts_with(&format!("{BUDGET_PREFIX}{month}#")));
    }
}
