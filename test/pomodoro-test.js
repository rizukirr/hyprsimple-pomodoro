const assert = require('node:assert/strict')
const P = require('../lib/Pomodoro.js')

const MIN = 60000
const config = P.parseConfig('')
assert.deepEqual(config, { focus: 25, break: 5, longBreak: 30, sessions: 4 })
assert.deepEqual(P.parseConfig('{'), config)
assert.deepEqual(P.parseConfig('[]'), config)
assert.deepEqual(P.parseConfig('{"focus":50,"break":0,"longBreak":"15","sessions":3.5,"extra":1}'), { focus: 50, break: 5, longBreak: 30, sessions: 4 })
assert.deepEqual(P.parseConfig('{"focus":50,"break":10,"longBreak":20,"sessions":3}'), { focus: 50, break: 10, longBreak: 20, sessions: 3 })
console.log('ok - config defaults, and one bad value does not discard the others')

assert.equal(P.parseNumber('focus', ' 45 '), 45)
for (const bad of ['', '0', '181', '-5', '2.5', 'abc', '1e2']) assert.equal(P.parseNumber('focus', bad), null, bad)
assert.equal(P.parseNumber('sessions', '12'), 12)
assert.equal(P.parseNumber('sessions', '13'), null)
assert.equal(P.parseNumber('unknown', '5'), null)
console.log('ok - settings accept whole numbers inside their limits only')

// Start once, then let the clock run: every phase hands over to the next.
const walk = (sessions, steps) => {
  const c = Object.assign({}, config, { sessions })
  let state = P.toggle(P.initialState(), c, 1000)
  const seen = []
  for (let i = 0; i < steps; i++) {
    assert.equal(state.status, 'running')
    seen.push(state.phase + state.session)
    const ended = state.endsAt
    assert.equal(P.advance(state, c, ended - 1), state)
    state = P.advance(state, c, ended)
    assert.equal(state.endsAt, ended + c[state.phase] * MIN)
  }
  return { seen, state }
}
assert.deepEqual(walk(3, 7).seen, ['focus1', 'break1', 'focus2', 'break2', 'focus3', 'longBreak3', 'focus1'])
assert.deepEqual(walk(4, 8).seen, ['focus1', 'break1', 'focus2', 'break2', 'focus3', 'break3', 'focus4', 'longBreak4'])
assert.deepEqual(walk(1, 4).seen, ['focus1', 'longBreak1', 'focus1', 'longBreak1'])
assert.equal(walk(3, 6).state.count, 3)
console.log('ok - once started every phase runs into the next, and the long break replaces the last short break')

let state = P.toggle(P.initialState(), config, 0)
assert.equal(P.left(state, config, 0), 25 * MIN)
assert.equal(P.format(P.left(state, config, 0)), '25:00')
assert.equal(P.format(P.left(state, config, 500)), '25:00')
assert.equal(P.format(P.left(state, config, 1000)), '24:59')
assert.equal(P.format(P.left(state, config, 26 * MIN)), '00:00')
assert.equal(P.format(P.left(P.initialState(), config, 123)), '25:00')
// A tick that arrives late still starts the break at the moment focus ended.
state = P.advance(state, config, 25 * MIN + 3000)
assert.deepEqual([state.phase, state.status, state.count, state.endsAt], ['break', 'running', 1, 30 * MIN])
assert.equal(P.format(P.left(state, config, 25 * MIN + 3000)), '04:57')
console.log('ok - time left comes from the clock, and a late tick costs the next phase nothing')

// Asleep or with the bar down past the end of the next phase too: stop there.
state = P.advance(P.toggle(P.initialState(), config, 0), config, 8 * 60 * MIN)
assert.deepEqual([state.phase, state.status, state.count, state.session, state.endsAt], ['break', 'idle', 1, 1, 0])
assert.equal(P.advance(state, config, 9 * 60 * MIN), state)
assert.deepEqual(P.notification(P.toggle(P.initialState(), config, 0), state, config), { title: 'Focus round done', body: 'The timer stopped while you were away.' })
// Back within the next phase: it is simply running.
state = P.advance(P.toggle(P.initialState(), config, 0), config, 28 * MIN)
assert.deepEqual([state.phase, state.status], ['break', 'running'])
console.log('ok - a whole phase missed stops the timer instead of counting rounds nobody worked')

state = P.toggle(P.initialState(), config, 0)
state = P.toggle(state, config, 10 * MIN)
assert.equal(state.status, 'paused')
assert.equal(P.left(state, config, 99 * MIN), 15 * MIN)
assert.equal(P.advance(state, config, 99 * MIN), state)
state = P.toggle(state, config, 60 * MIN)
assert.equal(state.status, 'running')
assert.equal(state.endsAt, 75 * MIN)
console.log('ok - a paused phase keeps its time however long the pause lasts')

state = P.skip(P.toggle(P.initialState(), config, 0), config, 3 * MIN)
assert.deepEqual([state.phase, state.status, state.count, state.endsAt], ['break', 'running', 0, 8 * MIN])
state = P.skip(P.toggle(state, config, 4 * MIN), config, 5 * MIN)
assert.deepEqual([state.phase, state.status, state.session], ['focus', 'running', 2])
assert.equal(P.skip(P.initialState(), config, 0).status, 'idle')
console.log('ok - skip starts the next phase at once without counting the one it ended')

state = P.advance(P.toggle(P.initialState(), config, 0), config, 25 * MIN)
state = P.toggle(state, config, 27 * MIN)
state = P.reset(state)
assert.deepEqual([state.phase, state.status, state.session, state.count, state.remaining, state.endsAt], ['focus', 'idle', 1, 1, 0, 0])
console.log('ok - reset stops the timer at the first session and keeps the count')

state = P.withDay(Object.assign(P.initialState(), { count: 5, day: '2026-10-10' }), '2026-10-10')
assert.equal(state.count, 5)
assert.equal(P.withDay(state, '2026-10-10'), state)
assert.deepEqual([P.withDay(state, '2026-10-11').count, P.withDay(state, '2026-10-11').day], [0, '2026-10-11'])
assert.equal(P.today(new Date(2026, 0, 5, 23, 59)), '2026-01-05')
console.log('ok - the count starts again on a new day')

// A longer setting applies from the next phase, never to one in progress.
state = P.toggle(P.initialState(), config, 0)
const longer = Object.assign({}, config, { focus: 50, break: 10 })
assert.equal(P.left(state, longer, 0), 25 * MIN)
state = P.advance(state, longer, 25 * MIN)
assert.equal(P.left(state, longer, 25 * MIN), 10 * MIN)
console.log('ok - a changed length applies from the next phase')

const saved = P.toggle(P.initialState(), config, 5000)
assert.deepEqual(P.parseState(JSON.stringify(saved)), saved)
for (const bad of ['', '{', 'null', '{"phase":"nap"}', JSON.stringify(Object.assign({}, saved, { endsAt: 'soon' })), JSON.stringify(Object.assign({}, saved, { session: 0 }))])
  assert.deepEqual(P.parseState(bad), P.initialState(), bad)
// A file from the version that waited at the end of a phase.
assert.deepEqual(P.parseState(JSON.stringify(Object.assign({}, saved, { status: 'over', count: 2 }))), Object.assign(P.initialState(), { count: 2 }))
console.log('ok - saved state round-trips, and a damaged file starts fresh')

state = P.initialState()
assert.deepEqual([P.title(state), P.actionLabel(state), P.sessionLabel(state, config)], ['Focus', 'Start focus', 'Session 1 of 4'])
state = P.toggle(state, config, 0)
assert.deepEqual([P.title(state), P.actionLabel(state)], ['Focus', 'Pause'])
assert.deepEqual([P.title(P.toggle(state, config, 1)), P.actionLabel(P.toggle(state, config, 1))], ['Focus paused', 'Resume'])
let after = P.advance(state, config, 25 * MIN)
assert.deepEqual([P.title(after), P.actionLabel(after), P.countLabel(after)], ['Break', 'Pause', '1 focus round done today'])
assert.deepEqual(P.notification(state, after, config), { title: 'Focus round done', body: 'Break started, 5 minutes.' })
assert.deepEqual(P.notification(after, P.advance(after, config, 30 * MIN), config), { title: 'Break over', body: 'Focus started, 25 minutes.' })
const last = Object.assign({}, state, { session: 4 })
after = P.advance(last, config, 25 * MIN)
assert.deepEqual(P.notification(last, after, config), { title: 'Focus round done', body: 'Long break started, 30 minutes.' })
assert.deepEqual(P.notification(after, P.advance(after, config, 55 * MIN), config), { title: 'Long break over', body: 'Focus started, 25 minutes.' })
assert.equal(P.actionLabel(Object.assign(P.initialState(), { phase: 'longBreak' })), 'Start long break')
assert.equal(P.countLabel(Object.assign({}, state, { count: 0 })), '0 focus rounds done today')
console.log('ok - labels and notifications name the right phase')
