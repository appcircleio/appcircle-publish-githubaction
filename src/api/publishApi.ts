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

// Human-readable names for the numeric publish flow step statuses.
const FLOW_STEP_STATUS: Record<number, string> = {
  0: 'Success',
  1: 'Failed',
  2: 'Cancelled',
  3: 'Timeout',
  90: 'Waiting',
  91: 'Running',
  92: 'Completing',
  99: 'Unknown',
  100: 'Skipped',
  200: 'Not Started',
  201: 'Stopped',
  202: 'In Progress',
  203: 'Awaiting Response'
}

function stepStatusName(status: number): string {
  return FLOW_STEP_STATUS[status] ?? `Unknown (${status})`
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

export async function getAppVersions(options: {
  platform: string
  publishProfileId: string
}): Promise<any[]> {
  const response = await appcircleApi.get(
    `publish/v2/profiles/${options.platform}/${options.publishProfileId}/app-versions`,
    { headers: UploadServiceHeaders.getHeaders() }
  )
  return Array.isArray(response.data) ? response.data : (response.data?.data ?? [])
}

// The most recently created app version (first item) — used after an upload to
// identify the version that was just created.
export async function getLatestAppVersionId(options: {
  platform: string
  publishProfileId: string
}): Promise<string> {
  const versions = await getAppVersions(options)
  if (!versions.length) {
    throw new Error('No app versions found on the publish profile after upload.')
  }
  return versions[0].id
}

// The profile's current release candidate (publish-only mode publishes this).
export async function getReleaseCandidateVersionId(options: {
  platform: string
  publishProfileId: string
}): Promise<string> {
  const versions = await getAppVersions(options)
  const rc = versions.find((v: any) => v.releaseCandidate === true)
  if (!rc) {
    throw new Error(
      'No release candidate app version found on the publish profile. Mark a version as release candidate (or enable upload) before publishing.'
    )
  }
  return rc.id
}

export async function markReleaseCandidate(options: {
  platform: string
  publishProfileId: string
  appVersionId: string
}): Promise<void> {
  await appcircleApi.patch(
    `publish/v2/profiles/${options.platform}/${options.publishProfileId}/app-versions/${options.appVersionId}`,
    { ReleaseCandidate: true },
    {
      params: { action: 'releaseCandidate' },
      headers: UploadServiceHeaders.getHeaders()
    }
  )
}

// Number of in-progress publishes for a given profile (scope: target profile).
export async function getActivePublishCountForProfile(
  publishProfileId: string
): Promise<number> {
  const response = await appcircleApi.get(
    `build/v1/queue/my-dashboard`,
    {
      params: { page: 1, size: 1000 },
      headers: UploadServiceHeaders.getHeaders()
    }
  )
  const items = response.data?.data ?? []
  return items.filter(
    (p: any) => p.publishId != null && p.profileId === publishProfileId
  ).length
}

export async function uploadPublishApp(options: {
  platform: string
  publishProfileId: string
  appPath: string
}) {
  const filePath = options.appPath
  const fileName = path.basename(filePath)
  const fileSize = fs.statSync(filePath).size
  // Profile listing is v2, but the signed-URL upload/commit actions live on v1.
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

// Fetch the publish flow for an app version and return its run id (publishId).
export async function getPublishId(options: {
  platform: string
  publishProfileId: string
  appVersionId: string
}): Promise<string> {
  const response = await appcircleApi.get(
    `publish/v2/profiles/${options.platform}/${options.publishProfileId}/app-versions/${options.appVersionId}/publish`,
    { headers: UploadServiceHeaders.getHeaders() }
  )
  const steps = response.data?.steps ?? []
  const publishId = steps[0]?.publishId
  if (!publishId) {
    throw new Error(
      'No publish flow steps found for the app version. Configure a publish flow on the profile first.'
    )
  }
  return publishId
}

export async function startPublish(options: {
  platform: string
  publishProfileId: string
  publishId: string
}): Promise<void> {
  await appcircleApi.post(
    `publish/v2/profiles/${options.platform}/${options.publishProfileId}/publish/${options.publishId}`,
    '{}',
    {
      params: { action: 'restart' },
      headers: {
        ...UploadServiceHeaders.getHeaders(),
        'Content-Type': 'application/json'
      }
    }
  )
}

// Poll the publish status until it terminates. status: 0=success, 1=failed,
// anything else = still running. Prints step-level progress as it advances.
export async function pollPublishStatus(options: {
  platform: string
  publishProfileId: string
  appVersionId: string
  intervalMs?: number
  maxAttempts?: number
}): Promise<boolean> {
  const interval = options.intervalMs ?? 5000
  const maxAttempts = options.maxAttempts ?? 240 // ~20 min at 5s
  const seenStep: Record<string, number> = {}

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await appcircleApi.get(
      `publish/v1/profiles/${options.platform}/${options.publishProfileId}/app-versions/${options.appVersionId}/publish`,
      { headers: UploadServiceHeaders.getHeaders() }
    )
    const data = response.data ?? {}
    const steps = data.steps ?? []
    for (const step of steps) {
      const key = step.id ?? step.name
      if (key && seenStep[key] !== step.status) {
        seenStep[key] = step.status
        console.log(`  step '${step.name}' -> ${stepStatusName(step.status)}`)
      }
    }

    const status = typeof data.status === 'number' ? data.status : 99
    if (status === 0) {
      console.log('Publish completed successfully.')
      return true
    }
    if (status === 1) {
      console.log('Publish failed.')
      return false
    }
    await new Promise(resolve => setTimeout(resolve, interval))
  }
  throw new Error('Publish status polling timed out.')
}
