# Imprint GitHub Action

This GitHub Action authenticates itself to a Security Token Service API running on Cloudflare Workers
```yml
- name: Keyless Authentication for exchanging resource token
  uses: narwhl/actions/imprint@latest
  with:
    scope: tailscale cloudflare
```

Subsequent steps in the Action can then access requested resource access credentials via environment variables
