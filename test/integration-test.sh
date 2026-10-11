#!/bin/bash
# The real manager and the real QML, in an isolated home with no desktop.
set -euo pipefail
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
CORE=$(realpath "${HYPRSIMPLE_SOURCE:?Set HYPRSIMPLE_SOURCE to the core checkout}")
TMP=$(mktemp -d)
trap 'kill "${qs_pid:-}" 2>/dev/null || true; rm -rf "${TMP:?}"' EXIT
export HOME="$TMP/home" XDG_CONFIG_HOME="$TMP/home/.config" XDG_RUNTIME_DIR="$TMP/runtime"
export XDG_DATA_HOME="$HOME/.local/share" XDG_STATE_HOME="$HOME/.local/state" XDG_CACHE_HOME="$HOME/.cache"
export HYPRSIMPLE_PATH="$CORE" HYPRSIMPLE_PLUGIN_ROOT="$HOME/.local/share/hyprsimple-plugins"
export PATH="$TMP/bin:$PATH" CALLS="$TMP/calls"
export QML_IMPORT_PATH="$TMP/shell" QT_QPA_PLATFORM=offscreen DBUS_SESSION_BUS_ADDRESS="unix:path=$TMP/no-bus"
unset WAYLAND_DISPLAY DISPLAY HYPRLAND_INSTANCE_SIGNATURE
mkdir -p "$TMP/bin" "$TMP/source" "$TMP/shell" "$XDG_RUNTIME_DIR" "$HOME/.local/bin"
chmod 700 "$XDG_RUNTIME_DIR"
CONFIG="$XDG_CONFIG_HOME/hyprsimple/plugins/pomodoro.json"
STATE="$XDG_STATE_HOME/hyprsimple/plugins/pomodoro.json"

# The manager clones committed content. Commit a snapshot only in a scratch repo.
cp -a "$REPO/manifest.json" "$REPO/Service.qml" "$REPO/Widget.qml" "$REPO/Panel.qml" "$REPO/lib" "$REPO/views" "$TMP/source/"
git -C "$TMP/source" init -q -b main
git -C "$TMP/source" add .
git -C "$TMP/source" -c user.name=Fixture -c user.email=fixture@example.invalid commit -qm fixture
cat >"$TMP/bin/notify-send" <<'STUB'
#!/bin/bash
printf '%s\n' "$*" >>"$CALLS"
STUB
for command in sudo pacman paru yay hyprctl; do
  cat >"$TMP/bin/$command" <<'STUB'
#!/bin/bash
printf 'unexpected operation: %s\n' "$0 $*" >&2
exit 99
STUB
done
printf '#!/bin/bash\nexit 0\n' >"$HOME/.local/bin/hyprsimple-restart-bar.sh"
chmod +x "$TMP/bin/"* "$HOME/.local/bin/hyprsimple-restart-bar.sh"
manager() { bash "$CORE/.local/bin/hyprsimple-plugin" "$@"; }
manager install --local "$TMP/source"
jq -e '.plugins.pomodoro.enabled and .plugins.pomodoro.placement == "left"' "$XDG_CONFIG_HOME/hyprsimple/plugins.json" >/dev/null
echo 'ok - the real manager installs and enables the plugin with no dependencies'

for dir in plugins theme bar components panels system launcher notifications; do ln -s "$CORE/default/quickshell/$dir" "$TMP/shell/$dir"; done
# Offscreen Quickshell cannot create a layer-shell window. Replace only that
# boundary in a scratch copy of the public module. Panel.qml and both views
# are the real ones.
mkdir -p "$TMP/shell/Hyprsimple"
sed 's|../panels/PopupPanel.qml|MockPopupPanel.qml|' "$CORE/default/quickshell/Hyprsimple/qmldir" >"$TMP/shell/Hyprsimple/qmldir"
cat >"$TMP/shell/Hyprsimple/MockPopupPanel.qml" <<'QML'
import QtQuick
Item {
    required property var bar
    required property Item anchorItem
    required property string name
    property int panelWidth: 400
    property Item focusTarget: null
    readonly property bool open: bar.openPanel === name
    width: panelWidth
    function dismiss() { bar.openPanel = "" }
}
QML
harness() {
  cat >"$TMP/shell/shell.qml" <<QML
import QtQuick
import Quickshell
import qs.plugins
import qs.theme
import qs.components
import qs.bar
import qs.panels
ShellRoot {
    id: root
    property int failures: 0
    property int stage: 0
    property var widget: null
    property var panel: null
    Registry { id: registry; onFailed: root.failures++ }
    Item {
        id: bar
        property var screen: ({name: "fixture"})
        property string openPanel: ""
        function toggle(name) { openPanel = openPanel === name ? "" : name }
    }
    PluginContext { id: context; pluginId: "pomodoro"; bar: bar; screen: bar.screen; anchorItem: bar }
    function require(value, message) {
        if (!value) { console.error("SMOKE-FAIL", message); Qt.quit(); throw Error(message) }
    }
    Timer {
        interval: 100
        running: registry.ready
        repeat: true
        onTriggered: {
            const service = registry.services.pomodoro
            require(root.failures === 0 && registry.plugins.length === 1 && service, "registry acceptance")
            if (!service.restored) return
            if (root.stage === 0) {
                context.service = service
                const plugin = registry.plugins[0]
                root.widget = registry.create(plugin.dir + "/Widget.qml", bar, context, "pomodoro")
                root.panel = registry.create(plugin.dir + "/Panel.qml", bar, context, "pomodoro")
                require(root.widget && root.panel && root.failures === 0, "widget and panel load")
            }
$1
        }
    }
    // Quit once the last write has landed.
    Timer { id: quit; interval: 50; repeat: true; onTriggered: if (!registry.services.pomodoro.saving) Qt.quit() }
}
QML
}
run() { timeout 20 qs -p "$TMP/shell" --no-color >"$TMP/log" 2>&1 || { cat "$TMP/log"; exit 1; }; }
passed() {
  if ! grep -q 'SMOKE-PASS' "$TMP/log" || grep -q 'SMOKE-FAIL' "$TMP/log"; then cat "$TMP/log"; exit 1; fi
}

# First start: no files yet. Drive a round from the service and the views.
harness '
            if (root.stage !== 0) return
            root.stage = 1
            require(service.status === "idle" && service.label === "25:00", "defaults before any file exists")
            bar.toggle(context.panelId)
            require(root.panel.open, "panel opens")
            service.toggle()
            require(service.status === "running" && service.phase === "focus", "start")
            service.toggle()
            require(service.status === "paused", "pause")
            require(service.setSetting("focus", "50") && service.config.focus === 50, "valid setting saved")
            require(!service.setSetting("break", "0") && service.config.break === 5, "invalid setting refused")
            require(service.label !== "50:00", "a new length leaves the round in progress alone")
            root.panel.setSettingsOpen(true)
            require(root.panel.settingsOpen && root.failures === 0, "settings view loads")
            root.panel.setSettingsOpen(false)
            service.toggle()
            service.skip()
            require(service.status === "over" && service.timer.count === 0, "skip does not count")
            service.toggle()
            require(service.phase === "break" && service.status === "running", "sequence carries on")
            console.log("SMOKE-PASS")
            quit.start()
'
run
passed
jq -e '.focus == 50 and .break == 5 and .longBreak == 30 and .sessions == 4' "$CONFIG" >/dev/null
jq -e '.phase == "break" and .status == "running" and .session == 1 and .endsAt > 0' "$STATE" >/dev/null
[[ ! -e $CALLS ]]
echo 'ok - real service, widget, Panel.qml and both views: a round, the settings and the saved files'

# Second start: a focus round that ran out while the bar was down. It comes
# back over, counted once and announced, and a key can reset it over IPC.
day=$(date +%F)
jq -n --arg day "$day" '{phase:"focus",status:"running",endsAt:1000,remaining:0,session:4,count:2,day:$day}' >"$STATE"
printf '{"focus": 50, "sessions": 4, "longBreak": 20\n' >"$CONFIG"
harness '
            if (root.stage === 0) {
                root.stage = 1
                require(service.config.focus === 25 && service.config.longBreak === 30, "a damaged settings file falls back to defaults")
                require(service.status === "over" && service.timer.count === 3, "expired while down, counted once")
                require(service.label.startsWith("+"), "overrun shown")
                require(service.actionLabel === "Start long break", "the fourth session leads to the long break")
                console.log("READY")
            } else if (root.stage === 1 && service.status === "idle") {
                root.stage = 2
                require(service.timer.count === 3 && service.timer.session === 1, "reset keeps the count")
                console.log("SMOKE-PASS")
                quit.start()
            }
'
timeout 20 qs -p "$TMP/shell" --no-color >"$TMP/log" 2>&1 &
qs_pid=$!
for _ in $(seq 50); do grep -q 'READY\|SMOKE-FAIL' "$TMP/log" && break; sleep 0.1; done
qs -p "$TMP/shell" ipc show | grep -q 'function toggle(): void'
qs -p "$TMP/shell" ipc call pomodoro reset
wait "$qs_pid" || { cat "$TMP/log"; exit 1; }
qs_pid=''
passed
grep -qx -- '-a Pomodoro Focus round done Time for a 30 minute long break.' "$CALLS"
[[ $(wc -l <"$CALLS") == 1 ]]
jq -e --arg day "$day" '.status == "idle" and .count == 3 and .day == $day' "$STATE" >/dev/null
echo 'ok - a round that ended while the bar was down is counted and announced once, and IPC reset works'

manager disable pomodoro
manager enable pomodoro
manager remove pomodoro
[[ ! -e $HYPRSIMPLE_PLUGIN_ROOT/pomodoro ]]
[[ -f $CONFIG && -f $STATE ]]
echo 'ok - disable, enable and remove succeed, and removal keeps the settings and state files'
