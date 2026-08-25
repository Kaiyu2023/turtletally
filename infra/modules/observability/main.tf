resource "aws_sns_topic" "alerts" {
  name = "${var.name_prefix}-alerts"

  # An alarm carries a resource name and a metric, never a finance value, but
  # the managed key costs nothing and keeps the topic off the list of things
  # that are readable by default.
  kms_master_key_id = "alias/aws/sns"
}

resource "aws_sns_topic_subscription" "alerts" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# ADR 0009: the ceiling is recorded before the first billable resource, and the
# thresholds below it are what give the owner time to act rather than a bill to
# read afterwards.
resource "aws_budgets_budget" "monthly" {
  name         = "${var.name_prefix}-monthly"
  budget_type  = "COST"
  limit_amount = format("%.2f", var.monthly_cost_ceiling)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "notification" {
    for_each = toset([50, 80, 100])

    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_sns_topic_arns  = [aws_sns_topic.alerts.arn]
      subscriber_email_addresses = []
    }
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_sns_topic_arns  = [aws_sns_topic.alerts.arn]
    subscriber_email_addresses = []
  }
}

resource "aws_cloudwatch_metric_alarm" "function_errors" {
  for_each = var.watched_functions

  alarm_name          = "${var.name_prefix}-${each.key}-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 0
  period              = 300
  statistic           = "Sum"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  treat_missing_data  = "notBreaching"
  alarm_description   = "A request this function could not serve."
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    FunctionName = each.value
  }
}

resource "aws_cloudwatch_metric_alarm" "function_throttles" {
  for_each = var.watched_functions

  alarm_name          = "${var.name_prefix}-${each.key}-throttles"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 0
  period              = 300
  statistic           = "Sum"
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  treat_missing_data  = "notBreaching"
  alarm_description   = "The concurrency ceiling turned a request away."
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    FunctionName = each.value
  }
}

# Provisioned capacity is the read budget of ADR 0007. Exceeding it is a design
# signal, not a transient error.
resource "aws_cloudwatch_metric_alarm" "table_throttles" {
  for_each = var.watched_tables

  alarm_name          = "${var.name_prefix}-${each.key}-table-throttles"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 0
  period              = 300
  statistic           = "Sum"
  namespace           = "AWS/DynamoDB"
  metric_name         = "ThrottledRequests"
  treat_missing_data  = "notBreaching"
  alarm_description   = "A read or write exceeded the reserve this design budgets for."
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    TableName = each.value
  }
}
