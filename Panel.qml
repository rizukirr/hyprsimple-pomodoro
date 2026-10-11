import QtQuick
import Hyprsimple
import "views"

// The timer, or its four settings.
// Keys: Space starts, pauses or moves on, n skips, r resets, s switches to
// settings and back, Esc leaves settings and then closes.
PopupPanel {
    id: root

    required property var context
    readonly property var service: context.service
    bar: context.bar
    anchorItem: context.anchorItem
    name: context.panelId
    property bool settingsOpen: false

    function setSettingsOpen(value) {
        settingsOpen = value
        keys.forceActiveFocus()
    }

    panelWidth: Theme.panelWidthNarrow + Theme.lg * 2
    focusTarget: keys
    onOpenChanged: {
        if (!open) {
            settingsOpen = false
            return
        }
        service.reloadConfig()
        service.refresh()
    }

    Item {
        id: keys

        width: parent.width
        height: page.item ? page.item.implicitHeight : 0

        // Keys typed into a text field never get here. Anything not handled carries on to the panel, which closes on Esc.
        Keys.onPressed: event => {
            const key = event.text.toLowerCase()
            if (event.key === Qt.Key_Escape && root.settingsOpen) root.setSettingsOpen(false)
            else if (key === "s") root.setSettingsOpen(!root.settingsOpen)
            else if (root.settingsOpen) return
            else if (event.key === Qt.Key_Space) root.service.toggle()
            else if (key === "n") root.service.skip()
            else if (key === "r") root.service.reset()
            else return
            event.accepted = true
        }

        Loader {
            id: page
            width: parent.width
            sourceComponent: root.settingsOpen ? settingsPage : timerPage
        }
    }

    Component {
        id: timerPage

        TimerView {
            service: root.service
            onSettingsRequested: root.setSettingsOpen(true)
        }
    }

    Component {
        id: settingsPage

        SettingsView {
            service: root.service
            onCloseRequested: root.setSettingsOpen(false)
        }
    }
}
