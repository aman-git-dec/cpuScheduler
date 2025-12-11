// app.js
// Entry point: imports scheduler, ui, gantt, wires DOM events and controls.

import * as S from './scheduler.js';
import * as UI from './ui.js';
import * as G from './gantt.js';

// DOM references (IDs must match index.html)
const tableBody = document.querySelector('#procTable tbody');
const progressList = document.getElementById('progressList');
const waitingLine = document.getElementById('waitingLine');
const metricsEls = {
  makespan: document.getElementById('makespan'),
  avgWait: document.getElementById('avgWait'),
  avgTurn: document.getElementById('avgTurn'),
  throughput: document.getElementById('throughput'),
  cpuUtil: document.getElementById('cpuUtil')
};
const modal = document.getElementById('addModal');
const legendEl = document.getElementById('legend');
const tooltip = document.getElementById('ganttTooltip');

// init canvas modules
const canvas = document.getElementById('gantt');
const queueCanvas = document.getElementById('queueChart');
G.initGantt(canvas, queueCanvas, tooltip, legendEl);

// init UI module
UI.initUI({
  tableBody,
  progressList,
  waitingLine,
  metricsEls,
  modal,
  legendEl
});

// helper: seed sample processes if none
if (!S.state.processes.length) {
  S.addProcess('P1',0,5,1); S.addProcess('P2',2,3,2); S.addProcess('P3',4,2,1);
  for (const p of S.state.processes) G.assignColor(p.pid);
}

// refresh initial UI + charts
UI.refreshUI(); G.drawGantt(); G.drawQueue();

// wire control elements
document.getElementById('start').addEventListener('click', ()=>{
  if (S.state.processes.length === 0) { alert('Add at least one process'); return; }
  S.resetState();
  // reassign color map if new processes added
  for (const p of S.state.processes) G.assignColor(p.pid);
  S.state.running = true;
  S.state.currentPid = null;
  runLoop();
});

document.getElementById('toggle').addEventListener('click', ()=>{
  S.state.running = !S.state.running;
  document.getElementById('toggle').textContent = S.state.running ? '⏸ Pause' : '▶ Resume';
  if (S.state.running) runLoop();
});

document.getElementById('reset').addEventListener('click', ()=>{
  S.resetState(); UI.refreshUI(); G.drawGantt(); G.drawQueue(); UI.showMetrics({});
  S.state.running = false;
  document.getElementById('toggle').textContent = '⏸ Pause';
});

document.getElementById('openAdd').addEventListener('click', ()=> UI.showModal(true));
document.getElementById('m_cancel').addEventListener('click', ()=> UI.showModal(false));
document.getElementById('m_add').addEventListener('click', ()=>{
  const pid = document.getElementById('m_pid').value.trim() || `P${S.state.processes.length+1}`;
  const arr = Number(document.getElementById('m_arr').value || 0);
  const burst = Number(document.getElementById('m_burst').value || 1);
  const pri = Number(document.getElementById('m_pri').value || 0);
  S.addProcess(pid, arr, burst, pri);
  G.assignColor(pid);
  UI.refreshUI(); UI.showModal(false);
});

document.getElementById('q_add').addEventListener('click', ()=>{
  const pid = document.getElementById('q_pid').value.trim() || `P${S.state.processes.length+1}`;
  const arr = Number(document.getElementById('q_arr').value || 0);
  const burst = Number(document.getElementById('q_burst').value || 1);
  const pri = Number(document.getElementById('q_pr').value || 0);
  S.addProcess(pid, arr, burst, pri);
  G.assignColor(pid);
  UI.refreshUI();
  document.getElementById('q_pid').value = '';
});

// remove selected
document.getElementById('removeSelected').addEventListener('click', ()=>{
  const rows = [...tableBody.children];
  const selIndex = rows.findIndex(r => r.classList.contains('selected'));
  if (selIndex === -1) { alert('Select a row'); return; }
  const pid = rows[selIndex].children[0].textContent;
  S.removeProcessByPid(pid);
  UI.refreshUI();
  G.drawGantt(); G.drawQueue();
});

// controls mapping
document.getElementById('algo').addEventListener('change', (e)=> S.state.algorithm = e.target.value);
document.getElementById('quantum').addEventListener('change', (e)=> S.state.quantum = Number(e.target.value));
document.getElementById('speed').addEventListener('input', (e)=> S.state.speedMs = Number(e.target.value));

// simulation loop
let loopTimer = null;
function runLoop() {
  if (!S.state.running) return;
  S.stepOnce();
  UI.refreshUI();
  G.drawGantt();
  G.drawQueue();

  if (S.state.processes.every(p=>p.remaining===0)) {
    S.state.running = false;
    const metrics = S.computeMetrics();
    UI.showMetrics(metrics);
    document.getElementById('toggle').textContent = '▶ Resume';
    alert(`Simulation finished at t=${S.state.simTime}`);
    return;
  }
  loopTimer = setTimeout(runLoop, S.state.speedMs);
}

// small convenience: initial metrics clear
UI.showMetrics({});
