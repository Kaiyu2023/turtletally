//! The persistent adapters: DynamoDB for the ledger and its derived items, S3
//! for the objects a record references. ADR 0003 fixes the model; this crate
//! only implements it.

pub mod attribute;
pub mod dynamo;
pub mod keys;
pub mod objects;

pub use dynamo::{DynamoStore, StoreTables};
pub use objects::S3ObjectStore;
