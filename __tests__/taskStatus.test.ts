import http from 'http'
import { AddressInfo } from 'net'
import { TaskPollOptions } from '../src/api/taskStatus'
import { checkTaskStatus, setApiEndpoint } from '../src/api/publishApi'

const STATES: Record<string, [number, string]> = {
  unknown: [0, 'Unknown'],
  begin: [1, 'Begin'],
  canceled: [2, 'Canceled'],
  completed: [3, 'Completed']
}
const scripts: Record<string, string[]> = {}
const hanging: http.ServerResponse[] = []
const calls: Record<string, number> = {}

const server = http.createServer((req, res) => {
  const taskId = (req.url ?? '').split('/').pop() as string
  const count = (calls[taskId] = (calls[taskId] ?? 0) + 1)
  const script = scripts[taskId] ?? ['missing']
  const step = script[Math.min(count, script.length) - 1]
  if (step === 'missing') {
    res.writeHead(204)
    res.end()
  } else if (step === 'drop') {
    req.socket.destroy()
  } else if (step === 'hang') {
    hanging.push(res)
  } else if (step === 'html') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<html>login</html>')
  } else if (step.startsWith('http')) {
    res.writeHead(Number(step.slice(4)), { 'Content-Type': 'application/json' })
    res.end('{"message":"error"}')
  } else {
    const [stateValue, stateName] = STATES[step]
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ taskId, stateValue, stateName }))
  }
})

type Clock = Required<Pick<TaskPollOptions, 'now' | 'sleep'>>

function fakeClock(): Clock & { sleeps: number[] } {
  let time = 0
  const sleeps: number[] = []
  return {
    now: () => time,
    sleep: async (ms: number) => {
      sleeps.push(ms)
      time += ms
    },
    sleeps
  }
}

let nextId = 0
function task(...script: string[]): string {
  const taskId = `task-${++nextId}`
  scripts[taskId] = script
  return taskId
}

beforeAll(done => {
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address() as AddressInfo
    setApiEndpoint(`http://127.0.0.1:${port}`)
    done()
  })
})

afterAll(done => {
  server.closeAllConnections()
  server.close(() => done())
})

describe('checkTaskStatus', () => {
  it('resolves when the task reaches Completed after Begin', async () => {
    const clock = fakeClock()
    const taskId = task('begin', 'begin', 'completed')
    await expect(checkTaskStatus(taskId, clock)).resolves.toBeUndefined()
    expect(calls[taskId]).toBe(3)
    expect(clock.sleeps).toEqual([2000, 2000])
  })

  it('keeps polling while the state is Unknown', async () => {
    const taskId = task('unknown', 'unknown', 'completed')
    await expect(checkTaskStatus(taskId, fakeClock())).resolves.toBeUndefined()
    expect(calls[taskId]).toBe(3)
  })

  it('fails with the canceled message on state 2', async () => {
    const taskId = task('begin', 'canceled')
    await expect(checkTaskStatus(taskId, fakeClock())).rejects.toThrow(
      `${taskId} id upload request failed with status Cancelled`
    )
  })

  it('waits for a task that appears after a short 204', async () => {
    const taskId = task('missing', 'missing', 'begin', 'completed')
    await expect(checkTaskStatus(taskId, fakeClock())).resolves.toBeUndefined()
    expect(calls[taskId]).toBe(4)
  })

  it('fails when the task stays missing past the grace period', async () => {
    const taskId = task('missing')
    await expect(checkTaskStatus(taskId, fakeClock())).rejects.toThrow(
      `Upload task ${taskId} was not found. Appcircle did not register the task within 60 seconds.`
    )
    expect(calls[taskId]).toBe(31)
  })

  it('fails on timeout while the task stays in Begin', async () => {
    const taskId = task('begin')
    await expect(checkTaskStatus(taskId, fakeClock())).rejects.toThrow(
      `Upload task ${taskId} did not complete within 10 minutes. Last state: Begin.`
    )
    expect(calls[taskId]).toBe(301)
  })

  it('retries transient errors', async () => {
    const taskId = task('drop', 'http503', 'http429', 'completed')
    await expect(checkTaskStatus(taskId, fakeClock())).resolves.toBeUndefined()
    expect(calls[taskId]).toBe(4)
  })

  it('fails fast on a non-transient HTTP error', async () => {
    const taskId = task('http401')
    await expect(checkTaskStatus(taskId, fakeClock())).rejects.toThrow(
      `Could not read the status of upload task ${taskId}: HTTP 401.`
    )
    expect(calls[taskId]).toBe(1)
  })

  it('fails when the task id is missing', async () => {
    await expect(checkTaskStatus('', fakeClock())).rejects.toThrow(
      'Task ID is not found in the upload response'
    )
  })

  it('fails on timeout while the errors stay transient', async () => {
    const taskId = task('http503')
    await expect(checkTaskStatus(taskId, fakeClock())).rejects.toThrow(
      `Upload task ${taskId} did not complete within 10 minutes. Last state: HTTP 503.`
    )
  })

  it('fails on timeout while no answer comes back', async () => {
    const taskId = task('drop')
    await expect(checkTaskStatus(taskId, fakeClock())).rejects.toThrow(
      `Upload task ${taskId} did not complete within 10 minutes. Last state: no response.`
    )
  })

  it('stops a status request that gets no answer', async () => {
    const taskId = task('hang', 'completed')
    await expect(
      checkTaskStatus(taskId, { ...fakeClock(), requestTimeoutMs: 100 })
    ).resolves.toBeUndefined()
    expect(calls[taskId]).toBe(2)
  })

  it('treats a 200 without a readable body like a missing task', async () => {
    const taskId = task('html')
    await expect(checkTaskStatus(taskId, fakeClock())).rejects.toThrow(
      `Upload task ${taskId} was not found. Appcircle did not register the task within 60 seconds.`
    )
  })

  it('fails when the task id is undefined', async () => {
    await expect(
      checkTaskStatus(undefined as unknown as string, fakeClock())
    ).rejects.toThrow('Task ID is not found in the upload response')
  })
})
