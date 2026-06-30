import axios from 'axios'

export async function getToken(
  pat: string,
  authEndpoint = 'https://auth.appcircle.io'
): Promise<any> {
  const params = new URLSearchParams()
  params.append('pat', pat)

  const authHostname = authEndpoint.replace(/\/+$/, '')
  const response = await axios.post(
    `${authHostname}/auth/v1/token`,
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
