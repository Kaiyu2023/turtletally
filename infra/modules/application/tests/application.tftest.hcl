mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

variables {
  name_prefix   = "turtle-tally-test"
  function_name = "app-api"
  artifact_path = "tests/fixtures/artifact.txt"

  handler_environment = {
    FINANCE_TABLE = "turtle-tally-test-finance"
  }

  policy_statements = [
    {
      sid       = "ReadTheLedger"
      actions   = ["dynamodb:Query"]
      resources = ["arn:aws:dynamodb:eu-west-2:000000000000:table/turtle-tally-test-finance"]
    },
  ]
}

run "the_function_is_the_shape_adr_0001_chose" {
  command = plan

  assert {
    condition     = contains(aws_lambda_function.function.architectures, "arm64")
    error_message = "ADR 0001 builds native ARM64 functions."
  }

  assert {
    condition     = aws_lambda_function.function.runtime == "provided.al2023"
    error_message = "A native binary runs on the managed runtime, not a language one."
  }

  assert {
    condition     = aws_lambda_function.function.reserved_concurrent_executions > 0
    error_message = "A concurrency ceiling is also a cost ceiling."
  }
}

run "a_function_keeps_bounded_logs_and_writes_only_its_own" {
  command = plan

  assert {
    condition     = aws_cloudwatch_log_group.function.retention_in_days > 0
    error_message = "Logs are kept for a bounded time, never forever."
  }

  assert {
    condition = length([
      for statement in data.aws_iam_policy_document.function.statement :
      statement if contains(statement.actions, "logs:CreateLogGroup")
    ]) == 0
    error_message = "The function writes into the group Terraform owns rather than creating its own."
  }
}

run "no_function_url_exists_unless_one_was_asked_for" {
  command = plan

  assert {
    condition     = length(aws_lambda_function_url.function) == 0
    error_message = "A function reached through a gateway needs no public URL."
  }
}
