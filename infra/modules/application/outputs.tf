output "function_name" {
  value = aws_lambda_function.function.function_name
}

output "function_arn" {
  value = aws_lambda_function.function.arn
}

output "invoke_arn" {
  value = aws_lambda_function.function.invoke_arn
}

output "environment" {
  description = "What the function was configured with, so a root test can prove the wiring."
  value       = var.handler_environment
}

output "role_arn" {
  value = aws_iam_role.function.arn
}

output "function_url" {
  value = one(aws_lambda_function_url.function[*].function_url)
}

output "function_url_domain" {
  value = one([for url in aws_lambda_function_url.function[*].function_url : replace(replace(url, "https://", ""), "/", "")])
}
