use crate::ordering::compare_names;
use crate::types::{Account, Category};

/// The bounded reference lists are read on almost every route, so their order
/// is part of the read model rather than a caller's concern. Case-insensitive
/// first, then by code point, which is what the browser's collation gives for
/// the names this product allows.
pub fn sort_accounts(accounts: &mut [Account]) {
    accounts.sort_by(|left, right| compare_names(&left.name, &right.name));
}

pub fn sort_categories(categories: &mut [Category]) {
    categories.sort_by(|left, right| {
        compare_names(group_name(left), group_name(right))
            .then_with(|| compare_names(&left.name, &right.name))
    });
}

fn group_name(category: &Category) -> &'static str {
    match category.group {
        crate::types::CategoryGroup::Shopping => "Shopping",
        crate::types::CategoryGroup::Rent => "Rent",
        crate::types::CategoryGroup::Utilities => "Utilities",
        crate::types::CategoryGroup::Services => "Services",
        crate::types::CategoryGroup::Tax => "Tax",
        crate::types::CategoryGroup::Transport => "Transport",
        crate::types::CategoryGroup::Income => "Income",
        crate::types::CategoryGroup::Investment => "Investment",
    }
}
