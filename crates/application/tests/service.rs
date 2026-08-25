use chrono::{TimeZone, Utc};
use turtle_tally_application::memory::{
    FixedClock, InMemoryObjects, InMemoryStore, Seed, SequentialIds,
};
use turtle_tally_application::ports::{Actor, Owner};
use turtle_tally_application::service::FinanceService;
use turtle_tally_domain::calendar::{LocalDate, Month};
use turtle_tally_domain::error::ErrorCode;
use turtle_tally_domain::rollup::rebuild_month;
use turtle_tally_domain::types::{
    Account, AccountType, Category, CategoryGroup, CreateScheduleInput, CreateTransactionInput,
    Currency, EndOfMonthPolicy, RequestUploadInput, ScheduleRecurrence, SetBudgetInput,
    TransactionFilters, TransactionKind, TransactionSort, TransactionStatus, UpdateAccountInput,
    UpdateTransactionInput, UploadMediaType,
};

type Service = FinanceService<InMemoryStore, InMemoryObjects>;

fn owner() -> Owner {
    Owner::new("owner-under-test")
}

fn date(value: &str) -> LocalDate {
    LocalDate::parse(value).expect("a valid date")
}

fn month(value: &str) -> Month {
    Month::parse(value).expect("a valid month")
}

fn account(id: &str, name: &str, balance_minor: i64) -> Account {
    Account {
        id: id.to_owned(),
        name: name.to_owned(),
        account_type: AccountType::Current,
        currency: Currency::Gbp,
        balance_minor,
        colour: "#809bce".to_owned(),
        deactivated_at: None,
        version: 1,
    }
}

fn category(id: &str, name: &str, group: CategoryGroup) -> Category {
    Category {
        id: id.to_owned(),
        name: name.to_owned(),
        group,
        colour: "#76b7b2".to_owned(),
        deactivated_at: None,
        version: 1,
    }
}

fn service() -> Service {
    let store = InMemoryStore::new();
    store.seed(
        &owner(),
        Seed {
            accounts: vec![
                account("account-current", "Everyday Current", 100_000),
                account("account-savings", "Rainy Day", 50_000),
            ],
            categories: vec![
                category("category-groceries", "Groceries", CategoryGroup::Shopping),
                category("category-salary", "Salary", CategoryGroup::Income),
            ],
            ..Seed::default()
        },
    );

    FinanceService::new(
        store,
        InMemoryObjects::new(),
        Box::new(FixedClock(
            Utc.with_ymd_and_hms(2026, 8, 17, 12, 0, 0)
                .single()
                .expect("a real instant"),
        )),
        Box::new(SequentialIds::default()),
    )
}

fn spending(account_id: &str, amount_minor: i64, local_date: &str) -> CreateTransactionInput {
    CreateTransactionInput {
        account_id: account_id.to_owned(),
        category_id: Some("category-groceries".to_owned()),
        description: "Weekly groceries".to_owned(),
        amount_minor,
        kind: TransactionKind::Spending,
        local_date: date(local_date),
        occurred_at: None,
        origin: None,
        receipt_id: None,
    }
}

#[tokio::test]
async fn a_created_transaction_moves_the_balance_and_the_rollup() {
    let service = service();
    let owner = owner();

    let created = service
        .create_transaction(
            &owner,
            Actor::Browser,
            &spending("account-current", -4_325, "2026-08-13"),
        )
        .await
        .expect("a usable transaction");

    assert_eq!(created.version, 1);
    assert_eq!(created.account_name, "Everyday Current");
    assert_eq!(created.category_name.as_deref(), Some("Groceries"));

    let accounts = service
        .list_accounts(&owner, false)
        .await
        .expect("the accounts");
    assert_eq!(
        accounts
            .iter()
            .find(|entry| entry.id == "account-current")
            .expect("the account")
            .balance_minor,
        95_675
    );

    let rollup = service
        .store()
        .stored_rollup(&owner, &month("2026-08"))
        .expect("a maintained rollup");
    assert_eq!(rollup.spending_minor, 4_325);
    assert_eq!(rollup.transaction_count, 1);
    assert_eq!(service.store().audit_events(&owner).len(), 1);
}

#[tokio::test]
async fn an_edit_that_changes_account_moves_both_balances() {
    let service = service();
    let owner = owner();
    let created = service
        .create_transaction(
            &owner,
            Actor::Browser,
            &spending("account-current", -4_325, "2026-08-13"),
        )
        .await
        .expect("a usable transaction");

    let updated = service
        .update_transaction(
            &owner,
            Actor::Browser,
            &created.id,
            &UpdateTransactionInput {
                expected_version: created.version,
                account_id: Some("account-savings".to_owned()),
                amount_minor: Some(-5_000),
                ..blank_update(created.version)
            },
        )
        .await
        .expect("an accepted edit");

    assert_eq!(updated.version, 2);
    let accounts = service
        .list_accounts(&owner, false)
        .await
        .expect("the accounts");
    let balance = |id: &str| {
        accounts
            .iter()
            .find(|entry| entry.id == id)
            .expect("the account")
            .balance_minor
    };
    assert_eq!(balance("account-current"), 100_000);
    assert_eq!(balance("account-savings"), 45_000);
}

#[tokio::test]
async fn a_stale_version_is_refused() {
    let service = service();
    let owner = owner();
    let created = service
        .create_transaction(
            &owner,
            Actor::Browser,
            &spending("account-current", -4_325, "2026-08-13"),
        )
        .await
        .expect("a usable transaction");

    let error = service
        .update_transaction(&owner, Actor::Browser, &created.id, &blank_update(99))
        .await
        .expect_err("a stale edit is refused");
    assert_eq!(error.code, ErrorCode::Conflict);
}

#[tokio::test]
async fn voiding_reverses_the_balance_and_keeps_the_record() {
    let service = service();
    let owner = owner();
    let created = service
        .create_transaction(
            &owner,
            Actor::Browser,
            &spending("account-current", -4_325, "2026-08-13"),
        )
        .await
        .expect("a usable transaction");

    let voided = service
        .void_transaction(
            &owner,
            Actor::Browser,
            &created.id,
            created.version,
            Some("Duplicate"),
        )
        .await
        .expect("a voided transaction");

    assert!(voided.voided_at.is_some());
    assert_eq!(voided.void_reason.as_deref(), Some("Duplicate"));

    let accounts = service
        .list_accounts(&owner, false)
        .await
        .expect("the accounts");
    assert_eq!(
        accounts
            .iter()
            .find(|entry| entry.id == "account-current")
            .expect("the account")
            .balance_minor,
        100_000
    );
    assert_eq!(
        service
            .store()
            .stored_rollup(&owner, &month("2026-08"))
            .expect("a rollup")
            .transaction_count,
        0
    );

    let voided_page = service
        .list_transactions(
            &owner,
            &TransactionFilters {
                month: Some(month("2026-08")),
                status: Some(TransactionStatus::Voided),
                ..TransactionFilters::default()
            },
        )
        .await
        .expect("a readable page");
    assert_eq!(voided_page.items.len(), 1);
}

#[tokio::test]
async fn the_maintained_rollup_always_equals_a_rebuild() {
    let service = service();
    let owner = owner();

    let first = service
        .create_transaction(
            &owner,
            Actor::Browser,
            &spending("account-current", -4_325, "2026-08-13"),
        )
        .await
        .expect("a usable transaction");
    service
        .create_transaction(
            &owner,
            Actor::Browser,
            &spending("account-current", -1_250, "2026-08-14"),
        )
        .await
        .expect("a usable transaction");
    let moved = service
        .update_transaction(
            &owner,
            Actor::Browser,
            &first.id,
            &UpdateTransactionInput {
                local_date: Some(date("2026-07-30")),
                ..blank_update(first.version)
            },
        )
        .await
        .expect("an accepted edit");
    service
        .void_transaction(&owner, Actor::Browser, &moved.id, moved.version, None)
        .await
        .expect("a voided transaction");

    for value in ["2026-07", "2026-08"] {
        let target = month(value);
        let ledger = service
            .list_transactions(
                &owner,
                &TransactionFilters {
                    month: Some(target.clone()),
                    status: Some(TransactionStatus::All),
                    limit: Some(100),
                    ..TransactionFilters::default()
                },
            )
            .await
            .expect("a readable page");
        let maintained = service
            .store()
            .stored_rollup(&owner, &target)
            .unwrap_or_else(|| turtle_tally_domain::rollup::MonthlyRollup::empty(target.clone()));
        assert_eq!(
            maintained,
            rebuild_month(&target, &ledger.items),
            "rollup for {target}"
        );
    }
}

#[tokio::test]
async fn the_overview_reads_the_rollup_rather_than_the_ledger() {
    let service = service();
    let owner = owner();
    service
        .create_transaction(
            &owner,
            Actor::Browser,
            &spending("account-current", -4_325, "2026-08-13"),
        )
        .await
        .expect("a usable transaction");
    service
        .create_transaction(
            &owner,
            Actor::Browser,
            &CreateTransactionInput {
                category_id: Some("category-salary".to_owned()),
                description: "Salary".to_owned(),
                amount_minor: 250_000,
                kind: TransactionKind::Income,
                ..spending("account-current", 250_000, "2026-08-01")
            },
        )
        .await
        .expect("a usable transaction");

    let summary = service
        .get_dashboard(&owner, &month("2026-08"))
        .await
        .expect("an overview");
    assert_eq!(summary.spending_minor, 4_325);
    assert_eq!(summary.income_minor, 250_000);
    assert_eq!(summary.net_cash_flow_minor, 245_675);
    assert_eq!(summary.transaction_count, 2);
    assert_eq!(summary.recent_transactions.len(), 2);
    assert_eq!(summary.daily_spending.len(), 17);
}

#[tokio::test]
async fn a_page_resumes_after_the_key_it_returned() {
    let service = service();
    let owner = owner();
    for day in 1..=5 {
        service
            .create_transaction(
                &owner,
                Actor::Browser,
                &spending("account-current", -1_000 * day, &format!("2026-08-0{day}")),
            )
            .await
            .expect("a usable transaction");
    }

    let filters = TransactionFilters {
        month: Some(month("2026-08")),
        limit: Some(2),
        sort: Some(TransactionSort::Oldest),
        ..TransactionFilters::default()
    };
    let first = service
        .list_transactions(&owner, &filters)
        .await
        .expect("a readable page");
    assert_eq!(first.items.len(), 2);

    let second = service
        .list_transactions(
            &owner,
            &TransactionFilters {
                cursor: first.next_cursor.clone(),
                ..filters.clone()
            },
        )
        .await
        .expect("a readable page");
    assert!(
        second
            .items
            .iter()
            .all(|item| !first.items.iter().any(|seen| seen.id == item.id))
    );

    let third = service
        .list_transactions(
            &owner,
            &TransactionFilters {
                cursor: second.next_cursor.clone(),
                ..filters
            },
        )
        .await
        .expect("a readable page");
    assert_eq!(third.items.len(), 1);
    assert!(third.next_cursor.is_none());
}

#[tokio::test]
async fn a_query_that_names_no_window_is_refused() {
    let service = service();
    let error = service
        .list_transactions(&owner(), &TransactionFilters::default())
        .await
        .expect_err("an unbounded read is refused");
    assert_eq!(error.code, ErrorCode::Validation);
}

#[tokio::test]
async fn an_inactive_account_cannot_take_new_entries() {
    let service = service();
    let owner = owner();
    service
        .deactivate_account(&owner, Actor::Browser, "account-savings", 1)
        .await
        .expect("a deactivated account");

    let error = service
        .create_transaction(
            &owner,
            Actor::Browser,
            &spending("account-savings", -1_000, "2026-08-13"),
        )
        .await
        .expect_err("an inactive account is refused");
    assert_eq!(error.code, ErrorCode::Conflict);
    assert_eq!(
        service
            .list_accounts(&owner, false)
            .await
            .expect("the accounts")
            .len(),
        1
    );
    assert_eq!(
        service
            .list_accounts(&owner, true)
            .await
            .expect("the accounts")
            .len(),
        2
    );
}

#[tokio::test]
async fn an_active_name_cannot_be_taken_twice() {
    let service = service();
    let owner = owner();
    let error = service
        .update_account(
            &owner,
            Actor::Browser,
            "account-savings",
            &UpdateAccountInput {
                expected_version: 1,
                name: Some("everyday current".to_owned()),
                account_type: None,
                colour: None,
            },
        )
        .await
        .expect_err("a duplicate name is refused");
    assert_eq!(error.code, ErrorCode::Conflict);
}

#[tokio::test]
async fn a_budget_belongs_to_a_spending_category_and_tracks_the_rollup() {
    let service = service();
    let owner = owner();
    service
        .create_transaction(
            &owner,
            Actor::Browser,
            &spending("account-current", -4_325, "2026-08-13"),
        )
        .await
        .expect("a usable transaction");

    let budget = service
        .set_budget(
            &owner,
            Actor::Browser,
            &SetBudgetInput {
                month: month("2026-08"),
                category_id: "category-groceries".to_owned(),
                limit_minor: 20_000,
                expected_version: None,
            },
        )
        .await
        .expect("a stored budget");
    assert_eq!(budget.version, 1);

    let progress = service
        .list_budgets(&owner, &month("2026-08"))
        .await
        .expect("the budget list");
    let groceries = progress.first().expect("a budget row");
    assert_eq!(groceries.spent_minor, 4_325);
    assert_eq!(groceries.remaining_minor, 15_675);
    assert_eq!(groceries.percent_used, 22);

    let income_budget = service
        .set_budget(
            &owner,
            Actor::Browser,
            &SetBudgetInput {
                month: month("2026-08"),
                category_id: "category-salary".to_owned(),
                limit_minor: 100,
                expected_version: None,
            },
        )
        .await
        .expect_err("an income category has no budget");
    assert_eq!(income_budget.code, ErrorCode::Validation);
}

#[tokio::test]
async fn a_due_schedule_generates_each_occurrence_once() {
    let service = service();
    let owner = owner();
    service
        .create_schedule(
            &owner,
            Actor::Browser,
            &CreateScheduleInput {
                name: "Rent".to_owned(),
                account_id: "account-current".to_owned(),
                category_id: Some("category-groceries".to_owned()),
                description: "Monthly rent".to_owned(),
                amount_minor: -118_000,
                kind: TransactionKind::Spending,
                recurrence: ScheduleRecurrence::Monthly {
                    day: 1,
                    end_of_month_policy: EndOfMonthPolicy::Clamp,
                },
                next_due_date: date("2026-07-01"),
            },
        )
        .await
        .expect("a stored schedule");

    let first = service
        .run_due_schedules(&owner, Actor::Scheduler, &date("2026-08-17"))
        .await
        .expect("a run");
    assert_eq!(first.len(), 2);

    let second = service
        .run_due_schedules(&owner, Actor::Scheduler, &date("2026-08-17"))
        .await
        .expect("a run");
    assert!(second.is_empty());

    let schedule = service
        .list_schedules(&owner, false)
        .await
        .expect("the schedules")
        .remove(0);
    assert_eq!(schedule.next_due_date, Some(date("2026-09-01")));
    assert_eq!(schedule.last_generated_date, Some(date("2026-08-01")));
    assert_eq!(
        service
            .store()
            .stored_rollup(&owner, &month("2026-08"))
            .expect("a rollup")
            .spending_minor,
        118_000
    );
}

#[tokio::test]
async fn a_receipt_is_accepted_only_when_the_stored_object_matches() {
    let service = service();
    let owner = owner();
    let grant = service
        .request_receipt_upload(
            &owner,
            &RequestUploadInput {
                file_name: "receipt.pdf".to_owned(),
                media_type: UploadMediaType::ApplicationPdf,
                size_bytes: 12_000,
            },
        )
        .await
        .expect("an upload grant");

    let unwritten = service
        .complete_receipt_upload(&owner, Actor::Browser, &grant.upload_id, "deadbeef")
        .await
        .expect_err("an unwritten object is refused");
    assert_eq!(unwritten.code, ErrorCode::NotFound);
}

#[tokio::test]
async fn a_receipt_is_stored_once_the_object_matches_its_reported_checksum() {
    let service = service();
    let owner = owner();

    let grant = service
        .request_receipt_upload(
            &owner,
            &RequestUploadInput {
                file_name: "receipt.pdf".to_owned(),
                media_type: UploadMediaType::ApplicationPdf,
                size_bytes: 12_000,
            },
        )
        .await
        .expect("an upload grant");
    service.objects().store_object(
        &format!("receipts/{}/{}", owner.as_str(), grant.upload_id),
        "a1b2c3d4e5",
    );

    let receipt = service
        .complete_receipt_upload(&owner, Actor::Browser, &grant.upload_id, "a1b2c3d4e5")
        .await
        .expect("a stored receipt");
    assert_eq!(receipt.file_name, "receipt.pdf");
    assert_eq!(receipt.checksum, "a1b2c3d4e5");
    assert!(
        service
            .receipt_download_url(&owner, &receipt.id)
            .await
            .is_ok()
    );

    // The grant is single use, so a replay cannot attach a second record to the
    // same object.
    let replayed = service
        .complete_receipt_upload(&owner, Actor::Browser, &grant.upload_id, "a1b2c3d4e5")
        .await
        .expect_err("a redeemed grant cannot be redeemed twice");
    assert_eq!(replayed.code, ErrorCode::NotFound);
}

#[tokio::test]
async fn a_receipt_whose_object_differs_from_its_checksum_is_refused() {
    let service = service();
    let owner = owner();

    let grant = service
        .request_receipt_upload(
            &owner,
            &RequestUploadInput {
                file_name: "receipt.pdf".to_owned(),
                media_type: UploadMediaType::ApplicationPdf,
                size_bytes: 12_000,
            },
        )
        .await
        .expect("an upload grant");
    service.objects().store_object(
        &format!("receipts/{}/{}", owner.as_str(), grant.upload_id),
        "a1b2c3d4e5",
    );

    let wrong = service
        .complete_receipt_upload(&owner, Actor::Browser, &grant.upload_id, "ffffffff")
        .await
        .expect_err("a checksum that does not match the stored object is refused");
    assert_eq!(wrong.code, ErrorCode::Validation);
}

#[tokio::test]
async fn preferences_start_at_the_default_and_advance_by_version() {
    let service = service();
    let owner = owner();
    let initial = service
        .get_user_preferences(&owner)
        .await
        .expect("the defaults");
    assert_eq!(initial.version, 0);

    let updated = service
        .update_user_preferences(
            &owner,
            Actor::Browser,
            &turtle_tally_domain::types::UpdateUserPreferencesInput {
                locale: turtle_tally_domain::types::AppLocale::ZhCn,
                expected_version: 0,
            },
        )
        .await
        .expect("an accepted change");
    assert_eq!(updated.version, 1);

    let stale = service
        .update_user_preferences(
            &owner,
            Actor::Browser,
            &turtle_tally_domain::types::UpdateUserPreferencesInput {
                locale: turtle_tally_domain::types::AppLocale::EnGb,
                expected_version: 0,
            },
        )
        .await
        .expect_err("a stale change is refused");
    assert_eq!(stale.code, ErrorCode::Conflict);
}

fn blank_update(expected_version: u32) -> UpdateTransactionInput {
    UpdateTransactionInput {
        expected_version,
        account_id: None,
        category_id: None,
        description: None,
        amount_minor: None,
        kind: None,
        local_date: None,
        occurred_at: None,
        receipt_id: None,
    }
}
