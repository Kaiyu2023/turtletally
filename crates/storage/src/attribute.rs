use std::collections::HashMap;

use aws_sdk_dynamodb::types::AttributeValue;
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::{Map, Number, Value};
use turtle_tally_domain::error::{DomainError, DomainResult};

/// Stored records are the contract's own types, so they are converted through
/// JSON rather than through a hand-written mapping per entity. Every stored
/// number is a whole number of pence or a version, which is why a fractional
/// value is rejected rather than rounded.
pub fn to_item<T: Serialize>(value: &T) -> DomainResult<HashMap<String, AttributeValue>> {
    match serde_json::to_value(value).map_err(storage_error)? {
        Value::Object(fields) => Ok(fields
            .into_iter()
            .map(|(name, field)| Ok((name, to_attribute(field)?)))
            .collect::<DomainResult<HashMap<_, _>>>()?),
        _ => Err(DomainError::validation(
            "Only a record can be stored as an item.",
        )),
    }
}

pub fn from_item<T: DeserializeOwned>(item: HashMap<String, AttributeValue>) -> DomainResult<T> {
    let mut fields = Map::new();
    for (name, value) in item {
        fields.insert(name, from_attribute(value)?);
    }
    serde_json::from_value(Value::Object(fields)).map_err(storage_error)
}

pub fn to_attribute(value: Value) -> DomainResult<AttributeValue> {
    Ok(match value {
        Value::Null => AttributeValue::Null(true),
        Value::Bool(flag) => AttributeValue::Bool(flag),
        Value::Number(number) => AttributeValue::N(whole_number(&number)?),
        Value::String(text) => AttributeValue::S(text),
        Value::Array(items) => AttributeValue::L(
            items
                .into_iter()
                .map(to_attribute)
                .collect::<DomainResult<Vec<_>>>()?,
        ),
        Value::Object(fields) => AttributeValue::M(
            fields
                .into_iter()
                .map(|(name, field)| Ok((name, to_attribute(field)?)))
                .collect::<DomainResult<HashMap<_, _>>>()?,
        ),
    })
}

pub fn from_attribute(value: AttributeValue) -> DomainResult<Value> {
    Ok(match value {
        AttributeValue::Null(_) => Value::Null,
        AttributeValue::Bool(flag) => Value::Bool(flag),
        AttributeValue::N(number) => Value::Number(
            number
                .parse::<i64>()
                .map(Number::from)
                .map_err(|_| DomainError::validation("A stored number must be a whole number."))?,
        ),
        AttributeValue::S(text) => Value::String(text),
        AttributeValue::L(items) => Value::Array(
            items
                .into_iter()
                .map(from_attribute)
                .collect::<DomainResult<Vec<_>>>()?,
        ),
        AttributeValue::M(fields) => Value::Object(
            fields
                .into_iter()
                .map(|(name, field)| Ok((name, from_attribute(field)?)))
                .collect::<DomainResult<Map<_, _>>>()?,
        ),
        _ => {
            return Err(DomainError::validation(
                "A stored item carries an unsupported attribute type.",
            ));
        }
    })
}

pub fn number(value: i64) -> AttributeValue {
    AttributeValue::N(value.to_string())
}

pub fn text(value: impl Into<String>) -> AttributeValue {
    AttributeValue::S(value.into())
}

fn whole_number(number: &Number) -> DomainResult<String> {
    number
        .as_i64()
        .map(|value| value.to_string())
        .ok_or_else(|| DomainError::validation("Money and versions are stored as whole numbers."))
}

fn storage_error(error: serde_json::Error) -> DomainError {
    DomainError::validation(format!(
        "A stored record does not match the contract: {error}"
    ))
}

#[cfg(test)]
mod tests {
    use turtle_tally_domain::calendar::{LocalDate, Month};
    use turtle_tally_domain::rollup::MonthlyRollup;
    use turtle_tally_domain::types::{
        Account, AccountType, Currency, EndOfMonthPolicy, Schedule, ScheduleRecurrence,
        TimePrecision, Timezone, Transaction, TransactionKind, TransactionOrigin,
    };

    use super::*;

    fn transaction() -> Transaction {
        Transaction {
            id: "transaction-1".to_owned(),
            account_id: "account-1".to_owned(),
            account_name: "Everyday Current".to_owned(),
            category_id: None,
            category_name: None,
            description: "Weekly groceries".to_owned(),
            amount_minor: -4_325,
            currency: Currency::Gbp,
            kind: TransactionKind::Spending,
            origin: TransactionOrigin::Manual,
            occurred_at: "2026-08-13T11:00:00.000Z".to_owned(),
            local_date: LocalDate::parse("2026-08-13").expect("a valid date"),
            time_precision: TimePrecision::Date,
            timezone: Timezone::EuropeLondon,
            schedule_id: None,
            occurrence_date: None,
            import_row_fingerprint: None,
            receipt: None,
            voided_at: None,
            void_reason: None,
            created_at: "2026-08-13T11:00:00.000Z".to_owned(),
            updated_at: "2026-08-13T11:00:00.000Z".to_owned(),
            version: 1,
        }
    }

    #[test]
    fn a_transaction_survives_a_round_trip() {
        let original = transaction();
        let item = to_item(&original).expect("a storable item");
        assert!(matches!(
            item.get("categoryId"),
            Some(AttributeValue::Null(true))
        ));
        assert_eq!(
            from_item::<Transaction>(item).expect("a readable item"),
            original
        );
    }

    #[test]
    fn a_schedule_keeps_the_shape_of_its_recurrence() {
        let schedule = Schedule {
            id: "schedule-1".to_owned(),
            name: "Rent".to_owned(),
            account_id: "account-1".to_owned(),
            account_name: "Everyday Current".to_owned(),
            category_id: Some("category-rent".to_owned()),
            category_name: Some("Rent".to_owned()),
            description: "Monthly rent".to_owned(),
            amount_minor: -118_000,
            currency: Currency::Gbp,
            kind: TransactionKind::Spending,
            recurrence: ScheduleRecurrence::Monthly {
                day: 31,
                end_of_month_policy: EndOfMonthPolicy::Clamp,
            },
            next_due_date: Some(LocalDate::parse("2026-09-30").expect("a valid date")),
            last_generated_date: None,
            deactivated_at: None,
            version: 3,
        };

        let restored: Schedule =
            from_item(to_item(&schedule).expect("a storable item")).expect("a readable item");
        assert_eq!(restored, schedule);
    }

    #[test]
    fn a_rollup_keeps_its_maps() {
        let mut rollup = MonthlyRollup::empty(Month::parse("2026-08").expect("a valid month"));
        rollup
            .spending_by_category
            .insert("category-groceries".to_owned(), 4_325);
        rollup.daily_spending.insert(13, 4_325);

        let restored: MonthlyRollup =
            from_item(to_item(&rollup).expect("a storable item")).expect("a readable item");
        assert_eq!(restored, rollup);
    }

    #[test]
    fn an_account_rejects_a_fractional_amount() {
        let account = Account {
            id: "account-1".to_owned(),
            name: "Everyday Current".to_owned(),
            account_type: AccountType::Current,
            currency: Currency::Gbp,
            balance_minor: 100,
            colour: "#809bce".to_owned(),
            deactivated_at: None,
            version: 1,
        };
        assert!(to_item(&account).is_ok());
        assert!(to_attribute(serde_json::json!(1.5)).is_err());
    }
}
