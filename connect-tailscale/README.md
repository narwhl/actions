# connect-tailscale

Connects the runner to a [Tailscale](https://tailscale.com) tailnet: installs matching binaries, starts `tailscaled` with in-memory state, and runs `tailscale up`, cleaning up in a post step.

Forked from [`tailscale/github-action`](https://github.com/tailscale/github-action) (BSD-3-Clause, see [LICENSE](LICENSE)). Upstream behavior is preserved with one addition:

## What's different

Upstream's workload-identity path always requests the OIDC token from the runner itself via `core.getIDToken()`, which only works for GitHub's job-scoped token (~5 minute lifetime). This fork adds an **`id-token`** input: when set, the token is passed through to `tailscale up --id-token` directly and no runner OIDC request is made. This lets you authenticate with a token minted by any identity provider your tailnet trusts — for example one exchanged by [`imprint`](../imprint) via its `access_token` output:

```yml
steps:
  - uses: narwhl/actions/imprint@latest
    id: imprint
    with:
      scope: tailscale

  - uses: narwhl/actions/connect-tailscale@latest
    with:
      oauth-client-id: ${{ vars.TAILSCALE_CLIENT_ID }}
      tags: tag:ci
      id-token: ${{ steps.imprint.outputs.access_token }}
```

When `id-token` is omitted, behavior is identical to upstream: provide `audience` + `oauth-client-id` + `tags` (token requested from the runner), `oauth-secret` + `tags`, or a classic `authkey`. The `audience` input is not required with `id-token` — Tailscale validates the token's `aud` claim server-side against the OIDC identity configuration. The default installed version is refreshed periodically and may differ from upstream's.

## Inputs

| Input | Description | Default |
| --- | --- | --- |
| `oauth-client-id` | Tailscale OAuth or OIDC federated identity client ID. | |
| `id-token` | Federated OIDC ID token from an external provider; skips the runner OIDC request. | |
| `audience` | Audience for the runner-requested OIDC token. Ignored when `id-token` is set. | |
| `oauth-secret` | Tailscale OAuth client secret. | |
| `tags` | Comma-separated tags applied to the node (required for OAuth/federated auth). | |
| `authkey` | Classic Tailscale auth key (deprecated upstream). | |
| `version` | Tailscale version, `latest`, or `unstable`. | `1.102.4` |
| `args` / `tailscaled-args` | Extra args for `tailscale up` / `tailscaled`. | |
| `hostname` | Fixed hostname; generated from the runner name when empty. | |
| `timeout` / `retry` | `tailscale up` timeout and retry count. | `2m` / `5` |
| `use-cache` | Cache Tailscale binaries between runs. | `true` |
| `statedir` | State directory; in-memory state when empty. | |
| `sha256sum` | Expected tarball checksum. | |
| `ping` | Hosts to `tailscale ping` after connecting. | |
| `log-mode` | `grouped`, `normal`, or `quiet` log output. | `grouped` |

## Development

```sh
npm install
npm run build   # ncc bundle to dist/
```

`dist/` is committed, as the action runs directly from it.
