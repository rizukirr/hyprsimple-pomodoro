import QtQuick
import QtQuick.Layouts
import Hyprsimple
import "../lib/Pomodoro.js" as Pomodoro

// The four numbers. Each is saved on Enter or when its field loses focus, and
// a value outside its limits is refused and left unsaved.
Column {
    id: root

    required property var service
    signal closeRequested()

    spacing: Theme.md

    component NumberField: Column {
        id: field

        required property string key
        required property string label
        readonly property string saved: String(root.service.config[key])
        property bool refused: false

        function submit() {
            refused = !root.service.setSetting(key, input.text)
        }

        width: parent.width
        spacing: Theme.xs
        onSavedChanged: if (!input.editing) input.text = saved
        Component.onCompleted: input.text = saved

        StyledText {
            text: field.label
            font.pixelSize: Theme.fontSizeSmall
        }
        TextField {
            id: input
            width: parent.width
            invalid: field.refused
            onEditingFinished: field.submit()
        }
        StyledText {
            visible: field.refused
            width: parent.width
            text: `A whole number from ${Pomodoro.LIMITS[field.key][0]} to ${Pomodoro.LIMITS[field.key][1]}`
            color: Theme.danger
            font.pixelSize: Theme.fontSizeSmall
            wrapMode: Text.WordWrap
        }
    }

    RowLayout {
        width: parent.width

        IconButton {
            icon: Theme.icon.left
            onClicked: root.closeRequested()
        }
        StyledText {
            Layout.fillWidth: true
            text: "Settings"
            font.bold: true
        }
    }

    NumberField { key: "focus"; label: "Focus (minutes)" }
    NumberField { key: "break"; label: "Break (minutes)" }
    NumberField { key: "longBreak"; label: "Long break (minutes)" }
    NumberField { key: "sessions"; label: "Sessions before a long break" }

    SectionLabel {
        width: parent.width
        text: "A new length applies from the next phase."
        wrapMode: Text.WordWrap
    }
}
