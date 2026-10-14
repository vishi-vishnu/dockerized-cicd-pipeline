# Terraform: the AWS side

Creates everything the app needs in `ap-south-1` (Mumbai):

| Resource | Why |
| --- | --- |
| `aws_instance.app` | Amazon Linux 2023, t3.micro, encrypted disk, IMDSv2 only. User data installs Docker. |
| `aws_eip.app` | Fixed public IP, so the GitHub variable `EC2_HOST` never changes. |
| `aws_security_group.web` | Port 80 for everyone, port 22 for SSH key login. |
| `aws_key_pair.deploy` | Your public key, so the pipeline can log in. |
| `aws_iam_role.ec2` + instance profile | The server writes logs with a role, not stored keys. Also allows Session Manager. |
| `aws_cloudwatch_log_group.app` | Container logs, kept 14 days. |
| Alarms + `aws_sns_topic.alerts` | Status check failed, CPU above 80%, more than 5 app errors in 5 minutes. Email by SNS. |
| `aws_cloudwatch_dashboard.main` | One screen with the key graphs and latest logs. |
| `aws_budgets_budget.monthly` | Email when the monthly cost forecast goes above USD 5. |

## Use

```bash
cp terraform.tfvars.example terraform.tfvars   # fill in your public key and email
terraform init
terraform plan
terraform apply
terraform output public_ip
terraform destroy   # remove everything
```

## State

Terraform remembers what it created in `terraform.tfstate`. Here it is a local file (ignored by git, because it can contain sensitive values). In a team you would store it in an S3 bucket with locking, so two people cannot apply at the same time:

```hcl
terraform {
  backend "s3" {
    bucket       = "my-terraform-state"
    key          = "pulse/terraform.tfstate"
    region       = "ap-south-1"
    use_lockfile = true
  }
}
```

The CI pipeline runs `terraform fmt -check` and `terraform validate` on every push. `apply` is run by hand because it needs AWS credentials.
