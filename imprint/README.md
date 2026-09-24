# Imprint GitHub Action

This GitHub Action exchanges the runner's GitHub OIDC ID token for a workload identity federation token via [RFC 8693 token exchange](https://www.rfc-editor.org/rfc/rfc8693) against an OAuth 2.0 identity provider (defaults to `https://login.kris.engineer`).

The repository must be registered as a workload identity on the identity provider, with issuer `https://token.actions.githubusercontent.com` and the GitHub `sub` claim (e.g. `repo:narwhl/example:ref:refs/heads/main`) as its subject.

```yml
permissions:
  id-token: write

steps:
- name: Obtain workload identity token
  id: imprint
  uses: narwhl/actions/imprint@latest
  with:
    scope: terraform
```

### Action Inputs

- `endpoint` issuer URL of the identity provider, defaults to `https://login.kris.engineer`
- `id_token_audience` audience of the GitHub OIDC ID token, must match the workload identity's audience. Defaults to `endpoint`
- `scope` space-separated scopes to request, must be a subset of the workload identity's scopes. Defaults to all granted scopes
- `audience` audience of the issued access token. Defaults to the workload identity's audience, else the issuer

### Action Outputs

- `access_token` the issued access token, masked in logs. Also exported as the `FEDERATED_TOKEN` environment variable for [`setup-terraform`](../setup-terraform)
- `expires_in` lifetime of the token in seconds (15 minutes)
- `scope` scopes granted on the token

Imprint does not retrieve secrets. To read configuration or credentials, pass the token to [`consul-action`](../consul-action):

```yml
- uses: narwhl/actions/consul-action@latest
  with:
    url: https://consul.example.com
    method: jwt
    authMethod: passage
    jwt: ${{ steps.imprint.outputs.access_token }}
    secrets: |
      dynamic/cloudflare/api-token/ci | CLOUDFLARE_API_TOKEN
```
