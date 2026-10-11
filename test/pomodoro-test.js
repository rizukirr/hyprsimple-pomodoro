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

// Walk whole cycles by starting each phase and letting it run out.
const walk = (sessions, steps) => {
  const c = Object.assign({}, config, { sessions })
  let state = P.initialState()
  let now = 1000
  const seen = []
  for (let i = 0; i < steps; i++) {
    state = P.toggle(state, c, now)
    assert.equal(state.status, 'running')
    assert.equal(state.endsAt, now + c[state.phase] * MIN)
    seen.push(state.phase + state.session)
    now = state.endsAt
    state = P.expire(state, now)
    assert.equal(state.status, 'over')
  }
  return { seen, state }
}
assert.deepEqual(walk(3, 7).seen, ['focus1', 'break1', 'focus2', 'break2', 'focus3', 'longBreak3', 'focus1'])
assert.deepEqual(walk(4, 8).seen, ['focus1', 'break1', 'focus2', 'break2', 'focus3', 'break3', 'focus4', 'longBreak4'])
assert.deepEqual(walk(1, 4).seen, ['focus1', 'longBreak1', 'focus1', 'longBreak1'])
assert.equal(walk(3, 6).state.count, 3)
console.log('ok - the long break replaces the last short break, then the cycle repeats')

let state = P.toggle(P.initialState(), config, 0)
assert.equal(P.left(state, config, 0), 25 * MIN)
assert.equal(P.format(P.left(state, config, 0)), '25:00')
assert.equal(P.format(P.left(state, config, 500)), '25:00')
assert.equal(P.format(P.left(state, config, 1000)), '24:59')
assert.equal(P.expire(state, 25 * MIN - 1), state)
// The clock decides, so time that passed while suspended or restarted counts.
state = P.expire(state, 40 * MIN)
assert.equal(state.status, 'over')
assert.equal(state.count, 1)
assert.equal(P.format(P.left(state, config, 40 * MIN)), '+15:00')
assert.equal(P.format(P.left(state, config, 25 * MIN + 2500)), '+00:02')
assert.equal(P.expire(state, 50 * MIN), state)
assert.equal(P.format(P.left(P.initialState(), config, 123)), '25:00')
console.log('ok - time left comes from the clock, overrun is shown, and a round is counted once')

state = P.toggle(P.initialState(), config, 0)
state = P.toggle(state, config, 10 * MIN)
assert.equal(state.status, 'paused')
assert.equal(P.left(state, config, 99 * MIN), 15 * MIN)
assert.equal(P.expire(state, 99 * MIN), state)
state = P.toggle(state, config, 60 * MIN)
assert.equal(state.status, 'running')
assert.equal(state.endsAt, 75 * MIN)
console.log('ok - a paused phase keeps its time however long the pause lasts')

state = P.skip(P.toggle(P.initialState(), config, 0), 3 * MIN)
assert.equal(state.status, 'over')
assert.equal(state.count, 0)
assert.equal(P.format(P.left(state, config, 3 * MIN)), '00:00')
assert.equal(P.format(P.left(state, config, 3 * MIN + 1500)), '+00:01')
assert.equal(P.toggle(state, config, 4 * MIN).phase, 'break')
assert.equal(P.skip(P.initialState(), 0).status, 'idle')
console.log('ok - skip ends the phase without counting it, and the sequence carries on')

state = P.expire(P.toggle(P.initialState(), config, 0), 25 * MIN)
state = P.toggle(P.toggle(state, config, 26 * MIN), config, 27 * MIN)
state = P.reset(state)
assert.deepEqual([state.phase, state.status, state.session, state.count, state.remaining, state.endsAt], ['focus', 'idle', 1, 1, 0, 0])
console.log('ok - reset returns to the first session and keeps the count')

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
state = P.toggle(P.expire(state, 25 * MIN), longer, 25 * MIN)
assert.equal(P.left(state, longer, 25 * MIN), 10 * MIN)
console.log('ok - a changed length applies from the next phase')

const saved = P.toggle(P.initialState(), config, 5000)
assert.deepEqual(P.parseState(JSON.stringify(saved)), saved)
for (const bad of ['', '{', 'null', '{"phase":"nap"}', JSON.stringify(Object.assign({}, saved, { endsAt: 'soon' })), JSON.stringify(Object.assign({}, saved, { session: 0 }))])
  assert.deepEqual(P.parseState(bad), P.initialState(), bad)
console.log('ok - saved state round-trips, and a damaged file starts fresh')

state = P.initialState()
assert.deepEqual([P.title(state), P.actionLabel(state, config), P.sessionLabel(state, config)], ['Focus', 'Start focus', 'Session 1 of 4'])
state = P.toggle(state, config, 0)
assert.deepEqual([P.title(state), P.actionLabel(state, config)], ['Focus', 'Pause'])
assert.deepEqual([P.title(P.toggle(state, config, 1)), P.actionLabel(P.toggle(state, config, 1), config)], ['Focus paused', 'Resume'])
state = P.expire(state, 25 * MIN)
assert.deepEqual([P.title(state), P.actionLabel(state, config), P.countLabel(state)], ['Focus done', 'Start break', '1 focus round done today'])
assert.deepEqual(P.notification(state, config), { title: 'Focus round done', body: 'Time for a 5 minute break.' })
const last = Object.assign({}, state, { session: 4 })
assert.equal(P.actionLabel(last, config), 'Start long break')
assert.deepEqual(P.notification(last, config), { title: 'Focus round done', body: 'Time for a 30 minute long break.' })
assert.deepEqual(P.notification(Object.assign({}, state, { phase: 'longBreak' }), config), { title: 'Long break over', body: 'Ready for the next focus round.' })
assert.equal(P.countLabel(Object.assign({}, state, { count: 0 })), '0 focus rounds done today')
console.log('ok - labels and notifications name the right phase')
