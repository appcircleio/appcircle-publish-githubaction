import * as core from '@actions/core'

import { getToken } from './api/authApi'
import {
  checkTaskStatus,
  getActivePublishCountForProfile,
  getLatestAppVersionId,
  getPublishId,
  getPublishProfileId,
  getReleaseCandidateVersionId,
  markReleaseCandidate,
  pollPublishStatus,
  setApiEndpoint,
  startPublish,
  uploadPublishApp,
  UploadServiceHeaders
} from './api/publishApi'

function asBool(value: string): boolean {
  return (value || 'false').toLowerCase() === 'true'
}

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const personalAPIToken = core.getInput('personalAPIToken')
    const authEndpoint =
      core.getInput('authEndpoint') || 'https://auth.appcircle.io'
    const apiEndpoint =
      core.getInput('apiEndpoint') || 'https://api.appcircle.io'
    const platform = core.getInput('platform')?.toLowerCase()
    const publishProfile = core.getInput('publishProfile')
    const appPath = core.getInput('appPath')
    const upload = asBool(core.getInput('upload'))
    const publish = asBool(core.getInput('publish'))

    setApiEndpoint(apiEndpoint)

    // --- Validation -------------------------------------------------------
    if (!upload && !publish) {
      core.setFailed(
        "Nothing to do: set 'upload' and/or 'publish' to true."
      )
      return
    }

    const validPlatforms = ['ios', 'android']
    if (!validPlatforms.includes(platform)) {
      core.setFailed(`Invalid platform: ${platform}. Use 'ios' or 'android'.`)
      return
    }

    if (upload) {
      if (!appPath) {
        core.setFailed("'appPath' is required when 'upload' is true.")
        return
      }
      const validExtensions = ['.apk', '.aab', '.ipa']
      const fileExtension = appPath
        .slice(appPath.lastIndexOf('.'))
        .toLowerCase()
      if (!validExtensions.includes(fileExtension)) {
        core.setFailed(
          `Invalid file extension: ${appPath}. For Android, use .apk or .aab. For iOS, use .ipa.`
        )
        return
      }
    }

    // --- Auth + profile ---------------------------------------------------
    const loginResponse = await getToken(personalAPIToken, authEndpoint)
    UploadServiceHeaders.token = loginResponse.access_token
    console.log('Logged in to Appcircle successfully')

    const publishProfileId = await getPublishProfileId({
      platform,
      publishProfileName: publishProfile
    })

    // Guard: never start a new publish if one is already running for the profile.
    if (publish) {
      const active = await getActivePublishCountForProfile(publishProfileId)
      if (active > 0) {
        core.setFailed(
          `A publish is already in progress for profile '${publishProfile}'. Not starting a new one.`
        )
        return
      }
    }

    let appVersionId: string | undefined

    // --- Upload -----------------------------------------------------------
    if (upload) {
      const uploadResponse = await uploadPublishApp({
        platform,
        publishProfileId,
        appPath
      })
      const ok = await checkTaskStatus(uploadResponse.taskId)
      if (!ok) {
        core.setFailed(
          `${uploadResponse.taskId} id upload request failed with status Cancelled`
        )
        return
      }
      appVersionId = await getLatestAppVersionId({ platform, publishProfileId })
      console.log(
        `${appPath} uploaded to the Appcircle Publish profile '${publishProfile}' successfully`
      )
    }

    // --- Publish ----------------------------------------------------------
    if (publish) {
      if (upload && appVersionId) {
        // Both: mark the freshly uploaded version as release candidate, then publish it.
        await markReleaseCandidate({ platform, publishProfileId, appVersionId })
        console.log('Marked the uploaded version as release candidate.')
      } else {
        // Publish-only: publish the profile's current release candidate.
        appVersionId = await getReleaseCandidateVersionId({
          platform,
          publishProfileId
        })
      }

      const publishId = await getPublishId({
        platform,
        publishProfileId,
        appVersionId: appVersionId as string
      })
      await startPublish({ platform, publishProfileId, publishId })
      console.log(`Publish flow started for profile '${publishProfile}'.`)

      const success = await pollPublishStatus({
        platform,
        publishProfileId,
        appVersionId: appVersionId as string
      })
      if (!success) {
        core.setFailed('Publish flow failed.')
        return
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.setFailed(`An unexpected error occurred ${error}`)
    }
  }
}
