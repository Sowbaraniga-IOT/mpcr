import { useEffect, useRef, useState } from 'react'
import DashboardHeader from './DashboardHeader.jsx'
import Sidebar from './Sidebar.jsx'
import Toolbar from './Toolbar.jsx'
import MachineCard from './MachineCard.jsx'
import MachineList from './MachineList.jsx'
import Pagination from '../../components/Pagination.jsx'
import { sortMachines } from './sorting.js'
import ImageDialog from './ImageDialog.jsx'
import DeviationMonitor from './DeviationMonitor.jsx'
import ParameterLog from '../log/ParameterLog.jsx'
import Report from '../report/Report.jsx'
import Settings, { canOpenSettings, settingsPagesFor } from '../settings/Settings.jsx'
import { MACHINES, STATUSES, activeMachines } from '../../store/machines.js'
import { can, canAccessMachine, canChange } from '../../store/users.js'
import { LOG_CHANGED, alertOf, logFor, productionDate } from '../../store/parameterLog.js'
import { LIVE_CHANGED } from '../../store/session.js'
import { api, save } from '../../api/client.js'
import './Dashboard.css'

const PAGE_SIZE = 10
// Uploaded photos: { machines: { [id]: { src, fit } | null }, models: { [model]: { src, fit } } }.
// A machine's own entry wins over its model's; null means "removed, show the upload box".
// Kept on the server; only the entries that changed are sent.
function saveImageChanges(prev, next) {
  const set = []
  const drop = []
  for (const [group, scope] of [['machines', 'machine'], ['models', 'model']]) {
    for (const [key, image] of Object.entries(next[group])) if (prev[group][key] !== image) set.push({ scope, key, image })
    for (const key of Object.keys(prev[group])) if (!(key in next[group])) drop.push({ scope, key })
  }
  if (set.length || drop.length) save(api.post('/images/', { set, drop }))
}

// "#/log/J10-25", "#/report", "#/settings/machines", "#/settings/parameters/R-001" → which page to show.
function getRoute() {
  const hash = location.hash
  const log = hash.match(/^#\/log\/(.+)$/)
  const settings = hash.match(/^#\/settings(?:\/([a-z]+))?(?:\/(.+))?$/)
  return {
    logId: log ? decodeURIComponent(log[1]) : null,
    page: hash === '#/report' ? 'report' : settings ? 'settings' : 'dashboard',
    settingsPage: settings?.[1] ?? null,
    recipeId: settings?.[2] ? decodeURIComponent(settings[2]) : null,
  }
}

const EMPTY_FILTERS = {
  query: '',
  status: 'all',
  line: 'all',
  clamp: 'all',
  alert: 'all',
  sort: 'code',
  reversed: false,
}

// Today's deviations per machine, as the server last reported them.
function todayAlerts(machines, now = new Date()) {
  const today = productionDate(now)
  return new Map(machines.map((m) => [m.id, alertOf(logFor(m, today).deviations)]))
}

function matches(machine, { query, status, line, clamp, alert }, alertById) {
  const q = query.trim().toLowerCase()
  const text = `${machine.name} ${machine.id} ${machine.mold} ${machine.partNo}`.toLowerCase()
  return (
    (!q || text.includes(q)) &&
    (status === 'all' || machine.status === status) &&
    (line === 'all' || machine.line === line) &&
    (clamp === 'all' || machine.clamp === Number(clamp)) &&
    (alert === 'all' || alertById?.get(machine.id)?.level === alert)
  )
}

export default function Dashboard({ user, initialImages, theme, onThemeChange, onSignOut, onChangePassword }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [view, setView] = useState('card')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState(null)
  const [images, setImages] = useState(() => initialImages ?? { machines: {}, models: {} })
  const savedImages = useRef(images)
  const [editing, setEditing] = useState(null) // { machine, file? } while the image dialog is open
  const [route, setRoute] = useState(getRoute)
  const [openRequest, setOpenRequest] = useState(0) // bumps when the bell is clicked on the report
  const [, setDataVersion] = useState(0) // bumps when Settings changes machines, so the grid redraws
  const scrollRef = useRef(null) // the pane right of the sidebar; header and sidebar never scroll
  const [, setClock] = useState(0) // bumps every minute and on each live refresh, so status and alerts stay current

  // Pages the signed-in role may not open fall back to the dashboard.
  // Without "View dashboard" the machine grid and the parameter logs are closed; the user lands on the first page they may open.
  const allowed = {
    dashboard: can(user, 'dashboard'),
    report: can(user, 'report'),
    settings: canOpenSettings(user),
  }
  const home = Object.keys(allowed).find((k) => allowed[k]) ?? 'none'
  const activePage = allowed[route.page] === false ? home : route.page
  const logMachine = allowed.dashboard ? MACHINES.find((m) => m.id === route.logId) : undefined
  const settingsPages = settingsPagesFor(user)
  const settingsPage = settingsPages.find((p) => p.key === route.settingsPage) ?? settingsPages[0]

  // The open log and the report live in the URL hash, so Back, refresh and shared links all work.
  useEffect(() => {
    const sync = () => setRoute(getRoute())
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])

  useEffect(() => {
    document.title = logMachine
      ? `MPCR · ${logMachine.id} · Parameter log`
      : activePage === 'report'
        ? 'MPCR · Report'
        : activePage === 'settings'
          ? `MPCR · Settings · ${settingsPage?.label}`
          : 'MPCR · Dashboard'
    scrollRef.current?.scrollTo(0, 0)
    window.scrollTo(0, 0) // phones scroll the whole page instead of the pane
  }, [logMachine, activePage, settingsPage])

  useEffect(() => {
    const refresh = () => setClock((n) => n + 1)
    const timer = setInterval(refresh, 60_000)
    window.addEventListener(LIVE_CHANGED, refresh)
    window.addEventListener(LOG_CHANGED, refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener(LIVE_CHANGED, refresh)
      window.removeEventListener(LOG_CHANGED, refresh)
    }
  }, [])

  useEffect(() => {
    saveImageChanges(savedImages.current, images)
    savedImages.current = images
  }, [images])

  // Derived data: computed from state on every render, never stored separately.
  // Inactive machines (Machine Master) and machines outside the user's access are left out.
  const plant = activeMachines().filter((m) => canAccessMachine(user, m))
  const counts = Object.fromEntries(STATUSES.map((s) => [s.key, plant.filter((m) => m.status === s.key).length]))
  // Admins see each machine blink red (no reason), orange (awaiting supervisor / manager) or glow orange (accepted).
  const monitor = can(user, 'monitor')
  const alertById = monitor && activePage === 'dashboard' && !logMachine ? todayAlerts(plant) : null
  const filtered = sortMachines(
    plant.filter((m) => matches(m, filters, alertById)),
    filters.sort,
    filters.reversed,
    alertById,
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function handleFilterChange(key, value) {
    setFilters((f) => ({ ...f, [key]: value }))
    setPage(1) // a new filter starts back on the first page
  }

  // Photos are machine-master data: only users who may change the machine master upload or remove them.
  const canPhotos = canChange(user, 'machineMaster')

  function imageFor(machine) {
    if (machine.id in images.machines) return images.machines[machine.id]
    return images.models[machine.model] ?? (machine.hasPhoto ? 'default' : null)
  }

  function handleRemoveImage(id) {
    setImages((prev) => ({
      ...prev,
      machines: { ...prev.machines, [id]: null },
    }))
  }

  function handleSaveImage(machine, image, { applyToModel }) {
    setImages((prev) => {
      if (!applyToModel) return { ...prev, machines: { ...prev.machines, [machine.id]: image } }
      // One shared photo for the model; drop per-machine overrides so it shows everywhere.
      const machines = Object.fromEntries(
        Object.entries(prev.machines).filter(([id]) => MACHINES.find((m) => m.id === id)?.model !== machine.model),
      )
      return { machines, models: { ...prev.models, [machine.model]: image } }
    })
  }

  function handleOpenLog(machine) {
    setSelectedId(machine.id) // highlighted when you come back to the grid
    location.hash = `/log/${encodeURIComponent(machine.id)}`
  }

  function handleCloseLog() {
    history.pushState(null, '', location.pathname + location.search)
    setRoute(getRoute())
  }

  function handleSectionChange(next) {
    if (next === 'report') location.hash = '/report'
    else if (next === 'settings') location.hash = `/settings/${settingsPages[0].key}`
    else if (location.hash) handleCloseLog()
  }

  const first = filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0
  const last = Math.min(currentPage * PAGE_SIZE, filtered.length)

  return (
    <div className="dashboard">
      <DashboardHeader
        counts={counts}
        theme={theme}
        onThemeChange={onThemeChange}
        user={user}
        onSignOut={onSignOut}
        onChangePassword={onChangePassword}
        machine={logMachine}
        onBack={handleCloseLog}
        heading={
          logMachine
            ? null
            : activePage === 'report'
              ? {
                  title: 'Report',
                  subtitle: 'All machines · Standard vs actual',
                }
              : activePage === 'settings'
                ? {
                    title: 'Settings',
                    subtitle: `${settingsPage?.label} · Plant 01`,
                  }
                : activePage === 'none'
                  ? { title: 'No access', subtitle: 'Plant 01' }
                  : null
        }
        onAlerts={
          logMachine
            ? () => document.getElementById('deviations')?.focus()
            : activePage === 'report'
              ? () => setOpenRequest((n) => n + 1)
              : null
        }
        onOpenLog={(id) => (location.hash = `/log/${encodeURIComponent(id)}`)}
        onReport={allowed.report ? () => handleSectionChange('report') : null}
        reportActive={!logMachine && activePage === 'report'}
      />

      <div className="dashboard__body">
        <Sidebar
          active={logMachine ? 'dashboard' : activePage}
          hidden={Object.keys(allowed).filter((k) => !allowed[k])}
          onChange={handleSectionChange}
        />

        <div className="dashboard__scroll paper-grid" ref={scrollRef}>
          {logMachine ? (
            <ParameterLog key={logMachine.id} machine={logMachine} user={user} />
          ) : activePage === 'report' ? (
            <Report user={user} openRequest={openRequest} onOpenLog={handleOpenLog} />
          ) : activePage === 'settings' ? (
            <Settings
              page={settingsPage.key}
              recipeId={route.recipeId}
              user={user}
              onNavigate={(key) => (location.hash = `/settings/${key}`)}
              onOpenRecipe={(id) => (location.hash = `/settings/parameters/${encodeURIComponent(id)}`)}
              onEditImage={(machine) => setEditing({ machine })}
              imageFor={imageFor}
              onChange={() => setDataVersion((v) => v + 1)}
            />
          ) : activePage === 'none' ? (
            <section className="dashboard__main dashboard__empty">
              <p className="mono">No access</p>
              <h2>Your role has no pages switched on.</h2>
              <span>Ask an admin to tick what you need in Settings → User Management → role permissions.</span>
            </section>
          ) : (
            <section className="dashboard__main" aria-label="Machines">
              {alertById && (
                <DeviationMonitor
                  alerts={[...alertById.values()]}
                  value={filters.alert}
                  onChange={(level) => handleFilterChange('alert', level)}
                />
              )}
              <Toolbar filters={filters} onFilterChange={handleFilterChange} view={view} onViewChange={setView} />

              {visible.length === 0 ? (
                <div className="dashboard__none">
                  <p>No machines match these filters.</p>
                  <button type="button" className="link" onClick={() => setFilters(EMPTY_FILTERS)}>
                    Clear filters →
                  </button>
                </div>
              ) : view === 'card' ? (
                <div className="dashboard__grid">
                  {visible.map((m) => (
                    <MachineCard
                      key={m.id}
                      machine={m}
                      image={imageFor(m)}
                      selected={m.id === selectedId}
                      alert={alertById?.get(m.id)}
                      onSelect={() => handleOpenLog(m)}
                      onEditImage={canPhotos ? (machine, file) => setEditing({ machine, file }) : null}
                      onRemoveImage={canPhotos ? handleRemoveImage : null}
                      onOpenLog={handleOpenLog}
                    />
                  ))}
                </div>
              ) : (
                <MachineList
                  machines={visible}
                  selectedId={selectedId}
                  alertFor={alertById && ((m) => alertById.get(m.id))}
                  onOpenLog={handleOpenLog}
                />
              )}

              <footer className="dashboard__footer">
                <p className="mono">
                  Showing {first}–{last} of {filtered.length} machines · Click a card for its parameter log
                </p>
                {pageCount > 1 && <Pagination page={currentPage} pageCount={pageCount} onChange={setPage} />}
              </footer>
            </section>
          )}
        </div>
      </div>

      {editing && (
        <ImageDialog
          machine={editing.machine}
          current={imageFor(editing.machine)}
          initialFile={editing.file}
          onSave={(image, options) => handleSaveImage(editing.machine, image, options)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
