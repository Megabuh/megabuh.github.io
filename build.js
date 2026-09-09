const os = require("os");
const path = require("path");
const CFG = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
const SKILL = path.join(CFG, "gigatool", "skills", "xlsx");
const ExcelJS = require(path.join(SKILL, "vendor", "exceljs.bundle.cjs"));
const H = require(path.join(SKILL, "helpers", "index.cjs"));

// ---- Календарная логика (из nalog_calendar.cjs) ----
const HOLIDAYS_2026 = new Set([
  "1-1","1-2","1-3","1-4","1-5","1-6","1-7","1-8","1-9",
  "2-23","3-8","3-9","5-1","5-9","5-11","6-12","11-4","12-31",
]);
const D = (y,m,d) => new Date(Date.UTC(y,m-1,d));
const M = (dt) => dt.getUTCMonth()+1;
const DD = (dt) => dt.getUTCDate();
const ru = (dt) => `${String(DD(dt)).padStart(2,"0")}.${String(M(dt)).padStart(2,"0")}.${dt.getUTCFullYear()}`;
const p2 = (n) => String(n).padStart(2,"0");
const Q_END_MONTH = {1:3,2:6,3:9,4:12};

function isWorkday(dt) {
  const wd = dt.getUTCDay();
  if (wd===0||wd===6) return false;
  if (dt.getUTCFullYear()===2026&&HOLIDAYS_2026.has(M(dt)+"-"+DD(dt))) return false;
  if (dt.getUTCFullYear()===2027&&M(dt)===1&&DD(dt)<=8) return false;
  return true;
}
function shift(dt) {
  let d = new Date(dt.getTime());
  while (!isWorkday(d)) d = new Date(d.getTime()+86400000);
  return d;
}
function lastWorkdayOfYear(year) {
  let d = D(year,12,31);
  while (!isWorkday(d)) d = new Date(d.getTime()-86400000);
  return d;
}

function buildEvents(year, profile, employees, nds) {
  const org = profile.startsWith("ooo");
  const usn = profile.endsWith("usn");
  const osno = profile.endsWith("osno");
  const ev = [];
  const add = (d,name,kind,note="") => ev.push({deadline:shift(d),nominal:d,name,kind,note});
  const mk = (y,m,d) => D(y,m,d);
  if (employees) {
    for (let m=1;m<=12;m++) {
      add(mk(year,m,25),`Уведомление ЕНП: НДФЛ за 1–22 ${p2(m)}.${year}`,"уведомление");
      add(mk(year,m,28),`Уплата НДФЛ за 1–22 ${p2(m)}.${year}`,"уплата");
      if (m===12) {
        const eoy = lastWorkdayOfYear(year);
        add(eoy,`Уведомление ЕНП: НДФЛ за 23–31 ${p2(m)}.${year}`,"уведомление","п.6 ст.226 НК — последний рабочий день года");
        add(eoy,`Уплата НДФЛ за 23–31 ${p2(m)}.${year}`,"уплата","п.6 ст.226 НК — последний рабочий день года");
      } else {
        add(mk(year,m+1,3),`Уведомление ЕНП: НДФЛ за 23–конец ${p2(m)}.${year}`,"уведомление");
        add(mk(year,m+1,5),`Уплата НДФЛ за 23–конец ${p2(m)}.${year}`,"уплата");
      }
      add(mk(year,m+1,25),`Персонифицированные сведения о физлицах за ${p2(m)}.${year}`,"отчёт");
      add(mk(year,m+1,28),`Уплата страховых взносов за ${p2(m)}.${year}`,"уплата");
      add(mk(year,m+1,15),`Взносы на травматизм за ${p2(m)}.${year} (СФР, вне ЕНП)`,"уплата");
      if (m%3!==0) add(mk(year,m+1,25),`Уведомление ЕНП: страховые взносы за ${p2(m)}.${year}`,"уведомление");
    }
    for (const q of [1,2,3,4]) {
      const em=Q_END_MONTH[q];
      add(mk(year,em+1,25),`РСВ за ${q===4?"год":`${q} кв. ${year}`}`,"отчёт");
      add(mk(year,em+1,25),`ЕФС-1 (раздел 2, травматизм) за ${q} кв. ${year}`,"отчёт");
      if (q<4) add(mk(year,em+1,25),`6-НДФЛ за ${q} кв. ${year} (нарастающим)`,"отчёт");
    }
    add(mk(year+1,2,25),`6-НДФЛ за ${year} год`,"отчёт");
  }
  if (osno||(usn&&nds)) {
    for (const q of [1,2,3,4]) {
      const em=Q_END_MONTH[q];
      add(mk(year,em+1,25),`Декларация по НДС за ${q} кв. ${year}`,"отчёт");
      for (const i of [1,2,3]) add(mk(year,em+i,28),`Уплата 1/3 НДС за ${q} кв. ${year}`,"уплата");
    }
  }
  if (org&&osno) {
    for (const q of [1,2,3]) {
      const em=Q_END_MONTH[q];
      add(mk(year,em+1,25),`Декларация по налогу на прибыль за ${q} кв. ${year}`,"отчёт");
      add(mk(year,em+1,28),`Аванс по налогу на прибыль за ${q} кв. ${year}`,"уплата");
    }
    add(mk(year+1,3,25),`Декларация по налогу на прибыль за ${year} год`,"отчёт");
    add(mk(year+1,3,28),`Налог на прибыль за ${year} год`,"уплата");
  }
  if (usn) {
    for (const q of [1,2,3]) {
      const em=Q_END_MONTH[q];
      add(mk(year,em+1,25),`Уведомление ЕНП: аванс по УСН за ${q} кв. ${year}`,"уведомление");
      add(mk(year,em+1,28),`Аванс по УСН за ${q} кв. ${year}`,"уплата");
    }
    if (org) {
      add(mk(year+1,3,25),`Декларация по УСН за ${year} год (организации)`,"отчёт");
      add(mk(year+1,3,28),`Налог по УСН за ${year} год (организации)`,"уплата");
    } else {
      add(mk(year+1,4,25),`Декларация по УСН за ${year} год (ИП)`,"отчёт");
      add(mk(year+1,4,28),`Налог по УСН за ${year} год (ИП)`,"уплата");
    }
  }
  if (!org) {
    add(mk(year,12,28),`Фиксированные взносы ИП за себя за ${year} год`,"уплата");
    add(mk(year+1,7,1),`Взносы ИП 1% с дохода свыше 300 тыс. за ${year} год`,"уплата");
    if (osno) {
      add(mk(year+1,4,30),`3-НДФЛ за ${year} год (ИП на ОСНО)`,"отчёт");
      add(mk(year+1,7,15),`НДФЛ за ${year} год (ИП на ОСНО)`,"уплата");
    }
  }
  if (org) {
    add(mk(year+1,3,31),`Бухгалтерская отчётность за ${year} год`,"отчёт");
    if (osno) {
      add(mk(year+1,2,25),`Декларация по налогу на имущество за ${year} год`,"отчёт","если есть имущество по среднегодовой стоимости");
      add(mk(year+1,2,28),`Налог на имущество за ${year} год`,"уплата","при наличии объектов");
    }
  }
  ev.sort((a,b)=>a.deadline-b.deadline||(a.kind<b.kind?-1:a.kind>b.kind?1:0));
  return ev;
}

// ---- CLI ----
const argv = process.argv.slice(2);
const val=(f,d)=>(argv.includes(f)?argv[argv.indexOf(f)+1]:d);

function usageAndExit(code) {
  console.log(`Налоговый календарь 2026 — генератор .xlsx

Использование:
  multitool-node build.js --profile ooo-usn [--employees] [--nds]
  multitool-node build.js --profile ip-osno [--no-employees]

Профили: ooo-osno, ooo-usn, ip-osno, ip-usn
Флаги:  --employees / --no-employees (ООО=да, ИП=нет по умолч.)
        --nds (УСН с НДС при доходе >20 млн)
        --output FILE.xlsx (по умолч. nalog-calendar-2026.xlsx)
`);
  process.exit(code);
}

if (!argv.includes("--profile")) usageAndExit(2);
const profile = val("--profile");
if (!["ooo-osno","ooo-usn","ip-osno","ip-usn"].includes(profile)) {
  console.log("Неизвестный профиль:", profile); process.exit(2);
}
const year = parseInt(val("--year","2026"),10);
let employees = profile.startsWith("ooo");
if (argv.includes("--employees")) employees = true;
if (argv.includes("--no-employees")) employees = false;
const nds = argv.includes("--nds");
const outPath = val("--output","nalog-calendar-2026.xlsx");

const events = buildEvents(year, profile, employees, nds);

// ---- Сборка .xlsx ----
(async () => {
  const wb = new ExcelJS.Workbook();

  // Лист 1: Дашборд
  const dash = H.addSheet(wb, "Дашборд");
  H.titleBand(dash, "A1:G1", "Налоговый календарь 2026", "Персональный график отчётности и платежей по ЕНП/ЕНС");

  // Инфо по профилю
  const profileLabel = { "ooo-osno":"ООО на ОСНО", "ooo-usn":"ООО на УСН", "ip-osno":"ИП на ОСНО", "ip-usn":"ИП на УСН" };
  dash.getCell("A3").value = "Профиль:";
  dash.getCell("B3").value = profileLabel[profile];
  dash.getCell("B3").font = { bold: true, size: 10, color: { argb: H.THEME.ink } };
  dash.getCell("A4").value = "Работники:";
  dash.getCell("B4").value = employees ? "Есть" : "Нет";
  dash.getCell("B4").font = { bold: true, size: 10, color: { argb: H.THEME.ink } };
  if (nds) { dash.getCell("A5").value = "НДС:"; dash.getCell("B5").value = "Да (УСН с НДС)"; dash.getCell("B5").font = { bold: true, size: 10, color: { argb: H.THEME.ink } }; }

  // KPI
  const reportCount = events.filter(e => e.kind==="отчёт").length;
  const payCount = events.filter(e => e.kind==="уплата").length;
  const noticeCount = events.filter(e => e.kind==="уведомление").length;
  H.kpi(dash, "A7", "Всего событий", events.length, H.FMT.int);
  H.kpi(dash, "C7", "Отчёты", reportCount, H.FMT.int);
  H.kpi(dash, "E7", "Платежи", payCount, H.FMT.int);
  H.kpi(dash, "G7", "Уведомления", noticeCount, H.FMT.int);

  // Горящие сроки (ближайшие 30 дней)
  const now = new Date();
  const soon = new Date(now.getTime() + 30*86400000);
  const urgent = events.filter(e => e.deadline >= now && e.deadline <= soon);
  if (urgent.length > 0) {
    dash.getCell("A10").value = "Ближайшие сроки";
    dash.getCell("A10").font = { bold: true, size: 11, color: { argb: H.THEME.band } };
    const hRow = 11;
    dash.getCell(`A${hRow}`).value = "Дата";
    dash.getCell(`B${hRow}`).value = "Тип";
    dash.getCell(`C${hRow}`).value = "Событие";
    dash.getCell(`D${hRow}`).value = "Примечание";
    H.headerRow(dash, `A${hRow}:D${hRow}`);
    urgent.forEach((e,i) => {
      const r = hRow + 1 + i;
      dash.getCell(`A${r}`).value = ru(e.deadline);
      dash.getCell(`A${r}`).numFmt = H.FMT.text;
      dash.getCell(`B${r}`).value = e.kind;
      const moved = ru(e.deadline) !== ru(e.nominal) ? ` (перенос с ${ru(e.nominal)})` : "";
      dash.getCell(`C${r}`).value = e.name + moved;
      dash.getCell(`D${r}`).value = e.note || "";
    });
    H.body(dash, `A${hRow+1}:D${hRow+urgent.length}`);
    H.widths(dash, [["A",14],["B",14],["C",55],["D",40]]);
  }

  // Лист 2: Календарь (все события)
  const cal = H.addSheet(wb, "Календарь");
  H.titleBand(cal, "A1:D1", "Все события", `Налоговый календарь ${year} — ${events.length} записей`);

  // Группируем по месяцам
  let row = 3;
  let currentMonth = "";
  for (const e of events) {
    const ym = `${e.deadline.getUTCFullYear()}-${p2(M(e.deadline))}`;
    if (ym !== currentMonth) {
      currentMonth = ym;
      cal.getCell(`A${row}`).value = `${M(e.deadline)}.${e.deadline.getUTCFullYear()}`;
      cal.getCell(`A${row}`).font = { bold: true, size: 10, color: { argb: H.THEME.band } };
      row++;
    }
    const moved = ru(e.deadline) !== ru(e.nominal) ? ` (перенос с ${ru(e.nominal)})` : "";
    cal.getCell(`A${row}`).value = ru(e.deadline);
    cal.getCell(`A${row}`).numFmt = H.FMT.text;
    cal.getCell(`B${row}`).value = e.kind;
    cal.getCell(`C${row}`).value = e.name + moved;
    cal.getCell(`D${row}`).value = e.note || "";
    cal.getCell(`A${row}`).font = { size: 10, color: { argb: H.THEME.ink } };
    cal.getCell(`B${row}`).font = { size: 10, color: { argb: H.THEME.ink } };
    cal.getCell(`C${row}`).font = { size: 10, color: { argb: H.THEME.ink } };
    cal.getCell(`D${row}`).font = { size: 10, color: { argb: H.THEME.ink } };
    row++;
  }
  H.widths(cal, [["A",14],["B",14],["C",55],["D",40]]);
  H.freeze(cal, 2);

  // Лист 3: Статистика
  const stats = H.addSheet(wb, "Статистика");
  H.titleBand(stats, "A1:C1", "Статистика", "Сводка по типам событий и месяцам");

  // По типам
  stats.getCell("A3").value = "Тип";
  stats.getCell("B3").value = "Количество";
  H.headerRow(stats, "A3:B3");
  const types = ["отчёт","уплата","уведомление"];
  types.forEach((t,i) => {
    const r = 4+i;
    stats.getCell(`A${r}`).value = t;
    stats.getCell(`B${r}`).value = events.filter(e => e.kind===t).length;
  });
  stats.getCell("A7").value = "ИТОГО";
  stats.getCell("A7").font = { bold: true };
  stats.getCell("B7").value = { formula: "SUM(B4:B6)" };
  stats.getCell("B7").numFmt = H.FMT.int;
  H.body(stats, "A4:B7");
  H.widths(stats, [["A",20],["B",14]]);

  // По месяцам
  const months = [];
  for (let m=1; m<=12; m++) {
    const me = events.filter(e => M(e.deadline)===m && e.deadline.getUTCFullYear()===year);
    months.push({month: m, count: me.length, reports: me.filter(e=>e.kind==="отчёт").length, payments: me.filter(e=>e.kind==="уплата").length });
  }
  // Добавим события следующего года
  const nextYear = events.filter(e => e.deadline.getUTCFullYear()>year);
  if (nextYear.length > 0) {
    months.push({month: 0, count: nextYear.length, reports: nextYear.filter(e=>e.kind==="отчёт").length, payments: nextYear.filter(e=>e.kind==="уплата").length });
  }

  stats.getCell("A9").value = "Месяц";
  stats.getCell("B9").value = "Всего";
  stats.getCell("C9").value = "Отчёты";
  stats.getCell("D9").value = "Платежи";
  H.headerRow(stats, "A9:D9");
  months.forEach((m,i) => {
    const r = 10+i;
    stats.getCell(`A${r}`).value = m.month===0 ? `I кв. ${year+1}` : `${m.month}.${year}`;
    stats.getCell(`B${r}`).value = m.count;
    stats.getCell(`C${r}`).value = m.reports;
    stats.getCell(`D${r}`).value = m.payments;
  });
  H.body(stats, "A10:D"+(9+months.length));
  H.widths(stats, [["A",16],["B",10],["C",10],["D",10]]);

  await wb.xlsx.writeFile(outPath);
  console.log(`Создан файл: ${outPath} (${events.length} событий)`);
  console.log(`Профиль: ${profileLabel[profile]}, работники: ${employees ? "да" : "нет"}${nds ? ", НДС: да" : ""}`);
})();