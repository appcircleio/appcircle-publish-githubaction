import * as core from '@actions/core'
import * as authApi from '../src/api/authApi'
import { run } from '../src/main'

const MESSAGE =
  'Set both authEndpoint and apiEndpoint for a self-hosted Appcircle server, or leave both empty for the Appcircle cloud.'

describe('validateEndpoints', () => {
  it('accepts the cloud defaults and a full self-hosted pair', () => {
    expect(() => authApi.validateEndpoints(undefined, undefined)).not.toThrow()
    expect(() => authApi.validateEndpoints('', ' ')).not.toThrow()
    expect(() =>
      authApi.validateEndpoints(
        'https://auth.appcircle.io/',
        'https://API.appcircle.io'
      )
    ).not.toThrow()
    expect(() =>
      authApi.validateEndpoints(
        'https://auth.example.test',
        'https://api.example.test/'
      )
    ).not.toThrow()
  })

  it('rejects a self-hosted auth endpoint without a self-hosted API endpoint', () => {
    expect(() =>
      authApi.validateEndpoints('https://auth.example.test', '')
    ).toThrow(MESSAGE)
    expect(() =>
      authApi.validateEndpoints(
        'https://auth.example.test',
        'https://api.appcircle.io'
      )
    ).toThrow(MESSAGE)
  })

  it('rejects a self-hosted API endpoint without a self-hosted auth endpoint', () => {
    expect(() =>
      authApi.validateEndpoints('', 'https://api.example.test')
    ).toThrow(MESSAGE)
  })
})

describe('run', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    jest.restoreAllMocks()
  })

  it('stops before any request when only one endpoint is self-hosted', async () => {
    process.env['INPUT_PERSONALAPITOKEN'] = 'my-pat'
    process.env['INPUT_AUTHENDPOINT'] = 'https://auth.example.test'
    process.env['INPUT_APIENDPOINT'] = ''
    process.env['INPUT_PLATFORM'] = 'ios'
    process.env['INPUT_PUBLISHPROFILE'] = 'Example Publish Profile'
    process.env['INPUT_APPPATH'] = 'app.ipa'
    process.env['INPUT_UPLOAD'] = 'true'
    process.env['INPUT_PUBLISH'] = 'false'
    const getToken = jest
      .spyOn(authApi, 'getToken')
      .mockRejectedValue(new Error('getToken must not be called'))
    const setFailed = jest
      .spyOn(core, 'setFailed')
      .mockImplementation(() => undefined)

    await run()

    expect(setFailed).toHaveBeenCalledWith(MESSAGE)
    expect(getToken).not.toHaveBeenCalled()
  })
})
