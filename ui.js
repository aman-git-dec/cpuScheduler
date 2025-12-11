// ui.js
// Exports initUI(elements) and refresh functions. Minimal DOM logic.

import { state } from './scheduler.js';

export let elements = {};

export function initUI(opts) {
  elements = opts; // expect { tableBody, progressList, waitingLine, metricsEls, modalEls, legendEl, tooltipEl }
}

// Refresh processes table and small UI elements
export function refreshUI() {
  const tableBody = elements.tableBody;
  tableBody.innerHTML = '';
  state.processes.sort((a,b)=> a.arrival - b.arrival || a.pid.localeCompare(b.pid));
  for (const p of state.processes) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${p.pid}</td><td>${p.arrival}</td><td>${p.burst}</td><td>${p.remaining}</td><td>${p.priority}</td><td>${statusOf(p)}</td>`;
    tr.onclick = ()=> {
      [...tableBody.children].forEach(r=>r.classList.remove('selected'));
      tr.classList.add('selected');
    };
    tableBody.appendChild(tr);
  }

  // progress
  const progressList = elements.progressList;
  progressList.innerHTML = '';
  for (const p of state.processes) {
    const d = document.createElement('div'); d.className='progress-item';
    const lbl = document.createElement('div'); lbl.textContent = p.pid; lbl.style.width='48px';
    const barWrap = document.createElement('div'); barWrap.className='bar';
    const i = document.createElement('i'); i.style.width = (100 * (1 - p.remaining / p.burst)) + '%';
    barWrap.appendChild(i);
    const pct = document.createElement('div'); pct.textContent = Math.round(100*(1 - p.remaining / p.burst)) + '%'; pct.style.width='44px';
    d.appendChild(lbl); d.appendChild(barWrap); d.appendChild(pct);
    progressList.appendChild(d);
  }

  // waiting single-line
  const waiting = state.processes.filter(p=> p.arrival<=state.simTime && p.remaining>0 && p.pid!==state.currentPid).map(p=>p.pid);
  elements.waitingLine.textContent = waiting.length ? waiting.join(', ') : '—';
}

// status text used in table
function statusOf(p) {
  if (p.remaining === 0) return 'Done';
  if (p.start !== null && p.remaining>0 && p.pid === state.currentPid) return 'Running';
  if (p.arrival <= state.simTime) return 'Ready';
  return 'Waiting';
}

export function showMetrics(metrics) {
  const m = elements.metricsEls;
  if (!m) return;
  m.makespan.textContent = metrics.makespan != null ? metrics.makespan.toFixed ? metrics.makespan.toFixed(0) : metrics.makespan : '-';
  m.avgWait.textContent  = metrics.avg_wait  != null ? metrics.avg_wait.toFixed(2) : '-';
  m.avgTurn.textContent  = metrics.avg_turn  != null ? metrics.avg_turn.toFixed(2) : '-';
  m.throughput.textContent = metrics.throughput != null ? metrics.throughput.toFixed(2) : '-';
  m.cpuUtil.textContent = metrics.cpuUtil != null ? (metrics.cpuUtil*100).toFixed(1)+'%' : '-';
}

export function showModal(show) {
  if (!elements.modal) return;
  if (show) { elements.modal.classList.remove('hidden'); elements.modal.setAttribute('aria-hidden','false'); }
  else { elements.modal.classList.add('hidden'); elements.modal.setAttribute('aria-hidden','true'); }
}
