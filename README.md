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

### [consul-action](consul-action)

Authenticates to Consul with an existing ACL token or a caller-supplied JWT, then reads Consul KV values into masked action outputs and environment variables. The `secrets` input follows the Vault Action mapping style, adapted to Consul's single value per KV key:

```text
{{ KV key }} | {{ Env/output variable name }}
```

Requests are separated by semicolons. When the mapped name is omitted, the final key segment is normalized automatically.

```yml
steps:
- uses: narwhl/actions/consul-action@latest
  id: consul
  with:
    url: https://consul.example.com
    method: jwt
    authMethod: github-actions
    jwt: ${{ steps.github-oidc.outputs.token }}
    secrets: |
      apps/api/database-password | DB_PASSWORD ;
      apps/api/npm-token | NPM_TOKEN
```

Supported authentication strategies:

- `token` (default): provide `token` with an existing Consul ACL token.
- `jwt`: provide `authMethod` and `jwt`; the caller-supplied JWT is exchanged through `/v1/acl/login`.

The action does not mint GitHub OIDC tokens. A GitHub-issued token can be supplied through the `jwt` input. Consul's browser-interactive `oidc` auth method is not supported. ACL tokens created by `jwt` authentication are destroyed by the action's post step.

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
