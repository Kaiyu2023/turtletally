mock_provider "aws" {}

variables {
  name_prefix             = "turtle-tally-test"
  cognito_domain_prefix   = "turtle-tally-test"
  relying_party_id        = "app.example.invalid"
  browser_callback_urls   = ["https://app.example.invalid/auth/callback"]
  browser_logout_urls     = ["https://app.example.invalid"]
  mcp_resource_identifier = "https://mcp.example.invalid"

  assistant_clients = {
    first  = { callback_urls = ["https://first.example.invalid/callback"] }
    second = { callback_urls = ["https://second.example.invalid/callback"] }
  }
}

run "there_is_one_owner_and_no_way_to_sign_up" {
  command = plan

  assert {
    condition     = aws_cognito_user_pool.owner.admin_create_user_config[0].allow_admin_create_user_only
    error_message = "This product has one owner and no public sign-up."
  }

  assert {
    condition     = aws_cognito_user_pool.owner.mfa_configuration == "ON"
    error_message = "A second factor is required, not offered."
  }

  assert {
    condition = alltrue([
      for setting in aws_cognito_user_pool.owner.account_recovery_setting :
      alltrue([for mechanism in setting.recovery_mechanism : mechanism.name == "admin_only"])
    ])
    error_message = "Recovery is an administrator procedure, not an email loop."
  }

  assert {
    condition     = one(aws_cognito_user_pool.owner.web_authn_configuration[*].user_verification) == "required"
    error_message = "A passkey must verify the person, not just the device."
  }
}

run "each_assistant_gets_its_own_revocable_client" {
  command = plan

  assert {
    condition     = length(aws_cognito_user_pool_client.assistant) == 2
    error_message = "ADR 0011 registers one client per assistant."
  }

  assert {
    condition = alltrue([
      for client in aws_cognito_user_pool_client.assistant : client.enable_token_revocation
    ])
    error_message = "An assistant must be revocable on its own."
  }

  assert {
    condition = alltrue([
      for client in aws_cognito_user_pool_client.assistant : client.generate_secret
    ])
    error_message = "An assistant is a confidential client, not a page."
  }

  assert {
    condition     = !contains(aws_cognito_user_pool_client.browser.allowed_oauth_scopes, "https://mcp.example.invalid/assistant")
    error_message = "A browser token is not an assistant token either."
  }
}
