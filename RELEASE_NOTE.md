# Release Notes for v0.1.0

## :rocket: New Features

### Initial release — Publish module support

The Appcircle Publish GitHub Action uploads an application binary (`.ipa`,
`.apk`, or `.aab`) to an existing Appcircle **Publish** profile, creating a new
app version ready for the profile's app store publishing flow.

```yml
- name: Upload App to Appcircle Publish
  uses: appcircleio/appcircle-publish-githubaction
  with:
    personalAPIToken: ${{ secrets.AC_PERSONAL_API_TOKEN }}
    platform: ios # or android
    publishProfile: "My Publish Profile"
    appPath: ./app.ipa
```

- Resolves the Publish profile by name for the selected platform (`ios` /
  `android`).
- Uploads via the size-validated, signed-URL (Resource Server v2) flow with
  retry, then polls the upload task to completion.

### Self-Hosted Appcircle Support

Optional `authEndpoint` / `apiEndpoint` inputs target a self-hosted Appcircle
installation. Both default to the Appcircle cloud, so existing cloud workflows
need no change.

> **Self-signed certificates:** if your self-hosted server uses a self-signed or
> private-CA certificate, trust the CA on the runner via `NODE_EXTRA_CA_CERTS`
> (the action does not disable TLS verification).
