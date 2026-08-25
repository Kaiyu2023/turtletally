mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

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

run "alerts_carry_their_own_key_rather_than_the_ledgers" {
  command = plan

  assert {
    condition     = aws_kms_key.alerts.enable_key_rotation
    error_message = "Every key this stack owns rotates."
  }

  assert {
    condition = alltrue([
      for statement in data.aws_iam_policy_document.alert_key.statement :
      alltrue([
        for principal in statement.principals :
        principal.type != "Service" || alltrue([
          for identifier in principal.identifiers :
          contains(["cloudwatch.amazonaws.com", "budgets.amazonaws.com"], identifier)
        ])
      ])
    ])
    error_message = "Only the services that publish an alert may use the alert key."
  }
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
