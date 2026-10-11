// Pure rules for the pomodoro timer: the phase sequence, the time left, the
// state changes and the settings validation. No QML here, so
// test/pomodoro-test.js can run it under node.

// Lengths are minutes. sessions is how many focus rounds end in a long break.
var DEFAULTS = { focus: 25, break: 5, longBreak: 30, sessions: 4 }
var LIMITS = { focus: [1, 180], break: [1, 180], longBreak: [1, 180], sessions: [1, 12] }
var PHASES = ["focus", "break", "longBreak"]
var STATUSES = ["idle", "running", "paused"]
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

// endsAt is a clock time in milliseconds, set while running.
// remaining is milliseconds, set while paused. count is focus rounds finished
// on day.
function initialState() {
  return { phase: "focus", status: "idle", endsAt: 0, remaining: 0, session: 1, count: 0, day: "" }
}

function parseState(text) {
  var parsed = null
  try { parsed = JSON.parse(text) } catch (e) { return initialState() }
  // Written by a version that waited at the end of a phase.
  if (parsed !== null && typeof parsed === "object" && parsed.status === "over") parsed = assign(parsed, { status: "idle", endsAt: 0, remaining: 0 })
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

// Milliseconds left in the phase.
function left(state, config, now) {
  if (state.status === "idle") return durationMs(config, state.phase)
  if (state.status === "paused") return state.remaining
  return Math.max(0, state.endsAt - now)
}

function format(ms) {
  var seconds = Math.ceil(ms / 1000)
  var pad = function (value) { return (value < 10 ? "0" : "") + value }
  return pad(Math.floor(seconds / 60)) + ":" + pad(seconds % 60)
}

function begin(state, config, phase, session, now) {
  return assign(state, { phase: phase, session: session, status: "running", endsAt: now + durationMs(config, phase), remaining: 0 })
}

// A running phase whose time is up hands over to the next one, which starts
// at the moment the last one ended, so a late tick costs it nothing. A finished
// focus round is counted here, once.
//
// When the next phase has run out as well, nobody was watching: the bar was
// down or the machine asleep for longer than a whole phase. The timer stops at
// that phase instead of running on and counting rounds nobody worked.
function advance(state, config, now) {
  if (state.status !== "running" || now < state.endsAt) return state
  var following = next(state, config)
  var counted = assign(state, { count: state.phase === "focus" ? state.count + 1 : state.count })
  var started = begin(counted, config, following.phase, following.session, state.endsAt)
  return now < started.endsAt ? started : assign(started, { status: "idle", endsAt: 0 })
}

// Start, pause or resume.
function toggle(state, config, now) {
  if (state.status === "idle") return begin(state, config, state.phase, state.session, now)
  if (state.status === "running") return assign(state, { status: "paused", remaining: Math.max(0, state.endsAt - now), endsAt: 0 })
  return assign(state, { status: "running", endsAt: now + state.remaining, remaining: 0 })
}

// Ends the phase now without counting it and starts the next one.
function skip(state, config, now) {
  if (state.status !== "running" && state.status !== "paused") return state
  var following = next(state, config)
  return begin(state, config, following.phase, following.session, now)
}

// Back to the first session. The day's count is kept.
function reset(state) {
  return assign(state, { phase: "focus", status: "idle", endsAt: 0, remaining: 0, session: 1 })
}

function title(state) {
  return TITLES[state.phase] + (state.status === "paused" ? " paused" : "")
}

function actionLabel(state) {
  if (state.status === "running") return "Pause"
  if (state.status === "paused") return "Resume"
  return "Start " + TITLES[state.phase].toLowerCase()
}

function sessionLabel(state, config) {
  return "Session " + state.session + " of " + Math.max(state.session, config.sessions)
}

function countLabel(state) {
  return state.count === 1 ? "1 focus round done today" : state.count + " focus rounds done today"
}

// The notification for the phase that has just ended, given the state it led to.
function notification(previous, state, config) {
  var ended = previous.phase === "focus" ? "Focus round done" : TITLES[previous.phase] + " over"
  if (state.status !== "running") return { title: ended, body: "The timer stopped while you were away." }
  return { title: ended, body: TITLES[state.phase] + " started, " + config[state.phase] + " minutes." }
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
    advance: advance,
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
