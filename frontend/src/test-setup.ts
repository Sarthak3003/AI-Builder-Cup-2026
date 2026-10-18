import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom has the dialog element but not its modal methods; browser checks cover focus trapping.
if (!HTMLDialogElement.prototype.showModal) {
	HTMLDialogElement.prototype.showModal = function () { this.open = true }
	HTMLDialogElement.prototype.close = function () { this.open = false }
}

afterEach(cleanup)
