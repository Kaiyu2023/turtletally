mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

variables {
  name_prefix    = "turtle-tally-test"
  upload_origins = ["https://app.example.invalid"]
}

run "the_ledger_is_recoverable_and_hard_to_delete" {
  command = plan

  assert {
    condition     = one(aws_dynamodb_table.finance.point_in_time_recovery[*].enabled)
    error_message = "The ledger must be restorable to a point in time."
  }

  assert {
    condition = alltrue([
      aws_dynamodb_table.finance.deletion_protection_enabled,
      aws_dynamodb_table.audit.deletion_protection_enabled,
      aws_dynamodb_table.sessions.deletion_protection_enabled,
    ])
    error_message = "Every table refuses deletion at the service level."
  }

  assert {
    condition     = one(aws_dynamodb_table.finance.ttl[*].attribute_name) == "ttl"
    error_message = "Upload grants and assistant proposals expire on their own."
  }

  assert {
    condition     = one(aws_dynamodb_table.finance.global_secondary_index[*].name) == "TransactionById"
    error_message = "ADR 0010 resolves a transaction by identifier through one sparse index."
  }
}

run "the_data_key_rotates_and_survives_a_teardown" {
  command = plan

  assert {
    condition     = aws_kms_key.data.enable_key_rotation
    error_message = "The key that protects a refresh token rotates."
  }

  assert {
    condition     = aws_kms_key.data.deletion_window_in_days >= 30
    error_message = "A key deleted quickly takes every session with it."
  }
}

run "receipts_are_private_versioned_and_encrypted" {
  command = plan

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.receipts.block_public_acls,
      aws_s3_bucket_public_access_block.receipts.block_public_policy,
      aws_s3_bucket_public_access_block.receipts.ignore_public_acls,
      aws_s3_bucket_public_access_block.receipts.restrict_public_buckets,
    ])
    error_message = "A receipt must never be reachable publicly."
  }

  assert {
    condition     = one(aws_s3_bucket_versioning.receipts.versioning_configuration[*].status) == "Enabled"
    error_message = "A replaced receipt must still be recoverable."
  }

  assert {
    condition = alltrue([
      for rule in aws_s3_bucket_server_side_encryption_configuration.receipts.rule :
      one(rule.apply_server_side_encryption_by_default).sse_algorithm == "aws:kms"
    ])
    error_message = "Receipts are encrypted under the key this stack owns."
  }

  assert {
    condition = alltrue([
      for rule in aws_s3_bucket_cors_configuration.receipts.cors_rule :
      length(rule.allowed_origins) == 1
      && contains(rule.allowed_origins, "https://app.example.invalid")
      && length(rule.allowed_methods) == 1
      && contains(rule.allowed_methods, "PUT")
    ])
    error_message = "Only the application's own origin may write a receipt, and only by writing one."
  }
}
