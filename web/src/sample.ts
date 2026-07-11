// Default source shown on first load. Small but exercises a spread of node types:
// directives, hotkeys, functions, classes, control flow, and expressions.
export const SAMPLE_AHK = `#Requires AutoHotkey v2.0

; A hotkey: Ctrl+J types a greeting
^j::
{
    name := "world"
    MsgBox(Greet(name))
}

Greet(who) {
    return "Hello, " who "!"
}

class Counter {
    count := 0

    Increment(by := 1) {
        this.count += by
        return this.count
    }
}

for index, value in ["a", "b", "c"] {
    if (Mod(index, 2) == 0)
        continue
    OutputDebug(value)
}
`;
