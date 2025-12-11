// scheduler.js
// Exports scheduler state and functions for stepping algorithms.
// No DOM here.

export const state = {
  processes: [],
  simTime: 0,
  running: false,
  currentPid: null,
  gantt: [],            // [pid, start, end]
  waitingHistory: [],   // [time, waitingLen]
  rr: { queue: null, index: 0, used: 0 },

  // UI-settable control params (mutate from app)
  algorithm: 'FCFS',
  quantum: 2,
  speedMs: 300
};

// Utility: add a process
export function addProcess(pid, arrival, burst, priority = 0) {
  const p = {
    pid: String(pid),
    arrival: Number(arrival),
    burst: Number(burst),
    remaining: Number(burst),
    priority: Number(priority),
    start: null,
    finish: null
  };
  state.processes.push(p);
  return p;
}

export function removeProcessByPid(pid) {
  state.processes = state.processes.filter(p => p.pid !== pid);
}

export function resetState() {
  state.simTime = 0;
  state.currentPid = null;
  state.gantt = [];
  state.waitingHistory = [];
  state.rr = { queue: null, index: 0, used: 0 };
  for (const p of state.processes) {
    p.remaining = p.burst;
    p.start = null;
    p.finish = null;
  }
}

// internal: push/update gantt
function _startGantt(pid) {
  const t = state.simTime;
  if (!state.gantt.length || state.gantt[state.gantt.length - 1][0] !== pid) {
    state.gantt.push([pid, t, t + 1]);
  } else {
    state.gantt[state.gantt.length - 1][2] = t + 1;
  }
  state.currentPid = pid === 'idle' ? null : pid;
}

// Step helpers for algorithms (mutate state.processes directly)
function _fcfsStep(ready) {
  if (!ready.length) { _startGantt('idle'); return; }
  const pick = ready.slice().sort((a,b)=>a.arrival - b.arrival || a.pid.localeCompare(b.pid))[0];
  _startGantt(pick.pid);
  if (pick.start === null) pick.start = state.simTime;
  pick.remaining -= 1;
  if (pick.remaining === 0) pick.finish = state.simTime + 1;
}

function _sjfStep(ready) {
  if (state.currentPid) {
    const cur = state.processes.find(p=>p.pid===state.currentPid);
    if (cur && cur.remaining>0) {
      _startGantt(cur.pid);
      if (cur.start===null) cur.start = state.simTime;
      cur.remaining -= 1;
      if (cur.remaining===0) cur.finish = state.simTime+1, state.currentPid=null;
      return;
    } else state.currentPid=null;
  }
  if (!ready.length) { _startGantt('idle'); return; }
  const pick = ready.slice().sort((a,b)=>a.burst - b.burst || a.arrival - b.arrival || a.pid.localeCompare(b.pid))[0];
  state.currentPid = pick.pid;
  _startGantt(pick.pid);
  if (pick.start===null) pick.start = state.simTime;
  pick.remaining -= 1;
  if (pick.remaining===0) pick.finish = state.simTime+1, state.currentPid=null;
}

function _srtfStep(ready) {
  if (!ready.length) { _startGantt('idle'); return; }
  const pick = ready.slice().sort((a,b)=>a.remaining - b.remaining || a.arrival - b.arrival || a.pid.localeCompare(b.pid))[0];
  _startGantt(pick.pid);
  if (pick.start===null) pick.start = state.simTime;
  pick.remaining -= 1;
  if (pick.remaining===0) pick.finish = state.simTime+1;
}

function _rrStep(ready) {
  if (!state.rr.queue) state.rr = { queue: [], index: 0, used: 0 };
  // enqueue arrivals
  const sorted = state.processes.slice().sort((a,b)=>a.arrival - b.arrival || a.pid.localeCompare(b.pid));
  for (const p of sorted) {
    if (p.arrival <= state.simTime && p.remaining>0 && !state.rr.queue.includes(p)) state.rr.queue.push(p);
  }
  if (!state.rr.queue.length) { _startGantt('idle'); return; }
  if (state.rr.index >= state.rr.queue.length) state.rr.index = 0;
  let cur = state.rr.queue[state.rr.index];
  if (cur.remaining === 0) {
    state.rr.queue.splice(state.rr.index, 1);
    state.rr.used = 0;
    if (!state.rr.queue.length) { _startGantt('idle'); return; }
    state.rr.index %= state.rr.queue.length;
    cur = state.rr.queue[state.rr.index];
  }
  _startGantt(cur.pid);
  if (cur.start===null) cur.start = state.simTime;
  cur.remaining -= 1; state.rr.used += 1;
  if (cur.remaining===0) {
    cur.finish = state.simTime+1;
    state.rr.queue.splice(state.rr.index, 1);
    state.rr.used = 0;
    if (state.rr.index >= state.rr.queue.length) state.rr.index = 0;
  } else if (state.rr.used >= Number(state.quantum)) {
    state.rr.index = (state.rr.index + 1) % state.rr.queue.length;
    state.rr.used = 0;
  }
}

function _priorityStep(ready) {
  if (!ready.length) { _startGantt('idle'); return; }
  const pick = ready.slice().sort((a,b) => a.priority - b.priority || a.arrival - b.arrival || a.pid.localeCompare(b.pid))[0];
  _startGantt(pick.pid);
  if (pick.start===null) pick.start = state.simTime;
  pick.remaining -= 1;
  if (pick.remaining===0) pick.finish = state.simTime+1;
}

// Public: single-step simulation tick
export function stepOnce() {
  const ready = state.processes.filter(p => p.arrival <= state.simTime && p.remaining > 0);
  state.waitingHistory.push([state.simTime, ready.filter(p=>p.pid !== state.currentPid).length]);

  switch (state.algorithm) {
    case 'FCFS': _fcfsStep(ready); break;
    case 'SJF': _sjfStep(ready); break;
    case 'SRTF': _srtfStep(ready); break;
    case 'Round Robin': _rrStep(ready); break;
    case 'Priority': _priorityStep(ready); break;
    default: _fcfsStep(ready);
  }
  state.simTime += 1;
}

// Metrics
export function computeMetrics() {
  const finished = state.processes.filter(p => p.finish != null);
  if (!finished.length) return {};
  const n = finished.length;
  let totalWait = 0, totalTurn = 0;
  for (const p of finished) {
    const turnaround = p.finish - p.arrival;
    const waiting = turnaround - p.burst;
    totalTurn += turnaround; totalWait += waiting;
  }
  const makespan = Math.max(...finished.map(p=>p.finish)) - Math.min(...state.processes.map(p=>p.arrival));
  const throughput = n / Math.max(1, (Math.max(...finished.map(p=>p.finish)) - Math.min(...state.processes.map(p=>p.arrival))));
  const busy = finished.reduce((s,p)=>s+p.burst,0);
  const totalTime = Math.max(...finished.map(p=>p.finish)) - Math.min(...state.processes.map(p=>p.arrival));
  const cpuUtil = busy / (totalTime || 1);
  return {
    avg_wait: totalWait / n,
    avg_turnaround: totalTurn / n,
    makespan, throughput, cpuUtil
  };
}
