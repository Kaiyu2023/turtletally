variable "name_prefix" {
  description = "Prefix applied to every resource name, including the stage."
  type        = string
}

variable "domain_name" {
  description = "The domain the browser application is served from."
  type        = string
}

variable "certificate_arn" {
  description = "An ACM certificate in us-east-1 covering the domain."
  type        = string
}

variable "api_origin_domain" {
  description = "The host of the function URL that serves the session and API routes."
  type        = string
}

variable "log_retention_days" {
  description = "How long edge logs are kept."
  type        = number
  default     = 30
}

variable "web_acl_arn" {
  description = "An optional WAF association. The flat-rate plan's WAF is attached by the owner (manual actions register)."
  type        = string
  default     = null
}
