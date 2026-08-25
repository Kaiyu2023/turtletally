variable "region" {
  description = "The region the stack runs in."
  type        = string
}

variable "stage" {
  description = "Which deployment this is. Sandbox and production are distinct state keys, never workspaces."
  type        = string

  validation {
    condition     = contains(["sandbox", "production"], var.stage)
    error_message = "A stage is sandbox or production."
  }
}

variable "app_domain" {
  description = "The domain the browser application answers on."
  type        = string
}

variable "mcp_domain" {
  description = "The domain the MCP ingress answers on. It is deliberately not the application's."
  type        = string
}

variable "app_certificate_arn" {
  description = "An ACM certificate in us-east-1 covering the application domain."
  type        = string
}

variable "mcp_certificate_arn" {
  description = "A regional ACM certificate covering the MCP domain."
  type        = string
}

variable "cognito_domain_prefix" {
  description = "The prefix of the managed sign-in domain."
  type        = string
}

variable "passkey_relying_party_id" {
  description = "The passkey relying-party identity. Changing it invalidates every enrolled passkey, which is why the domain decision comes first."
  type        = string
}

variable "assistant_clients" {
  description = "One entry per assistant permitted to reach the MCP ingress (ADR 0011)."
  type = map(object({
    callback_urls = list(string)
  }))
  default = {}
}

variable "app_api_artifact" {
  description = "The built ARM64 ZIP for the browser API."
  type        = string
}

variable "mcp_api_artifact" {
  description = "The built ARM64 ZIP for the MCP ingress."
  type        = string
}

variable "scheduler_artifact" {
  description = "The built ARM64 ZIP for the scheduler worker."
  type        = string
}

variable "owner_subject" {
  description = "The Cognito subject the scheduler runs for. One owner, and no way to discover them without a scan."
  type        = string
  sensitive   = true
}

variable "monthly_cost_ceiling" {
  description = "The monthly figure ADR 0009 requires before the first billable resource. Crossing it is a stop condition, not a notification."
  type        = number

  validation {
    condition     = var.monthly_cost_ceiling > 0
    error_message = "A ceiling recorded as zero or a placeholder is not a control."
  }
}

variable "alert_email" {
  description = "Where an alert is delivered."
  type        = string
  sensitive   = true
}

variable "log_retention_days" {
  description = "How long any log this stack owns is kept."
  type        = number
  default     = 30
}

variable "web_acl_arn" {
  description = "An optional WAF association for the distribution."
  type        = string
  default     = null
}
