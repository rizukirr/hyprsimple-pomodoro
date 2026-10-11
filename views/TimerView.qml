import QtQuick
import QtQuick.Layouts
import Hyprsimple

// The phase, the time, and the buttons that drive it.
Column {
    id: root

    required property var service
    signal settingsRequested()

    spacing: Theme.md

    RowLayout {
        width: parent.width

        StyledText {
            Layout.fillWidth: true
            text: root.service.title
            font.bold: true
        }
        IconButton {
            icon: Theme.icon.settings
            onClicked: root.settingsRequested()
        }
    }

    StyledText {
        anchors.horizontalCenter: parent.horizontalCenter
        text: root.service.label
        opacity: root.service.status === "paused" ? Theme.dimmed : 1
        font.pixelSize: 2 * Theme.fontSizeLarge
        font.weight: Font.Medium
    }

    StyledText {
        anchors.horizontalCenter: parent.horizontalCenter
        text: root.service.sessionLabel
        color: Theme.muted
    }

    Row {
        anchors.horizontalCenter: parent.horizontalCenter
        spacing: Theme.sm

        TextButton {
            text: root.service.actionLabel
            filled: true
            onClicked: root.service.toggle()
        }
        TextButton {
            text: "Skip"
            visible: root.service.status === "running" || root.service.status === "paused"
            onClicked: root.service.skip()
        }
        TextButton {
            text: "Reset"
            visible: root.service.status !== "idle"
            onClicked: root.service.reset()
        }
    }

    SectionLabel {
        anchors.horizontalCenter: parent.horizontalCenter
        text: root.service.countLabel
    }
}
