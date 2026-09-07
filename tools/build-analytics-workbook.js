"use strict";
/* Builds inmycalendar-analytics.xlsx

   The person exports their tasks, pastes the CSV into one sheet, and every
   other sheet is formulas over it. Metrics are the ones an operations person
   actually uses - cycle time, throughput, WIP, completion rate - rather than
   counts that look busy and answer nothing.

   COLUMNS ARE LOOKED UP BY NAME, NEVER TYPED AS LETTERS, and that is the whole
   lesson of this file. The export gained a column in the middle, every formula
   here silently started reading its neighbour, and the workbook was wrong in a
   way that still opened, still calculated, and still looked fine: cycle times
   computed from the day colour, day types counted from a timestamp. Nothing
   caught it because nothing compared the two lists.

   So CSV_COLUMNS below is copied from assets/app.js, col("entered_done")
   returns "J" rather than anyone counting across a row, and the suite fails if
   the two lists stop matching. Add a column in the app, run this, done. */

const ExcelJS = require("exceljs");
const path = require("path");

const ROWS = 2000;                      // formula range for pasted data
const WEEKS = 60;                       // pre-wired rows on the By week tab

/* MUST match CSV_COLUMNS in assets/app.js. tests/app.test.js enforces it. */
const HEADERS = ["date","weekday","iso_week","status","priority","task","task_colour",
                 "entered_todo","entered_in_progress","entered_done",
                 "day_colour","day_note","public_holiday"];

/* "entered_done" -> "J". One place that knows where anything lives. */
function col(name){
  const i = HEADERS.indexOf(name);
  if (i < 0) throw new Error("no such export column: " + name);
  let n = i + 1, s = "";
  while (n > 0){ const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; }
  return s;
}
const P  = (c, r) => `'Paste data'!${col(c)}${r}`;
const PR = (c) => `'Paste data'!$${col(c)}$2:$${col(c)}$${ROWS}`;
const CT = (c) => `'Cycle time'!$${c}$2:$${c}$${ROWS}`;

const FONT = { name: "Arial", size: 10 };
const H = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
const TITLE = { name: "Arial", size: 16, bold: true, color: { argb: "FF16181D" } };
const SUB = { name: "Arial", size: 10, italic: true, color: { argb: "FF6B7280" } };
const NOTE = { name: "Arial", size: 10, color: { argb: "FF3F434C" } };
const SECT = { name: "Arial", size: 9, bold: true, color: { argb: "FF6B7280" } };
const ACCENT = "FF18181B", RULE = "FFE5E7EB";
const BLUE = "FF2563EB", AMBER = "FFD97706", GREEN = "FF059669", VIOLET = "FF7C3AED";

const wb = new ExcelJS.Workbook();
wb.creator = "inmycalendar";
wb.created = new Date();

function styleHeaderRow(ws, row, cols, fill){
  const r = ws.getRow(row);
  for (let c = 1; c <= cols; c++){
    const cell = r.getCell(c);
    cell.font = H;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill || ACCENT } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = { bottom: { style: "thin", color: { argb: RULE } } };
  }
  r.height = 20;
}
function label(ws, addr, text, style){
  const c = ws.getCell(addr);
  c.value = text;
  c.font = style || FONT;
  return c;
}
function lines(ws, startAddr, arr, style){
  const m = /^([A-Z]+)(\d+)$/.exec(startAddr);
  let r = parseInt(m[2], 10);
  arr.forEach(t => { label(ws, m[1] + r, t, style || NOTE); r++; });
  return r;
}

/* ========================================================================
   1. HOW TO USE
   ======================================================================== */
const how = wb.addWorksheet("How to use", { properties: { tabColor: { argb: ACCENT } } });
how.columns = [{ width: 4 }, { width: 96 }];
label(how, "B2", "inmycalendar analytics", TITLE);
label(how, "B3", "Paste your exported tasks and every number below updates itself.", SUB);

let r = 5;
[["1.", "In inmycalendar, scroll to the footer and click Export tasks. You get a .csv file."],
 ["2.", "Open that .csv, select everything including the header row, and copy it."],
 ["3.", "Come back here, open the Paste data tab, click cell A1, and paste."],
 ["4.", "That is it. Every other tab recalculates."],
 ["", ""],
 ["Note", "Paste over the example row. It shows the expected format and is meant to be replaced."],
 ["Note", "Built for up to " + ROWS.toLocaleString("en-GB") + " tasks. Beyond that, extend the formula ranges."],
 ["Note", "A blank cycle time means the task never passed through that column, so there is"],
 ["", "nothing to measure. It is not an error."]
].forEach(([a, b]) => {
  label(how, "A" + r, a, { ...FONT, bold: true });
  label(how, "B" + r, b, FONT);
  r++;
});

r += 1;
label(how, "B" + r, "What each tab tells you", { ...FONT, bold: true, size: 12 });
r += 1;
[["Dashboard", "The headline numbers: how much you finish, how long it takes, what is stuck."],
 ["Cycle time", "Per task: how long it waited, how long it took once started, total age."],
 ["By week", "Throughput over time. The clearest signal in the workbook."],
 ["By task colour", "Work against everything else. What the colours on the cards are for."],
 ["By day type", "Do you finish more on WFH days than travel days? This answers it."],
 ["Paste data", "Your raw export. The only sheet you touch."]
].forEach(([a, b]) => {
  label(how, "B" + r, a + "  -  " + b, FONT);
  r++;
});

r += 1;
label(how, "B" + r, "The columns this expects", { ...FONT, bold: true, size: 12 });
r += 1;
label(how, "B" + r, HEADERS.join(", "), { ...FONT, color: { argb: "FF6B7280" } });
r += 2;
lines(how, "B" + r, [
  "These are exactly the columns Export tasks writes, in exactly that order. If you have",
  "an older export with fewer columns, take a fresh one rather than pasting it in - the",
  "formulas read by position, and a shifted column reads as a wrong answer, not an error."
]);

/* ========================================================================
   2. PASTE DATA
   ======================================================================== */
const pd = wb.addWorksheet("Paste data", { properties: { tabColor: { argb: BLUE } } });
const WIDE = { task: 46, day_note: 34, public_holiday: 24, iso_week: 12, weekday: 10 };
pd.columns = HEADERS.map(h => ({ header: h, key: h, width: WIDE[h] || 15 }));
styleHeaderRow(pd, 1, HEADERS.length, BLUE);
/* one example row, so the expected format is unambiguous */
pd.addRow(["2026-07-07","Tue","2026-W28","done",1,
           "Example: replace this row with your own export","Work",
           "2026-07-06 09:15","2026-07-06 11:40","2026-07-07 16:05",
           "WFH","Example day note",""]);
pd.getRow(2).font = { ...FONT, italic: true, color: { argb: "FF9CA3AF" } };
pd.views = [{ state: "frozen", ySplit: 1 }];

/* ========================================================================
   3. CYCLE TIME  (per task, formula-driven off Paste data)
   ======================================================================== */
const ct = wb.addWorksheet("Cycle time", { properties: { tabColor: { argb: AMBER } } });
const CT_HEAD = ["date","task","colour","status","waiting (days)","working (days)",
                 "total (days)","finished week"];
ct.columns = [{width:13},{width:52},{width:12},{width:12},{width:15},{width:15},{width:14},{width:15}];
ct.getRow(1).values = CT_HEAD;
styleHeaderRow(ct, 1, CT_HEAD.length, AMBER);
ct.views = [{ state: "frozen", ySplit: 1 }];

/* A timestamp arrives as EITHER text or a real Excel datetime, depending on
   how Excel decides to treat the pasted column, and it converts silently.
   Verification caught this: parsing the text form gave 366 days for a 5-day
   task, because LEFT() of a date serial is digits of the serial, not a year.

   ISNUMBER picks the branch. The text branch uses DATE() with numeric parts
   rather than DATEVALUE, which reads the machine's regional format and fails
   outright on a dd-mm-yyyy machine. */
function ts(name, row){
  const x = P(name, row);
  const parsed = `DATE(VALUE(LEFT(${x},4)),VALUE(MID(${x},6,2)),VALUE(MID(${x},9,2)))`
               + `+VALUE(MID(${x},12,2))/24+VALUE(MID(${x},15,2))/1440`;
  return `IF(ISNUMBER(${x}),${x},IFERROR(${parsed},""))`;
}

for (let i = 2; i <= ROWS; i++){
  const g = (name) => P(name, i);
  const blank = `${g("date")}=""`;
  ct.getCell(`A${i}`).value = { formula: `IF(${blank},"",${g("date")})` };
  ct.getCell(`B${i}`).value = { formula: `IF(${blank},"",${g("task")})` };
  ct.getCell(`C${i}`).value = { formula: `IF(${blank},"",${g("task_colour")})` };
  ct.getCell(`D${i}`).value = { formula: `IF(${blank},"",${g("status")})` };
  /* waiting: first entered to do -> first entered in progress */
  ct.getCell(`E${i}`).value = { formula:
    `IFERROR(IF(OR(${g("entered_todo")}="",${g("entered_in_progress")}=""),"",` +
    `ROUND((${ts("entered_in_progress",i)})-(${ts("entered_todo",i)}),2)),"")` };
  /* working: in progress -> done */
  ct.getCell(`F${i}`).value = { formula:
    `IFERROR(IF(OR(${g("entered_in_progress")}="",${g("entered_done")}=""),"",` +
    `ROUND((${ts("entered_done",i)})-(${ts("entered_in_progress",i)}),2)),"")` };
  /* total: to do -> done */
  ct.getCell(`G${i}`).value = { formula:
    `IFERROR(IF(OR(${g("entered_todo")}="",${g("entered_done")}=""),"",` +
    `ROUND((${ts("entered_done",i)})-(${ts("entered_todo",i)}),2)),"")` };
  /* the Monday of the week the task was finished, for the throughput tab */
  ct.getCell(`H${i}`).value = { formula:
    `IFERROR(IF(${g("entered_done")}="","",(${ts("entered_done",i)})-WEEKDAY((${ts("entered_done",i)}),3)),"")` };
  ct.getCell(`A${i}`).numFmt = "yyyy-mm-dd";
  ct.getCell(`H${i}`).numFmt = "yyyy-mm-dd";
  ["E","F","G"].forEach(c => ct.getCell(`${c}${i}`).numFmt = "0.00;-0.00;-");
  for (let c = 1; c <= CT_HEAD.length; c++) ct.getRow(i).getCell(c).font = FONT;
}

const WAIT = CT("E"), WORK = CT("F"), TOTAL = CT("G"), FWEEK = CT("H");
const CDATE = CT("A"), CCOL = CT("C"), CSTAT = CT("D");

/* ========================================================================
   4. DASHBOARD
   ======================================================================== */
const db = wb.addWorksheet("Dashboard", { properties: { tabColor: { argb: GREEN } } });
db.columns = [{ width: 4 }, { width: 34 }, { width: 16 }, { width: 4 }, { width: 58 }];
label(db, "B2", "Dashboard", TITLE);
label(db, "B3", "Every figure is a formula over the Paste data tab. Nothing here is typed in.", SUB);

const TASKCOL = PR("task"), STAT = PR("status");
/* COUNTED ON THE TASK COLUMN, NOT THE DATE. The export also carries days that
   have a note or a colour but no task at all, and those rows have a date. */
const NTASKS = `COUNTIF(${TASKCOL},"<>")`;

const metrics = [
  ["Volume", null, null],
  ["Tasks in export",             NTASKS,                                     "0"],
  ["Done",                        `COUNTIF(${STAT},"done")`,                  "0"],
  ["In progress",                 `COUNTIF(${STAT},"doing")`,                 "0"],
  ["To do",                       `COUNTIF(${STAT},"todo")`,                  "0"],
  ["Completion rate",             `IFERROR(COUNTIF(${STAT},"done")/${NTASKS},"")`, "0.0%"],
  ["Speed  (days)", null, null],
  ["Median total time",           `IFERROR(MEDIAN(${TOTAL}),"")`,             "0.00"],
  ["Average total time",          `IFERROR(AVERAGE(${TOTAL}),"")`,            "0.00"],
  ["Median waiting before start", `IFERROR(MEDIAN(${WAIT}),"")`,              "0.00"],
  ["Median working once started", `IFERROR(MEDIAN(${WORK}),"")`,              "0.00"],
  ["Slowest task",                `IF(COUNT(${TOTAL})=0,"",MAX(${TOTAL}))`,   "0.00;-0.00;-"],
  ["Fastest task",                `IF(COUNT(${TOTAL})=0,"",MIN(${TOTAL}))`,   "0.00"],
  ["Span", null, null],
  ["First date",                  `IFERROR(MIN(${CDATE}),"")`,                "yyyy-mm-dd"],
  ["Last date",                   `IFERROR(MAX(${CDATE}),"")`,                "yyyy-mm-dd"],
  ["Days covered",                `IFERROR(MAX(${CDATE})-MIN(${CDATE})+1,"")`, "0"],
  ["Tasks finished per week",
   `IFERROR(COUNTIF(${STAT},"done")/MAX(1,(MAX(${CDATE})-MIN(${CDATE})+1)/7),"")`, "0.0"]
];

let row = 5;
metrics.forEach(([name, formula, fmt]) => {
  if (formula === null){
    const c = label(db, "B" + row, name.toUpperCase(), SECT);
    c.border = { bottom: { style: "thin", color: { argb: RULE } } };
    db.getCell("C" + row).border = { bottom: { style: "thin", color: { argb: RULE } } };
    row += 1;
    return;
  }
  label(db, "B" + row, name, FONT);
  const cell = db.getCell("C" + row);
  cell.value = { formula };
  cell.font = { ...FONT, bold: true };
  cell.numFmt = fmt;
  cell.alignment = { horizontal: "right" };
  row += 1;
});

label(db, "E5", "Reading these numbers", { ...FONT, bold: true, size: 12 });
lines(db, "E6", [
  "Waiting before start is the number most people are surprised by. If it is much larger",
  "than working time, the constraint is deciding what to do, not doing it.",
  "",
  "Median sits next to average deliberately. One task left open for three months drags the",
  "average and tells you nothing; the median is what a typical task actually looks like.",
  "",
  "Tasks finished per week is throughput. It is the honest measure of capacity, and the one",
  "worth watching over time rather than in a single snapshot.",
  "",
  "Tasks in export counts rows that have a task. The export also carries days that hold",
  "only a note or a colour, and those are not tasks."
]);

/* ========================================================================
   5. BY WEEK  (throughput)
   ======================================================================== */
const bw = wb.addWorksheet("By week", { properties: { tabColor: { argb: AMBER } } });
bw.columns = [{ width: 16 }, { width: 18 }, { width: 22 }, { width: 4 }, { width: 62 }];
bw.getRow(1).values = ["week starting", "tasks finished", "median days to finish"];
styleHeaderRow(bw, 1, 3, AMBER);

/* THE WEEKS FILL THEMSELVES. This tab used to open with an empty column A and
   an instruction to type the Monday of every week you cared about, which is a
   worksheet asking you to do the work it exists to do. Column A now starts at
   the Monday of the earliest date in the data and steps a week at a time until
   it passes the last, then stops. */
bw.getCell("A2").value = { formula:
  `IFERROR(MIN(${CDATE})-WEEKDAY(MIN(${CDATE}),3),"")` };
for (let i = 3; i <= WEEKS + 1; i++){
  bw.getCell(`A${i}`).value = { formula:
    `IF($A${i-1}="","",IF($A${i-1}+7>MAX(${CDATE}),"",$A${i-1}+7))` };
}
for (let i = 2; i <= WEEKS + 1; i++){
  bw.getCell(`B${i}`).value = { formula: `IF($A${i}="","",COUNTIFS(${FWEEK},$A${i}))` };
  bw.getCell(`C${i}`).value = { formula:
    `IF($A${i}="","",IFERROR(AVERAGEIFS(${TOTAL},${FWEEK},$A${i}),""))` };
  bw.getCell(`A${i}`).numFmt = "yyyy-mm-dd";
  bw.getCell(`C${i}`).numFmt = "0.00;-0.00;-";
  for (let c = 1; c <= 3; c++) bw.getRow(i).getCell(c).font = FONT;
}
lines(bw, "E2", [
  "Column A fills itself from your data: the Monday of your earliest week, then one row",
  "per week until it reaches your latest. Nothing to type.",
  "",
  "Throughput is the clearest signal in the whole workbook. A run of low weeks is worth a",
  "conversation with yourself; a single low week usually is not.",
  "",
  "Weeks are counted by the day a task reached Done, not the day it was created."
]);
bw.views = [{ state: "frozen", ySplit: 1 }];

/* ========================================================================
   6. BY TASK COLOUR  (work against the rest of life)
   ======================================================================== */
const bc = wb.addWorksheet("By task colour", { properties: { tabColor: { argb: VIOLET } } });
bc.columns = [{width:18},{width:12},{width:12},{width:16},{width:20},{width:4},{width:62}];
bc.getRow(1).values = ["colour", "tasks", "finished", "completion rate", "median days"];
styleHeaderRow(bc, 1, 5, VIOLET);

/* The two the app ships with, plus room for any added, plus the untagged. */
const TASKCOLOURS = ["Work", "Personal", "", "", ""];
TASKCOLOURS.forEach((t, i) => {
  const rr = i + 2;
  if (t) bc.getCell(`A${rr}`).value = t;
  bc.getCell(`B${rr}`).value = { formula: `IF($A${rr}="","",COUNTIF(${CCOL},$A${rr}))` };
  bc.getCell(`C${rr}`).value = { formula: `IF($A${rr}="","",COUNTIFS(${CCOL},$A${rr},${CSTAT},"done"))` };
  bc.getCell(`D${rr}`).value = { formula: `IF($A${rr}="","",IFERROR($C${rr}/$B${rr},""))` };
  bc.getCell(`E${rr}`).value = { formula: `IF($A${rr}="","",IFERROR(AVERAGEIFS(${TOTAL},${CCOL},$A${rr}),""))` };
  bc.getCell(`D${rr}`).numFmt = "0.0%";
  bc.getCell(`E${rr}`).numFmt = "0.00;-0.00;-";
  for (let c = 1; c <= 5; c++) bc.getRow(rr).getCell(c).font = FONT;
});
const bcLast = TASKCOLOURS.length + 2;
bc.getCell(`A${bcLast}`).value = "No colour set";
bc.getCell(`B${bcLast}`).value = { formula: `COUNTIFS(${TASKCOL},"<>",${PR("task_colour")},"")` };
bc.getCell(`C${bcLast}`).value = { formula: `COUNTIFS(${TASKCOL},"<>",${PR("task_colour")},"",${STAT},"done")` };
bc.getCell(`D${bcLast}`).value = { formula: `IFERROR($C${bcLast}/$B${bcLast},"")` };
bc.getCell(`D${bcLast}`).numFmt = "0.0%";
for (let c = 1; c <= 5; c++) bc.getRow(bcLast).getCell(c).font = FONT;

lines(bc, "G2", [
  "Rows 2 and 3 are the two colours the app ships with. If you renamed them, or added",
  "your own, type the names into column A and the rest of the row fills itself.",
  "",
  "This is the tab the colours exist for. The useful question is not how many work tasks",
  "you have - it is whether the completion rate and the median days differ between them.",
  "A pile of personal tasks that never reach Done is worth knowing about."
]);
bc.views = [{ state: "frozen", ySplit: 1 }];

/* ========================================================================
   7. BY DAY TYPE
   ======================================================================== */
const bd = wb.addWorksheet("By day type", { properties: { tabColor: { argb: GREEN } } });
bd.columns = [{ width: 18 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 4 }, { width: 60 }];
bd.getRow(1).values = ["day type", "tasks", "finished", "completion rate"];
styleHeaderRow(bd, 1, 4, GREEN);
const DAYCOL = PR("day_colour");
const DAYTYPES = ["Milestone", "Travel", "Leave", "WFH", "", ""];
DAYTYPES.forEach((t, i) => {
  const rr = i + 2;
  if (t) bd.getCell(`A${rr}`).value = t;
  bd.getCell(`B${rr}`).value = { formula: `IF($A${rr}="","",COUNTIFS(${TASKCOL},"<>",${DAYCOL},$A${rr}))` };
  bd.getCell(`C${rr}`).value = { formula: `IF($A${rr}="","",COUNTIFS(${TASKCOL},"<>",${DAYCOL},$A${rr},${STAT},"done"))` };
  bd.getCell(`D${rr}`).value = { formula: `IF($A${rr}="","",IFERROR($C${rr}/$B${rr},""))` };
  bd.getCell(`D${rr}`).numFmt = "0.0%";
  for (let c = 1; c <= 4; c++) bd.getRow(rr).getCell(c).font = FONT;
});
const rrLast = DAYTYPES.length + 2;
bd.getCell(`A${rrLast}`).value = "No colour set";
bd.getCell(`B${rrLast}`).value = { formula: `COUNTIFS(${TASKCOL},"<>",${DAYCOL},"")` };
bd.getCell(`C${rrLast}`).value = { formula: `COUNTIFS(${TASKCOL},"<>",${DAYCOL},"",${STAT},"done")` };
bd.getCell(`D${rrLast}`).value = { formula: `IFERROR($C${rrLast}/$B${rrLast},"")` };
bd.getCell(`D${rrLast}`).numFmt = "0.0%";
for (let c = 1; c <= 4; c++) bd.getRow(rrLast).getCell(c).font = FONT;

lines(bd, "F2", [
  "The four day colours the app ships with. If you renamed them, rename them here to",
  "match; blank rows are spare, for colours you added.",
  "",
  "The question worth asking is whether the days you mark as exceptions - travel, leave -",
  "are quietly absorbing work you meant to protect them from.",
  "",
  "The export also carries a public_holiday column. Filter Paste data by it to see how",
  "much of a slow week was simply days nobody was working."
]);

/* ---- order the tabs so the first thing seen is the instructions ---- */
wb.worksheets.forEach((s, i) => { s.orderNo = i; });

const OUT = path.join(__dirname, "..", "downloads", "inmycalendar-analytics.xlsx");
wb.xlsx.writeFile(OUT).then(() => console.log("written: " + OUT));
