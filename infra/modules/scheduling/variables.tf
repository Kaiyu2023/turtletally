variable "name_prefix" {
  description = "Prefix applied to every resource name, including the stage."
  type        = string
}

variable "function_arn" {
  description = "The worker the schedule invokes."
  type        = string
}

variable "function_name" {
  description = "The worker's name, for the invoke permission."
  type        = string
}

variable "schedule_expression" {
  description = "When the worker runs. Once a day is enough: a run generates every occurrence that is due."
  type        = string
  default     = "cron(15 1 * * ? *)"
}

variable "timezone" {
  description = "The zone the schedule is read in, which is the owner's own."
  type        = string
  default     = "Europe/London"
}
