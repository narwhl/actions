# setup-terraform

This GitHub Action is a wrapper for [`hashicorp/setup-terraform`](https://github.com/hashicorp/setup-terraform), it exposes the action inputs except for `cli_config_credentials_token` since Terraform Cloud will not be used. It authenticates automatically with a preconfigured custom HTTP state backend.


### Usage
```yml
steps:
- uses: narwhl/actions/setup-terraform@latest
  with:
    terraform_version: "1.13.0"

```

### Action Inputs

- `terraform_version`

- `terraform_wrapper`

- `enable_caching`

- `state` path to store the terraform state, must be unique per workflow

- `use_federated_token` uses the workload identity token issued by [imprint](../imprint) (`FEDERATED_TOKEN`), valid for 15 minutes; the state backend must trust the identity provider's issuer

- `endpoint` preconfigured
