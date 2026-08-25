variable "name_prefix" {
  description = "Prefix applied to every resource name, including the stage."
  type        = string
}

variable "finance_read_capacity" {
  description = "Provisioned read units for the ledger table. ADR 0007 sizes reads to a small reserve."
  type        = number
  default     = 5
}

variable "finance_write_capacity" {
  description = "Provisioned write units for the ledger table. A transaction costs double."
  type        = number
  default     = 5
}

variable "log_retention_days" {
  description = "How long any log this module owns is kept."
  type        = number
  default     = 30
}

variable "upload_origins" {
  description = "The exact origins allowed to write a receipt through a presigned grant."
  type        = list(string)
}
