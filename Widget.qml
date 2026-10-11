import QtQuick
import Hyprsimple

// Left click opens the panel. Middle click starts, pauses or moves on.
Capsule {
    id: root
    required property var context
    readonly property var service: context.service

    StatusButton {
        icon: root.service.phase === "focus" ? "timer" : "weekend"
        label: root.service.status === "idle" ? "" : root.service.label
        active: root.context.panelOpen
        highlighted: root.service.status === "over"
        dim: root.service.status === "paused"
        tooltip: root.service.status === "idle" ? "Pomodoro" : `${root.service.title}, ${root.service.sessionLabel.toLowerCase()}`
        onClicked: root.context.togglePanel()
        TapHandler {
            acceptedButtons: Qt.MiddleButton
            onTapped: root.service.toggle()
        }
    }
}
