use crate::calendar::LocalDate;
use crate::error::{DomainError, DomainResult};
use crate::time::zoned_date;

const MAX_NAME_LENGTH: usize = 100;

pub fn valid_name(value: &str, label: &str) -> DomainResult<String> {
    let name = value.trim();
    if name.is_empty() || name.chars().count() > MAX_NAME_LENGTH {
        return Err(DomainError::validation(format!(
            "{label} must be between 1 and {MAX_NAME_LENGTH} characters."
        )));
    }
    Ok(name.to_owned())
}

pub fn valid_colour(value: &str) -> DomainResult<()> {
    let is_hex = value.len() == 7
        && value.starts_with('#')
        && value[1..]
            .chars()
            .all(|character| character.is_ascii_hexdigit());
    if !is_hex {
        return Err(DomainError::validation(
            "Colour must be a six-digit hex value.",
        ));
    }
    Ok(())
}

/// A ledger entry with no amount is not a fact about money.
pub fn valid_amount(value: i64, label: &str) -> DomainResult<()> {
    if value == 0 {
        return Err(DomainError::validation(format!(
            "{label} must be a non-zero whole number of pence."
        )));
    }
    Ok(())
}

pub fn valid_minor(value: i64, label: &str, allow_zero: bool) -> DomainResult<()> {
    let minimum = if allow_zero { 0 } else { 1 };
    if value < minimum {
        let suffix = if allow_zero { " or zero" } else { "" };
        return Err(DomainError::validation(format!(
            "{label} must be a whole number of pence{suffix}."
        )));
    }
    Ok(())
}

pub fn valid_occurred_at(value: &str, local_date: &LocalDate) -> DomainResult<()> {
    if &zoned_date(value)? != local_date {
        return Err(DomainError::validation(
            "Transaction time must fall on the selected local date.",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_name_is_trimmed_and_bounded() {
        assert_eq!(
            valid_name("  Groceries  ", "Name").expect("a usable name"),
            "Groceries"
        );
        assert!(valid_name("   ", "Name").is_err());
        assert!(valid_name(&"x".repeat(101), "Name").is_err());
    }

    #[test]
    fn a_colour_is_six_hex_digits() {
        assert!(valid_colour("#76b7b2").is_ok());
        assert!(valid_colour("#76B7B2").is_ok());
        assert!(valid_colour("#76b7b").is_err());
        assert!(valid_colour("76b7b2").is_err());
        assert!(valid_colour("#zzzzzz").is_err());
    }

    #[test]
    fn an_instant_must_fall_on_its_local_date() {
        let date = LocalDate::parse("2026-08-17").expect("a valid date");
        assert!(valid_occurred_at("2026-08-17T11:00:00.000Z", &date).is_ok());
        assert!(valid_occurred_at("2026-08-16T22:00:00.000Z", &date).is_err());
        assert!(valid_occurred_at("not-a-time", &date).is_err());
    }
}
