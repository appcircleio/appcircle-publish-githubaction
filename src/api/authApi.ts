import axios from 'axios'

export async function getToken(
  pat: string,
  authEndpoint = 'https://auth.appcircle.io',
  subOrganizationId?: string
): Promise<any> {
  const params = new URLSearchParams()
  params.append('pat', pat)

  const tokenPath = subOrganizationId ? '/auth/v2/token' : '/auth/v1/token'
  if (subOrganizationId) {
    params.append('subOrganizationId', subOrganizationId)
  }

  const authHostname = authEndpoint.replace(/\/+$/, '')
  const response = await axios.post(
    `${authHostname}${tokenPath}`,
    params.toString(),
    {
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded'
      }
    }
  )
  return response.data
}

const CLOUD_AUTH_ENDPOINT = 'https://auth.appcircle.io'
const CLOUD_API_ENDPOINT = 'https://api.appcircle.io'

function isCloudEndpoint(
  endpoint: string | undefined,
  cloudEndpoint: string
): boolean {
  const value = (endpoint ?? '').trim().replace(/\/+$/, '')
  return value === '' || value.toLowerCase() === cloudEndpoint
}

export function validateEndpoints(
  authEndpoint: string | undefined,
  apiEndpoint: string | undefined
): void {
  if (
    isCloudEndpoint(authEndpoint, CLOUD_AUTH_ENDPOINT) !==
    isCloudEndpoint(apiEndpoint, CLOUD_API_ENDPOINT)
  ) {
    throw new Error(
      'Set both authEndpoint and apiEndpoint for a self-hosted Appcircle server, or leave both empty for the Appcircle cloud.'
    )
  }
}
