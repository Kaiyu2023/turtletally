mock_provider "aws" {}

variables {
  name_prefix     = "turtle-tally-test"
  domain_name     = "mcp.example.invalid"
  certificate_arn = "arn:aws:acm:eu-west-2:000000000000:certificate/example"
  function_name   = "turtle-tally-test-mcp-api"
  invoke_arn      = "arn:aws:apigateway:eu-west-2:lambda:path/2015-03-31/functions/arn:aws:lambda:eu-west-2:000000000000:function:turtle-tally-test-mcp-api/invocations"
}

run "the_ingress_answers_on_its_own_domain_only" {
  command = plan

  assert {
    condition     = aws_apigatewayv2_api.mcp.disable_execute_api_endpoint
    error_message = "The generated endpoint would be a second way in."
  }

  assert {
    condition     = one(aws_apigatewayv2_domain_name.mcp.domain_name_configuration[*].security_policy) == "TLS_1_2"
    error_message = "The ingress must not negotiate an outdated protocol."
  }
}

run "one_assistant_cannot_flood_the_ledger" {
  command = plan

  assert {
    condition     = aws_apigatewayv2_stage.mcp.default_route_settings[0].throttling_rate_limit <= 10
    error_message = "A conversational client needs very few requests a second."
  }

  assert {
    condition     = aws_cloudwatch_log_group.access.retention_in_days > 0
    error_message = "Access logs are kept for a bounded time."
  }
}

run "the_access_log_records_shape_rather_than_content" {
  command = plan

  assert {
    condition = alltrue([
      for field in ["token", "authorization", "body", "amount"] :
      !can(regex(field, aws_apigatewayv2_stage.mcp.access_log_settings[0].format))
    ])
    error_message = "A log line must carry no token, body, or financial value."
  }
}
