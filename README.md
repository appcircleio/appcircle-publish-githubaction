## Appcircle Publish

Upload an application binary (`.ipa`, `.apk`, or `.aab`) directly to an Appcircle
**Publish** profile from your GitHub workflow. The uploaded binary becomes a new
app version on the target Publish profile, ready for the profile's configured
app store publishing flow.

Learn more about
[Appcircle Publish](https://appcircle.io/publish-to-stores?utm_source=github&utm_medium=plugin&utm_campaign=publish).

### System Requirements

**Compatible Agents:**

- macos-14 (arm64)
- Ubuntu-22.04

Note: Both Appcircle Cloud and self-hosted Appcircle installations are supported.
See [Self-Hosted Appcircle](#self-hosted-appcircle) below to configure custom
endpoints.

![Appcircle Publish](images/publish.png)

### Generating/Managing the Personal API Tokens

To generate a Personal API Token:

1. Go to the My Organization screen (second option at the bottom left).
2. Find the Personal API Token section in the top right corner.
3. Press the "Generate Token" button to generate your first token.

![Token Generation](images/PAT.png)

## How to use Appcircle Publish Action

This action uploads a binary to an existing Publish profile. Create the Publish
profile in Appcircle first, then reference it by name. Publish profile names are
unique per platform.

```yml
- name: Upload App to Appcircle Publish
  id: upload-to-appcircle-publish
  uses: appcircleio/appcircle-publish-githubaction
  with:
    personalAPIToken: ${{ secrets.AC_PERSONAL_API_TOKEN }}
    platform: PLATFORM # "ios" or "android"
    publishProfile: PUBLISH_PROFILE_NAME
    appPath: APP_PATH
```

- `personalAPIToken`: The Appcircle Personal API token is utilized to
  authenticate and secure access to Appcircle services, ensuring that only
  authorized users can perform actions within the platform.
- `platform`: Target platform of the Publish profile. Must be `ios` or
  `android`.
- `publishProfile`: Name of the Publish profile to upload the binary to. The
  name is resolved to the profile for the selected platform.
- `appPath`: Indicates the file path to the application that will be uploaded to
  the Appcircle Publish profile. For iOS use a `.ipa` file; for Android use an
  `.apk` or `.aab` file.

### Self-Hosted Appcircle

If you run a self-hosted Appcircle installation, point the action to your own
servers with the optional `authEndpoint` and `apiEndpoint` inputs. When omitted,
they default to the Appcircle cloud (`https://auth.appcircle.io` and
`https://api.appcircle.io`), so existing cloud workflows keep working without any
change.

```yml
- name: Upload App to Appcircle Publish
  uses: appcircleio/appcircle-publish-githubaction
  with:
    personalAPIToken: ${{ secrets.AC_PERSONAL_API_TOKEN }}
    platform: PLATFORM # "ios" or "android"
    publishProfile: PUBLISH_PROFILE_NAME
    appPath: APP_PATH
    authEndpoint: https://auth.your-appcircle-domain.com
    apiEndpoint: https://api.your-appcircle-domain.com
```

- `authEndpoint`: Base URL of the self-hosted Appcircle authentication server.
  Optional; defaults to `https://auth.appcircle.io`.
- `apiEndpoint`: Base URL of the self-hosted Appcircle API server. Optional;
  defaults to `https://api.appcircle.io`.

> **Self-signed or private CA certificates:** If your self-hosted Appcircle server
> uses a self-signed certificate (or one issued by a private/internal CA), requests
> will fail certificate validation. The action does not disable TLS verification.
> Trust the server's CA on the runner — set the `NODE_EXTRA_CA_CERTS` environment
> variable to a PEM file containing the CA certificate, or add the CA to the system
> certificate store.

### Leveraging Environment Variables

Utilize environment variables seamlessly by substituting the parameters with
${{ envs.VARIABLE_NAME }} in your task inputs. The action automatically
retrieves values from the specified environment variables within your pipeline.

**Ensure that this action is added after build steps have been completed.**

If you would like to learn more about this action and how to utilize it in your
projects, please
[contact us](https://appcircle.io/contact?utm_source=github&utm_medium=plugin&utm_campaign=publish)

### Reference

For more detailed instructions and support, visit the
[Appcircle Publish documentation](https://appcircle.io/publish-to-stores?utm_source=github&utm_medium=plugin&utm_campaign=publish).
