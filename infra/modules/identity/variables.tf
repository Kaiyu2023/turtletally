variable "name_prefix" {
  description = "Prefix applied to every resource name, including the stage."
  type        = string
}

variable "cognito_domain_prefix" {
  description = "The prefix of the managed sign-in domain."
  type        = string
}

variable "browser_callback_urls" {
  description = "The exact callback URLs the browser client may use."
  type        = list(string)
}

variable "browser_logout_urls" {
  description = "The exact logout URLs the browser client may use."
  type        = list(string)
}

variable "assistant_clients" {
  description = <<-DESCRIPTION
    One entry per assistant permitted to reach the MCP ingress (ADR 0011). Each
    gets its own client and its own revocation; the callback URL is the exact
    value that assistant showed the owner.
  DESCRIPTION
  type = map(object({
    callback_urls = list(string)
  }))
  default = {}
}

variable "mcp_resource_identifier" {
  description = "The resource identifier an MCP token is bound to."
  type        = string
}

variable "relying_party_id" {
  description = "The passkey relying-party identity. Changing it invalidates every enrolled passkey."
  type        = string
}
