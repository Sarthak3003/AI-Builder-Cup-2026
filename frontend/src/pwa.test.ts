import { expect, test, vi } from 'vitest'
import indexHtml from '../index.html?raw'
import manifestText from '../public/manifest.webmanifest?raw'
import workerSource from '../public/sw.js?raw'

const manifest = JSON.parse(manifestText)
const publicFiles = new Set(Object.keys(import.meta.glob('../public/**/*.{png,svg}')).map((key) => key.replace('../public', '')))

type Icon = { src: string; sizes: string; type: string; purpose?: string }

test('manifest has what browsers need to offer installation', () => {
  expect(manifest.name).toContain('Saathi')
  expect(manifest.short_name).toBe('Saathi')
  expect(manifest.display).toBe('standalone')
  expect(manifest.start_url).toMatch(/^\//)
  expect(manifest.scope).toBe('/')
  expect(manifest.orientation).toBe('portrait')
})

test('manifest uses Google blue for the browser bar and a light background', () => {
  expect(manifest.theme_color).toBe('#1a73e8')
  expect(manifest.background_color).toBe('#f8f9fa')
})

test('manifest icons include 192 and 512 PNGs and a maskable icon, and every file exists', () => {
  const icons: Icon[] = manifest.icons
  const png = icons.filter((icon) => icon.type === 'image/png')
  expect(png.some((icon) => icon.sizes === '192x192' && icon.purpose === 'any')).toBe(true)
  expect(png.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any')).toBe(true)
  expect(png.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable')).toBe(true)
  for (const icon of icons) expect(publicFiles, `${icon.src} is missing from public/`).toContain(icon.src)
})

test('home-screen shortcuts open the matching service and use real icons', () => {
  const services = manifest.shortcuts.map((shortcut: { url: string }) => new URL(shortcut.url, 'https://saathi.test').searchParams.get('service'))
  expect(services).toEqual(['ride', 'food', 'medicine'])
  for (const shortcut of manifest.shortcuts) {
    for (const icon of shortcut.icons) expect(publicFiles).toContain(icon.src)
  }
})

test('index.html is set up for phones and home-screen installs', () => {
  expect(indexHtml).toContain('viewport-fit=cover')
  expect(indexHtml).toContain('rel="manifest" href="/manifest.webmanifest"')
  expect(indexHtml).toContain('name="theme-color" content="#1a73e8"')
  expect(indexHtml).toContain('name="apple-mobile-web-app-capable"')
  const touchIcon = indexHtml.match(/rel="apple-touch-icon" href="([^"]+)"/)?.[1]
  expect(touchIcon).toBeDefined()
  expect(publicFiles).toContain(touchIcon)
})

// ---- Service worker, run against an in-memory stand-in for the Cache API ----

const ORIGIN = 'https://saathi.test'
const SHELL_HTML =
  '<link rel="icon" href="/saathi.svg"><link rel="manifest" href="/manifest.webmanifest">' +
  '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"><link rel="stylesheet" href="/assets/index-1.css">' +
  '<script type="module" src="/assets/index-1.js"></script><a href="https://elsewhere.test/x">external</a>'

type Handler = (event: unknown) => void
type FakeRequest = { url: string; method: string; mode: string }

function startWorker(network: (path: string) => Promise<Response>) {
  const listeners: Record<string, Handler> = {}
  const buckets = new Map<string, Map<string, Response>>()
  const href = (input: string | FakeRequest) => new URL(typeof input === 'string' ? input : input.url, ORIGIN).href
  const fetchStub = vi.fn((input: string | FakeRequest) => network(new URL(href(input)).pathname))
  const caches = {
    open: async (name: string) => {
      const bucket = buckets.get(name) ?? new Map<string, Response>()
      buckets.set(name, bucket)
      return {
        put: async (input: string | FakeRequest, response: Response) => void bucket.set(href(input), response),
        add: async (input: string) => {
          const response = await fetchStub(input)
          if (!response.ok) throw new TypeError('Request failed')
          bucket.set(href(input), response)
        },
      }
    },
    keys: async () => [...buckets.keys()],
    delete: async (name: string) => buckets.delete(name),
    match: async (input: string | FakeRequest) => {
      for (const bucket of buckets.values()) {
        const hit = bucket.get(href(input))
        if (hit) return hit.clone()
      }
      return undefined
    },
  }
  const scope = {
    location: { origin: ORIGIN },
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
    addEventListener: (type: string, handler: Handler) => void (listeners[type] = handler),
  }
  new Function('self', 'caches', 'fetch', 'Response', workerSource)(scope, caches, fetchStub, Response)

  async function lifecycle(type: 'install' | 'activate') {
    const pending: Promise<unknown>[] = []
    listeners[type]({ waitUntil: (work: Promise<unknown>) => pending.push(work) })
    await Promise.all(pending)
  }
  async function request(path: string, init: Partial<FakeRequest> = {}) {
    const fake: FakeRequest = { url: ORIGIN + path, method: 'GET', mode: 'cors', ...init }
    let answer: Promise<Response> | undefined
    const pending: Promise<unknown>[] = []
    listeners.fetch({ request: fake, respondWith: (work: Promise<Response>) => (answer = work), waitUntil: (work: Promise<unknown>) => pending.push(work) })
    const response = answer ? await answer : undefined
    await Promise.all(pending)
    return response
  }
  return { scope, buckets, fetchStub, lifecycle, request }
}

const ok = (body: string) => new Response(body, { status: 200 })
const online = (path: string) => Promise.resolve(path === '/' ? ok(SHELL_HTML) : ok(`file:${path}`))
const offline = () => Promise.reject(new TypeError('Failed to fetch'))

test('install precaches the page and the files it names, then takes over', async () => {
  const worker = startWorker(online)
  await worker.lifecycle('install')
  const cached = [...(worker.buckets.get('saathi-shell-v2')?.keys() ?? [])].map((key) => new URL(key).pathname).sort()
  expect(cached).toEqual(['/', '/assets/index-1.css', '/assets/index-1.js', '/icons/apple-touch-icon.png', '/manifest.webmanifest', '/saathi.svg'])
  expect(worker.scope.skipWaiting).toHaveBeenCalled()
})

test('a missing optional file does not stop the app from installing', async () => {
  const worker = startWorker((path) => Promise.resolve(path === '/assets/index-1.css' ? new Response('', { status: 404 }) : path === '/' ? ok(SHELL_HTML) : ok('x')))
  await expect(worker.lifecycle('install')).resolves.toBeUndefined()
  expect(worker.buckets.get('saathi-shell-v2')?.size).toBeGreaterThan(1)
})

test('API calls are never intercepted or cached', async () => {
  const worker = startWorker(online)
  await worker.lifecycle('install')
  const before = worker.fetchStub.mock.calls.length
  for (const path of ['/api/hub/state', '/api/health', '/api/hub/activity/abc']) {
    expect(await worker.request(path)).toBeUndefined()
  }
  expect(worker.fetchStub.mock.calls.length).toBe(before)
  const cachedPaths = [...(worker.buckets.get('saathi-shell-v2')?.keys() ?? [])]
  expect(cachedPaths.some((key) => key.includes('/api/'))).toBe(false)
})

test('writes and other origins are left alone', async () => {
  const worker = startWorker(online)
  await worker.lifecycle('install')
  expect(await worker.request('/anything', { method: 'POST' })).toBeUndefined()
  expect(await worker.request('/anything', { method: 'DELETE' })).toBeUndefined()
  expect(await worker.request('/x.js', { url: 'https://elsewhere.test/x.js' })).toBeUndefined()
})

test('pages are served fresh when online and from the cache when offline', async () => {
  let reachable = true
  const worker = startWorker((path) => (reachable ? Promise.resolve(path === '/' ? ok(SHELL_HTML) : ok(`file:${path}`)) : offline()))
  await worker.lifecycle('install')
  expect(await (await worker.request('/assets/other.js'))?.text()).toBe('file:/assets/other.js')
  reachable = false
  expect(await (await worker.request('/assets/other.js'))?.text()).toBe('file:/assets/other.js')
  expect((await worker.request('/assets/never-seen.js'))?.type).toBe('error')
})

test('offline navigation falls back to the cached app page', async () => {
  let reachable = true
  const worker = startWorker((path) => (reachable ? online(path) : offline()))
  await worker.lifecycle('install')
  reachable = false
  const page = await worker.request('/activity?source=pwa', { mode: 'navigate' })
  expect(await page?.text()).toBe(SHELL_HTML)
})

test('failed responses are not cached', async () => {
  let status = 500
  let reachable = true
  const worker = startWorker((path) => (reachable ? (path === '/' ? online(path) : Promise.resolve(new Response('boom', { status }))) : offline()))
  await worker.lifecycle('install')
  await worker.request('/assets/flaky.js')
  reachable = false
  expect((await worker.request('/assets/flaky.js'))?.type).toBe('error')
  status = 200
})

test('activation removes older app caches only and claims open pages', async () => {
  const worker = startWorker(online)
  worker.buckets.set('saathi-shell-v1', new Map())
  worker.buckets.set('saathi-shell-v2', new Map())
  worker.buckets.set('someone-elses-cache', new Map())
  await worker.lifecycle('activate')
  expect([...worker.buckets.keys()].sort()).toEqual(['saathi-shell-v2', 'someone-elses-cache'])
  expect(worker.scope.clients.claim).toHaveBeenCalled()
})
