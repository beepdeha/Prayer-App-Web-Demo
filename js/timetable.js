/* ============================================================
   TIMETABLE VIEW — full month as a data table.
   Toggle between Start times and Jamāʿah times for a cleaner view.
   ============================================================ */
import { MON, RAW, dayTimes, formatTime } from "./data.js";
import { getSettings } from "./settings.js";

const $ = id => document.getElementById(id);
/* Friday reads "Jmh" (Jummah) rather than "Fri" — it is the day's name
   at the masjid. */
const DAY_SHORT = ["Sun","Mon","Tue","Wed","Thu","Jmh","Sat"];
let activeMonth = new Date().getMonth()+1;
let mode = "begins";   // "begins" | "jamaat"
let selectedDay = null; // the row the reader tapped, for this month only

/* One month as displayed. Goes through dayTimes() rather than reading RAW
   directly, so the Jamaat carry-forward, the admin's custom times and the
   clock-change correction are the same ones the Prayers page uses. */
function monthRows(m, year){
  return (RAW[m] || []).map(([d])=>{
    const t = dayTimes(new Date(year, m-1, d)) || {};
    return { d,
      begins:{ fajr:t.sehri, zuhr:t.zuhrS, asr:t.asrS, maghrib:t.maghrib, isha:t.ishaS },
      jamaat:{ fajr:t.fajrJ, zuhr:t.zuhrJ, asr:t.asrJ, maghrib:t.maghrib, isha:t.ishaJ }
    };
  });
}

function buildGrid(){
  const g=$("monthGrid");
  g.innerHTML = MON.map((name,i)=>
    `<button class="monthbtn" data-m="${i+1}">${i+1}. ${name.slice(0,3)}</button>`).join("");
  g.querySelectorAll(".monthbtn").forEach(b=>{
    b.onclick=()=>{ if(parseInt(b.dataset.m,10)!==activeMonth) selectedDay=null; showMonth(parseInt(b.dataset.m,10)); };
  });
}

function showMonth(m){
  activeMonth=m;
  document.querySelectorAll(".monthbtn").forEach(b=>
    b.classList.toggle("active", parseInt(b.dataset.m,10)===m));

  const today=new Date();
  const rows=monthRows(m, today.getFullYear());
  const { hour12, meridiem } = getSettings().display;
  /* `prayer` is needed because the stored "H.MM" has no AM/PM — which half
     of the day it lands in comes from which prayer it is. */
  const cell = (v, prayer) => v ? formatTime(v, prayer, hour12, meridiem) : "—";
  const body = rows.map(r=>{
    const t = r[mode];
    const date=new Date(today.getFullYear(), m-1, r.d);
    const isToday = date.toDateString()===today.toDateString();
    const isFri = date.getDay()===5;
    const cls=[isToday?"is-today":"", isFri?"is-fri":"", r.d===selectedDay?"is-sel":""].filter(Boolean).join(" ");
    return `<tr class="${cls}" tabindex="0" data-d="${r.d}">
      <td class="d">${r.d}</td>
      <td class="dy">${DAY_SHORT[date.getDay()]}</td>
      <td>${cell(t.fajr,"fajr")}</td>
      <td>${cell(t.zuhr,"zuhr")}</td>
      <td>${cell(t.asr,"asr")}</td>
      <td>${cell(t.maghrib,"maghrib")}</td>
      <td>${cell(t.isha,"isha")}</td>
    </tr>`;
  }).join("");

  const box=$("monthTable");
  box.hidden=false;
  box.innerHTML = `<div class="mt-cap">${m}. ${MON[m-1]}</div>
    <div class="card" style="margin-top:0;overflow-x:auto">
      <table class="mt-table">
        <thead><tr>
          <th>Date</th><th>Day</th><th>Fajr</th><th>Zuhr</th><th>Asr</th><th>Mgrb</th><th>Isha</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <p class="note">Showing <b>${mode==="begins"?"start":"Jamaat"} times</b>. Today is highlighted · Jummah (Friday) rows are shaded blue · Tap a row to mark it.</p>`;

  /* Tap a row to mark it, tap it again to clear. Toggled in place rather
     than re-rendering, so the table keeps its scroll position. */
  box.querySelector("tbody").onclick = e=>{
    const tr = e.target.closest("tr[data-d]");
    if(!tr) return;
    const d = parseInt(tr.dataset.d,10);
    selectedDay = selectedDay===d ? null : d;
    box.querySelectorAll("tr.is-sel").forEach(x=>x.classList.remove("is-sel"));
    if(selectedDay!==null) tr.classList.add("is-sel");
  };
}

/* Repaint the open month after a settings change (e.g. 12h/24h). No-op if
   the timetable has never been built, so it is safe to call unconditionally. */
export function refreshTimetable(){
  if($("monthTable")?.hidden === false) showMonth(activeMonth);
}

export function initTimetable(){
  buildGrid();
  document.querySelectorAll("#ttSeg button").forEach(b=>{
    b.onclick=()=>{
      mode=b.dataset.mode;
      document.querySelectorAll("#ttSeg button").forEach(x=>x.classList.toggle("active", x===b));
      showMonth(activeMonth);
    };
  });
  showMonth(new Date().getMonth()+1);
}
