// Pure rules for the pomodoro timer: the phase sequence, the time left, the
// state changes and the settings validation. No QML here, so
// test/pomodoro-test.js can run it under node.

// Lengths are minutes. sessions is how many focus rounds end in a long break.
var DEFAULTS = { focus: 25, break: 5, longBreak: 30, sessions: 4 }
var LIMITS = { focus: [1, 180], break: [1, 180], longBreak: [1, 180], sessions: [1, 12] }
var PHASES = ["focus", "break", "longBreak"]
var STATUSES = ["idle", "running", "paused", "over"]
var TITLES = { focus: "Focus", break: "Break", longBreak: "Long break" }

function assign(state, changes) {
  return Object.assign({}, state, changes)
}

// A whole number inside the setting's limits, or null.
function parseNumber(key, text) {
  var trimmed = String(text).trim()
  var limits = LIMITS[key]
  if (!limits || !/^[0-9]+$/.test(trimmed)) return null
  var value = parseInt(trimmed, 10)
  return value >= limits[0] && value <= limits[1] ? value : null
}

// Every key falls back to its default on its own, so one bad value does not
// discard the others.
function parseConfig(text) {
  var parsed = null
  try { parsed = JSON.parse(text) } catch (e) { parsed = null }
  var config = {}
  Object.keys(DEFAULTS).forEach(function (key) {
    var value = parsed !== null && typeof parsed === "object" && typeof parsed[key] === "number" ? parseNumber(key, parsed[key]) : null
    config[key] = value === null ? DEFAULTS[key] : value
  })
  return config
}

// endsAt is a clock time in milliseconds, set while running or over.
// remaining is milliseconds, set while paused. count is focus rounds finished
// on day.
function initialState() {
  return { phase: "focus", status: "idle", endsAt: 0, remaining: 0, session: 1, count: 0, day: "" }
}

function parseState(text) {
  var parsed = null
  try { parsed = JSON.parse(text) } catch (e) { return initialState() }
  var whole = function (value) { return typeof value === "number" && isFinite(value) && value >= 0 }
  if (parsed === null || typeof parsed !== "object" ||
      PHASES.indexOf(parsed.phase) === -1 || STATUSES.indexOf(parsed.status) === -1 ||
      !whole(parsed.endsAt) || !whole(parsed.remaining) || !whole(parsed.count) ||
      !whole(parsed.session) || parsed.session < 1 || typeof parsed.day !== "string") return initialState()
  return { phase: parsed.phase, status: parsed.status, endsAt: parsed.endsAt, remaining: parsed.remaining, session: parsed.session, count: parsed.count, day: parsed.day }
}

function today(date) {
  var pad = function (value) { return (value < 10 ? "0" : "") + value }
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate())
}

// The count is per day.
function withDay(state, day) {
  return state.day === day ? state : assign(state, { day: day, count: 0 })
}

function durationMs(config, phase) {
  return config[phase] * 60000
}

// The last focus round of a set is followed by the long break, in place of a
// short one.
function next(state, config) {
  if (state.phase === "focus") return { phase: state.session >= config.sessions ? "longBreak" : "break", session: state.session }
  if (state.phase === "break") return { phase: "focus", session: state.session + 1 }
  return { phase: "focus", session: 1 }
}

// Milliseconds left in the phase. Negative once it is over, by how long it
// has been waiting.
function left(state, config, now) {
  if (state.status === "idle") return durationMs(config, state.phase)
  if (state.status === "paused") return state.remaining
  return state.endsAt - now
}

function format(ms) {
  var seconds = ms < 0 ? Math.floor(-ms / 1000) : Math.ceil(ms / 1000)
  var pad = function (value) { return (value < 10 ? "0" : "") + value }
  return (ms < 0 ? "+" : "") + pad(Math.floor(seconds / 60)) + ":" + pad(seconds % 60)
}

function begin(state, config, phase, session, now) {
  return assign(state, { phase: phase, session: session, status: "running", endsAt: now + durationMs(config, phase), remaining: 0 })
}

// A running phase whose time is up becomes over and waits. A finished focus
// round is counted here, once.
function expire(state, now) {
  if (state.status !== "running" || now < state.endsAt) return state
  return assign(state, { status: "over", count: state.phase === "focus" ? state.count + 1 : state.count })
}

// Start, pause, resume, or move on from a phase that is over.
function toggle(state, config, now) {
  if (state.status === "idle") return begin(state, config, state.phase, state.session, now)
  if (state.status === "running") return assign(state, { status: "paused", remaining: Math.max(0, state.endsAt - now), endsAt: 0 })
  if (state.status === "paused") return assign(state, { status: "running", endsAt: now + state.remaining, remaining: 0 })
  var following = next(state, config)
  return begin(state, config, following.phase, following.session, now)
}

// Ends the phase now without counting it, and waits like any other ending.
function skip(state, now) {
  if (state.status !== "running" && state.status !== "paused") return state
  return assign(state, { status: "over", endsAt: now, remaining: 0 })
}

// Back to the first session. The day's count is kept.
function reset(state) {
  return assign(state, { phase: "focus", status: "idle", endsAt: 0, remaining: 0, session: 1 })
}

function title(state) {
  return TITLES[state.phase] + (state.status === "over" ? " done" : state.status === "paused" ? " paused" : "")
}

function actionLabel(state, config) {
  if (state.status === "running") return "Pause"
  if (state.status === "paused") return "Resume"
  var phase = state.status === "over" ? next(state, config).phase : state.phase
  return "Start " + TITLES[phase].toLowerCase()
}

function sessionLabel(state, config) {
  return "Session " + state.session + " of " + Math.max(state.session, config.sessions)
}

function countLabel(state) {
  return state.count === 1 ? "1 focus round done today" : state.count + " focus rounds done today"
}

// The notification for a phase that has just ended.
function notification(state, config) {
  var following = next(state, config).phase
  if (state.phase !== "focus") return { title: TITLES[state.phase] + " over", body: "Ready for the next focus round." }
  return { title: "Focus round done", body: "Time for a " + config[following] + " minute " + TITLES[following].toLowerCase() + "." }
}

if (typeof module !== "undefined") {
  module.exports = {
    DEFAULTS: DEFAULTS,
    LIMITS: LIMITS,
    parseNumber: parseNumber,
    parseConfig: parseConfig,
    initialState: initialState,
    parseState: parseState,
    today: today,
    withDay: withDay,
    durationMs: durationMs,
    next: next,
    left: left,
    format: format,
    expire: expire,
    toggle: toggle,
    skip: skip,
    reset: reset,
    title: title,
    actionLabel: actionLabel,
    sessionLabel: sessionLabel,
    countLabel: countLabel,
    notification: notification
  }
}
