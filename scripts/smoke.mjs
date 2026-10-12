// Phase 1 smoke test, local or deployed: BASE_URL=https://<site> node scripts/smoke.mjs [--api-only] [--require-ready]
// Optional: EXPECT_VERSION, EXPECT_ENVIRONMENT, SAATHI_BROWSER_CHANNEL (default chrome; e.g. msedge).
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const options = new Set(process.argv.slice(2))
const unknown = [...options].filter((option) => !['--api-only', '--require-ready'].includes(option))
if (unknown.length) {
  console.error(`Unknown option: ${unknown.join(' ')}`)
  process.exit(2)
}

const base = (process.env.BASE_URL ?? 'http://127.0.0.1:5173').replace(/\/+$/, '')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const connected = /Backend connected · v\S+/

async function check(name, run) {
  try {
    const detail = await run()
    console.log(`PASS ${name}${detail ? ` (${detail})` : ''}`)
  } catch (error) {
    console.error(`FAIL ${name}: ${error.message}`)
    process.exitCode = 1
  }
}

async function getJson(route) {
  const response = await fetch(`${base}${route}`, { signal: AbortSignal.timeout(10_000) }).catch((error) => {
    throw new Error(`cannot reach ${base}${route}: ${error.cause?.code ?? error.message}`)
  })
  const type = response.headers.get('content-type') ?? ''
  assert.match(type, /json/, `${route} returned ${type || 'no content type'}; is /api routed to the backend?`)
  return { status: response.status, body: await response.json() }
}

await check('origin uses HTTPS or loopback', () => {
  const { protocol, hostname } = new URL(base)
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(hostname)
  assert.ok(protocol === 'https:' || loopback, `${base} is not HTTPS`)
})

await check('GET /api/health', async () => {
  const { status, body } = await getJson('/api/health')
  assert.equal(status, 200)
  assert.deepEqual(body, { status: 'ok', service: 'saathi-api' })
})

await check('GET /api/version', async () => {
  const { status, body } = await getJson('/api/version')
  assert.equal(status, 200)
  assert.equal(typeof body.version, 'string')
  if (process.env.EXPECT_VERSION) assert.equal(body.version, process.env.EXPECT_VERSION)
  if (process.env.EXPECT_ENVIRONMENT) assert.equal(body.environment, process.env.EXPECT_ENVIRONMENT)
  return `v${body.version}, ${body.environment}`
})

await check('GET /api/ready', async () => {
  const { status, body } = await getJson('/api/ready')
  const required = options.has('--require-ready')
  if (required) {
    assert.equal(status, 200)
    assert.deepEqual(body, { status: 'ready', firestore: 'ready' })
  }
  return `HTTP ${status}, firestore ${body.firestore}${required ? '' : ', not required'}`
})

if (!options.has('--api-only')) {
  await check('browser shows connected status', async () => {
    let chromium
    try {
      chromium = createRequire(path.join(root, 'frontend', 'package.json'))('playwright').chromium
    } catch {
      throw new Error('Playwright is missing; run "npm ci" in frontend/ or pass --api-only')
    }
    const channel = process.env.SAATHI_BROWSER_CHANNEL ?? 'chrome'
    const browser = await chromium.launch({ channel, timeout: 30_000 }).catch((error) => {
      const lines = error.message.split('\n')
      const reason = lines.filter((line) => /\[err\]\s*\S/.test(line)).map((line) => line.replace(/^.*\[err\]\s*/, '')).join(' ') || lines[0]
      throw new Error(`cannot start browser "${channel}": ${reason} Set SAATHI_BROWSER_CHANNEL (chrome, msedge, chromium) or use --api-only.`)
    })
    try {
      const page = await browser.newPage()
      const pageErrors = []
      const apiCalls = []
      page.on('pageerror', (error) => pageErrors.push(error.message))
      page.on('response', (response) => {
        const { pathname } = new URL(response.url())
        if (pathname.startsWith('/api/')) apiCalls.push(`${pathname} ${response.status()}`)
      })
      await page.goto(base)
      const status = page.getByRole('status').filter({ hasText: connected })
      try {
        await status.waitFor({ timeout: 15_000 })
      } catch {
        const seen = await page.getByRole('status').allTextContents()
        throw new Error(`no "Backend connected · v…" status; page shows ${JSON.stringify(seen)}; API calls: ${apiCalls.join(', ') || 'none'}`)
      }
      assert.ok(apiCalls.includes('/api/health 200'), `page did not receive /api/health 200; API calls: ${apiCalls.join(', ')}`)
      assert.deepEqual(pageErrors, [], 'uncaught page errors')
      return (await status.first().textContent()).trim()
    } finally {
      await browser.close()
    }
  })
}

if (process.exitCode) console.error('Smoke test FAILED')
else console.log('Smoke test passed')
