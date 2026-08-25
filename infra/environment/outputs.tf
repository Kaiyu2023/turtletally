output "distribution_domain" {
  description = "What the application's DNS record points at. Creating the record is an owner action."
  value       = module.edge.distribution_domain
}

output "mcp_domain_target" {
  description = "What the MCP domain's DNS record points at."
  value       = module.mcp.domain_target
}

output "site_bucket" {
  description = "Where the built application is uploaded."
  value       = module.edge.site_bucket
}

output "protected_resource_metadata_url" {
  description = "The document a client discovers from an unauthenticated refusal (ADR 0011)."
  value       = "${module.mcp.resource_url}/.well-known/oauth-protected-resource"
}
