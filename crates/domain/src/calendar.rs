use std::fmt::{Display, Formatter, Result as FmtResult};

use chrono::{Datelike, Days, NaiveDate};
use serde::{Deserialize, Serialize};

use crate::error::{DomainError, DomainResult};

/// A calendar date in `YYYY-MM-DD` form. Both representations are fixed width,
/// so their string ordering is their calendar ordering and a bounded ledger
/// query can compare them directly.
#[derive(Clone, Debug, Eq, PartialEq, Ord, PartialOrd, Hash, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct LocalDate(String);

/// A calendar month in `YYYY-MM` form.
#[derive(Clone, Debug, Eq, PartialEq, Ord, PartialOrd, Hash, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct Month(String);

impl LocalDate {
    pub fn parse(value: &str) -> DomainResult<Self> {
        let date = Self::naive_from(value)?;
        if format_date(date) != value {
            return Err(DomainError::validation("Date is not valid."));
        }
        Ok(Self(value.to_owned()))
    }

    pub fn from_naive(date: NaiveDate) -> Self {
        Self(format_date(date))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn to_naive(&self) -> NaiveDate {
        Self::naive_from(&self.0).expect("a constructed LocalDate is a calendar date")
    }

    pub fn month(&self) -> Month {
        Month(self.0[..7].to_owned())
    }

    pub fn day(&self) -> u32 {
        self.to_naive().day()
    }

    pub fn add_days(&self, days: i64) -> Self {
        let date = self.to_naive();
        let shifted = if days >= 0 {
            date.checked_add_days(Days::new(days.unsigned_abs()))
        } else {
            date.checked_sub_days(Days::new(days.unsigned_abs()))
        };
        Self::from_naive(shifted.expect("ledger dates stay inside the supported calendar range"))
    }

    fn naive_from(value: &str) -> DomainResult<NaiveDate> {
        let invalid = || DomainError::validation("Date must use YYYY-MM-DD format.");
        if value.len() != 10 {
            return Err(invalid());
        }
        let year: i32 = value[0..4].parse().map_err(|_| invalid())?;
        let month: u32 = value[5..7].parse().map_err(|_| invalid())?;
        let day: u32 = value[8..10].parse().map_err(|_| invalid())?;
        NaiveDate::from_ymd_opt(year, month, day)
            .ok_or_else(|| DomainError::validation("Date is not valid."))
    }
}

impl Month {
    pub fn parse(value: &str) -> DomainResult<Self> {
        let invalid = || DomainError::validation("Month must use YYYY-MM format.");
        if value.len() != 7 || value.as_bytes()[4] != b'-' {
            return Err(invalid());
        }
        let year: i32 = value[0..4].parse().map_err(|_| invalid())?;
        let month: u32 = value[5..7].parse().map_err(|_| invalid())?;
        if !(1..=12).contains(&month) || NaiveDate::from_ymd_opt(year, month, 1).is_none() {
            return Err(invalid());
        }
        Ok(Self(value.to_owned()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn year(&self) -> i32 {
        self.0[0..4]
            .parse()
            .expect("a constructed Month carries a year")
    }

    pub fn number(&self) -> u32 {
        self.0[5..7]
            .parse()
            .expect("a constructed Month carries a month number")
    }

    pub fn first_day(&self) -> LocalDate {
        LocalDate::from_naive(
            NaiveDate::from_ymd_opt(self.year(), self.number(), 1)
                .expect("a constructed Month has a first day"),
        )
    }

    pub fn last_day(&self) -> LocalDate {
        let (year, month) = if self.number() == 12 {
            (self.year() + 1, 1)
        } else {
            (self.year(), self.number() + 1)
        };
        let next_first =
            NaiveDate::from_ymd_opt(year, month, 1).expect("the month after a valid month exists");
        LocalDate::from_naive(next_first.pred_opt().expect("a month has a last day"))
    }

    pub fn next(&self) -> Self {
        let (year, month) = if self.number() == 12 {
            (self.year() + 1, 1)
        } else {
            (self.year(), self.number() + 1)
        };
        Self(format!("{year:04}-{month:02}"))
    }

    pub fn previous(&self) -> Self {
        let (year, month) = if self.number() == 1 {
            (self.year() - 1, 12)
        } else {
            (self.year(), self.number() - 1)
        };
        Self(format!("{year:04}-{month:02}"))
    }

    pub fn contains(&self, date: &LocalDate) -> bool {
        date.as_str().starts_with(&self.0)
    }
}

pub fn days_in_month(year: i32, month: u32) -> u32 {
    let (next_year, next_month) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    match (
        NaiveDate::from_ymd_opt(next_year, next_month, 1),
        NaiveDate::from_ymd_opt(year, month, 1),
    ) {
        (Some(next), Some(_)) => next.pred_opt().map_or(0, |date| date.day()),
        _ => 0,
    }
}

fn format_date(date: NaiveDate) -> String {
    format!("{:04}-{:02}-{:02}", date.year(), date.month(), date.day())
}

impl Display for LocalDate {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> FmtResult {
        formatter.write_str(&self.0)
    }
}

impl Display for Month {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> FmtResult {
        formatter.write_str(&self.0)
    }
}

impl TryFrom<String> for LocalDate {
    type Error = DomainError;

    fn try_from(value: String) -> DomainResult<Self> {
        Self::parse(&value)
    }
}

impl TryFrom<String> for Month {
    type Error = DomainError;

    fn try_from(value: String) -> DomainResult<Self> {
        Self::parse(&value)
    }
}

impl From<LocalDate> for String {
    fn from(value: LocalDate) -> Self {
        value.0
    }
}

impl From<Month> for String {
    fn from(value: Month) -> Self {
        value.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_a_date_the_calendar_does_not_have() {
        assert!(LocalDate::parse("2026-02-30").is_err());
        assert!(LocalDate::parse("2026-2-05").is_err());
        assert!(LocalDate::parse("2026-02-5").is_err());
        assert!(LocalDate::parse("not-a-date").is_err());
    }

    #[test]
    fn orders_dates_and_months_by_their_string_form() {
        let earlier = LocalDate::parse("2026-08-09").expect("a valid date");
        let later = LocalDate::parse("2026-08-10").expect("a valid date");
        assert!(earlier < later);
        assert_eq!(
            earlier.month(),
            Month::parse("2026-08").expect("a valid month")
        );
    }

    #[test]
    fn walks_month_boundaries_in_both_directions() {
        let january = Month::parse("2026-01").expect("a valid month");
        assert_eq!(january.previous().as_str(), "2025-12");
        assert_eq!(january.last_day().as_str(), "2026-01-31");
        assert_eq!(
            Month::parse("2028-02")
                .expect("a valid month")
                .last_day()
                .as_str(),
            "2028-02-29"
        );
        assert_eq!(
            LocalDate::parse("2026-03-01")
                .expect("a valid date")
                .add_days(-1)
                .as_str(),
            "2026-02-28"
        );
    }

    #[test]
    fn rejects_a_month_outside_the_year() {
        assert!(Month::parse("2026-13").is_err());
        assert!(Month::parse("2026-00").is_err());
        assert!(Month::parse("2026-1").is_err());
    }
}
