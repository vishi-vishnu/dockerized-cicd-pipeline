# The server that runs the Pulse container, and everything it needs.

# Latest Amazon Linux 2023 image, looked up from AWS's public parameter store.
data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-x86_64"
}

# Every AWS account has a default VPC (private network) in each region. We use it to keep things simple.
data "aws_vpc" "default" {
  default = true
}

resource "aws_key_pair" "deploy" {
  key_name   = "${var.project}-deploy"
  public_key = var.ssh_public_key
}

# Firewall rules for the server
resource "aws_security_group" "web" {
  name        = "${var.project}-web"
  description = "HTTP for everyone, SSH for deploys"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "Website"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "SSH, key login only"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_cidr]
  }

  egress {
    description = "Pull images from Docker Hub, send logs to CloudWatch"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ---------- IAM: what the server itself may do in AWS ----------
# No access keys live on the server. It gets short-lived credentials from this role.
resource "aws_iam_role" "ec2" {
  name = "${var.project}-ec2"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Least privilege: write logs to our one log group, nothing else.
resource "aws_iam_role_policy" "logs" {
  name = "write-app-logs"
  role = aws_iam_role.ec2.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
      Resource = "${aws_cloudwatch_log_group.app.arn}:*"
    }]
  })
}

# Lets you open a shell from the AWS console (Session Manager) even without SSH.
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${var.project}-ec2"
  role = aws_iam_role.ec2.name
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/${var.project}/app"
  retention_in_days = var.log_retention_days
}

# ---------- The server ----------
resource "aws_instance" "app" {
  ami                    = data.aws_ssm_parameter.al2023.value
  instance_type          = var.instance_type
  key_name               = aws_key_pair.deploy.key_name
  vpc_security_group_ids = [aws_security_group.web.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name

  # Installs Docker and prepares /opt/pulse on first boot
  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    region    = var.region
    log_group = aws_cloudwatch_log_group.app.name
  })
  user_data_replace_on_change = true

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }

  # IMDSv2 only: protects the role credentials from a common class of attacks (SSRF)
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  tags = {
    Name = "${var.project}-app"
  }

  lifecycle {
    # A newer Amazon Linux image should not replace a running server by surprise
    ignore_changes = [ami]
  }
}

# A fixed public IP address, so the GitHub variable EC2_HOST never has to change.
resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"

  tags = {
    Name = "${var.project}-ip"
  }
}
