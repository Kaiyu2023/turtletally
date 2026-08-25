output "user_pool_id" {
  value = aws_cognito_user_pool.owner.id
}

output "issuer" {
  value = "https://cognito-idp.${data.aws_region.current.region}.amazonaws.com/${aws_cognito_user_pool.owner.id}"
}

output "hosted_domain" {
  value = "https://${aws_cognito_user_pool_domain.owner.domain}.auth.${data.aws_region.current.region}.amazoncognito.com"
}

output "browser_client_id" {
  value = aws_cognito_user_pool_client.browser.id
}

output "assistant_client_ids" {
  description = "One client per assistant, each revocable on its own (ADR 0011)."
  value       = { for name, client in aws_cognito_user_pool_client.assistant : name => client.id }
}

output "mcp_scope" {
  value = one(aws_cognito_resource_server.mcp.scope_identifiers)
}
