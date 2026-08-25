mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

variables {
  region                   = "eu-west-2"
  stage                    = "sandbox"
  app_domain               = "app.example.invalid"
  mcp_domain               = "mcp.example.invalid"
  app_certificate_arn      = "arn:aws:acm:us-east-1:000000000000:certificate/example"
  mcp_certificate_arn      = "arn:aws:acm:eu-west-2:000000000000:certificate/example"
  cognito_domain_prefix    = "turtle-tally-example"
  passkey_relying_party_id = "app.example.invalid"
  app_api_artifact         = "tests/fixtures/artifact.txt"
  mcp_api_artifact         = "tests/fixtures/artifact.txt"
  monthly_cost_ceiling     = 25
  alert_email              = "alerts@example.invalid"

  assistant_clients = {
    example = { callback_urls = ["https://assistant.example.invalid/callback"] }
  }
}

run "the_stack_plans_as_one_boundary" {
  command = plan

  assert {
    condition     = module.app_api.environment["APP_ORIGIN"] == "https://app.example.invalid"
    error_message = "The browser API must know the exact origin it accepts mutations from."
  }

  assert {
    condition     = module.mcp_api.environment["RESOURCE_URL"] == "https://mcp.example.invalid"
    error_message = "The MCP ingress is its own resource, not the application's."
  }
}

# ADR 0004 separates the two ingresses. What proves it is that neither is
# configured with what the other holds.
run "the_assistant_is_never_given_the_browser_session" {
  command = plan

  assert {
    condition = alltrue([
      for name in ["SESSION_TABLE", "SESSION_KEY_ID", "BROWSER_CLIENT_ID"] :
      !contains(keys(module.mcp_api.environment), name)
    ])
    error_message = "The MCP ingress has no business reading a browser session."
  }

  assert {
    condition     = contains(keys(module.app_api.environment), "SESSION_TABLE")
    error_message = "The browser API keeps the sessions it issues."
  }
}

run "a_cost_ceiling_is_a_real_figure" {
  command = plan

  variables {
    monthly_cost_ceiling = 0
  }

  expect_failures = [var.monthly_cost_ceiling]
}

run "a_stage_is_sandbox_or_production" {
  command = plan

  variables {
    stage = "staging"
  }

  expect_failures = [var.stage]
}
