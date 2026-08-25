output "api_id" {
  value = aws_apigatewayv2_api.mcp.id
}

output "domain_target" {
  description = "The target a DNS record points at. The record itself is an owner action."
  value       = one(aws_apigatewayv2_domain_name.mcp.domain_name_configuration[*].target_domain_name)
}

output "resource_url" {
  value = "https://${var.domain_name}"
}
