use std::cmp::Ordering;

/// Code-point order, which `apps/web/src/data/ordering.ts` also defines. The
/// browser's `localeCompare` depends on its collation, so an ordering the
/// contract promises is defined without it and both sides can agree exactly.
pub fn compare_text(left: &str, right: &str) -> Ordering {
    left.cmp(right)
}

pub fn compare_names(left: &str, right: &str) -> Ordering {
    left.to_lowercase()
        .cmp(&right.to_lowercase())
        .then_with(|| left.cmp(right))
}
