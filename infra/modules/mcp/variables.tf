variable "name_prefix" {
  description = "Prefix applied to every resource name, including the stage."
  type        = string
}

variable "domain_name" {
  description = "The domain the MCP ingress answers on. It is not the browser's."
  type        = string
}

variable "certificate_arn" {
  description = "A regional ACM certificate covering the MCP domain."
  type        = string
}

variable "function_name" {
  description = "The function that serves the ingress."
  type        = string
}

variable "invoke_arn" {
  description = "The invoke ARN of that function."
  type        = string
}

variable "log_retention_days" {
  description = "How long access logs are kept."
  type        = number
  default     = 30
}

variable "burst_limit" {
  description = "How many requests may arrive at once. One assistant needs very few."
  type        = number
  default     = 10
}

variable "rate_limit" {
  description = "Sustained requests per second."
  type        = number
  default     = 5
}
