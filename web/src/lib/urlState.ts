import { deflateSync, inflateSync } from "fflate";

// Versioned codec for storing the editor source in the URL.

const VERSION = "1";

const DICTIONARY_TEXT = [
  "#Requires AutoHotkey",
  "#SingleInstance Force",
  "#Include ",
  "#Import ",
  "#HotIf ",
  "ExitApp",
  "WinActivate",
  "WinWaitActive",
  "ControlSend",
  "SetTimer",
  "OutputDebug",
  "ToolTip",
  "InputBox",
  "FileAppend",
  "FileRead",
  "FileOpen",
  "FileExist",
  "DirExist",
  "WinExist",
  "ControlExist",
  "Control",
  "ControlGet",
  "Process",
  "Format",
  "RegExMatch",
  "RegExReplace",
  "StrReplace",
  "StrSplit",
  "SubStr",
  "InStr",
  "DllCall",
  "Trim",
  "LTrim",
  "RTrim",
  "Gui",
  "Format(",
  "A_Index",
  "Array(",
  "Map(",
  "extends ",
  "static ",
  "struct ",
  "global ",
  "local ",
  "throw ",
  "export ",
  "return ",
  "continue",
  "break",
  "finally",
  "catch ",
  "error ",
  "try ",
  "loop ",
  "until ",
  "switch ",
  "case ",
  "default:",
  "for ",
  "while ",
  "else ",
  "if ",
  " := ",
  " .= ",
  " += ",
  " -= ",
  " => ",
  " && ",
  " || ",
  " . ",
  ".Length",
  ".Push(",
  ".Has(",
  "this.",
  "class ",
  "MsgBox",
  '"), "',
  '", "',
  "))\n",
  ")\n    ",
  "\n    ",
  "::",
  "\n",
]
.sort((a, b) => b.length - a.length)  // DEFLATE matches the dictionary by back-distance, so sort descending
.join("\n");

const DICTIONARY = new TextEncoder().encode(DICTIONARY_TEXT);

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes)
    bin += String.fromCharCode(b);

  return btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const bin = atob(text.replace(/-/g, "+")
    .replace(/_/g, "/"));
  const bytes = new Uint8Array(bin.length);

  for (let i = 0; i < bin.length; i++)
    bytes[i] = bin.charCodeAt(i);

  return bytes;
}

export function encodeSource(source: string): string {
  const bytes = new TextEncoder().encode(source);
  const compressed = deflateSync(bytes, { level: 9, dictionary: DICTIONARY });
  return VERSION + toBase64Url(compressed);
}

export function decodeSource(encoded: string): string | null {
  if (encoded[0] !== VERSION) return null;

  try {
    const compressed = fromBase64Url(encoded.slice(1));
    const bytes = inflateSync(compressed, { dictionary: DICTIONARY });
    return new TextDecoder().decode(bytes);
  } catch (err) {
    console.error(err);
    return null;
  }
}
