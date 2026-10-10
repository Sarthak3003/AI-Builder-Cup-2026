import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import FoodDemo from './FoodDemo'

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

test('requires review then saves and reloads activity', async () => {
  const meal = { id: 'dal', name: 'Dal and rice', price: 120, spice: 'mild' }
  const fetchMock = vi.fn(async (path: string) => ({ ok: true, json: async () =>
    path.endsWith('/session') ? {} : path.endsWith('/requests')
      ? { id: 'request-1', summary: 'Mild vegetarian lunch', clarification: '', options: [meal] }
      : { id: 'request-1', item: meal, status: 'simulated_confirmed' },
  }))
  vi.stubGlobal('fetch', fetchMock)
  render(<FoodDemo />)
  await userEvent.click(screen.getByRole('button', { name: 'Find meals' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Choose Dal and rice' }))
  expect(fetchMock.mock.calls.some(([path]) => path.endsWith('/confirm'))).toBe(false)
  await userEvent.click(screen.getByRole('button', { name: 'Cancel selection' }))
  expect(screen.queryByRole('button', { name: 'Confirm simulated order' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Choose Dal and rice' }))
  await userEvent.click(screen.getByRole('button', { name: 'Confirm simulated order' }))
  expect(await screen.findByText(/Saved simulated order:/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Load saved activity' }))
  expect(await screen.findByText('Activity loaded from Firestore.')).toBeInTheDocument()
})

test('shows setup error without pretending Gemini responded', async () => {
  vi.stubGlobal('fetch', vi.fn(async (path: string) => ({
    ok: path.endsWith('/session'), json: async () => ({ detail: 'Gemini is not configured yet.' }),
  })))
  render(<FoodDemo />)
  await userEvent.click(screen.getByRole('button', { name: 'Find meals' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Gemini is not configured yet.')
  expect(screen.queryByText('Your preferences')).not.toBeInTheDocument()
})
