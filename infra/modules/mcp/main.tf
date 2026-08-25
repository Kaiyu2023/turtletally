# ADR 0004 keeps this ingress separate from the browser's, and ADR 0011 makes
# its authentication the protocol's own: the function verifies the bearer token
# itself, so the gateway's job is the domain, the throttle, and the log.

resource "aws_cloudwatch_log_group" "access" {
  name              = "/aws/apigateway/${var.name_prefix}-mcp"
  retention_in_days = var.log_retention_days
}

resource "aws_apigatewayv2_api" "mcp" {
  name          = "${var.name_prefix}-mcp"
  protocol_type = "HTTP"

  # The ingress answers on its own domain only, so the generated endpoint is
  # not a second way in.
  disable_execute_api_endpoint = true
}

resource "aws_apigatewayv2_integration" "mcp" {
  api_id                 = aws_apigatewayv2_api.mcp.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 29000
}

resource "aws_apigatewayv2_route" "mcp" {
  api_id    = aws_apigatewayv2_api.mcp.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.mcp.id}"
}

resource "aws_apigatewayv2_stage" "mcp" {
  api_id      = aws_apigatewayv2_api.mcp.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = var.burst_limit
    throttling_rate_limit  = var.rate_limit
  }

  # Coarse request shape only: no bodies, no tokens, no finance values.
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format = jsonencode({
      requestId         = "$context.requestId"
      method            = "$context.httpMethod"
      route             = "$context.routeKey"
      status            = "$context.status"
      latencyMs         = "$context.responseLatency"
      integrationStatus = "$context.integration.status"
    })
  }
}

resource "aws_apigatewayv2_domain_name" "mcp" {
  domain_name = var.domain_name

  domain_name_configuration {
    certificate_arn = var.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

resource "aws_apigatewayv2_api_mapping" "mcp" {
  api_id      = aws_apigatewayv2_api.mcp.id
  domain_name = aws_apigatewayv2_domain_name.mcp.id
  stage       = aws_apigatewayv2_stage.mcp.id
}

resource "aws_lambda_permission" "mcp" {
  statement_id  = "AllowMcpGateway"
  action        = "lambda:InvokeFunction"
  function_name = var.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.mcp.execution_arn}/*/*"
}
