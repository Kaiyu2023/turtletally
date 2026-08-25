use chrono::{Duration, TimeZone, Utc};
use turtle_tally_application::assistant::{
    AssistantOperation, AssistantService, CommittedOperation,
};
use turtle_tally_application::memory::{
    FixedClock, InMemoryObjects, InMemoryStore, Seed, SequentialIds,
};
use turtle_tally_application::ports::{Actor, Owner};
use turtle_tally_application::service::FinanceService;
use turtle_tally_domain::calendar::{LocalDate, Month};
use turtle_tally_domain::error::ErrorCode;
use turtle_tally_domain::types::{
    Account, AccountType, Category, CategoryGroup, CreateTransactionInput, Currency,
    SetBudgetInput, TransactionKind, TransactionOrigin,
};

fn owner() -> Owner {
    Owner::new("owner-under-test")
}

fn seeded() -> InMemoryStore {
    let store = InMemoryStore::new();
    store.seed(
        &owner(),
        Seed {
            accounts: vec![Account {
                id: "account-current".to_owned(),
                name: "Everyday Current".to_owned(),
                account_type: AccountType::Current,
                currency: Currency::Gbp,
                balance_minor: 100_000,
                colour: "#809bce".to_owned(),
                deactivated_at: None,
                version: 1,
            }],
            categories: vec![Category {
                id: "category-groceries".to_owned(),
                name: "Groceries".to_owned(),
                group: CategoryGroup::Shopping,
                colour: "#76b7b2".to_owned(),
                deactivated_at: None,
                version: 1,
            }],
            ..Seed::default()
        },
    );
    store
}

fn assistant_at(hour: u32) -> AssistantService<InMemoryStore, InMemoryObjects, InMemoryStore> {
    let now = Utc
        .with_ymd_and_hms(2026, 8, 17, hour, 0, 0)
        .single()
        .expect("a real instant");
    assistant_with(seeded(), InMemoryStore::new(), now)
}

fn assistant_with(
    ledger: InMemoryStore,
    operations: InMemoryStore,
    now: chrono::DateTime<Utc>,
) -> AssistantService<InMemoryStore, InMemoryObjects, InMemoryStore> {
    AssistantService::new(
        FinanceService::new(
            ledger,
            InMemoryObjects::new(),
            Box::new(FixedClock(now)),
            Box::new(SequentialIds::default()),
        ),
        operations,
        Box::new(FixedClock(now)),
    )
}

fn spending() -> AssistantOperation {
    AssistantOperation::AddTransaction {
        input: CreateTransactionInput {
            account_id: "account-current".to_owned(),
            category_id: Some("category-groceries".to_owned()),
            description: "Weekly groceries".to_owned(),
            amount_minor: -4_325,
            kind: TransactionKind::Spending,
            local_date: LocalDate::parse("2026-08-13").expect("a valid date"),
            occurred_at: None,
            origin: None,
            receipt_id: None,
        },
    }
}

#[tokio::test]
async fn a_proposal_is_applied_only_by_the_commit_that_names_it() {
    let assistant = assistant_at(12);
    let owner = owner();

    let preview = assistant
        .preview(&owner, spending())
        .await
        .expect("a preview");
    assert!(preview.summary.contains("Weekly groceries"));
    assert_eq!(preview.changes.len(), 3);

    let committed = assistant
        .commit(&owner, &preview.operation_id, &preview.expected_hash)
        .await
        .expect("an applied proposal");

    match committed {
        CommittedOperation::Transaction(transaction) => {
            assert_eq!(transaction.origin, TransactionOrigin::Assistant);
            assert_eq!(transaction.amount_minor, -4_325);
        }
        CommittedOperation::Budget(_) => panic!("expected a transaction"),
    }
}

#[tokio::test]
async fn a_replayed_commit_finds_nothing_to_apply() {
    let assistant = assistant_at(12);
    let owner = owner();
    let preview = assistant
        .preview(&owner, spending())
        .await
        .expect("a preview");

    assistant
        .commit(&owner, &preview.operation_id, &preview.expected_hash)
        .await
        .expect("an applied proposal");
    let replay = assistant
        .commit(&owner, &preview.operation_id, &preview.expected_hash)
        .await
        .expect_err("a replay is refused");

    assert_eq!(replay.code, ErrorCode::NotFound);
}

#[tokio::test]
async fn a_commit_that_does_not_match_the_preview_is_refused() {
    let assistant = assistant_at(12);
    let owner = owner();
    let preview = assistant
        .preview(&owner, spending())
        .await
        .expect("a preview");

    let altered = assistant
        .commit(
            &owner,
            &preview.operation_id,
            "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        )
        .await
        .expect_err("an altered hash is refused");
    assert_eq!(altered.code, ErrorCode::Conflict);
}

#[tokio::test]
async fn an_expired_preview_fails_closed() {
    let ledger = seeded();
    let operations = InMemoryStore::new();
    let owner = owner();
    let start = Utc
        .with_ymd_and_hms(2026, 8, 17, 12, 0, 0)
        .single()
        .expect("a real instant");

    let previewer = assistant_with(ledger.clone(), operations.clone(), start);
    let preview = previewer
        .preview(&owner, spending())
        .await
        .expect("a preview");

    // Only the clock moves: the same operation is still stored.
    let committer = assistant_with(ledger, operations, start + Duration::minutes(11));
    let expired = committer
        .commit(&owner, &preview.operation_id, &preview.expected_hash)
        .await
        .expect_err("an expired preview is refused");

    assert_eq!(expired.code, ErrorCode::Conflict);
}

#[tokio::test]
async fn a_proposal_names_what_it_would_change_and_what_is_worth_saying() {
    let assistant = assistant_at(12);
    let owner = owner();

    let uncategorised = AssistantOperation::AddTransaction {
        input: CreateTransactionInput {
            category_id: None,
            ..match spending() {
                AssistantOperation::AddTransaction { input } => input,
                _ => unreachable!(),
            }
        },
    };

    let preview = assistant
        .preview(&owner, uncategorised)
        .await
        .expect("a preview");
    assert_eq!(preview.warnings.len(), 1);
    assert!(preview.warnings[0].contains("budget"));
}

#[tokio::test]
async fn a_budget_proposal_reads_the_month_before_it_changes_it() {
    let assistant = assistant_at(12);
    let owner = owner();

    let preview = assistant
        .preview(
            &owner,
            AssistantOperation::SetBudget {
                input: SetBudgetInput {
                    month: Month::parse("2026-08").expect("a valid month"),
                    category_id: "category-groceries".to_owned(),
                    limit_minor: 20_000,
                    expected_version: None,
                },
            },
        )
        .await
        .expect("a preview");

    assert_eq!(preview.changes.len(), 1);
    assert_eq!(preview.changes[0].to, "20000");

    let committed = assistant
        .commit(&owner, &preview.operation_id, &preview.expected_hash)
        .await
        .expect("an applied proposal");
    match committed {
        CommittedOperation::Budget(budget) => assert_eq!(budget.limit_minor, 20_000),
        CommittedOperation::Transaction(_) => panic!("expected a budget"),
    }
}

#[tokio::test]
async fn voiding_a_stale_entry_is_refused_before_it_is_proposed() {
    let store = seeded();
    let now = Utc
        .with_ymd_and_hms(2026, 8, 17, 12, 0, 0)
        .single()
        .expect("a real instant");
    let finance = FinanceService::new(
        store,
        InMemoryObjects::new(),
        Box::new(FixedClock(now)),
        Box::new(SequentialIds::default()),
    );
    let owner = owner();
    let created = finance
        .create_transaction(
            &owner,
            Actor::Browser,
            &match spending() {
                AssistantOperation::AddTransaction { input } => input,
                _ => unreachable!(),
            },
        )
        .await
        .expect("a usable transaction");

    let assistant = AssistantService::new(finance, InMemoryStore::new(), Box::new(FixedClock(now)));
    let stale = assistant
        .preview(
            &owner,
            AssistantOperation::VoidTransaction {
                transaction_id: created.id.clone(),
                expected_version: created.version + 1,
                reason: None,
            },
        )
        .await
        .expect_err("a stale version is refused");
    assert_eq!(stale.code, ErrorCode::Conflict);

    let preview = assistant
        .preview(
            &owner,
            AssistantOperation::VoidTransaction {
                transaction_id: created.id,
                expected_version: created.version,
                reason: Some("Duplicate".to_owned()),
            },
        )
        .await
        .expect("a preview");
    assert!(preview.summary.starts_with("Void"));
}
