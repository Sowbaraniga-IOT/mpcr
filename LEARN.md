# MPCR login page: a guided tour of the code

This guide walks through the project file by file, in the order I'd recommend reading it.
Each section explains **what the file does** and **the React idea it teaches**.

---

## 0. Run it

```bash
cd mpcr-login/frontend   # paths below are relative to frontend/
npm install      # downloads React and Vite into node_modules/
npm run dev      # starts a dev server, open the URL it prints
```

Try it out:
- Click **Login** with empty fields to see validation errors.
- Type any ID and the code `wrongcode` to see a "server" error.
- Type any ID and any code with 6 or more characters to sign in and land on the dashboard. Use the user menu (top right) to sign out.
- Click **Night** to switch theme, then reload the page. The theme stays, because it's saved.

---

## 1. The map: how the screen is split into components

```
App                    ← owns the theme state
└── SheetFrame         ← the drawing-sheet border with 1–8 / A–E zone labels
    ├── Brand          ← "MPCR" + subtitle
    ├── MachineDrawing ← the SVG machine with numbered callouts
    ├── ThemeToggle    ← Paper / Night buttons
    └── LoginCard      ← the form (owns all the form state)
        └── TitleBlock ← DWG NO / REV / SCALE table
```

**Concept: components.** A component is just a JavaScript function that returns JSX
(HTML-like markup). Its name starts with a capital letter, and you use it like a tag: `<Brand />`.
Each component sits in its own file with its own CSS file next to it, so when you want to change
the title block you know exactly where to look.

---

## 2. `index.html` and `src/main.jsx`: the entry point

`index.html` has one empty `<div id="root">`. It also loads two Google Fonts:
**Inter** for normal text and **JetBrains Mono** for the "engineering label" text.

`main.jsx` tells React to take over that div:

```jsx
createRoot(document.getElementById('root')).render(<App />)
```

Everything you see on screen comes from `<App />` and its children.

---

## 3. `src/index.css`: design tokens and the blueprint grid

```css
:root {
  --paper: #f3efe8;
  --ink: #1a1a1a;
  --accent: #e3241f;
  ...
}
:root[data-theme='night'] {
  --paper: #0f141b;
  --ink: #e7e2d9;
  ...
}
```

**Concept: CSS variables (design tokens).** Every colour in the app is written as `var(--ink)`,
`var(--accent)` and so on, never as a hard-coded hex value. To support Night mode, we only
redefine the variables when `<html data-theme="night">`. No component needs to know about themes.

The grid paper is made from four `linear-gradient`s on the `body`. Two draw thin lines every 20px
and two draw stronger lines every 100px.

`.mono` is a small helper class for the uppercase monospaced labels ("01 — OPERATOR ID").

---

## 4. `src/App.jsx`: state at the top and `useEffect`

```jsx
const [theme, setTheme] = useState(getInitialTheme)
```

**Concept: `useState`.** It gives you a value (`theme`) and a function to change it (`setTheme`).
When you call `setTheme('night')`, React re-runs `App` and updates the screen.

Passing the *function* `getInitialTheme` (no `()`) means React calls it only once, on the first render.

**Concept: lifting state up.** The theme is used by the toggle *and* by the whole page, so it lives
in their common parent, `App`. `App` passes it down as **props**:

```jsx
<ThemeToggle theme={theme} onChange={setTheme} />
```

**Concept: `useEffect`.** Some things happen *outside* React, like changing an attribute on `<html>`
or writing to `localStorage`. Those are "side effects", and they go in `useEffect`:

```jsx
useEffect(() => {
  document.documentElement.dataset.theme = theme
  localStorage.setItem('mpcr-theme', theme)
}, [theme])           // ← run again only when `theme` changes
```

The `try/catch` blocks around `localStorage` keep the page working in browsers that block storage
(private mode, for example).

`App.css` is the two-column layout. It uses CSS Grid with
`grid-template-columns: 1.55fr 1fr` and switches to one column below 960px.

---

## 5. `SheetFrame.jsx`: `children` and rendering lists

```jsx
export default function SheetFrame({ children }) { ... <main>{children}</main> ... }
```

**Concept: `children`.** Whatever you put between `<SheetFrame>` and `</SheetFrame>` arrives as the
`children` prop. This lets `SheetFrame` be a "wrapper" that doesn't care what's inside it.

**Concept: `.map()` and `key`.** The zone labels come from arrays:

```jsx
{COLUMNS.map((c) => <span key={c}>{c}</span>)}
```

`.map()` turns each item into a piece of JSX. React needs a unique `key` on each item so it can
tell them apart when the list changes.

`aria-hidden="true"` hides these purely decorative labels from screen readers.

---

## 6. `Brand.jsx`: a plain presentational component

No state and no props, just markup and CSS. Most components in a real app look like this.
Note `&amp;` in JSX for the `&` character, and `clamp(64px, 8vw, 128px)` in the CSS, which makes
the logo scale with the window but never become smaller than 64px or larger than 128px.

---

## 7. `MachineDrawing.jsx`: SVG in React

This is the biggest file, but it's mostly coordinates.

**Trick: viewBox = the design's coordinate system.**
```jsx
<svg viewBox="60 270 1080 760">
```
I took the x/y positions straight from the mockup image and used them as SVG coordinates.
The `viewBox` says "show the area from (60, 270), 1080 wide and 760 tall". The SVG then scales to
fit its container, with `width: 100%` set in the CSS.

**Concept: data-driven rendering again.** The five numbered balloons are an array of objects:

```jsx
const CALLOUTS = [
  { n: 1, label: 'Hopper', at: [625, 312], to: [761, 427] },
  ...
]
{CALLOUTS.map((c) => <Callout key={c.n} {...c} />)}
```

`{...c}` is the **spread** syntax. It passes every field of `c` as a separate prop, so
`<Callout n={1} label="Hopper" at={...} to={...} />`.

**Concept: small sub-components.** `Callout` and `Cavity` are defined in the same file because
nothing else uses them. `Cavity` is drawn twice, once in the mould and once enlarged inside
"Detail A", using `transform="translate(...) scale(...)"`.

**Generated shapes.** The heater bands, machine feet, hatch lines and screw zigzag are all made
with `.map()` or `Array.from({ length: n }, ...)` instead of being copy-pasted.

**Styling SVG with CSS.** Shapes get class names (`ink`, `accent-dashed`, `centerline`…) and
`MachineDrawing.css` sets their `stroke` with the same tokens as everything else. That's why the
drawing turns light-on-dark in Night mode for free. The centre line's dash-dot pattern is
`stroke-dasharray: 22 6 4 6`.

---

## 8. `ThemeToggle.jsx`: a controlled component

```jsx
export default function ThemeToggle({ theme, onChange }) {
  ...
  <button aria-pressed={theme === opt.value} onClick={() => onChange(opt.value)}>
```

**Concept: controlled components.** The toggle doesn't *own* the theme. It shows what it's given
(`theme`) and reports clicks (`onChange`). The parent decides what happens.

**Concept: event handlers.** `onClick={() => onChange(opt.value)}` passes a *function* that
React calls later, on click. Writing `onClick={onChange(opt.value)}` would call it immediately
during render, which is a classic beginner bug.

`aria-pressed` tells screen readers which button is active, and the CSS reuses it as the styling
hook: `[aria-pressed='true'] { background: var(--accent) }`.

---

## 9. `LoginCard.jsx`: forms, state and async (the most important file)

### 9a. One state per changing thing
```jsx
const [operatorId, setOperatorId] = useState('')
const [accessCode, setAccessCode] = useState('')
const [showCode, setShowCode] = useState(false)
const [keepOnShift, setKeepOnShift] = useState(true)
const [errors, setErrors] = useState({})
const [status, setStatus] = useState('idle')  // idle | loading | success | error
```

### 9b. Controlled inputs
```jsx
<input value={operatorId} onChange={(e) => setOperatorId(e.target.value)} />
```
React state is the single source of truth: the input shows `operatorId`, and every keystroke
updates it. Checkboxes use `checked` and `e.target.checked` instead of `value`.

### 9c. Show/hide password
```jsx
type={showCode ? 'text' : 'password'}
onClick={() => setShowCode((s) => !s)}
```
`setShowCode((s) => !s)` is the **updater form**. You pass a function that receives the
current value. Use it whenever the new value depends on the old one.

### 9d. Validation as a pure function
`validate()` lives *outside* the component. It takes values and returns an errors object, like
`{ accessCode: 'Enter your access code.' }`. It has no state and no side effects, so it's easy
to test and reuse.

### 9e. Submitting
```jsx
async function handleSubmit(event) {
  event.preventDefault()          // otherwise the browser reloads the page
  const found = validate(...)
  setErrors(found)
  if (Object.keys(found).length > 0) return
  setStatus('loading')
  try {
    await fakeLogin(...)
    setStatus('success')
  } catch (err) {
    setServerError(err.message)
    setStatus('error')
  }
}
```
`fakeLogin` is a stand-in that waits 1.2 seconds. **This is the one place to change to connect a
real backend.** Replace it with something like:
```js
const res = await fetch('/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ operatorId, accessCode, keepOnShift }),
})
if (!res.ok) throw new Error('Operator ID or access code is incorrect.')
```

### 9f. Conditional rendering
```jsx
{status === 'success' ? <SuccessView/> : <form>...</form>}
{errors.operatorId && <p className="field__error">{errors.operatorId}</p>}
```
The ternary `? :` chooses between two pieces of UI. `&&` renders something only if the left side
is truthy.

### 9g. Accessibility details
- `useId()` creates unique ids so each `<label htmlFor>` is linked to its `<input id>`. Clicking
  the label then focuses the field.
- `aria-invalid` and `aria-describedby` let screen readers announce the error text.
- `noValidate` on the form turns off the browser's own popups so our styled messages are used.
- The real checkbox is visually hidden but still focusable, and `.checkbox__box` draws the red box.
- `autoComplete="username"` and `"current-password"` let password managers fill the form.

### 9h. The CSS tricks in `LoginCard.css`
- `.field:focus-within` styles the whole field (red label and red underline) while the input
  inside has focus.
- `.field:focus-within::after` draws the small red square at the start of the underline, just like
  the design.
- The arrow on the button slides right on hover: `transform: translateX(4px)`.

---

## 10. `TitleBlock.jsx`: data first

The six cells are an array, rendered with `.map()` into a `<dl>` (description list). `dl`, `dt`
and `dd` are the semantically correct HTML for label/value pairs. CSS Grid
(`repeat(3, 1fr)`) lays out the 3×2 table, and `:nth-child(3n)` removes the right border on the
last column.

---

## Exercises to try next (we can do these together)

1. **Easy:** change the accent red to a blue blueprint colour by editing **only** `index.css`.
2. **Easy:** add a 7th cell "MATERIAL: PP-GF30" to the title block. You only need to touch the
   `CELLS` array.
3. **Medium:** make "Reset access code →" open a second small form (email only) inside the card,
   using a new piece of state like `view: 'login' | 'reset'`.
4. **Medium:** highlight the matching part of the drawing when you hover a callout balloon.
   Hint: lift a `hovered` state into `MachineDrawing`.
5. **Bigger:** add React Router and show a real `/dashboard` page after login.
