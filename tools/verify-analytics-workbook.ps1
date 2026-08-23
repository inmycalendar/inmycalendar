$ErrorActionPreference = "Stop"
# Verify on a COPY. The first version of this script "tidied up" by deleting
# rows from the shipped workbook, which permanently rewrote every formula that
# pointed at them into #REF! - and that corrupted file is what got shipped.
# The artifact must never be the thing under test.
$dir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$master = Join-Path $dir "inmycalendar-analytics.xlsx"
$probe  = Join-Path $dir "_probe.xlsx"
Copy-Item $master $probe -Force

$rows = @(
 @("2026-07-04","done","1","Task A","2026-07-01 09:00","2026-07-02 09:00","2026-07-04 09:00","WFH",""),
 @("2026-07-03","done","2","Task B","2026-07-01 09:00","2026-07-01 21:00","2026-07-03 09:00","Travel",""),
 @("2026-07-10","done","3","Task C","2026-07-05 08:00","2026-07-09 08:00","2026-07-10 08:00","WFH",""),
 @("2026-07-11","todo","1","Task D","2026-07-11 10:00","","","",""),
 @("2026-07-12","doing","1","Task E","2026-07-11 10:00","2026-07-12 10:00","","Leave","")
)

$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false
try {
  # --- 1. the SHIPPED file must be clean before anything is done to it -------
  $wb0 = $xl.Workbooks.Open($master)
  $shippedErrors = 0
  foreach ($ws in $wb0.Worksheets) {
    foreach ($cell in $ws.UsedRange) {
      if ($cell.Text -match '^#(REF|VALUE|NAME|DIV/0|N/A|NULL|NUM)') { $shippedErrors++ }
    }
  }
  Write-Output ("SHIPPED FILE, error cells before any edit: {0}" -f $shippedErrors)
  $wb0.Close($false)

  # --- 2. drive the copy with known data ------------------------------------
  $wb = $xl.Workbooks.Open($probe)
  $pd = $wb.Worksheets.Item("Paste data")
  $r = 2
  foreach ($row in $rows) {
    for ($c = 1; $c -le 9; $c++) { $pd.Cells.Item($r, $c).Value2 = [string]$row[$c-1] }
    $r++
  }
  $xl.CalculateFullRebuild()

  $ct = $wb.Worksheets.Item("Cycle time")
  $db = $wb.Worksheets.Item("Dashboard")

  Write-Output ""
  Write-Output "=== Cycle time (expected in brackets) ==="
  $expect = @(@("Task A",1.0,2.0,3.0), @("Task B",0.5,1.5,2.0), @("Task C",4.0,1.0,5.0))
  $fails = 0
  for ($i = 0; $i -lt 3; $i++) {
    $rw = $i + 2
    $w = $ct.Cells.Item($rw,4).Value2; $k = $ct.Cells.Item($rw,5).Value2; $t = $ct.Cells.Item($rw,6).Value2
    $e = $expect[$i]
    $ok = ([math]::Abs([double]$w - $e[1]) -lt 0.02) -and ([math]::Abs([double]$k - $e[2]) -lt 0.02) -and ([math]::Abs([double]$t - $e[3]) -lt 0.02)
    if (-not $ok) { $fails++ }
    Write-Output ("  {0} {1}: {2}/{3}/{4}  [{5}/{6}/{7}]" -f $(if($ok){"OK  "}else{"FAIL"}),$e[0],$w,$k,$t,$e[1],$e[2],$e[3])
  }

  Write-Output ""
  Write-Output "=== Dashboard ==="
  for ($rw = 5; $rw -le 24; $rw++) {
    $lab = $db.Cells.Item($rw,2).Text
    if ($lab -and $lab.Trim() -ne "") { Write-Output ("  {0,-32} {1}" -f $lab, $db.Cells.Item($rw,3).Text) }
  }

  $errCount = 0
  foreach ($ws in $wb.Worksheets) {
    foreach ($cell in $ws.UsedRange) {
      if ($cell.Text -match '^#(REF|VALUE|NAME|DIV/0|N/A|NULL|NUM)') { $errCount++ }
    }
  }
  Write-Output ""
  Write-Output ("POPULATED COPY, error cells: {0}" -f $errCount)
  Write-Output ("cycle-time failures: {0}" -f $fails)

  $wb.Close($false)          # never save the probe
}
finally {
  $xl.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
  if (Test-Path $probe) { Remove-Item $probe -Force }
}
