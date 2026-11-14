import './Brand.css'

// A "presentational" component: no state, no props, just markup.
export default function Brand() {
  return (
    <header className="brand">
      <h1 className="brand__logo">MPCR</h1>
      <p className="brand__title mono">Machine Parameters &amp; Condition Report</p>
      <p className="brand__tagline">Shot-by-shot records for every injection moulding machine.</p>
    </header>
  )
}
