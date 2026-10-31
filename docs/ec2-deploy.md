# Deploying the backend on a single EC2 instance (cheap, credit-friendly)

```
 feature branch ──PR──▶ prod ──merge──▶ GitHub Actions
                  ▲                       1. tests again   2. build image → ECR
          tests must pass                 3. tell the instance to deploy (SSM, no SSH)
          (branch ruleset)                                  │
                                                            ▼
   Netlify frontend ──HTTPS/WSS──▶ api.yourdomain.com ──▶ EC2 t3.micro (Docker)
                                                           ├─ Caddy  (HTTPS cert, proxies WebSockets)
                                                           └─ backend (FastAPI + Socket.IO)
                                                                 │
                                                                 ▼
                                                           Neon Postgres
```

**Why this fits your situation**

- No load balancer (≈ US$16+/month) and no NAT gateway; the only fixed costs are the instance,
  its public IP and a small disk. Roughly **US$13–15/month** all in (check the AWS pricing calculator for your region),
  versus ≈ US$30+ for ECS Fargate + ALB. $100 of credits therefore lasts about 6–7 months.
- No SSH, no open port 22: deploys and shell access go through AWS Systems Manager (SSM).
- Caddy gets and renews the HTTPS certificate by itself (your Netlify site is HTTPS, so the API must be HTTPS/WSS).
- Your data lives in Neon, so the instance is disposable: if it ever breaks, launch a new one and redeploy.
- A bad release rolls back automatically: the deploy script waits for the backend's health check and
  restores the previous image if it never becomes healthy.

**What you give up:** you patch the OS yourself (`sudo apt-get upgrade` now and then), there is a single instance
(a deploy or a reboot means roughly a minute of downtime; the browsers reconnect and rejoin on their own), and
rooms live in the memory of that one process, so this setup cannot scale to several servers without Redis.

**Know your credits.** Instance types eligible for free-plan credits depend on when your account was created.
List them with:
`aws ec2 describe-instance-types --filters Name=free-tier-eligible,Values=true --query 'InstanceTypes[].InstanceType' --output text`.
If your account is on the newer "Free plan", AWS says it closes when credits run out or after 6 months
unless you upgrade to Paid: check Billing → Free Tier. **Create a budget alert now**
(Billing → Budgets → Monthly cost budget, e.g. US$5, with your email).

---

## 0. Variables used below

```bash
export AWS_REGION=ap-south-1            # nearest to you / your Neon project
export AWS_DEFAULT_REGION=$AWS_REGION
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export DOMAIN=api.yourdomain.com        # see step 1.6 if you don't own a domain
export GH_REPO=singhsrj/watchparty-youtube
```
Run the commands from the repository root (they reference `backend/deploy/ec2/bootstrap.sh`).

## 1. One-time AWS setup

### 1.1 Image repository (keeps only the last 5 images, so storage stays at pennies)
```bash
aws ecr create-repository --repository-name watchparty-backend --image-scanning-configuration scanOnPush=true
aws ecr put-lifecycle-policy --repository-name watchparty-backend --lifecycle-policy-text \
 '{"rules":[{"rulePriority":1,"description":"keep last 5","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":5},"action":{"type":"expire"}}]}'
```

### 1.2 Instance role (lets the box pull images and receive SSM commands)
```bash
cat > /tmp/ec2-trust.json <<JSON
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}
JSON
aws iam create-role --role-name watchparty-ec2 --assume-role-policy-document file:///tmp/ec2-trust.json
aws iam attach-role-policy --role-name watchparty-ec2 --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam attach-role-policy --role-name watchparty-ec2 --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
aws iam create-instance-profile --instance-profile-name watchparty-ec2
aws iam add-role-to-instance-profile --instance-profile-name watchparty-ec2 --role-name watchparty-ec2
sleep 15   # let IAM propagate
```

### 1.3 Security group: web traffic only, **no port 22**
```bash
VPC_ID=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
SUBNET_ID=$(aws ec2 describe-subnets --filters Name=vpc-id,Values=$VPC_ID Name=default-for-az,Values=true --query 'Subnets[0].SubnetId' --output text)
SG_ID=$(aws ec2 create-security-group --group-name watchparty --description "WatchParty web" --vpc-id $VPC_ID --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 80  --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 443 --cidr 0.0.0.0/0
```

### 1.4 Launch the instance
```bash
AMI_ID=$(aws ssm get-parameter \
  --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id \
  --query Parameter.Value --output text)

INSTANCE_ID=$(aws ec2 run-instances \
  --image-id $AMI_ID --instance-type t3.micro \
  --subnet-id $SUBNET_ID --security-group-ids $SG_ID \
  --iam-instance-profile Name=watchparty-ec2 \
  --metadata-options HttpTokens=required,HttpEndpoint=enabled \
  --credit-specification CpuCredits=standard \
  --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=20,VolumeType=gp3,DeleteOnTermination=true}' \
  --user-data file://backend/deploy/ec2/bootstrap.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=watchparty}]' \
  --query 'Instances[0].InstanceId' --output text)
echo $INSTANCE_ID
```
- `t3.micro` is plenty (use `t3.small` if you ever see memory pressure).
- `CpuCredits=standard` stops the burstable CPU from running up surplus charges.
- `HttpTokens=required` turns on the more secure metadata service (IMDSv2).
- `bootstrap.sh` runs on first boot: installs Docker, the AWS CLI, 1 GB of swap and the deploy launcher (takes ~3 minutes).

### 1.5 Fixed public IP
Without this the address changes whenever the instance is stopped and started.
```bash
aws ec2 wait instance-running --instance-ids $INSTANCE_ID
ALLOC_ID=$(aws ec2 allocate-address --domain vpc --query AllocationId --output text)
aws ec2 associate-address --instance-id $INSTANCE_ID --allocation-id $ALLOC_ID
aws ec2 describe-addresses --allocation-ids $ALLOC_ID --query 'Addresses[0].PublicIp' --output text
```
Keep the IP attached: an unattached Elastic IP is billed too. Public IPv4 costs about US$0.005/hour (≈ US$3.6/month).

### 1.6 DNS
Create an **A record** `api` → the IP above (at your domain's DNS provider).
No domain? A free subdomain from [duckdns.org](https://www.duckdns.org) pointing at that IP works too
(then `DOMAIN=yourname.duckdns.org`). Check it with `nslookup $DOMAIN` before the first deploy:
Caddy can only get a certificate once the name points at the instance.

### 1.7 Check the box is ready (give it ~3–4 minutes)
```bash
aws ssm describe-instance-information --query 'InstanceInformationList[].[InstanceId,PingStatus]' --output text
```
Expect your instance with `Online`. If it isn't listed yet, wait a minute and retry.

### 1.8 Let GitHub deploy (OIDC, no stored AWS keys)
```bash
aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com --client-id-list sts.amazonaws.com
# if the CLI insists on a thumbprint: add  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1

cat > /tmp/gh-trust.json <<JSON
{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
 "Principal":{"Federated":"arn:aws:iam::$ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"},
 "Action":"sts:AssumeRoleWithWebIdentity",
 "Condition":{"StringEquals":{"token.actions.githubusercontent.com:aud":"sts.amazonaws.com"},
              "StringLike":{"token.actions.githubusercontent.com:sub":"repo:$GH_REPO:ref:refs/heads/prod"}}}]}
JSON
aws iam create-role --role-name watchparty-github-deploy --assume-role-policy-document file:///tmp/gh-trust.json

cat > /tmp/gh-deploy.json <<JSON
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":"ecr:GetAuthorizationToken","Resource":"*"},
 {"Effect":"Allow","Action":["ecr:BatchCheckLayerAvailability","ecr:InitiateLayerUpload","ecr:UploadLayerPart","ecr:CompleteLayerUpload","ecr:PutImage"],
  "Resource":"arn:aws:ecr:$AWS_REGION:$ACCOUNT_ID:repository/watchparty-backend"},
 {"Effect":"Allow","Action":"ssm:SendCommand",
  "Resource":["arn:aws:ec2:$AWS_REGION:$ACCOUNT_ID:instance/$INSTANCE_ID","arn:aws:ssm:$AWS_REGION::document/AWS-RunShellScript"]},
 {"Effect":"Allow","Action":["ssm:GetCommandInvocation","ssm:ListCommandInvocations"],"Resource":"*"}]}
JSON
aws iam put-role-policy --role-name watchparty-github-deploy --policy-name deploy --policy-document file:///tmp/gh-deploy.json
```
Only workflows running on the **`prod`** branch of your repo can assume this role, and it can only push to this one
image repository and run commands on this one instance.

## 2. Put your secrets on the instance (once)

EC2 console → your instance → **Connect → Session Manager → Connect**, then:
```bash
sudo nano /opt/watchparty/.env
```
Paste (no quotes, no spaces around `=`), save, and lock the file down:
```dotenv
DATABASE_URL=<Neon direct URL>
DATABASE_URL_POOLED=<Neon pooled URL (-pooler host)>
SECRET_KEY=<a long random string>
FRONTEND_URL=https://<your-site>.netlify.app
DOMAIN=api.yourdomain.com
```
```bash
sudo chmod 600 /opt/watchparty/.env
```
These never go into GitHub or into the Docker image.

## 3. GitHub variables

Settings → Secrets and variables → Actions → **Variables** (they are not secrets):

| Name | Value |
|---|---|
| `AWS_REGION` | e.g. `ap-south-1` |
| `AWS_ROLE_ARN` | `arn:aws:iam::<account>:role/watchparty-github-deploy` |
| `ECR_REPOSITORY` | `watchparty-backend` |
| `EC2_INSTANCE_ID` | the `i-...` id from step 1.4 |
| `API_URL` | `https://api.yourdomain.com` (used for the post-deploy health check) |

## 4. Make `prod` the production branch

What makes `prod` "production" is three things working together: the deploy workflow only runs on pushes to
`prod`, the AWS role only trusts the `prod` branch, and (step 5) a ruleset stops anything unchecked reaching it.
Your default branch (`main`) can stay as it is.

### 4.1 Get the branch and switch to it
```bash
git fetch origin
git branch -r                       # is there an origin/prod?

# A) prod already exists on GitHub
git switch prod                     # creates a local prod that tracks origin/prod
git pull origin prod

# B) prod does not exist yet: create it from main
git switch main && git pull origin main
git switch -c prod
git push -u origin prod
```

### 4.2 Add the CI/CD files to it
Make sure the earlier fixes (host-refresh fix, Neon) are already on `prod`: the CI runs the host-refresh
regression test. If you applied the earlier ECS patch (`aws-cicd.patch`), undo it first with `git apply -R aws-cicd.patch`.
```bash
git switch -c ci-cd-setup           # branch off prod
git apply ec2-cicd.patch
git add -A && git commit -m "CI/CD: test on PR, deploy to EC2 from prod"
git push -u origin ci-cd-setup
gh pr create --base prod --fill     # or open the PR on github.com
```
The PR runs **Backend tests** and **Frontend build**. When both are green, merge it. The merge is the first
deploy: GitHub builds the image, pushes it to ECR and tells the instance to start it. Watch it in the Actions tab.
Afterwards `https://api.yourdomain.com/health` should answer `{"status":"ok",...}`.

### 4.3 Point the frontend at the new API
Netlify → Site settings → Environment variables: `VITE_API_URL` and `VITE_WS_URL` = `https://api.yourdomain.com`, then redeploy.
(You can switch off the Render service once this works.)

## 5. Lock `prod` so only tested code gets in

Settings → **Rules → Rulesets → New ruleset → New branch ruleset**
- Enforcement: **Active**; target branch: pattern `prod`
- ✅ Restrict deletions, ✅ Block force pushes
- ✅ **Require a pull request before merging** (0 approvals is fine when you work alone)
- ✅ **Require status checks to pass** → add **Backend tests** and **Frontend build**
  (they appear in the picker because the PR in step 4.2 already ran them)
- Leave the bypass list empty so it applies to you as well.

Also enable **Settings → General → Pull Requests → Allow auto-merge**.

GitHub can't reject a push after it has landed, so the ruleset blocks the *merge* until the tests are green.
That is how failing code never reaches `prod`.

## 6. Day-to-day

```bash
git switch -c my-change            # work on any branch, commit as usual
git push -u origin my-change
gh pr create --base prod --fill
gh pr merge --auto --squash        # merges by itself once the checks pass
```
1. The PR runs the backend socket tests and the frontend build.
2. Red check → it never merges. Fix, push again.
3. Green → it merges into `prod` → **Deploy** workflow: tests again → build image → push to ECR → instance deploys
   → health check → smoke test.
4. If the new version is unhealthy, the instance rolls back to the previous image by itself and the workflow turns red.

## 7. Operating it

| Need | How |
|---|---|
| Logs | Session Manager shell, then `cd /opt/watchparty && sudo docker compose --env-file .env --env-file image.env logs -f backend` |
| Status | same shell: `sudo docker ps` |
| Manual rollback | revert the merge via a new PR (cleanest), or in the shell edit `/opt/watchparty/image.env` to an older image tag (they are listed in ECR) and run `sudo docker compose --env-file .env --env-file image.env up -d` |
| Change a secret | edit `/opt/watchparty/.env`, then `sudo docker compose --env-file .env --env-file image.env up -d` |
| OS updates | shell: `sudo apt-get update && sudo apt-get -y upgrade`, reboot occasionally (`sudo reboot`; the stack restarts itself) |
| Rebuild from scratch | terminate the instance, repeat 1.4–1.7 and step 2, then re-run the Deploy workflow (Actions → Run workflow, branch `prod`). Data is safe in Neon |
| Stop paying | terminate the instance, **release the Elastic IP**, delete the ECR repository |

Notes:
- The deploy fetches `docker-compose.yml`, the Caddyfile and `deploy.sh` for the exact commit from
  `raw.githubusercontent.com`, so the repository must be **public** (it is today). If it becomes private, tell me and we'll
  ship those files differently.
- `render.yaml` and `runtime.txt` are only for Render and are unused here.
- `backend/integration_socket_test.py` is not part of CI: it expects `change_video` to leave the video paused, but the server starts playback.
- Dependabot (`.github/dependabot.yml`) opens weekly PRs to bump the GitHub Actions versions.
