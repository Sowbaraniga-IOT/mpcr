import './Pagination.css'

// 1 … 4 5 6 … 5874: first, last and the pages around the current one.
function pageList(page, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)
  const near = [page - 1, page, page + 1].filter((p) => p > 1 && p < pageCount)
  const list = [1, ...near, pageCount]
  return list.flatMap((p, i) => (i > 0 && p - list[i - 1] > 1 ? [`gap-${p}`, p] : [p]))
}

export default function Pagination({ page, pageCount, onChange }) {
  return (
    <nav className="pagination mono" aria-label="Pages">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page === 1} aria-label="Previous page">
        ◂
      </button>
      {pageList(page, pageCount).map((p) =>
        typeof p === 'string' ? (
          <span key={p} className="pagination__gap" aria-hidden="true">
            …
          </span>
        ) : (
          <button key={p} type="button" aria-current={p === page ? 'page' : undefined} onClick={() => onChange(p)}>
            {p.toLocaleString('en-IN')}
          </button>
        ),
      )}
      <button type="button" onClick={() => onChange(page + 1)} disabled={page === pageCount} aria-label="Next page">
        ▸
      </button>
    </nav>
  )
}
