# A daily run is enough because a run generates every occurrence that is due,
# and generating one twice is prevented by the occurrence itself rather than by
# the trigger firing exactly once.

data "aws_iam_policy_document" "assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${var.name_prefix}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

data "aws_iam_policy_document" "invoke" {
  statement {
    sid       = "InvokeTheWorker"
    effect    = "Allow"
    actions   = ["lambda:InvokeFunction"]
    resources = [var.function_arn]
  }
}

resource "aws_iam_role_policy" "scheduler" {
  name   = "${var.name_prefix}-scheduler"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.invoke.json
}

resource "aws_scheduler_schedule" "due_schedules" {
  name                         = "${var.name_prefix}-due-schedules"
  schedule_expression          = var.schedule_expression
  schedule_expression_timezone = var.timezone
  state                        = "ENABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = var.function_arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({})

    # A failed run is repeated by the next day's run, so the retry window is
    # short and nothing is buried in a queue.
    retry_policy {
      maximum_retry_attempts       = 2
      maximum_event_age_in_seconds = 3600
    }
  }
}
