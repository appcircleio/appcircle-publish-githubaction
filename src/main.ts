import * as core from '@actions/core'

import { getToken } from './api/authApi'
import {
  checkTaskStatus,
  getPublishProfileId,
  setApiEndpoint,
  uploadPublishApp,
  UploadServiceHeaders
} from './api/publishApi'

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

    setApiEndpoint(apiEndpoint)

    const validPlatforms = ['ios', 'android']
    if (!validPlatforms.includes(platform)) {
      core.setFailed(`Invalid platform: ${platform}. Use 'ios' or 'android'.`)
      return
    }

    const validExtensions = ['.apk', '.aab', '.ipa']
    const fileExtension = appPath.slice(appPath.lastIndexOf('.')).toLowerCase()
    if (!validExtensions.includes(fileExtension)) {
      core.setFailed(
        `Invalid file extension: ${appPath}. For Android, use .apk or .aab. For iOS, use .ipa.`
      )
      return
    }

    const loginResponse = await getToken(personalAPIToken, authEndpoint)
    UploadServiceHeaders.token = loginResponse.access_token
    console.log('Logged in to Appcircle successfully')

    const publishProfileId = await getPublishProfileId({
      platform,
      publishProfileName: publishProfile
    })

    const uploadResponse = await uploadPublishApp({
      platform,
      publishProfileId,
      appPath
    })
    const status = await checkTaskStatus(uploadResponse.taskId)

    if (!status) {
      core.setFailed(
        `${uploadResponse.taskId} id upload request failed with status Cancelled`
      )
      return
    }

    console.log(
      `${appPath} uploaded to the Appcircle Publish profile '${publishProfile}' successfully`
    )
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.setFailed(`An unexpected error occurred ${error}`)
    }
  }
}
