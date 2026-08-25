mock_provider "aws" {}

variables {
  region            = "eu-west-2"
  state_bucket_name = "turtle-tally-example-state"
}

run "state_storage_is_private_and_recoverable" {
  command = plan

  assert {
    condition     = aws_s3_bucket_versioning.state.versioning_configuration[0].status == "Enabled"
    error_message = "State history is what a restoration drill restores from."
  }

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.state.block_public_acls,
      aws_s3_bucket_public_access_block.state.block_public_policy,
      aws_s3_bucket_public_access_block.state.ignore_public_acls,
      aws_s3_bucket_public_access_block.state.restrict_public_buckets,
    ])
    error_message = "State must never be reachable publicly."
  }

  assert {
    condition = alltrue([
      for rule in aws_s3_bucket_server_side_encryption_configuration.state.rule :
      one(rule.apply_server_side_encryption_by_default).sse_algorithm == "AES256"
    ])
    error_message = "State is encrypted at rest."
  }
}

run "a_lowercase_bucket_name_is_required" {
  command = plan

  variables {
    state_bucket_name = "Turtle-Tally-State"
  }

  expect_failures = [var.state_bucket_name]
}
