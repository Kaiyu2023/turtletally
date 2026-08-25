mock_provider "aws" {}

variables {
  name_prefix          = "turtle-tally-test"
  monthly_cost_ceiling = 25
  alert_email          = "alerts@example.invalid"
  watched_functions    = { app-api = "turtle-tally-test-app-api" }
  watched_tables       = { finance = "turtle-tally-test-finance" }
}

run "the_ceiling_warns_before_it_is_reached" {
  command = plan

  assert {
    condition = length([
      for notification in aws_budgets_budget.monthly.notification :
      notification if notification.threshold < 100
    ]) > 0
    error_message = "A ceiling that only reports being crossed is a bill, not a control."
  }

  assert {
    condition = length([
      for notification in aws_budgets_budget.monthly.notification :
      notification if notification.notification_type == "FORECASTED"
    ]) == 1
    error_message = "A forecast is what gives the owner time to act."
  }
}

run "a_placeholder_ceiling_is_refused" {
  command = plan

  variables {
    monthly_cost_ceiling = 0
  }

  expect_failures = [var.monthly_cost_ceiling]
}

run "failures_and_throttles_both_raise_an_alarm" {
  command = plan

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.function_errors) == 1
    error_message = "Every watched function has an error alarm."
  }

  assert {
    condition = alltrue([
      for alarm in aws_cloudwatch_metric_alarm.table_throttles : alarm.threshold == 0
    ])
    error_message = "Exceeding the read reserve is a design signal, not a tolerance."
  }
}
