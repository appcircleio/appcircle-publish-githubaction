import axios, { AxiosRequestConfig } from 'axios'
import fs from 'fs'
import FormData from 'form-data'
import path from 'path'

let apiHostname = 'https://api.appcircle.io'
export const appcircleApi = axios.create({
  baseURL: `${apiHostname}/`
})

export function setApiEndpoint(endpoint: string): void {
  if (!endpoint) return
  apiHostname = endpoint.replace(/\/+$/, '')
  appcircleApi.defaults.baseURL = `${apiHostname}/`
}

async function uploadWithRetry(
  doUpload: () => Promise<any>,
  maxRetries = 5
): Promise<any> {
  let attempt = 0
  let delay = 1000
  while (true) {
    try {
      return await doUpload()
    } catch (error: any) {
      const status = error?.response?.status
      const retryable =
        status === 503 ||
        error?.code === 'ECONNRESET' ||
        (typeof error?.message === 'string' &&
          error.message.includes('socket hang up'))
      if (!retryable || attempt >= maxRetries) {
        throw error
      }
      attempt++
      const jitter = Math.floor(Math.random() * 300)
      await new Promise(resolve => setTimeout(resolve, delay + jitter))
      delay *= 2
    }
  }
}

export class UploadServiceHeaders {
  static token = ''

  static getHeaders = (): AxiosRequestConfig['headers'] => {
    let response: AxiosRequestConfig['headers'] = {
      accept: 'application/json',
      'User-Agent': 'Appcircle Github Action'
    }

    response.Authorization = `Bearer ${UploadServiceHeaders.token}`

    return response
  }
}

export async function getPublishProfiles(platform: string) {
  const response = await appcircleApi.get(`publish/v2/profiles/${platform}`, {
    headers: UploadServiceHeaders.getHeaders()
  })
  return response.data
}

// Resolve a publish profile id from its name for the given platform.
// Profile names are unique per (organization, platform), so the match is exact.
export async function getPublishProfileId(options: {
  platform: string
  publishProfileName: string
}): Promise<string> {
  const profiles = await getPublishProfiles(options.platform)
  const profile = (profiles ?? []).find(
    (p: any) => p.name === options.publishProfileName
  )
  if (!profile) {
    throw new Error(
      `Publish profile '${options.publishProfileName}' not found for platform '${options.platform}'.`
    )
  }
  return profile.id
}

export async function uploadPublishApp(options: {
  platform: string
  publishProfileId: string
  appPath: string
}) {
  const filePath = options.appPath
  const fileName = path.basename(filePath)
  const fileSize = fs.statSync(filePath).size
  const basePath = `publish/v1/profiles/${options.platform}/${options.publishProfileId}/app-versions`

  // Step 1: Get upload information (size-validated, returns the upload method)
  console.log('Getting file upload information...')
  const uploadInfoResponse = await appcircleApi.get<{
    fileId: string
    uploadUrl: string
    configuration?: {
      httpMethod: string
      signParameters: Record<string, string>
    }
  }>(basePath, {
    params: { action: 'uploadInformation', fileName, fileSize },
    headers: UploadServiceHeaders.getHeaders()
  })
  const { fileId, uploadUrl, configuration } = uploadInfoResponse.data
  const httpMethod = configuration?.httpMethod?.toUpperCase() ?? 'PUT'
  const signParameters = configuration?.signParameters ?? {}

  // Step 2: Upload the binary to object storage (PUT, or POST multipart for MinIO)
  console.log('Uploading file to Appcircle...')
  await uploadWithRetry(() => {
    if (httpMethod === 'POST') {
      const form = new FormData()
      for (const [key, value] of Object.entries(signParameters)) {
        form.append(key, value)
      }
      form.append('file', fs.createReadStream(filePath), fileName)
      return axios.post(uploadUrl, form, {
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: { ...form.getHeaders() }
      })
    }
    return axios.put(uploadUrl, fs.readFileSync(filePath), {
      headers: { 'Content-Type': 'application/octet-stream' },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    })
  })

  // Step 3: Commit the uploaded file to the resolved publish profile.
  console.log('Committing file upload...')
  const commitResponse = await appcircleApi.post<{ taskId: string }>(
    basePath,
    { fileId, fileName },
    {
      params: { action: 'commitFileUpload' },
      headers: UploadServiceHeaders.getHeaders()
    }
  )
  return commitResponse.data
}

export async function checkTaskStatus(taskId: string, currentAttempt = 0) {
  const response = await appcircleApi.get(`/task/v1/tasks/${taskId}`, {
    headers: UploadServiceHeaders.getHeaders()
  })

  if (response?.data.stateValue == 1 && currentAttempt < 100) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    return checkTaskStatus(taskId, currentAttempt + 1)
  }

  if (response.data.stateValue === 2) {
    return false
  }

  return true
}
