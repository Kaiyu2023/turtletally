# ADR 0001: native ARM64 ZIP functions on the managed runtime, one role each,
# and nothing shared between them but the crates they were built from.

resource "aws_cloudwatch_log_group" "function" {
  name              = "/aws/lambda/${var.name_prefix}-${var.function_name}"
  retention_in_days = var.log_retention_days
}

data "aws_iam_policy_document" "assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "function" {
  name               = "${var.name_prefix}-${var.function_name}"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

data "aws_iam_policy_document" "function" {
  statement {
    sid       = "WriteOwnLogs"
    effect    = "Allow"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.function.arn}:*"]
  }

  dynamic "statement" {
    for_each = var.policy_statements

    content {
      sid       = statement.value.sid
      effect    = "Allow"
      actions   = statement.value.actions
      resources = statement.value.resources
    }
  }
}

resource "aws_iam_role_policy" "function" {
  name   = "${var.name_prefix}-${var.function_name}"
  role   = aws_iam_role.function.id
  policy = data.aws_iam_policy_document.function.json
}

resource "aws_lambda_function" "function" {
  function_name = "${var.name_prefix}-${var.function_name}"
  role          = aws_iam_role.function.arn

  filename         = var.artifact_path
  source_code_hash = filebase64sha256(var.artifact_path)

  runtime       = "provided.al2023"
  handler       = "bootstrap"
  architectures = ["arm64"]

  memory_size = var.memory_mb
  timeout     = var.timeout_seconds

  reserved_concurrent_executions = var.reserved_concurrency

  environment {
    variables = var.handler_environment
  }

  logging_config {
    log_format = "JSON"
    log_group  = aws_cloudwatch_log_group.function.name
  }

  depends_on = [aws_iam_role_policy.function]
}

# Reached only by the distribution in front of it, which signs the request.
resource "aws_lambda_function_url" "function" {
  count = var.create_function_url ? 1 : 0

  function_name      = aws_lambda_function.function.function_name
  authorization_type = "AWS_IAM"
}
