variable "region" {
  description = "The region the state bucket lives in."
  type        = string
}

variable "state_bucket_name" {
  description = "The globally unique name of the private state bucket."
  type        = string

  validation {
    condition     = length(var.state_bucket_name) >= 3 && !can(regex("[A-Z]", var.state_bucket_name))
    error_message = "A bucket name is lowercase and at least three characters."
  }
}
