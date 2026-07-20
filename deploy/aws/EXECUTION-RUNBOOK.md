# DEP.2 strategist execution runbook

Only the strategist runs AWS or Terraform commands in this document. This is a
single local-state Terraform root; do not run `stack.yaml`, CloudFormation,
CDK, modules, or workspaces for DEP.2.

1. Authenticate the approved profile and prove the account.

   ```bash
   export AWS_PROFILE=sigil-deploy AWS_REGION=us-west-2
   aws sts get-caller-identity --profile "$AWS_PROFILE"
   ```

   Expected: prints one JSON identity for the approved billing account and
   deployment principal. Stop on any other account. This runbook assumes
   configured access keys rather than SSO.

2. Create an emergency-only SSH key outside the repository and fill in local
   Terraform inputs.

   ```bash
   install -d -m 0700 "$HOME/.ssh/sigil-chat-deploy"
   ssh-keygen -t ed25519 -f "$HOME/.ssh/sigil-chat-deploy/id_ed25519" -N '' -C sigil-chat-deploy
   cp deploy/aws/terraform/terraform.tfvars.example deploy/aws/terraform/terraform.tfvars
   $EDITOR deploy/aws/terraform/terraform.tfvars
   ```

   Expected: `terraform.tfvars` contains profile `sigil-deploy`, region
   `us-west-2`, a real hostname, existing public-key path, and one trusted
   `/32` administrator CIDR. It contains no AWS credential or private key.

3. Initialize and static-validate the root module.

   ```bash
   cd deploy/aws/terraform
   terraform init
   terraform fmt -check -recursive
   terraform validate
   ```

   Expected: provider installation completes, formatting has no diff, and
   validation ends `Success! The configuration is valid.` No resource exists yet.

4. Save the required plan review artifact before an apply.

   ```bash
   REPORT=../../../docs.local/DEP2-EXECUTION-REPORT.md
   printf '\n## Terraform plan review\n\n' >>"$REPORT"
   terraform plan -out=plan.tfplan
   terraform show -no-color plan.tfplan | tee plan.txt | tee -a "$REPORT"
   ```

   Expected: exactly one key pair, security group, EC2 instance, Elastic IP,
   and EIP association; Route53 is zero or one record. Stop if any other
   billable service is in the plan.

5. Apply that exact reviewed plan and record the instance/EIP.

   ```bash
   terraform apply plan.tfplan
   EIP=$(terraform output -raw elastic_ip)
   INSTANCE=$(terraform output -raw instance_id)
   cd ../../..
   printf '\n## Terraform apply receipt\n\n- instance: %s\n- elastic IP: %s\n' "$INSTANCE" "$EIP" >>docs.local/DEP2-EXECUTION-REPORT.md
   ```

   Expected: Terraform reports five resources added, or six with Route53.

6. Point the public A record at the EIP if optional Route53 was not supplied;
   do not start Caddy until DNS is correct.

   ```bash
   PUBLIC_HOST='approved-host.example.com'
   dig +short A "$PUBLIC_HOST"
   ```

   Expected: the answer is exactly `$EIP`.

7. Wait for user-data's Docker installation and copy only the deployment files.

   ```bash
   until ssh -o StrictHostKeyChecking=accept-new -i "$HOME/.ssh/sigil-chat-deploy/id_ed25519" ubuntu@"$EIP" 'docker compose version'; do sleep 10; done
   rsync -az deploy/aws/ -e "ssh -i $HOME/.ssh/sigil-chat-deploy/id_ed25519" ubuntu@"$EIP":/tmp/sigil-chat-deploy/
   ```

   Expected: Docker Compose prints its version. Rsync must not list `.env`,
   `.data`, `node_modules`, `.output`, or `docs.local`.

8. Download the four-image digest manifest from the successful `prod` workflow,
   create host-only secret files, and install the deployment directory.

   ```bash
   ssh -i "$HOME/.ssh/sigil-chat-deploy/id_ed25519" ubuntu@"$EIP" \
     "sudo /tmp/sigil-chat-deploy/provision-host.sh --public-host '$PUBLIC_HOST' --mode prepare"
   ```

   Expected: the deployment environment exists at `/opt/sigil-chat/deploy`.
   Copy the downloaded `sigil-images.env` there:

   ```bash
   scp -i "$HOME/.ssh/sigil-chat-deploy/id_ed25519" sigil-images.env ubuntu@"$EIP":/tmp/sigil-images.env
   ssh -i "$HOME/.ssh/sigil-chat-deploy/id_ed25519" ubuntu@"$EIP" \
     'sudo install -m 0600 /tmp/sigil-images.env /opt/sigil-chat/deploy/sigil-images.env'
   ```

   No secret prints or enters the image manifest.

9. Validate and pull all four immutable images, stop the public edge, then
   replace the private services. This ordering applies to first deploys,
   upgrades, and rollbacks: a failed update must leave the edge stopped. Eve
   uses process liveness for container ordering, so this step does not require
   a model credential yet.

   ```bash
   ssh -i "$HOME/.ssh/sigil-chat-deploy/id_ed25519" ubuntu@"$EIP" \
     "sudo /opt/sigil-chat/deploy/update-images.sh /opt/sigil-chat/deploy/sigil-images.env"
   ```

   Expected: `web`, `eve`, and `gonk` are running; `edge` is intentionally
   stopped, including during an upgrade or rollback. The update command
   validates all four digests before Docker runs. No Eve or Gonk port is
   public.

10. Complete device auth as the Eve service identity, prove model-aware
    readiness, activate the edge, then verify app login, model response, and a
    container restart from a phone. Repeat this readiness gate after every
    upgrade or rollback before restarting edge. Docker uses Eve process
    liveness for startup ordering, so the private runtime comes up before this
    credential exists.

    ```bash
    ssh -i "$HOME/.ssh/sigil-chat-deploy/id_ed25519" ubuntu@"$EIP" \
      'sudo docker compose --env-file /opt/sigil-chat/deploy/deploy.env.local -f /opt/sigil-chat/deploy/compose.yaml exec eve codex login --device-auth && sudo docker compose --env-file /opt/sigil-chat/deploy/deploy.env.local -f /opt/sigil-chat/deploy/compose.yaml exec eve pnpm --filter sigil-chat-agent healthcheck && sudo docker compose --env-file /opt/sigil-chat/deploy/deploy.env.local -f /opt/sigil-chat/deploy/compose.yaml up -d edge'
    curl --fail --show-error --connect-timeout 15 "https://$PUBLIC_HOST/healthz"
    ```

    Expected: a device-auth URL/code is displayed and completed privately, then
    the model-aware healthcheck exits zero, edge starts, and curl prints `ok`.
    Never copy the code into the report.

11. Teardown proof: revoke device auth, remove app state, destroy Terraform,
    and prove the public origin gone.

    ```bash
    ssh -i "$HOME/.ssh/sigil-chat-deploy/id_ed25519" ubuntu@"$EIP" \
      'sudo docker compose --env-file /opt/sigil-chat/deploy/deploy.env.local -f /opt/sigil-chat/deploy/compose.yaml down --volumes --remove-orphans && sudo rm -rf /srv/sigil-chat /opt/sigil-chat'
    cd deploy/aws/terraform
    terraform destroy
    curl --fail --connect-timeout 5 "https://$PUBLIC_HOST/healthz" && exit 1 || true
    ```

    Expected: all Terraform resources are destroyed; curl cannot resolve or
    connect. Append secret-free receipts to the report.
