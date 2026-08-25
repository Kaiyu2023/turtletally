# The browser application of ADR 0009 and the MCP ingress of ADR 0011, in one
# state boundary per stage. Modules are implementation units; this root is what
# owns the state.

locals {
  name_prefix    = "turtle-tally-${var.stage}"
  app_origin     = "https://${var.app_domain}"
  mcp_resource   = "https://${var.mcp_domain}"
  browser_scopes = ["openid", "profile"]
}

module "data" {
  source = "../modules/data"

  name_prefix        = local.name_prefix
  upload_origins     = [local.app_origin]
  log_retention_days = var.log_retention_days
}

module "identity" {
  source = "../modules/identity"

  name_prefix             = local.name_prefix
  cognito_domain_prefix   = var.cognito_domain_prefix
  relying_party_id        = var.passkey_relying_party_id
  browser_callback_urls   = ["${local.app_origin}/auth/callback"]
  browser_logout_urls     = [local.app_origin]
  assistant_clients       = var.assistant_clients
  mcp_resource_identifier = local.mcp_resource
}

module "app_api" {
  source = "../modules/application"

  name_prefix         = local.name_prefix
  function_name       = "app-api"
  artifact_path       = var.app_api_artifact
  log_retention_days  = var.log_retention_days
  create_function_url = true

  handler_environment = {
    FINANCE_TABLE     = module.data.finance_table
    AUDIT_TABLE       = module.data.audit_table
    SESSION_TABLE     = module.data.sessions_table
    RECEIPT_BUCKET    = module.data.receipt_bucket
    SESSION_KEY_ID    = module.data.data_key_id
    APP_ORIGIN        = local.app_origin
    COGNITO_ISSUER    = module.identity.issuer
    COGNITO_DOMAIN    = module.identity.hosted_domain
    BROWSER_CLIENT_ID = module.identity.browser_client_id
  }

  policy_statements = [
    {
      sid       = "ReadAndWriteTheLedger"
      actions   = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:TransactWriteItems"]
      resources = [module.data.finance_table_arn, module.data.finance_index_arn]
    },
    {
      sid       = "RecordTheTrail"
      actions   = ["dynamodb:PutItem", "dynamodb:TransactWriteItems"]
      resources = [module.data.audit_table_arn]
    },
    {
      sid       = "KeepSessions"
      actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"]
      resources = [module.data.sessions_table_arn]
    },
    {
      sid       = "GrantReceiptAccess"
      actions   = ["s3:GetObject", "s3:PutObject"]
      resources = ["${module.data.receipt_bucket_arn}/receipts/*"]
    },
    {
      sid       = "UseTheDataKey"
      actions   = ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"]
      resources = [module.data.data_key_arn]
    },
  ]
}

module "mcp_api" {
  source = "../modules/application"

  name_prefix        = local.name_prefix
  function_name      = "mcp-api"
  artifact_path      = var.mcp_api_artifact
  log_retention_days = var.log_retention_days

  handler_environment = {
    FINANCE_TABLE        = module.data.finance_table
    AUDIT_TABLE          = module.data.audit_table
    RECEIPT_BUCKET       = module.data.receipt_bucket
    RESOURCE_URL         = local.mcp_resource
    AUTHORIZATION_SERVER = module.identity.issuer
    REQUIRED_SCOPE       = module.identity.mcp_scope
    ACCEPTED_AUDIENCES   = join(",", values(module.identity.assistant_client_ids))
  }

  # The assistant reads the ledger and writes only what a commit applies. It
  # never reaches sessions or the session key.
  policy_statements = [
    {
      sid       = "ReadAndWriteTheLedger"
      actions   = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:TransactWriteItems"]
      resources = [module.data.finance_table_arn, module.data.finance_index_arn]
    },
    {
      sid       = "RecordTheTrail"
      actions   = ["dynamodb:PutItem", "dynamodb:TransactWriteItems"]
      resources = [module.data.audit_table_arn]
    },
    {
      sid       = "UseTheDataKey"
      actions   = ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"]
      resources = [module.data.data_key_arn]
    },
  ]
}

module "scheduler" {
  source = "../modules/application"

  name_prefix        = local.name_prefix
  function_name      = "scheduler-worker"
  artifact_path      = var.scheduler_artifact
  log_retention_days = var.log_retention_days
  timeout_seconds    = 60

  handler_environment = {
    FINANCE_TABLE  = module.data.finance_table
    AUDIT_TABLE    = module.data.audit_table
    RECEIPT_BUCKET = module.data.receipt_bucket
    OWNER_SUBJECT  = var.owner_subject
  }

  # The worker writes ledger rows and advances schedules. It reaches no session,
  # no key, and no object.
  policy_statements = [
    {
      sid       = "ReadAndWriteTheLedger"
      actions   = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:TransactWriteItems"]
      resources = [module.data.finance_table_arn, module.data.finance_index_arn]
    },
    {
      sid       = "RecordTheTrail"
      actions   = ["dynamodb:PutItem", "dynamodb:TransactWriteItems"]
      resources = [module.data.audit_table_arn]
    },
  ]
}

module "scheduling" {
  source = "../modules/scheduling"

  name_prefix   = local.name_prefix
  function_arn  = module.scheduler.function_arn
  function_name = module.scheduler.function_name
}

module "edge" {
  source = "../modules/edge"

  name_prefix        = local.name_prefix
  domain_name        = var.app_domain
  certificate_arn    = var.app_certificate_arn
  api_origin_domain  = module.app_api.function_url_domain
  log_retention_days = var.log_retention_days
  web_acl_arn        = var.web_acl_arn
}

resource "aws_lambda_permission" "distribution_invokes_app_api" {
  statement_id           = "AllowDistribution"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = module.app_api.function_name
  principal              = "cloudfront.amazonaws.com"
  source_arn             = module.edge.distribution_arn
  function_url_auth_type = "AWS_IAM"
}

module "mcp" {
  source = "../modules/mcp"

  name_prefix        = local.name_prefix
  domain_name        = var.mcp_domain
  certificate_arn    = var.mcp_certificate_arn
  function_name      = module.mcp_api.function_name
  invoke_arn         = module.mcp_api.invoke_arn
  log_retention_days = var.log_retention_days
}

module "observability" {
  source = "../modules/observability"

  name_prefix          = local.name_prefix
  monthly_cost_ceiling = var.monthly_cost_ceiling
  alert_email          = var.alert_email

  watched_functions = {
    app-api          = module.app_api.function_name
    mcp-api          = module.mcp_api.function_name
    scheduler-worker = module.scheduler.function_name
  }

  watched_tables = {
    finance = module.data.finance_table
    audit   = module.data.audit_table
  }
}
