#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Soundness harness for the AutoHotkey tree-sitter grammar.

.DESCRIPTION
  Parses every .ahk/.ah2 file in the corpus with tree-sitter and reports any
  file that yields an ERROR/MISSING node (or hangs the parser). Each flagged
  file is copied to the findings dir with its full parse tree for triage.

  Default mode (parse-only) ASSUMES the corpus is valid AHK. That holds for a
  curated corpus of published libraries fetched by fetch-corpus.sh, so every
  ERROR is a candidate soundness gap -- valid AHK the grammar can't parse.
  (A handful may be v1 files or intentionally-broken examples; triage sorts
  those out.)

  -Validate adds the real interpreter as a validity oracle: a file is only
  checked against the grammar if AutoHotkey loads it (exit 0 under /Validate),
  and the too-permissive direction is ignored (the grammar is permissive by
  design; see CLAUDE.md). This is meant for the mutation/generation path, where
  inputs are synthesized and their validity is genuinely unknown -- NOT for the
  fetched corpus (flat + include-free), where it mostly rejects fragments.

.EXAMPLE
  pwsh test/fuzz/soundness.ps1
  pwsh test/fuzz/soundness.ps1 -Validate            # gate on the interpreter
  pwsh test/fuzz/soundness.ps1 -First 50 -Verbose
#>
[CmdletBinding()]
param(
    # Directory of corpus files to check (searched recursively).
    [string] $CorpusDir = "$PSScriptRoot/corpus",
    # Gate each file on the interpreter before checking the grammar (mutation path).
    [switch] $Validate,
    # Interpreter used as the validity oracle when -Validate is set (v2.1 superset).
    [string] $Ahk = 'C:\Program Files\AutoHotkey\v2.1\AutoHotkey64.exe',
    # Where flagged files + their parse trees + the report are written (gitignored).
    [string] $OutDir = "$PSScriptRoot/findings",
    # Per-file wall-clock budget; a process past this is killed and counted as a hang.
    [int] $TimeoutMs = 15000,
    # Only check the first N files (0 = all). Handy for smoke runs.
    [int] $First = 0,
    # Exit non-zero when there are findings. Off by default: in CI the harness
    # WARNS (annotations + job summary) but keeps the job green, since findings
    # are expected until the grammar catches up. Flip this to gate a branch.
    [switch] $FailOnFindings
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# --- Preflight ----------------------------------------------------------------
if (-not (Get-Command tree-sitter -ErrorAction SilentlyContinue)) {
    throw "tree-sitter not found on PATH."
}
if (-not (Test-Path -LiteralPath $CorpusDir)) {
    throw "Corpus dir not found: $CorpusDir. Run test/fuzz/fetch-corpus.sh first."
}
if ($Validate) {
    if (-not (Test-Path -LiteralPath $Ahk)) {
        $fallback = 'C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe'
        if (Test-Path -LiteralPath $fallback) {
            Write-Warning "v2.1 interpreter not found; falling back to v2.0 at $fallback"
            $Ahk = $fallback
        } else {
            throw "AutoHotkey interpreter not found at '$Ahk' (and no v2.0 fallback). Pass -Ahk <path>."
        }
    }

    # Dismisses AHK's dialogs (class #32770) by clicking "Continue". AHK shows
    # load-time #Warn warnings as a MODAL dialog even under /Validate /ErrorStdOut
    # (that switch redirects errors, not warnings), and a file can re-enable #Warn
    # itself -- so a loader wrapper can't suppress it. The warning dialog's buttons
    # are Abort (id 2, also the default/close action) and Continue (id 11); sending
    # WM_COMMAND(11) proceeds as if a human clicked Continue, keeping the run
    # unattended without losing warning-heavy files.
    Add-Type -Namespace Fuzz -Name DialogCloser -MemberDefinition @'
        [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr p);
        delegate bool EnumWindowsProc(IntPtr h, IntPtr p);
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
        [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, System.Text.StringBuilder s, int max);
        [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
        [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
        const uint WM_COMMAND = 0x0111;
        const int  IDCONTINUE = 11;
        public static void CloseFor(int pid) {
            EnumWindows((h, p) => {
                uint wpid; GetWindowThreadProcessId(h, out wpid);
                if (wpid == (uint)pid && IsWindowVisible(h)) {
                    var sb = new System.Text.StringBuilder(64);
                    GetClassName(h, sb, 64);
                    if (sb.ToString() == "#32770")
                        PostMessage(h, WM_COMMAND, (IntPtr)IDCONTINUE, IntPtr.Zero);
                }
                return true;
            }, IntPtr.Zero);
        }
'@
}

# Returns @{ TimedOut; ExitCode; StdOut; StdErr }. Async reads avoid pipe
# deadlock on large output. With -DismissDialogs it polls and dismisses any
# dialog the child pops (AHK warnings) so nothing can block the run.
function Invoke-Proc {
    param([string] $Exe, [string[]] $Arguments, [int] $TimeoutMs, [switch] $DismissDialogs)

    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = $Exe
    foreach ($a in $Arguments) { [void]$psi.ArgumentList.Add($a) }
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true

    $p = [System.Diagnostics.Process]::Start($psi)
    $outTask = $p.StandardOutput.ReadToEndAsync()
    $errTask = $p.StandardError.ReadToEndAsync()

    if ($DismissDialogs) {
        $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
        while (-not $p.HasExited) {
            if ([DateTime]::UtcNow -gt $deadline) {
                try { $p.Kill($true) } catch { }
                return @{ TimedOut = $true; ExitCode = $null; StdOut = ''; StdErr = '' }
            }
            [Fuzz.DialogCloser]::CloseFor($p.Id)
            Start-Sleep -Milliseconds 120
        }
    }
    elseif (-not $p.WaitForExit($TimeoutMs)) {
        try { $p.Kill($true) } catch { }
        return @{ TimedOut = $true; ExitCode = $null; StdOut = ''; StdErr = '' }
    }

    [System.Threading.Tasks.Task]::WaitAll(@($outTask, $errTask))
    return @{
        TimedOut = $false
        ExitCode = $p.ExitCode
        StdOut   = $outTask.Result
        StdErr   = $errTask.Result
    }
}

# Pull the "(ERROR ...)" / "(MISSING ...)" summary out of tree-sitter's line.
function Get-GrammarErrorSummary {
    param([string] $Text)
    $m = [regex]::Match($Text, '(\((?:ERROR|MISSING).*)')
    if ($m.Success) { return $m.Groups[1].Value.Trim() }
    return ($Text.Trim() -split "`n")[-1]
}

# Recurse so the harness works whether the corpus is flat or per-repo nested.
$corpusFull = (Resolve-Path -LiteralPath $CorpusDir).Path
# @(...) forces an array so .Count / foreach behave with a single-file corpus.
$files = @(Get-ChildItem -LiteralPath $CorpusDir -File -Recurse |
    Where-Object { $_.Extension -in '.ahk', '.ah2' } |
    Sort-Object FullName)
if ($First -gt 0) { $files = @($files | Select-Object -First $First) }

$total = $files.Count
if ($total -eq 0) { throw "No .ahk/.ah2 files in $CorpusDir" }

Write-Host "Corpus:      $total files in $CorpusDir"
Write-Host ("Mode:        {0}" -f ($(if ($Validate) { "validate (oracle: $Ahk)" } else { 'parse-only (assume corpus is valid AHK)' })))
Write-Host "Timeout:     $TimeoutMs ms/file"
Write-Host ""

$checked  = 0   # files handed to the grammar
$skipped  = 0   # -Validate only: AHK rejected -> not checked
$ahkHang  = 0   # -Validate only: AHK timed out -> not checked
$agree    = 0   # parsed clean
$findings = [System.Collections.Generic.List[object]]::new()

$i = 0
foreach ($f in $files) {
    $i++
    $rel = [System.IO.Path]::GetRelativePath($corpusFull, $f.FullName)
    Write-Progress -Activity "Soundness check" `
        -Status "$i/$total  $rel" -PercentComplete (100.0 * $i / $total)

    # Optional oracle: only check files the interpreter actually loads.
    if ($Validate) {
        $ahk = Invoke-Proc -Exe $Ahk -Arguments @('/ErrorStdOut', '/Validate', $f.FullName) `
            -TimeoutMs $TimeoutMs -DismissDialogs
        if ($ahk.TimedOut)       { $ahkHang++; continue }
        if ($ahk.ExitCode -ne 0) { $skipped++; continue }
    }
    $checked++

    # Grammar: parse and look for ERROR/MISSING (or a parser hang).
    $ts = Invoke-Proc -Exe 'tree-sitter' -Arguments @('parse', '-q', $f.FullName) -TimeoutMs $TimeoutMs
    if ($ts.TimedOut) {
        $findings.Add([pscustomobject]@{ Rel = $rel; Full = $f.FullName; Kind = 'grammar-hang'; Detail = "parse exceeded ${TimeoutMs}ms" })
    }
    elseif ($ts.ExitCode -ne 0) {
        $summary = Get-GrammarErrorSummary ($ts.StdOut + "`n" + $ts.StdErr)
        $findings.Add([pscustomobject]@{ Rel = $rel; Full = $f.FullName; Kind = 'grammar-error'; Detail = $summary })
    }
    else {
        $agree++
    }
}
Write-Progress -Activity "Soundness check" -Completed

Write-Host ""
Write-Host "==== Summary ===="
Write-Host ("  Checked:               {0}" -f $checked)
Write-Host ("    - parsed clean:      {0}" -f $agree)
Write-Host ("    - FINDINGS:          {0}" -f $findings.Count)
if ($Validate) {
    Write-Host ("  AHK rejected (skipped):{0}" -f $skipped)
    if ($ahkHang -gt 0) { Write-Host ("  AHK timed out:         {0}" -f $ahkHang) }
}
Write-Host ""

# In CI, mirror the summary into the job-summary panel so it's visible without
# opening logs. $GITHUB_STEP_SUMMARY is a file we append markdown to.
$inCI = $env:GITHUB_ACTIONS -eq 'true'
function Add-Summary { param([string] $Md) if ($inCI -and $env:GITHUB_STEP_SUMMARY) { Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY -Value $Md } }

if ($findings.Count -eq 0) {
    Write-Host "No soundness gaps: every checked file parsed cleanly." -ForegroundColor Green
    Add-Summary "### Soundness: clean ✅`n`nAll $checked checked file(s) parsed without ERROR/MISSING."
    return
}

# Persist findings: copy each flagged file + its full parse tree, write a report.
if (Test-Path -LiteralPath $OutDir) { Remove-Item -LiteralPath $OutDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$report = [System.Collections.Generic.List[string]]::new()
$report.Add("# Soundness findings: corpus files the grammar can't parse")
$report.Add("# mode: $(if ($Validate) { 'validate' } else { 'parse-only' })")
$report.Add("# generated: $(Get-Date -Format s)")
$report.Add("")

foreach ($find in ($findings | Sort-Object Kind, Rel)) {
    # Flatten the repo-relative path into a safe, unique triage filename.
    $flat = ($find.Rel -replace '[\\/]', '__')
    Copy-Item -LiteralPath $find.Full -Destination (Join-Path $OutDir $flat) -Force
    # Full (non-quiet) tree next to it for immediate triage.
    $tree = Invoke-Proc -Exe 'tree-sitter' -Arguments @('parse', $find.Full) -TimeoutMs $TimeoutMs
    Set-Content -LiteralPath (Join-Path $OutDir "$flat.tree.txt") -Value $tree.StdOut

    $report.Add(("{0}`t{1}`t{2}" -f $find.Kind, $find.Rel, $find.Detail))
    Write-Host ("  [{0}] {1}" -f $find.Kind, $find.Rel) -ForegroundColor Yellow
    Write-Host ("        {0}" -f $find.Detail) -ForegroundColor DarkGray
}

$reportPath = Join-Path $OutDir 'findings.tsv'
Set-Content -LiteralPath $reportPath -Value $report
Write-Host ""
Write-Host "Findings + parse trees written to: $OutDir" -ForegroundColor Cyan
Write-Host "Report: $reportPath"

if ($inCI) {
    # A warning annotation per finding, anchored to the corpus file + error line
    # (tree-sitter rows are 0-based; annotations are 1-based). GitHub renders the
    # first ~10 inline and keeps the rest in the log; the job summary has them all.
    foreach ($find in ($findings | Sort-Object Kind, Rel)) {
        $file = "test/fuzz/corpus/" + ($find.Rel -replace '\\', '/')
        $lineArg = ''
        $m = [regex]::Match($find.Detail, '\[(\d+),')
        if ($m.Success) { $lineArg = ",line=$([int]$m.Groups[1].Value + 1)" }
        Write-Host "::warning file=$file$lineArg::$($find.Kind): $($find.Detail)"
    }
    Write-Host "::warning::$($findings.Count) soundness finding(s): the grammar can't parse AHK the corpus contains. See the job summary and the uploaded findings artifact."

    $md = [System.Collections.Generic.List[string]]::new()
    $md.Add("### Soundness: $($findings.Count) finding(s) ⚠️")
    $md.Add("")
    $md.Add("Files parsed: $checked  ·  clean: $agree  ·  findings: $($findings.Count)")
    $md.Add("")
    $md.Add("| kind | file | detail |")
    $md.Add("| --- | --- | --- |")
    foreach ($find in ($findings | Sort-Object Kind, Rel)) {
        $md.Add("| $($find.Kind) | ``$($find.Rel)`` | ``$($find.Detail)`` |")
    }
    Add-Summary ($md -join "`n")
}

if ($FailOnFindings) { exit 1 }
