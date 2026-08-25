variable "name_prefix" {
  description = "Prefix applied to every resource name, including the stage."
  type        = string
}

variable "artifact_path" {
  description = "The built ARM64 ZIP for this function."
  type        = string
}

variable "function_name" {
  description = "The short name of this function, appended to the prefix."
  type        = string
}

variable "handler_environment" {
  description = "Configuration the function reads at start-up."
  type        = map(string)
}

variable "memory_mb" {
  description = "Memory, which also sets the share of a core the function gets."
  type        = number
  default     = 512
}

variable "timeout_seconds" {
  description = "How long one request may take before it is stopped."
  type        = number
  default     = 10
}

variable "log_retention_days" {
  description = "How long the function's logs are kept."
  type        = number
  default     = 30
}

variable "reserved_concurrency" {
  description = "A ceiling on concurrent executions, which is also a ceiling on cost."
  type        = number
  default     = 5
}

variable "policy_statements" {
  description = "The exact actions and resources this function needs."
  type = list(object({
    sid       = string
    actions   = list(string)
    resources = list(string)
  }))
}

variable "create_function_url" {
  description = "Whether this function is reached directly through a signed function URL."
  type        = bool
  default     = false
}
