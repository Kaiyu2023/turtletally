use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use chrono_tz::Europe::London;

use crate::calendar::LocalDate;
use crate::error::{DomainError, DomainResult};

/// The ledger is single-owner and single-zone: a local date is what the owner
/// sees, and the instant is what is stored. `apps/web/src/data/time.ts` holds
/// the same two directions.
pub fn zoned_date(instant: &str) -> DomainResult<LocalDate> {
    Ok(LocalDate::from_naive(
        parse_instant(instant)?.with_timezone(&London).date_naive(),
    ))
}

pub fn zoned_time(instant: &str) -> DomainResult<String> {
    Ok(parse_instant(instant)?
        .with_timezone(&London)
        .format("%H:%M:%S")
        .to_string())
}

/// Find the instant whose Europe/London wall clock reads the given date and
/// time. The zone offset depends on the instant being solved for, so start from
/// the naive reading and correct by the drift it produces; this settles within
/// two rounds for every offset this zone uses.
pub fn instant_at(local_date: &LocalDate, time_of_day: &str) -> DomainResult<String> {
    let target = wall_clock_millis(local_date.as_str(), time_of_day)?;
    let mut guess = target;

    for _ in 0..4 {
        let iso = format_instant(guess)?;
        let drift = target - wall_clock_millis(zoned_date(&iso)?.as_str(), &zoned_time(&iso)?)?;
        if drift == 0 {
            break;
        }
        guess += drift;
    }

    format_instant(guess)
}

pub fn reanchor(occurred_at: &str, local_date: &LocalDate) -> DomainResult<String> {
    instant_at(local_date, &zoned_time(occurred_at)?)
}

pub fn parse_instant(instant: &str) -> DomainResult<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(instant)
        .map(|value| value.with_timezone(&Utc))
        .map_err(|_| DomainError::validation("Transaction time must be an ISO timestamp."))
}

pub fn format_instant_at(instant: DateTime<Utc>) -> String {
    instant.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

fn format_instant(millis: i64) -> DomainResult<String> {
    Utc.timestamp_millis_opt(millis)
        .single()
        .map(format_instant_at)
        .ok_or_else(|| DomainError::validation("Transaction time is outside the supported range."))
}

fn wall_clock_millis(local_date: &str, time_of_day: &str) -> DomainResult<i64> {
    NaiveDateTime::parse_from_str(&format!("{local_date}T{time_of_day}"), "%Y-%m-%dT%H:%M:%S")
        .map(|value| value.and_utc().timestamp_millis())
        .map_err(|_| DomainError::validation("Time of day must use HH:MM:SS format."))
}
