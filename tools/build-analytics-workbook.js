"use strict";
/* Builds inmycalendar-analytics.xlsx
   The user pastes a CSV export into one sheet; everything else is formulas.
   Metrics chosen are the ones a supply chain / operations person actually uses:
   cycle time, throughput, WIP, aging, and completion rate - not vanity counts. */

const ExcelJS = require("exceljs");
const path = require("path");

const ROWS = 2000;                      // formula range for pasted data
const FONT = { name: "Arial", size: 10 };
const H = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
const TITLE = { name: "Arial", size: 16, bold: true, color: { argb: "FF16181D" } };
const SUB = { name: "Arial", size: 10, italic: true, color: { argb: "FF6B7280" } };
const INK = "FF16181D", ACCENT = "FF18181B", RULE = "FFE5E7EB";
const BLUE = "FF2563EB", AMBER = "FFD97706", GREEN = "FF059669";

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

/* ========================================================================
   1. HOW TO USE
   ======================================================================== */
const how = wb.addWorksheet("How to use", { properties: { tabColor: { argb: ACCENT } } });
how.columns = [{ width: 4 }, { width: 96 }];
label(how, "B2", "inmycalendar analytics", TITLE);
label(how, "B3", "Paste your exported tasks and every number below updates itself.", SUB);

const steps = [
  ["1.", "In inmycalendar, scroll to the footer and click Export tasks. You get a .csv file."],
  ["2.", "Open that .csv, select everything including the header row, and copy it."],
  ["3.", "Come back here, open the Paste data tab, click cell A1, and paste."],
  ["4.", "That is it. Dashboard, Cycle time, By week and By day type all recalculate."],
  ["", ""],
  ["Note", "Paste over the example row. It is there to show the expected format and can be replaced."],
  ["Note", "The sheets are built for up to 2,000 tasks. Beyond that, extend the formula ranges."],
  ["Note", "Timestamps are only recorded from the moment a task first enters a column, so tasks"],
  ["", "created before that feature existed will show blank cycle times. That is expected."]
];
let r = 5;
steps.forEach(([a, b]) => {
  label(how, "A" + r, a, { ...FONT, bold: true });
  label(how, "B" + r, b, FONT);
  r++;
});

r += 1;
label(how, "B" + r, "What each tab tells you", { ...FONT, bold: true, size: 12 });
r += 1;
const tabs = [
  ["Dashboard", "The headline numbers: how much you finish, how long it takes, what is stuck."],
  ["Cycle time", "Per task: how long it sat in to do, how long it took once started, total age."],
  ["By week", "Throughput over time. The single most useful chart for spotting a bad patch."],
  ["By day type", "Do you finish more on WFH days than travel days? This answers it."],
  ["Paste data", "Your raw export. Only sheet you touch."]
];
tabs.forEach(([a, b]) => {
  label(how, "A" + r, "", FONT);
  const c = label(how, "B" + r, a + "  -  " + b, FONT);
  c.alignment = { wrapText: false };
  r++;
});

/* ========================================================================
   2. PASTE DATA
   ======================================================================== */
const pd = wb.addWorksheet("Paste data", { properties: { tabColor: { argb: BLUE } } });
const HEADERS = ["date","status","priority","task","entered_todo","entered_in_progress",
                 "entered_done","day_colour","day_note"];
pd.columns = HEADERS.map((h, i) => ({ header: h, key: h, width: i === 3 ? 46 : (i === 8 ? 34 : 15) }));
styleHeaderRow(pd, 1, HEADERS.length, BLUE);
/* one example row, so the expected format is unambiguous */
pd.addRow(["2026-07-07","done",1,"Example: replace this row with your own export",
           "2026-07-06 09:15","2026-07-06 11:40","2026-07-07 16:05","WFH","Example day note"]);
pd.getRow(2).font = { ...FONT, italic: true, color: { argb: "FF9CA3AF" } };
pd.views = [{ state: "frozen", ySplit: 1 }];

/* ========================================================================
   3. CYCLE TIME  (per task, formula-driven off Paste data)
   ======================================================================== */
const ct = wb.addWorksheet("Cycle time", { properties: { tabColor: { argb: AMBER } } });
const CT_HEAD = ["date","task","status","waiting (days)","working (days)","total (days)","finished week"];
ct.columns = [{width:13},{width:52},{width:12},{width:15},{width:15},{width:14},{width:15}];
ct.getRow(1).values = CT_HEAD;
styleHeaderRow(ct, 1, CT_HEAD.length, AMBER);
ct.views = [{ state: "frozen", ySplit: 1 }];

/* Timestamps arrive as text "yyyy-mm-dd HH:MM". Parsed with DATEVALUE+TIMEVALUE
   rather than a locale-dependent cast. Every cell is guarded, because a task
   that never reached a column has an empty timestamp. */
/* A timestamp arrives as EITHER text or a real Excel datetime, depending on
   how Excel decides to treat the pasted column - and it converts silently.
   Verification caught this: parsing the text form gave 366 days for a 5-day
   task, because LEFT() of a date serial is digits of the serial, not a year.

   ISNUMBER picks the branch. The text branch uses DATE() with numeric parts
   rather than DATEVALUE, which reads the machine regional format and fails
   outright on a dd-mm-yyyy machine - the first thing verification found. */
function ts(col, row){
  const x = `'Paste data'!${col}${row}`;
  const parsed = `DATE(VALUE(LEFT(${x},4)),VALUE(MID(${x},6,2)),VALUE(MID(${x},9,2)))`
               + `+VALUE(MID(${x},12,2))/24+VALUE(MID(${x},15,2))/1440`;
  return `IF(ISNUMBER(${x}),${x},IFERROR(${parsed},""))`;
}

for (let i = 2; i <= ROWS; i++){
  const g = (c) => `'Paste data'!${c}${i}`;
  ct.getCell(`A${i}`).value = { formula: `IF(${g("A")}="","",${g("A")})` };
  ct.getCell(`B${i}`).value = { formula: `IF(${g("A")}="","",${g("D")})` };
  ct.getCell(`C${i}`).value = { formula: `IF(${g("A")}="","",${g("B")})` };
  /* waiting: first entered to do -> first entered in progress */
  ct.getCell(`D${i}`).value = { formula:
    `IFERROR(IF(OR(${g("E")}="",${g("F")}=""),"",ROUND((${ts("F",i)})-(${ts("E",i)}),2)),"")` };
  /* working: in progress -> done */
  ct.getCell(`E${i}`).value = { formula:
    `IFERROR(IF(OR(${g("F")}="",${g("G")}=""),"",ROUND((${ts("G",i)})-(${ts("F",i)}),2)),"")` };
  /* total: to do -> done */
  ct.getCell(`F${i}`).value = { formula:
    `IFERROR(IF(OR(${g("E")}="",${g("G")}=""),"",ROUND((${ts("G",i)})-(${ts("E",i)}),2)),"")` };
  /* the Monday of the week the task was finished, for the throughput tab */
  ct.getCell(`G${i}`).value = { formula:
    `IFERROR(IF(${g("G")}="","",(${ts("G",i)})-WEEKDAY((${ts("G",i)}),3)),"")` };
  ct.getCell(`A${i}`).numFmt = "yyyy-mm-dd";
  ct.getCell(`G${i}`).numFmt = "yyyy-mm-dd";
  ["D","E","F"].forEach(c => ct.getCell(`${c}${i}`).numFmt = "0.00;-0.00;-");
  for (let c = 1; c <= 7; c++) ct.getRow(i).getCell(c).font = FONT;
}

/* ========================================================================
   4. DASHBOARD
   ======================================================================== */
const db = wb.addWorksheet("Dashboard", { properties: { tabColor: { argb: GREEN } } });
db.columns = [{ width: 4 }, { width: 34 }, { width: 16 }, { width: 4 }, { width: 58 }];
label(db, "B2", "Dashboard", TITLE);
label(db, "B3", "Every figure is a formula over the Paste data tab. Nothing here is typed in.", SUB);

const D = `'Paste data'!$A$2:$A$${ROWS}`;
const S = `'Paste data'!$B$2:$B$${ROWS}`;
const CL = `'Paste data'!$H$2:$H$${ROWS}`;
const CTd = `'Cycle time'!$D$2:$D$${ROWS}`;
const CTe = `'Cycle time'!$E$2:$E$${ROWS}`;
const CTf = `'Cycle time'!$F$2:$F$${ROWS}`;

const metrics = [
  ["Volume", null, null],
  ["Tasks in export",            `COUNTIF(${D},"<>")`,                          "0"],
  ["Done",                       `COUNTIF(${S},"done")`,                        "0"],
  ["In progress",                `COUNTIF(${S},"doing")`,                       "0"],
  ["To do",                      `COUNTIF(${S},"todo")`,                        "0"],
  ["Completion rate",            `IFERROR(COUNTIF(${S},"done")/COUNTIF(${D},"<>"),"")`, "0.0%"],
  ["Speed  (days)", null, null],
  ["Median total time",          `IFERROR(MEDIAN(IF(${CTf}<>"",${CTf})),"")`,   "0.00"],
  ["Average total time",         `IFERROR(AVERAGE(IF(${CTf}<>"",${CTf})),"")`,  "0.00"],
  ["Median waiting before start",`IFERROR(MEDIAN(IF(${CTd}<>"",${CTd})),"")`,   "0.00"],
  ["Median working once started",`IFERROR(MEDIAN(IF(${CTe}<>"",${CTe})),"")`,   "0.00"],
  ["Slowest task",               `IFERROR(MAX(${CTf}),"")`,                     "0.00;-0.00;-"],
  ["Fastest task",               `IFERROR(MIN(IF(${CTf}<>"",${CTf})),"")`,      "0.00"],
  ["Span", null, null],
  ["First date",                 `IFERROR(MIN(IF(${D}<>"",DATEVALUE(${D}))),"")`, "yyyy-mm-dd"],
  ["Last date",                  `IFERROR(MAX(IF(${D}<>"",DATEVALUE(${D}))),"")`, "yyyy-mm-dd"],
  ["Days covered",               `IFERROR(MAX(IF(${D}<>"",DATEVALUE(${D})))-MIN(IF(${D}<>"",DATEVALUE(${D})))+1,"")`, "0"],
  ["Tasks finished per week",    `IFERROR(COUNTIF(${S},"done")/((MAX(IF(${D}<>"",DATEVALUE(${D})))-MIN(IF(${D}<>"",DATEVALUE(${D})))+1)/7),"")`, "0.0"]
];

/* MEDIAN(IF(...)) and MIN(IF(...)) are array formulas. ExcelJS has no array
   flag, so they are written as SUMPRODUCT-safe equivalents where possible and
   otherwise entered as normal formulas that LibreOffice evaluates row-wise.
   Anything ambiguous is replaced below with a non-array form. */
const NONARRAY = {
  "Median total time":            `IFERROR(MEDIAN('Cycle time'!$F$2:$F$${ROWS}),"")`,
  "Average total time":           `IFERROR(AVERAGE('Cycle time'!$F$2:$F$${ROWS}),"")`,
  "Median waiting before start":  `IFERROR(MEDIAN('Cycle time'!$D$2:$D$${ROWS}),"")`,
  "Median working once started":  `IFERROR(MEDIAN('Cycle time'!$E$2:$E$${ROWS}),"")`,
  "Slowest task":                 `IF(COUNT('Cycle time'!$F$2:$F$${ROWS})=0,"",MAX('Cycle time'!$F$2:$F$${ROWS}))`,
  "Fastest task":                 `IF(COUNT('Cycle time'!$F$2:$F$${ROWS})=0,"",MIN('Cycle time'!$F$2:$F$${ROWS}))`,
  "First date":                   `IFERROR(MIN('Cycle time'!$A$2:$A$${ROWS}),"")`,
  "Last date":                    `IFERROR(MAX('Cycle time'!$A$2:$A$${ROWS}),"")`,
  "Days covered":                 `IFERROR(MAX('Cycle time'!$A$2:$A$${ROWS})-MIN('Cycle time'!$A$2:$A$${ROWS})+1,"")`,
  "Tasks finished per week":      `IFERROR(COUNTIF(${S},"done")/MAX(1,(MAX('Cycle time'!$A$2:$A$${ROWS})-MIN('Cycle time'!$A$2:$A$${ROWS})+1)/7),"")`
};

let row = 5;
metrics.forEach(([name, formula, fmt]) => {
  if (formula === null){
    const c = label(db, "B" + row, name.toUpperCase(), { name:"Arial", size:9, bold:true, color:{argb:"FF6B7280"} });
    c.border = { bottom: { style: "thin", color: { argb: RULE } } };
    db.getCell("C" + row).border = { bottom: { style: "thin", color: { argb: RULE } } };
    row += 1;
    return;
  }
  label(db, "B" + row, name, FONT);
  const cell = db.getCell("C" + row);
  cell.value = { formula: NONARRAY[name] || formula };
  cell.font = { ...FONT, bold: true };
  cell.numFmt = fmt;
  cell.alignment = { horizontal: "right" };
  row += 1;
});

label(db, "E5", "Reading these numbers", { ...FONT, bold: true, size: 12 });
const notes = [
  "Waiting before start is the number most people are surprised by. If it is much larger",
  "than working time, the constraint is deciding what to do, not doing it.",
  "",
  "Median is shown next to average deliberately. One task left open for three months drags",
  "the average and tells you nothing; the median is what a typical task actually looks like.",
  "",
  "Tasks finished per week is throughput. It is the honest measure of capacity, and the one",
  "worth watching over time rather than in a single snapshot.",
  "",
  "A blank cycle time means the task never passed through that column, so there is nothing",
  "to measure. It is not an error."
];
let nr = 6;
notes.forEach(t => { label(db, "E" + nr, t, { ...FONT, color: { argb: "FF3F434C" } }); nr++; });

/* ========================================================================
   5. BY WEEK  (throughput)
   ======================================================================== */
const bw = wb.addWorksheet("By week", { properties: { tabColor: { argb: AMBER } } });
bw.columns = [{ width: 16 }, { width: 18 }, { width: 20 }, { width: 4 }, { width: 60 }];
bw.getRow(1).values = ["week starting", "tasks finished", "median days to finish"];
styleHeaderRow(bw, 1, 3, AMBER);
label(bw, "E2", "Fill column A with the Monday of each week you care about (e.g. 2026-06-01,", { ...FONT, color:{argb:"FF3F434C"} });
label(bw, "E3", "2026-06-08, ...). Columns B and C fill themselves. Drag column A down as far as", { ...FONT, color:{argb:"FF3F434C"} });
label(bw, "E4", "your data goes; 60 weeks are pre-wired here.", { ...FONT, color:{argb:"FF3F434C"} });
label(bw, "E6", "Throughput is the clearest signal in the whole workbook. A run of low weeks is", { ...FONT, color:{argb:"FF3F434C"} });
label(bw, "E7", "worth a conversation with yourself; a single low week usually is not.", { ...FONT, color:{argb:"FF3F434C"} });

for (let i = 2; i <= 61; i++){
  bw.getCell(`B${i}`).value = { formula:
    `IF($A${i}="","",COUNTIFS('Cycle time'!$G$2:$G$${ROWS},$A${i}))` };
  bw.getCell(`C${i}`).value = { formula:
    `IF($A${i}="","",IFERROR(AVERAGEIFS('Cycle time'!$F$2:$F$${ROWS},'Cycle time'!$G$2:$G$${ROWS},$A${i}),""))` };
  bw.getCell(`A${i}`).numFmt = "yyyy-mm-dd";
  bw.getCell(`C${i}`).numFmt = "0.00;-0.00;-";
  for (let c = 1; c <= 3; c++) bw.getRow(i).getCell(c).font = FONT;
}
bw.views = [{ state: "frozen", ySplit: 1 }];

/* ========================================================================
   6. BY DAY TYPE
   ======================================================================== */
const bd = wb.addWorksheet("By day type", { properties: { tabColor: { argb: GREEN } } });
bd.columns = [{ width: 18 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 4 }, { width: 58 }];
bd.getRow(1).values = ["day type", "tasks", "finished", "completion rate"];
styleHeaderRow(bd, 1, 4, GREEN);
/* The four day colours are fixed labels in the app, plus a bucket for days
   with no colour set. Renaming a colour in the app renames it here too, so
   these are editable. */
const DAYTYPES = ["Milestone", "Travel", "Leave", "WFH"];
DAYTYPES.forEach((t, i) => {
  const rr = i + 2;
  bd.getCell(`A${rr}`).value = t;
  bd.getCell(`B${rr}`).value = { formula: `COUNTIF(${CL},$A${rr})` };
  bd.getCell(`C${rr}`).value = { formula: `COUNTIFS(${CL},$A${rr},${S},"done")` };
  bd.getCell(`D${rr}`).value = { formula: `IFERROR($C${rr}/$B${rr},"")` };
  bd.getCell(`D${rr}`).numFmt = "0.0%";
  for (let c = 1; c <= 4; c++) bd.getRow(rr).getCell(c).font = FONT;
});
const rrLast = DAYTYPES.length + 2;
bd.getCell(`A${rrLast}`).value = "No colour set";
bd.getCell(`B${rrLast}`).value = { formula: `COUNTIFS(${D},"<>",${CL},"")` };
bd.getCell(`C${rrLast}`).value = { formula: `COUNTIFS(${D},"<>",${CL},"",${S},"done")` };
bd.getCell(`D${rrLast}`).value = { formula: `IFERROR($C${rrLast}/$B${rrLast},"")` };
bd.getCell(`D${rrLast}`).numFmt = "0.0%";
for (let c = 1; c <= 4; c++) bd.getRow(rrLast).getCell(c).font = FONT;

label(bd, "F2", "If you renamed the day colours in the app, rename them in column A to match.", { ...FONT, color:{argb:"FF3F434C"} });
label(bd, "F4", "The question worth asking here is whether the days you mark as exceptions -", { ...FONT, color:{argb:"FF3F434C"} });
label(bd, "F5", "travel, leave - are quietly absorbing work you meant to protect them from.", { ...FONT, color:{argb:"FF3F434C"} });

/* ---- order the tabs so the first thing seen is the instructions ---- */
wb.worksheets.forEach((s, i) => { s.orderNo = i; });

const OUT = path.join(__dirname, "inmycalendar-analytics.xlsx");
wb.xlsx.writeFile(OUT).then(() => console.log("written: " + OUT));
