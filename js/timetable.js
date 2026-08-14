/* ============================================================
   TIMETABLE VIEW — full month as a data table.
   Toggle between Start times and Jamāʿah times for a cleaner view.
   ============================================================ */
import { MON, RAW, overrideFor, formatTime } from "./data.js";
import { getSettings } from "./settings.js";

const $ = id => document.getElementById(id);
const DAY_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
let activeMonth = new Date().getMonth()+1;
let mode = "begins";   // "begins" | "jamaat"

// Jamāʿah carried forward within a month for display.
function monthRows(m){
  const rows = RAW[m] || [];
  let fJ="", zJ="", aJ="", iJ="";
  for(let mm=1; mm<m; mm++){
    for(const r of (RAW[mm]||[])){ if(r[6])fJ=r[6]; if(r[7])zJ=r[7]; if(r[8])aJ=r[8]; if(r[10])iJ=r[10]; }
  }
  return rows.map(r=>{
    const [d,sehri,sunrise,zuhrS,asrS,ishaS,f,z,a,maghrib,i]=r;
    if(f)fJ=f; if(z)zJ=z; if(a)aJ=a; if(i)iJ=i;
    // admin-set custom Jamaat times win for that specific day
    const ov = overrideFor(m, d) || {};
    return { d,
      begins:{ fajr:sehri, zuhr:zuhrS, asr:asrS, maghrib, isha:ishaS },
      jamaat:{ fajr:ov.fajr||fJ, zuhr:ov.zuhr||zJ, asr:ov.asr||aJ,
               maghrib:ov.maghrib||maghrib, isha:ov.isha||iJ }
    };
  });
}

function buildGrid(){
  const g=$("monthGrid");
  g.innerHTML = MON.map((name,i)=>
    `<button class="monthbtn" data-m="${i+1}">${i+1}. ${name.slice(0,3)}</button>`).join("");
  g.querySelectorAll(".monthbtn").forEach(b=>{
    b.onclick=()=>showMonth(parseInt(b.dataset.m,10));
  });
}

function showMonth(m){
  activeMonth=m;
  document.querySelectorAll(".monthbtn").forEach(b=>
    b.classList.toggle("active", parseInt(b.dataset.m,10)===m));

  const today=new Date();
  const rows=monthRows(m);
  const { hour12, meridiem } = getSettings().display;
  /* `prayer` is needed because the stored "H.MM" has no AM/PM — which half
     of the day it lands in comes from which prayer it is. */
  const cell = (v, prayer) => v ? formatTime(v, prayer, hour12, meridiem) : "—";
  const body = rows.map(r=>{
    const t = r[mode];
    const date=new Date(today.getFullYear(), m-1, r.d);
    const isToday = date.toDateString()===today.toDateString();
    const isFri = date.getDay()===5;
    const cls=[isToday?"is-today":"", isFri?"is-fri":""].filter(Boolean).join(" ");
    return `<tr class="${cls}">
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
    <p class="note">Showing <b>${mode==="begins"?"start":"Jamaat"} times</b>. Today is highlighted · Fridays are shaded.</p>`;
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
