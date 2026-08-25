variable "name_prefix" {
  description = "Prefix applied to every resource name, including the stage."
  type        = string
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
  description = "Where an alert is delivered. The subscription is confirmed by the owner."
  type        = string
  sensitive   = true
}

variable "watched_functions" {
  description = "The functions whose failures raise an alarm."
  type        = map(string)
}

variable "watched_tables" {
  description = "The tables whose throttling raises an alarm."
  type        = map(string)
}
