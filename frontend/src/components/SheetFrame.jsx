import './SheetFrame.css'

// Zone labels around a drawing sheet: columns 1–8, rows A–E.
const COLUMNS = ['1', '2', '3', '4', '5', '6', '7', '8']
const ROWS = ['A', 'B', 'C', 'D', 'E']

// `children` is whatever you put between <SheetFrame> and </SheetFrame>.
// `fixed` pins the sheet to the window: the page inside scrolls instead of the window.
export default function SheetFrame({ children, fixed = false }) {
  return (
    <div className={fixed ? 'sheet sheet--fixed' : 'sheet'}>
      <div className="sheet__zones sheet__zones--top" aria-hidden="true">
        {COLUMNS.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <div className="sheet__zones sheet__zones--bottom" aria-hidden="true">
        {COLUMNS.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <div className="sheet__zones sheet__zones--left" aria-hidden="true">
        {ROWS.map((r) => (
          <span key={r}>{r}</span>
        ))}
      </div>
      <div className="sheet__zones sheet__zones--right" aria-hidden="true">
        {ROWS.map((r) => (
          <span key={r}>{r}</span>
        ))}
      </div>

      <main className="sheet__inner">{children}</main>
    </div>
  )
}
