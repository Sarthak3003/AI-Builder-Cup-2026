import { useId } from 'react'

type Props = { showOptions?: boolean; onChange: (showOptions: boolean) => void; disabled?: boolean }

export default function BookingPreference({ showOptions = true, onChange, disabled = false }: Props) {
  const description = useId()
  return (
    <fieldset className="choice-group" disabled={disabled} aria-describedby={description}>
      <legend>When I ask for a ride or a meal</legend>
      <label className="check check-row"><input type="radio" name="booking-choice" checked={showOptions} onChange={() => onChange(true)} />Show me the options and let me confirm</label>
      <label className="check check-row"><input type="radio" name="booking-choice" checked={!showOptions} onChange={() => onChange(false)} />Let Saathi choose the best option and book it for me</label>
      <div id={description}>
        <p className="muted">If you let Saathi book for you, Saathi weighs the price and the waiting time, books rides and meals straight away without asking, and opens the booking page. Medicine requests always ask first. Every booking is simulated, and you can cancel it there.</p>
        <p className="muted">Telephone calls always ask you to confirm. Care Circle approval rules still apply.</p>
      </div>
    </fieldset>
  )
}
