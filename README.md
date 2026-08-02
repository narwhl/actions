# narwhl/actions

A collection of GitHub Actions for keyless authentication and HashiCorp tooling.

Every push force-updates the `latest` tag (see [`.github/workflows/tag.yml`](.github/workflows/tag.yml)), so any action below can be referenced as `@latest`. Note this tag is mutable — pin to a commit SHA if you need stable behavior.

## Actions

### [setup-consul](setup-consul)

Installs the [Consul](https://developer.hashicorp.com/consul) CLI in your workflow, resolving the requested version from [releases.hashicorp.com](https://releases.hashicorp.com/consul) and adding the binary to `PATH`.

```yml
steps:
- uses: narwhl/actions/setup-consul@latest
  with:
    consul_version: "1.18.2"
```

### [setup-terraform](setup-terraform)

Wraps [`hashicorp/setup-terraform`](https://github.com/hashicorp/setup-terraform) and authenticates automatically against a custom HTTP state backend (defaults to `terraform.narwhl.workers.dev`, overridable via `endpoint`), so no `cli_config_credentials_token` is required. Pass `use_federated_token: true` to authenticate with a token issued by [`imprint`](imprint), valid 1 hour instead of GitHub's ~5 minutes.

```yml
steps:
- uses: narwhl/actions/setup-terraform@latest
  with:
    state: my-state
    terraform_version: "1.13.0"
```

### [imprint](imprint)

Authenticates the runner to a Security Token Service via its OIDC ID token and exchanges it for short-lived resource credentials, exposed as environment variables for subsequent steps.

```yml
steps:
- uses: narwhl/actions/imprint@latest
  with:
    scope: tailscale cloudflare
```

## License

[MPL-2.0](https://www.mozilla.org/en-US/MPL/2.0/)
