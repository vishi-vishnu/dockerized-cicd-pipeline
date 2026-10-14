output "public_ip" {
  description = "Save this as the GitHub variable EC2_HOST."
  value       = aws_eip.app.public_ip
}

output "app_url" {
  value = "http://${aws_eip.app.public_ip}"
}

output "ssh_command" {
  value = "ssh -i ~/.ssh/pulse_deploy ec2-user@${aws_eip.app.public_ip}"
}

output "log_group" {
  value = aws_cloudwatch_log_group.app.name
}

output "dashboard_url" {
  value = "https://${var.region}.console.aws.amazon.com/cloudwatch/home?region=${var.region}#dashboards/dashboard/${var.project}"
}
