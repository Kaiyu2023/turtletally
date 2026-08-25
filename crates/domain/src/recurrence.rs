use crate::calendar::{LocalDate, days_in_month};
use crate::error::{DomainError, DomainResult};
use crate::types::{EndOfMonthPolicy, ScheduleRecurrence};

const MAX_MONTH_STEPS: u32 = 48;
const MAX_YEAR_STEPS: u32 = 8;

/// The date after `current_due`, or `None` when the schedule has no further
/// occurrence. A `SKIP` policy walks forward until a month is long enough.
pub fn next_occurrence(
    recurrence: &ScheduleRecurrence,
    current_due: &LocalDate,
) -> Option<LocalDate> {
    match recurrence {
        ScheduleRecurrence::Once { .. } => None,
        ScheduleRecurrence::Weekly { interval_weeks, .. } => {
            Some(current_due.add_days(i64::from(*interval_weeks) * 7))
        }
        ScheduleRecurrence::Monthly {
            day,
            end_of_month_policy,
        } => {
            let mut year = current_due.month().year();
            let mut month = current_due.month().number();

            for _ in 0..MAX_MONTH_STEPS {
                month += 1;
                if month > 12 {
                    month = 1;
                    year += 1;
                }
                let available = days_in_month(year, month);
                if *day <= available {
                    return date(year, month, *day);
                }
                if *end_of_month_policy == EndOfMonthPolicy::Clamp {
                    return date(year, month, available);
                }
            }
            None
        }
        ScheduleRecurrence::Yearly {
            month,
            day,
            end_of_month_policy,
        } => {
            let mut year = current_due.month().year();

            for _ in 0..MAX_YEAR_STEPS {
                year += 1;
                let available = days_in_month(year, *month);
                if *day <= available {
                    return date(year, *month, *day);
                }
                if *end_of_month_policy == EndOfMonthPolicy::Clamp {
                    return date(year, *month, available);
                }
            }
            None
        }
    }
}

pub fn validate(recurrence: &ScheduleRecurrence) -> DomainResult<()> {
    match recurrence {
        ScheduleRecurrence::Once { .. } => Ok(()),
        ScheduleRecurrence::Weekly { interval_weeks, .. } => {
            if !(1..=52).contains(interval_weeks) {
                return Err(DomainError::validation(
                    "Weekly interval must be between 1 and 52.",
                ));
            }
            Ok(())
        }
        ScheduleRecurrence::Monthly { day, .. } => day_in_range(*day),
        ScheduleRecurrence::Yearly { month, day, .. } => {
            day_in_range(*day)?;
            if !(1..=12).contains(month) {
                return Err(DomainError::validation(
                    "Schedule month must be between 1 and 12.",
                ));
            }
            Ok(())
        }
    }
}

fn day_in_range(day: u32) -> DomainResult<()> {
    if !(1..=31).contains(&day) {
        return Err(DomainError::validation(
            "Schedule day must be between 1 and 31.",
        ));
    }
    Ok(())
}

fn date(year: i32, month: u32, day: u32) -> Option<LocalDate> {
    LocalDate::parse(&format!("{year:04}-{month:02}-{day:02}")).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Weekday;

    fn date(value: &str) -> LocalDate {
        LocalDate::parse(value).expect("a valid date")
    }

    #[test]
    fn a_one_off_schedule_has_no_next_occurrence() {
        let recurrence = ScheduleRecurrence::Once {
            date: date("2026-08-20"),
        };
        assert_eq!(next_occurrence(&recurrence, &date("2026-08-20")), None);
    }

    #[test]
    fn a_skipping_monthly_schedule_passes_over_a_short_month() {
        let recurrence = ScheduleRecurrence::Monthly {
            day: 31,
            end_of_month_policy: EndOfMonthPolicy::Skip,
        };
        assert_eq!(
            next_occurrence(&recurrence, &date("2026-01-31")),
            Some(date("2026-03-31"))
        );
    }

    #[test]
    fn validation_rejects_an_impossible_interval() {
        let recurrence = ScheduleRecurrence::Weekly {
            weekday: Weekday::Monday,
            interval_weeks: 0,
        };
        assert!(validate(&recurrence).is_err());
        assert!(
            validate(&ScheduleRecurrence::Monthly {
                day: 32,
                end_of_month_policy: EndOfMonthPolicy::Clamp
            })
            .is_err()
        );
        assert!(
            validate(&ScheduleRecurrence::Yearly {
                month: 13,
                day: 1,
                end_of_month_policy: EndOfMonthPolicy::Clamp
            })
            .is_err()
        );
    }
}
