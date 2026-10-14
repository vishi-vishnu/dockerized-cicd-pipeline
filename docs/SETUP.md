# Setup guide

Follow these parts in order. Parts 1 and 2 make the pipeline build and push images. Parts 3 to 6 add the AWS server and automatic deploys. Commands are for **PowerShell on Windows**.

You never paste a password or secret into a file in this repo. Secrets go only into GitHub settings.

---

## Part 1. Put the code on GitHub

1. github.com > **New repository** > name `dockerized-cicd-pipeline` > **Public** > do **not** add a README > Create.
2. In PowerShell, inside the project folder:

```powershell
git init -b main
git pull pulse-1.bundle main
git remote add origin https://github.com/vishi-vishnu/dockerized-cicd-pipeline.git
git push -u origin main
```

The first run starts in the **Actions** tab. Test, build and Terraform checks pass. The image is not pushed yet (no Docker Hub token) and deploy is skipped (no server yet).

## Part 2. Docker Hub

1. hub.docker.com > your account `devvishnudocker` > **Account settings** > **Personal access tokens** > **Generate new token**.
   - Description: `github-actions-pulse`
   - Access: **Read & Write**
   - Copy the token now. Docker Hub shows it only once.
2. GitHub repo > **Settings** > **Secrets and variables** > **Actions**:
   - **Variables** tab > New variable: `DOCKERHUB_USERNAME` = `devvishnudocker`
   - **Secrets** tab > New secret: `DOCKERHUB_TOKEN` = the token you copied
3. Actions > the last **CI/CD** run > **Re-run all jobs**.
4. Check hub.docker.com: a public repository `devvishnudocker/pulse` now has two tags, `latest` and `sha-xxxxxxx`.

Try it locally: `docker run -p 3000:3000 devvishnudocker/pulse:latest`, then open http://localhost:3000. In Docker Desktop you can see it under **Images** and **Containers**.

## Part 3. AWS account (one time)

1. aws.amazon.com > **Create an AWS account**. Choose the **Free plan**. A card is needed for identity checks; new accounts get free credits.
2. Sign in as the **root user** > top right menu > **Security credentials** > **Assign MFA device** (use Google Authenticator or similar). Do this before anything else.
3. Make a separate user for Terraform, so you do not use root day to day:
   - Search **IAM** > Users > **Create user** > name `terraform` > Next.
   - **Attach policies directly** > tick `AdministratorAccess` > Create. (Fine for a personal learning account. In a company you would use SSO with smaller permissions.)
   - Open the user > **Security credentials** > **Create access key** > choose **Command Line Interface (CLI)** > Create. Copy both values. Do not share them or commit them.
4. Top right region menu: choose **Asia Pacific (Mumbai) ap-south-1**.

## Part 4. Tools on your laptop

```powershell
winget install Hashicorp.Terraform
winget install Amazon.AWSCLI
# close and reopen PowerShell, then:
terraform -version
aws --version
aws configure
#   AWS Access Key ID:     (paste)
#   AWS Secret Access Key: (paste)
#   Default region name:   ap-south-1
#   Default output format: json
aws sts get-caller-identity     # shows your account and the "terraform" user
```

Make the SSH key the pipeline will use to log in to the server:

```powershell
ssh-keygen -t ed25519 -f $HOME\.ssh\pulse_deploy -C "pulse-deploy"
# Press Enter twice (no passphrase; GitHub Actions cannot type one)
Get-Content $HOME\.ssh\pulse_deploy.pub      # public key: goes into Terraform
```

## Part 5. Create the server with Terraform

```powershell
cd infra\terraform
Copy-Item terraform.tfvars.example terraform.tfvars
notepad terraform.tfvars
```

In `terraform.tfvars` paste your **public** key line and your email, then save.

```powershell
terraform init       # downloads the AWS provider
terraform plan       # shows what will be created (about 15 resources). Nothing changes yet.
terraform apply      # type: yes
```

After about 1 minute you get outputs like:

```
public_ip     = "13.233.x.x"
app_url       = "http://13.233.x.x"
ssh_command   = "ssh -i ~/.ssh/pulse_deploy ec2-user@13.233.x.x"
dashboard_url = "https://ap-south-1.console.aws.amazon.com/cloudwatch/..."
```

- Check your email and click **Confirm subscription** from AWS Notifications, so alarms can reach you.
- Wait 2 minutes for Docker to install, then test: `ssh -i $HOME\.ssh\pulse_deploy ec2-user@<public_ip> "docker --version"`

## Part 6. Connect GitHub to the server

GitHub repo > Settings > Secrets and variables > Actions:

- **Variables** > `EC2_HOST` = the `public_ip` value
- **Secrets** > `EC2_SSH_KEY` = the whole **private** key. Copy it with:

```powershell
Get-Content $HOME\.ssh\pulse_deploy -Raw | Set-Clipboard
```

Optional but good: Settings > **Environments** > `production` > **Required reviewers** > add yourself. Every deploy then waits for your click (manual approval).

Now run Actions > CI/CD > **Run workflow** on `main` (or push any change). The **Deploy to AWS EC2** job runs. Open `http://<public_ip>`: the status page shows your commit and the first entry in **Deployment history**.

---

## Demo: watch the automatic rollback

This is the best thing to show in an interview. It takes one click.

1. Actions > **CI/CD** > **Run workflow** > branch `main` > tick **simulate_bad_release** > Run.
2. The pipeline builds a special image tagged `sha-xxxxxxx-bad`. Its `/health` works in CI, but returns `503` when it runs with `APP_ENV=production`, like a real release that is missing a production setting.
3. Watch the run: tests pass, the smoke test passes, the image is pushed, then the deploy job prints `new version ... is NOT healthy` and `rolling back to sha-...`. The job fails (red), which is what we want.
4. Open the site. It is still up on the old version, and the **Deployment history** shows **Rolled back**. CloudWatch Logs show the error line from the bad container.
5. Nothing to undo: the next normal push deploys as usual, and `latest` was never moved to the bad image.

Why can tests not catch everything? A health check can fail for reasons tests never see: a missing environment variable, a database that is down, a port clash. The automatic rollback is the safety net for those.

## Manual rollback

Actions > **Roll back** > Run workflow > type a tag such as `sha-1a2b3c4` (see the history table or Docker Hub tags).

## Look at the logs and alarms

- CloudWatch > **Log groups** > `/pulse/app`: one stream per deployed tag, JSON lines from the app.
- CloudWatch > **Dashboards** > `pulse`: CPU, status checks, app errors, network, latest log lines.
- CloudWatch > **Alarms**: status check failed, CPU high, app errors.

## Cost and clean up

- A `t3.micro` is part of the AWS free plan. The public IPv4 address costs about USD 0.005 per hour (about USD 3.6 a month), which the free credits cover.
- The budget alert emails you if the forecast goes above USD 5 a month.
- When you are done with the demo: `terraform destroy` in `infra\terraform` removes everything. `terraform apply` brings it all back.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Push to Docker Hub fails with `unauthorized` | Check the variable `DOCKERHUB_USERNAME` and that the token has Read & Write access. |
| Deploy: `Permission denied (publickey)` | `EC2_SSH_KEY` must be the private key, including the `-----BEGIN` and `-----END` lines. |
| Deploy: `ssh-keyscan` or connection timeout | Check `EC2_HOST`, and that the server is running (EC2 console). |
| Deploy: `docker: permission denied` | Docker was still installing. Wait 2 minutes after `terraform apply` and re-run the job. |
| Terraform check fails on `fmt` | Run `terraform fmt -recursive` in `infra\terraform`, commit, push. |
| No email alerts | Confirm the subscription email from AWS. |
