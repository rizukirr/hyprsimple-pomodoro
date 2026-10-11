import QtQuick
import Quickshell
import Quickshell.Io
import "lib/Pomodoro.js" as Pomodoro

// The one timer every monitor shows. It owns the settings file and the saved
// state, and nothing else writes either. The rules are in lib/Pomodoro.js.
Item {
    id: root
    required property var context

    readonly property string configPath: (Quickshell.env("XDG_CONFIG_HOME") || Quickshell.env("HOME") + "/.config") + "/hyprsimple/plugins/pomodoro.json"
    readonly property string statePath: (Quickshell.env("XDG_STATE_HOME") || Quickshell.env("HOME") + "/.local/state") + "/hyprsimple/plugins/pomodoro.json"

    property var config: Pomodoro.parseConfig("")
    property var timer: Pomodoro.initialState()
    // Nothing is changed or saved until the saved state has been read, or a key
    // pressed during startup would overwrite a round in progress.
    property bool restored: false
    property double now: Date.now()

    readonly property string status: timer.status
    readonly property string phase: timer.phase
    readonly property string label: Pomodoro.format(Pomodoro.left(timer, config, now))
    readonly property string title: Pomodoro.title(timer)
    readonly property string actionLabel: Pomodoro.actionLabel(timer, config)
    readonly property string sessionLabel: Pomodoro.sessionLabel(timer, config)
    readonly property string countLabel: Pomodoro.countLabel(timer)

    // True while a file is still being written.
    readonly property bool saving: stateWriter.busy || configWriter.busy

    // One write at a time per file, and the newest value wins. Separate detached
    // writes could finish out of order and leave an older state on disk.
    component Writer: Process {
        required property string path
        property var pending: null
        readonly property bool busy: running || pending !== null

        function save(value) {
            pending = JSON.stringify(value, null, 2)
            if (!running) flush()
        }
        // Written beside the file and renamed over it, so a reader never sees half.
        function flush() {
            if (pending === null) return
            command = ["sh", "-c", 'mkdir -p "$(dirname "$1")" && printf "%s\\n" "$2" >"$1.tmp" && mv -f "$1.tmp" "$1"', "sh", path, pending]
            pending = null
            running = true
        }
        onExited: flush()
    }

    Writer { id: stateWriter; path: root.statePath }
    Writer { id: configWriter; path: root.configPath }

    function commit(next) {
        if (next === root.timer) return
        root.timer = next
        stateWriter.save(next)
    }

    // Brings the state up to the clock: a new day, and a phase whose time ran
    // out, whether the bar was running at that moment or not.
    function refresh() {
        if (!root.restored) return
        root.now = Date.now()
        const current = Pomodoro.withDay(root.timer, Pomodoro.today(new Date(root.now)))
        const expired = Pomodoro.expire(current, root.now)
        if (expired !== current) {
            const message = Pomodoro.notification(expired, root.config)
            Quickshell.execDetached(["notify-send", "-a", "Pomodoro", message.title, message.body])
        }
        root.commit(expired)
    }

    function act(change) {
        if (!root.restored) return
        root.refresh()
        root.commit(change(root.timer, Date.now()))
    }

    function toggle() { root.act((state, now) => Pomodoro.toggle(state, root.config, now)) }
    function skip() { root.act((state, now) => Pomodoro.skip(state, now)) }
    function reset() { root.act(state => Pomodoro.reset(state)) }

    // False when the value is refused. A new length applies from the next phase.
    function setSetting(key, text) {
        const value = Pomodoro.parseNumber(key, text)
        if (value === null) return false
        if (value === root.config[key]) return true
        const next = Object.assign({}, root.config)
        next[key] = value
        root.config = next
        configWriter.save(next)
        return true
    }

    // Picks up a settings file edited by hand since the bar started.
    function reloadConfig() { configFile.reload() }

    FileView {
        id: configFile
        path: root.configPath
        watchChanges: true
        printErrors: false
        onFileChanged: configFile.reload()
        onLoaded: root.config = Pomodoro.parseConfig(configFile.text())
        onLoadFailed: root.config = Pomodoro.parseConfig("")
    }

    FileView {
        id: stateFile
        path: root.statePath
        printErrors: false
        function restore(text) {
            if (root.restored) return
            root.timer = Pomodoro.parseState(text)
            root.restored = true
            root.refresh()
        }
        onLoaded: restore(stateFile.text())
        onLoadFailed: restore("")
    }

    // Idle and paused need no clock, so nothing runs then.
    Timer {
        interval: 1000
        repeat: true
        running: root.status === "running" || root.status === "over"
        onTriggered: root.refresh()
    }

    IpcHandler {
        target: "pomodoro"
        function toggle(): void { root.toggle() }
        function skip(): void { root.skip() }
        function reset(): void { root.reset() }
    }
}
