# Pomodoro for Hyprsimple

A pomodoro timer in the [Hyprsimple](https://github.com/rizukirr/hyprsimple) bar: focus rounds, short breaks and a long break after a set number of rounds.

<img width="575" height="351" alt="2026-10-11-212700_screenshot" src="https://github.com/user-attachments/assets/8fd45d59-d128-4975-a2c3-de9e6fb8ca00" />

## Install

```sh
hyprsimple-plugin rizukirr/hyprsimple-pomodoro
```

It needs Hyprsimple 0.4.2 or later. It installs no packages and starts no background service.

## How it works

A cycle is a number of focus rounds, each followed by a break. The last round of the cycle is followed by the long break in place of a short one. With 3 sessions:

```
focus, break, focus, break, focus, long break, then again
```

You start it once. From then on each phase runs into the next by itself, with a notification at every change, until you pause or reset it.

The timer follows the clock. A suspended laptop or a restarted bar does not stretch or lose a round. If you come back after a whole phase has gone by unseen, such as a laptop left asleep for hours, the timer stops there instead of running on and counting rounds nobody worked.

## Use

| Action | Result |
|---|---|
| Click the widget | Open the panel |
| Middle click the widget | Start, pause or resume |
| Space in the panel | The same as middle click |
| `n` in the panel | Skip: start the next phase now without counting this one |
| `r` in the panel | Reset: stop, and go back to the first session |
| `s` in the panel | Open settings, or go back |
| Escape | Leave settings, then close the panel |

The widget shows an icon alone when nothing is running, the time left during a phase, dimmed while paused. The panel also shows which session you are on and how many focus rounds you have finished today.

## Settings

| Setting | Default | Limits |
|---|---|---|
| Focus | 25 minutes | 1 to 180 |
| Break | 5 minutes | 1 to 180 |
| Long break | 30 minutes | 1 to 180 |
| Sessions before a long break | 4 | 1 to 12 |

Change them with the settings button in the panel. A value is saved when you press Enter or leave the field, and a value outside its limits is refused.

They are stored in `~/.config/hyprsimple/plugins/pomodoro.json`, which you can also edit by hand:

```json
{
  "focus": 25,
  "break": 5,
  "longBreak": 30,
  "sessions": 4
}
```

An edit takes effect without restarting the bar. A missing file or key, or a value outside its limits, means the default. A new length applies from the next phase and never changes one in progress.

## Bind keys

The plugin binds no keys. Add the ones you want to `~/.config/hypr/bindings/applications.lua`:

```lua
hl.bind("SUPER + SHIFT + P", hl.dsp.exec_cmd("qs -p " .. vars.bar .. " ipc call pomodoro toggle"), { description = "Pomodoro: start or pause" })
hl.bind("SUPER + CTRL + P", hl.dsp.exec_cmd(vars.barPanel .. "pomodoro"), { description = "Pomodoro (panel)" })
```

Three actions are callable under the target `pomodoro`:

| Action | Does |
|---|---|
| `toggle` | Start, pause or resume |
| `skip` | Start the next phase now without counting the current one |
| `reset` | Stop and go back to the first session, keeping today's count |

From a terminal or a script:

```sh
qs -p ~/.local/share/hyprsimple/default/quickshell ipc call pomodoro toggle
```

## Files

| Path | Contents |
|---|---|
| `~/.config/hyprsimple/plugins/pomodoro.json` | The four settings |
| `~/.local/state/hyprsimple/plugins/pomodoro.json` | The current phase, when it ends, the session and today's count |

Removing the plugin leaves both in place.

## Develop

```sh
bash test/check.sh
HYPRSIMPLE_SOURCE=/path/to/hyprsimple bash test/check.sh
```

The first command needs Bash and Node.js. It tests the rules in `lib/Pomodoro.js`: the sequence, time left and overrun, pause, skip, reset, the daily count and the settings limits.

With `HYPRSIMPLE_SOURCE` set to a Hyprsimple checkout, it also installs the plugin with the real `hyprsimple-plugin install --local` into an isolated home and loads the real service, widget, panel and both views in Quickshell offscreen. It needs Quickshell and jq. Offscreen Quickshell cannot create the panel's layer-shell window, so that one boundary is replaced. Panel placement, focus and the look of the widget need a real Hyprland session.
