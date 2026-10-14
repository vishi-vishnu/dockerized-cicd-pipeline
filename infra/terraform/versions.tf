terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # State is kept in a local file (terraform.tfstate, ignored by git).
  # For a team, move it to an S3 bucket with locking. See README.md in this folder.
}

provider "aws" {
  region = var.region

  # Every resource gets these tags, so they are easy to find and to clean up.
  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
    }
  }
}
