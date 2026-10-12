import { expect, test } from 'vitest'
import css from './theme.css?raw'

function tokens(block: string): Record<string, string> {
  const body = css.split(block)[1]?.split('}')[0] ?? ''
  return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]))
}

const light = tokens(':root {')
const highContrast = { ...light, ...tokens('.high-contrast {') }

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const channel = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}

// [foreground token, background token, minimum ratio]: 4.5 for text (WCAG AA), 3 for control borders.
const pairs: [string, string, number][] = [
  ['text', 'bg', 4.5],
  ['text', 'surface', 4.5],
  ['text', 'surface-2', 4.5],
  ['text-2', 'bg', 4.5],
  ['text-2', 'surface', 4.5],
  ['text-2', 'surface-2', 4.5],
  ['on-dark', 'blue-strong', 4.5],
  ['on-dark', 'red-strong', 4.5],
  ['on-dark', 'green-strong', 4.5],
  ['on-dark', 'text', 4.5],
  ['text', 'g-yellow', 4.5],
  ['blue-strong', 'surface', 4.5],
  ['blue-strong', 'blue-tint', 4.5],
  ['blue-ink', 'blue-tint', 4.5],
  ['red-strong', 'red-tint', 4.5],
  ['red-strong', 'surface', 4.5],
  ['green-strong', 'green-tint', 4.5],
  ['green-strong', 'surface', 4.5],
  ['yellow-ink', 'yellow-tint', 4.5],
  ['control-line', 'surface', 3],
  ['blue', 'surface', 3],
]

test('defines every brand colour Google uses', () => {
  expect([light['g-blue'], light['g-red'], light['g-yellow'], light['g-green']]).toEqual(['#4285f4', '#ea4335', '#fbbc04', '#34a853'])
})

test.each(pairs)('%s on %s meets %s:1 contrast', (fg, bg, minimum) => {
  expect(light[fg], `missing token ${fg}`).toBeDefined()
  expect(light[bg], `missing token ${bg}`).toBeDefined()
  expect(contrast(light[fg], light[bg])).toBeGreaterThanOrEqual(minimum)
})

test.each(pairs)('high contrast: %s on %s meets %s:1 contrast', (fg, bg, minimum) => {
  expect(contrast(highContrast[fg], highContrast[bg])).toBeGreaterThanOrEqual(minimum)
})

test('brand colours are never paired with white text', () => {
  for (const brand of ['g-blue', 'g-red', 'g-green']) {
    expect(contrast(light['on-dark'], light[brand])).toBeLessThan(4.5)
  }
})
