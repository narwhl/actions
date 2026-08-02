# setup-consul

This GitHub Action installs the [Consul](https://developer.hashicorp.com/consul) CLI in your GitHub Actions workflow by resolving the requested version from [releases.hashicorp.com](https://releases.hashicorp.com/consul) and adding the binary to `PATH`. It follows the same structure as [`setup-terraform`](../setup-terraform) but leaves out Terraform-specific concerns (the command wrapper, CLI credentials file, and the darwin/arm64 fallback).

### Usage
```yml
steps:
- uses: narwhl/actions/setup-consul@latest
  with:
    consul_version: "1.18.2"
```

### Action Inputs

- `consul_version` — version of Consul CLI to install. Accepts a full version (`1.18.2`), a constraint starting with `<` (e.g. `<1.19.0`), or `latest`. Defaults to `latest`.
