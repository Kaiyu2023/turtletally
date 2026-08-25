use std::env::var;

use lambda_runtime::{Error, LambdaEvent, service_fn};
use serde::{Deserialize, Serialize};
use turtle_tally_application::ports::{Actor, Owner, SystemClock, UuidIdSource};
use turtle_tally_application::service::FinanceService;
use turtle_tally_domain::error::{DomainError, DomainResult};
use turtle_tally_domain::time::zoned_date;
use turtle_tally_storage::{DynamoStore, S3ObjectStore, StoreTables};

/// The trigger carries nothing this worker needs: what is due is a property of
/// the ledger, and the date it is due against is the owner's own wall clock.
#[derive(Deserialize)]
struct Trigger {}

/// The result is a count, never the entries themselves. A log line carries the
/// shape of what happened and no finance payload.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunSummary {
    as_of: String,
    generated: usize,
}

struct Worker {
    finance: FinanceService<DynamoStore, S3ObjectStore>,
    owner: Owner,
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    let worker = Worker::build()
        .await
        .map_err(|error| Error::from(error.message))?;

    lambda_runtime::run(service_fn(|event: LambdaEvent<Trigger>| {
        let worker = &worker;
        async move { worker.run(event).await }
    }))
    .await
}

impl Worker {
    async fn build() -> DomainResult<Self> {
        let aws = aws_config::load_defaults(aws_config::BehaviorVersion::latest()).await;

        Ok(Self {
            finance: FinanceService::new(
                DynamoStore::new(
                    aws_sdk_dynamodb::Client::new(&aws),
                    StoreTables {
                        finance: required("FINANCE_TABLE")?,
                        audit: required("AUDIT_TABLE")?,
                    },
                ),
                S3ObjectStore::new(aws_sdk_s3::Client::new(&aws), required("RECEIPT_BUCKET")?),
                Box::new(SystemClock),
                Box::new(UuidIdSource),
            ),
            // One owner (the roadmap keeps multi-owner out of scope), and no
            // way to discover them without a scan, which ADR 0003 forbids.
            owner: Owner::new(required("OWNER_SUBJECT")?),
        })
    }

    /// A run is idempotent by occurrence: a schedule and the date it is due for
    /// identify the row, so a retried invocation generates nothing twice.
    async fn run(&self, _event: LambdaEvent<Trigger>) -> Result<RunSummary, Error> {
        let as_of = zoned_date(&chrono::Utc::now().to_rfc3339())
            .map_err(|error| Error::from(error.message))?;
        let created = self
            .finance
            .run_due_schedules(&self.owner, Actor::Scheduler, &as_of)
            .await
            .map_err(|error| Error::from(error.message))?;

        Ok(RunSummary {
            as_of: as_of.to_string(),
            generated: created.len(),
        })
    }
}

fn required(name: &str) -> DomainResult<String> {
    var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| DomainError::validation(format!("{name} is not configured.")))
}
