# One owner, no public sign-up, and phishing-resistant factors. Recovery is an
# administrator procedure rather than an email loop, which is what keeps a
# stolen inbox from becoming a stolen ledger.

resource "aws_cognito_user_pool" "owner" {
  name = "${var.name_prefix}-owner"

  mfa_configuration          = "ON"
  deletion_protection        = "ACTIVE"
  auto_verified_attributes   = []
  username_attributes        = ["email"]
  sms_authentication_message = null

  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "admin_only"
      priority = 1
    }
  }

  software_token_mfa_configuration {
    enabled = true
  }

  web_authn_configuration {
    relying_party_id  = var.relying_party_id
    user_verification = "required"
  }

  password_policy {
    minimum_length                   = 24
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 1
  }

  user_pool_add_ons {
    advanced_security_mode = "AUDIT"
  }
}

resource "aws_cognito_user_pool_domain" "owner" {
  domain       = var.cognito_domain_prefix
  user_pool_id = aws_cognito_user_pool.owner.id
}

# The browser client is confidential only in the sense that it never leaves the
# server: the exchange happens in the function, not the page (ADR 0002).
resource "aws_cognito_user_pool_client" "browser" {
  name         = "${var.name_prefix}-browser"
  user_pool_id = aws_cognito_user_pool.owner.id

  generate_secret                      = false
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "profile"]
  callback_urls                        = var.browser_callback_urls
  logout_urls                          = var.browser_logout_urls
  supported_identity_providers         = ["COGNITO"]

  explicit_auth_flows = ["ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_SRP_AUTH"]

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true
}

# The MCP ingress is its own resource with its own scope, so a token issued for
# an assistant cannot be presented to the browser API or the reverse.
resource "aws_cognito_resource_server" "mcp" {
  identifier   = var.mcp_resource_identifier
  name         = "${var.name_prefix}-mcp"
  user_pool_id = aws_cognito_user_pool.owner.id

  scope {
    scope_name        = "assistant"
    scope_description = "Read the ledger and propose changes an owner confirms."
  }
}

resource "aws_cognito_user_pool_client" "assistant" {
  for_each = var.assistant_clients

  name         = "${var.name_prefix}-assistant-${each.key}"
  user_pool_id = aws_cognito_user_pool.owner.id

  generate_secret                      = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = [one(aws_cognito_resource_server.mcp.scope_identifiers)]
  callback_urls                        = each.value.callback_urls
  supported_identity_providers         = ["COGNITO"]

  explicit_auth_flows = ["ALLOW_REFRESH_TOKEN_AUTH"]

  access_token_validity  = 60
  refresh_token_validity = 7

  token_validity_units {
    access_token  = "minutes"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true
}
