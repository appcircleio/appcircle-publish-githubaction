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
