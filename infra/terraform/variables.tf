variable "project" {
  description = "Name used for every resource."
  type        = string
  default     = "pulse"
}

variable "region" {
  description = "AWS region. ap-south-1 is Mumbai, the closest to India."
  type        = string
  default     = "ap-south-1"
}

variable "instance_type" {
  description = "EC2 size. t3.micro is covered by the AWS free plan."
  type        = string
  default     = "t3.micro"
}

variable "ssh_public_key" {
  description = "Contents of your public key file (pulse_deploy.pub). The matching private key goes into the GitHub secret EC2_SSH_KEY."
  type        = string
}

variable "ssh_cidr" {
  description = "Who may connect on port 22. GitHub-hosted runners use many changing IP addresses, so the default is open; login is by key only."
  type        = string
  default     = "0.0.0.0/0"
}

variable "alert_email" {
  description = "Email for CloudWatch alarms and the budget alert. Leave empty to skip email alerts."
  type        = string
  default     = ""
}

variable "monthly_budget_usd" {
  description = "Send an email when the forecast monthly AWS cost goes above this amount."
  type        = number
  default     = 5
}

variable "log_retention_days" {
  description = "How long CloudWatch keeps the app logs."
  type        = number
  default     = 14
}
