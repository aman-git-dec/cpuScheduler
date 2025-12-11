// script.js — improved visuals + labels + Gantt tooltip

(function(){
  // DOM
  const algoEl = document.getElementById('algo');
  const quantumEl = document.getElementById('quantum');
  const startBtn = document.getElementById('start');
  const toggleBtn = document.getElementById('toggle');
  const resetBtn = document.getElementById('reset');
  const openAdd = document.getElementById('openAdd');
  const addModal = document.getElementById('addModal');
  const m_add = document.getElementById('m_add'), m_cancel = document.getElementById('m_cancel');
  const q_add = document.getElementById('q_add');

  const tableBody = document.querySelector('#procTable tbody');
  const progressList = document.getElementById('progressList');
  const waitingLine = document.getElementById('waitingLine');

  const makespanEl = document.getElementById('makespan');
  const avgWaitEl = document.getElementById('avgWait');
  const avgTurnEl = document.getElementById('avgTurn');
  const throughputEl = document.getElementById('throughput');
  const cpuUtilEl = document.getElementById('cpuUtil');

  const speedEl = document.getElementById('speed');
  // try to find an existing speed label; if not present, create one
  let speedLabel = document.getElementById('speedLabel');
  if(!speedLabel){
    speedLabel = document.createElement('div');
    speedLabel.id = 'speedLabel';
    speedLabel.style.fontSize = '12px';
    speedLabel.style.marginTop = '6px';
    speedEl.parentNode && speedEl.parentNode.insertBefore(speedLabel, speedEl.nextSibling);
  }

  // theme toggle element (if not present, create a small toggle button)
  let themeToggleEl = document.getElementById('themeToggle');
  if(!themeToggleEl){
    themeToggleEl = document.createElement('button');
    themeToggleEl.id = 'themeToggle';
    themeToggleEl.setAttribute('title','Toggle theme');
    themeToggleEl.textContent = '🌙 Theme';
    // try to place it near controls
    const controls = document.querySelector('.controls') || document.body;
    controls.insertBefore(themeToggleEl, controls.firstChild);
  }

  const canvas = document.getElementById('gantt');
  const ctx = canvas.getContext('2d');
  const queueCanvas = document.getElementById('queueChart');
  const qctx = queueCanvas.getContext('2d');
  const legendEl = document.getElementById('legend');
  const tooltip = document.getElementById('ganttTooltip');

  // modal inputs
  const m_pid = document.getElementById('m_pid');
  const m_arr = document.getElementById('m_arr');
  const m_burst = document.getElementById('m_burst');
  const m_pri = document.getElementById('m_pri');

  const q_pid = document.getElementById('q_pid');
  const q_arr = document.getElementById('q_arr');
  const q_burst = document.getElementById('q_burst');
  const q_pr = document.getElementById('q_pr');

  // state
  let processes = [];
  let simTime = 0;
  let running = false;
  let gantt = []; // [pid, start, end]
  let currentPid = null;
  let waitingHistory = [];
  let rrQueue = null, rrIndex = 0, rrUsed = 0;
  let barRects = []; // for tooltip detection

  // colors map
  const colors = ['#2b6cb0','#e76f51','#2a9d8f','#264653','#f4a261','#8d99ae','#e9c46a','#6a4c93','#06d6a0','#118ab2'];
  const colorMap = {};

  function assignColor(pid){
    if(colorMap[pid]) return colorMap[pid];
    const k = Object.keys(colorMap).length % colors.length;
    colorMap[pid] = colors[k];
    return colorMap[pid];
  }

  // utility to read theme-aware colors from CSS variables (fallbacks preserved)
  function cssVar(name, fallback){
    return (getComputedStyle(document.documentElement).getPropertyValue(name) || fallback).trim() || fallback;
  }

  // sample processes
  processes = [
    { pid: 'P1', arrival: 0, burst: 7, remaining: 7, priority: 2, start: null, finish: null },
    { pid: 'P2', arrival: 1, burst: 4, remaining: 4, priority: 1, start: null, finish: null },
    { pid: 'P3', arrival: 2, burst: 1, remaining: 1, priority: 3, start: null, finish: null },
    { pid: 'P4', arrival: 3, burst: 5, remaining: 5, priority: 2, start: null, finish: null },
    { pid: 'P5', arrival: 4, burst: 2, remaining: 2, priority: 1, start: null, finish: null }
];
  processes.forEach(p=>assignColor(p.pid));
  rebuildLegend();

  // UI helpers
  function refreshTable(){
    tableBody.innerHTML = '';
    processes.sort((a,b)=> a.arrival - b.arrival || a.pid.localeCompare(b.pid));
    processes.forEach(p=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${p.pid}</td><td>${p.arrival}</td><td>${p.burst}</td><td>${p.remaining}</td><td>${p.priority}</td><td>${statusOf(p)}</td>`;
      tr.onclick = ()=> {
        [...tableBody.children].forEach(r=>r.classList.remove('selected'));
        tr.classList.add('selected');
      };
      tableBody.appendChild(tr);
    });
    // progress
    progressList.innerHTML = '';
    processes.forEach(p=>{
      const d = document.createElement('div'); d.className='progress-item';
      const lbl = document.createElement('div'); lbl.textContent = p.pid; lbl.style.width='48px';
      const barWrap = document.createElement('div'); barWrap.className='bar';
      const i = document.createElement('i'); i.style.width = (100 * (1 - p.remaining / p.burst)) + '%';
      barWrap.appendChild(i);
      const pct = document.createElement('div'); pct.textContent = Math.round(100*(1 - p.remaining / p.burst)) + '%'; pct.style.width='44px';
      d.appendChild(lbl); d.appendChild(barWrap); d.appendChild(pct);
      progressList.appendChild(d);
    });
    // waiting line
    const waiting = processes.filter(p=> p.arrival<=simTime && p.remaining>0 && p.pid!==currentPid).map(p=>p.pid);
    waitingLine.textContent = waiting.length? waiting.join(', ') : '—';
  }

  function statusOf(p){
    if(p.remaining===0) return 'Done';
    if(p.start!==null && p.remaining>0 && p.pid===currentPid) return 'Running';
    if(p.arrival<=simTime) return 'Ready';
    return 'Waiting';
  }

  // Gantt drawing with axis, labels and legend
  function drawGantt(){
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);
    // background (theme aware)
    ctx.fillStyle = cssVar('--bg','#04111a');
    ctx.fillRect(0,0,W,H);

    const maxTime = Math.max(simTime+1, ...gantt.map(g=>g[2]), 1);
    const pxPerUnit = Math.max(12, Math.floor((W-120)/maxTime));
    // derive unique pids order (bottom-most idle)
    const uniquePids = [...new Set(gantt.map(g=>g[0]))];
    if(uniquePids.indexOf('idle')!==-1){ uniquePids.splice(uniquePids.indexOf('idle'),1); uniquePids.push('idle'); }
    const yStart = 28;
    const rowH = 26;
    // prepare map for left labels
    const yMap = {};
    uniquePids.forEach((pid,i)=> yMap[pid] = i);

    // draw row labels on left
    ctx.fillStyle = cssVar('--muted','#9fb7c6');
    ctx.font = '13px Segoe UI';
    uniquePids.slice().reverse().forEach((pid,i)=>{
      const y = yStart + i*(rowH+12) + rowH/1.2;
      ctx.fillText(pid, 6, y);
    });

    // draw bars
    barRects = [];
    uniquePids.forEach(pid=>{
      const items = gantt.filter(g=>g[0]===pid);
      items.forEach(it=>{
        const s = it[1], e = it[2];
        const x = 80 + s*pxPerUnit;
        const w = Math.max(1, (e - s)*pxPerUnit);
        const rowIdx = yMap[pid];
        const y = yStart + (uniquePids.length - 1 - rowIdx)*(rowH+12);
        ctx.fillStyle = pid === 'idle' ? cssVar('--idle','#374151') : (colorMap[pid] || assignColor(pid));
        ctx.fillRect(x, y, w, rowH);
        // text
        ctx.fillStyle = cssVar('--text','white');
        ctx.font = '12px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText(pid, x + Math.max(10, w/2), y + rowH/1.6);
        // store rect for hover
        barRects.push({pid, start:s, end:e, x, y, w, h:rowH});
      });
    });

    // draw time axis
    ctx.fillStyle = cssVar('--muted','#9aa6b2');
    ctx.font = '12px Segoe UI';
    ctx.textAlign = 'center';
    const axisY = H - 14;
    ctx.fillText('Time', W/2, H-2);
    for(let t=0;t<=maxTime;t++){
      const x = 80 + t*pxPerUnit;
      ctx.fillText(String(t), x, axisY);
      ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.moveTo(x, yStart-8); ctx.lineTo(x, axisY-8); ctx.stroke();
    }

    // legend (drawn DOM-side)
    rebuildLegend();
  }

  // tooltip handling
  canvas.addEventListener('mousemove', e=>{
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const hit = barRects.find(b => mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h);
    if(hit){
      tooltip.classList.remove('hidden');
      tooltip.textContent = `${hit.pid}  |  ${hit.start} → ${hit.end}`;
      // position, avoid overflow
      const left = Math.min(window.innerWidth - 180, e.clientX + 12);
      const top = Math.max(10, e.clientY - 30);
      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
    } else {
      tooltip.classList.add('hidden');
    }
  });
  canvas.addEventListener('mouseleave', ()=> tooltip.classList.add('hidden'));

  // legend DOM
  function rebuildLegend(){
    legendEl.innerHTML = '';
    Object.keys(colorMap).forEach(pid=>{
      const item = document.createElement('div'); item.className='item';
      const sw = document.createElement('span'); sw.className='swatch'; sw.style.background = colorMap[pid];
      const lbl = document.createElement('span'); lbl.textContent = pid;
      item.appendChild(sw); item.appendChild(lbl);
      legendEl.appendChild(item);
    });
  }

  // Queue drawing with axis labels
  function drawQueue(){
    qctx.clearRect(0,0,queueCanvas.width,queueCanvas.height);
    const W = queueCanvas.width, H = queueCanvas.height;
    qctx.fillStyle = cssVar('--bg','#04111a'); qctx.fillRect(0,0,W,H);
    if(!waitingHistory.length){
      // axes labels at least
      qctx.fillStyle = cssVar('--muted','#9aa6b2'); qctx.font = '12px Segoe UI';
      qctx.fillText('Time', W/2, H-6);
      qctx.save(); qctx.translate(10, H/2); qctx.rotate(-Math.PI/2); qctx.fillText('Waiting Length', 0, 0); qctx.restore();
      return;
    }
    const times = waitingHistory.map(a=>a[0]);
    const lens = waitingHistory.map(a=>a[1]);
    const maxT = Math.max(...times);
    const maxL = Math.max(1, ...lens);
    // grid
    qctx.strokeStyle = 'rgba(255,255,255,0.03)'; qctx.lineWidth = 1;
    for(let g=0; g<=maxL; g++){
      const y = 20 + (H-60)*(1 - g/maxL);
      qctx.beginPath(); qctx.moveTo(40,y); qctx.lineTo(W-20,y); qctx.stroke();
    }
    // plot
    qctx.beginPath(); qctx.strokeStyle = cssVar('--accent','#2b6cb0'); qctx.lineWidth = 2;
    times.forEach((t,i)=>{
      const x = 40 + (t/maxT)*(W-80);
      const y = 20 + (H-60)*(1 - lens[i]/maxL);
      if(i===0) qctx.moveTo(x,y); else qctx.lineTo(x,y);
    });
    qctx.stroke();
    // fill
    qctx.lineTo(W-40, H-20); qctx.lineTo(40, H-20); qctx.closePath();
    qctx.fillStyle = 'rgba(43,108,176,0.12)'; qctx.fill();

    // points
    qctx.fillStyle = '#06b6d4';
    times.forEach((t,i)=>{ const x = 40 + (t/maxT)*(W-80); const y = 20 + (H-60)*(1 - lens[i]/maxL); qctx.beginPath(); qctx.arc(x,y,3,0,Math.PI*2); qctx.fill(); });

    // axes labels
    qctx.fillStyle = cssVar('--muted','#9aa6b2'); qctx.font = '12px Segoe UI';
    qctx.fillText('Time', W/2, H-6);
    qctx.save(); qctx.translate(12, H/2); qctx.rotate(-Math.PI/2); qctx.fillText('Waiting Length', 0, 0); qctx.restore();
  }

  // Metrics
  function computeMetrics(){
    const finished = processes.filter(p=>p.finish!==null && p.finish!==undefined);
    if(!finished.length) return {};
    let totalWait = 0, totalTurn = 0;
    finished.forEach(p=>{
      const turn = p.finish - p.arrival; const wait = turn - p.burst;
      totalTurn += turn; totalWait += wait;
    });
    const makespan = Math.max(...finished.map(p=>p.finish)) - Math.min(...processes.map(p=>p.arrival));
    const throughput = finished.length / Math.max(1, Math.max(...finished.map(p=>p.finish)) - Math.min(...processes.map(p=>p.arrival)));
    const busy = finished.reduce((s,p)=>s+p.burst,0);
    const totalTime = Math.max(...finished.map(p=>p.finish)) - Math.min(...processes.map(p=>p.arrival));
    const cpuUtil = busy / (totalTime || 1);
    return { avg_wait: totalWait/finished.length, avg_turn: totalTurn/finished.length, makespan, throughput, cpuUtil };
  }
  function showMetrics(m){
    makespanEl.textContent = m.makespan?.toFixed?.(0) ?? '-';
    avgWaitEl.textContent = m.avg_wait?.toFixed?.(2) ?? '-';
    avgTurnEl.textContent = m.avg_turn?.toFixed?.(2) ?? '-';
    throughputEl.textContent = m.throughput?.toFixed?.(2) ?? '-';
    cpuUtilEl.textContent = m.cpuUtil? (m.cpuUtil*100).toFixed(1)+'%' : '-';
  }

  // Scheduler core (same algorithms) — compacted from previous implementation
  function startGantt(pid){
    if(!gantt.length || gantt[gantt.length-1][0] !== pid) gantt.push([pid, simTime, simTime+1]);
    else gantt[gantt.length-1][2] = simTime+1;
    currentPid = pid==='idle' ? null : pid;
  }

  function fcfsStep(ready){
    if(!ready.length){ startGantt('idle'); return; }
    const pick = ready.slice().sort((a,b)=>a.arrival - b.arrival || a.pid.localeCompare(b.pid))[0];
    startGantt(pick.pid);
    if(pick.start===null) pick.start = simTime;
    pick.remaining -= 1;
    if(pick.remaining===0) pick.finish = simTime+1;
  }

  function sjfStep(ready){
    if(currentPid){
      const cur = processes.find(p=>p.pid===currentPid);
      if(cur && cur.remaining>0){
        startGantt(cur.pid);
        if(cur.start===null) cur.start = simTime;
        cur.remaining--; if(cur.remaining===0) cur.finish = simTime+1, currentPid=null;
        return;
      } else currentPid=null;
    }
    if(!ready.length){ startGantt('idle'); return; }
    const pick = ready.slice().sort((a,b)=>a.burst - b.burst || a.arrival - b.arrival || a.pid.localeCompare(b.pid))[0];
    currentPid = pick.pid;
    startGantt(pick.pid);
    if(pick.start===null) pick.start = simTime;
    pick.remaining--; if(pick.remaining===0) pick.finish = simTime+1, currentPid=null;
  }

  function srtfStep(ready){
    if(!ready.length){ startGantt('idle'); return; }
    const pick = ready.slice().sort((a,b)=>a.remaining - b.remaining || a.arrival - b.arrival || a.pid.localeCompare(b.pid))[0];
    startGantt(pick.pid);
    if(pick.start===null) pick.start = simTime;
    pick.remaining--; if(pick.remaining===0) pick.finish = simTime+1;
  }

  function rrStep(ready){
    if(!rrQueue){ rrQueue = []; rrIndex = 0; rrUsed = 0; }
    processes.slice().sort((a,b)=>a.arrival - b.arrival || a.pid.localeCompare(b.pid)).forEach(p=>{
      if(p.arrival<=simTime && p.remaining>0 && !rrQueue.includes(p)) rrQueue.push(p);
    });
    if(!rrQueue.length){ startGantt('idle'); return; }
    if(rrIndex>=rrQueue.length) rrIndex=0;
    let cur = rrQueue[rrIndex];
    if(cur.remaining===0){ rrQueue.splice(rrIndex,1); rrUsed=0; if(!rrQueue.length){ startGantt('idle'); return } rrIndex %= rrQueue.length; cur = rrQueue[rrIndex]; }
    startGantt(cur.pid);
    if(cur.start===null) cur.start = simTime;
    cur.remaining--; rrUsed++;
    if(cur.remaining===0){ cur.finish = simTime+1; rrQueue.splice(rrIndex,1); rrUsed=0; if(rrIndex>=rrQueue.length) rrIndex=0; }
    else if(rrUsed >= parseInt(quantumEl.value,10)){ rrIndex = (rrIndex+1)%rrQueue.length; rrUsed = 0; }
  }

  function priorityStep(ready){
    if(!ready.length){ startGantt('idle'); return; }
    const pick = ready.slice().sort((a,b)=>a.priority - b.priority || a.arrival - b.arrival || a.pid.localeCompare(b.pid))[0];
    startGantt(pick.pid);
    if(pick.start===null) pick.start = simTime;
    pick.remaining--; if(pick.remaining===0) pick.finish = simTime+1;
  }

  // tick + loop using setTimeout; draws after every tick
  function tick(){
    const ready = processes.filter(p=>p.arrival <= simTime && p.remaining > 0);
    waitingHistory.push([simTime, ready.filter(p=>p.pid !== currentPid).length]);

    const alg = algoEl.value;
    if(alg==='FCFS') fcfsStep(ready);
    else if(alg==='SJF') sjfStep(ready);
    else if(alg==='SRTF') srtfStep(ready);
    else if(alg==='Round Robin') rrStep(ready);
    else if(alg==='Priority') priorityStep(ready);

    simTime++;
  }

  let loopTimer = null;
  function startSimulation(){
    if(running) return;
    if(!processes.length){ alert('Add at least one process'); return; }
    // reset
    simTime = 0; gantt = []; waitingHistory = []; currentPid = null; rrQueue=null;
    processes.forEach(p=>{ p.remaining = p.burst; p.start=null; p.finish=null; });
    running = true; toggleBtn.textContent = '⏸ Pause';
    stepLoop();
  }

  // improved speed mapping: the slider value becomes an intuitive "speed" (higher = faster)
   function speedMsFromValue(v){
    // Read slider min/max (fallback to sensible 1..10)
    const minV = Number.isFinite(parseFloat(speedEl.min)) ? parseInt(speedEl.min,10) : 1;
    const maxV = Number.isFinite(parseFloat(speedEl.max)) ? parseInt(speedEl.max,10) : 10;
    const val = Math.max(minV, Math.min(maxV, parseInt(v||minV,10)));

    // Tunable bounds (ms)
    const slowMs = 2000; // slider at min => 2000 ms per tick
    const fastMs = 40;   // slider at max => 40 ms per tick

    // linear interpolation (inverted: higher value => smaller ms)
    const t = (val - minV) / Math.max(1, (maxV - minV));
    const ms = Math.round(slowMs - t * (slowMs - fastMs));
    return Math.max(fastMs, Math.min(slowMs, ms));
  }

  function speedLabelText(v){
    const ms = speedMsFromValue(v);
    if(ms >= 1600) return `Very slow (${ms} ms)`;
    if(ms >= 800) return `Slow (${ms} ms)`;
    if(ms >= 300) return `Normal (${ms} ms)`;
    if(ms >= 100) return `Fast (${ms} ms)`;
    return `Very fast (${ms} ms)`;
  }

  function stepLoop(){
    if(!running) return;
    tick();
    refreshTable(); drawGantt(); drawQueue();
    if(processes.every(p=>p.remaining===0)){
      running=false;
      const metrics = computeMetrics(); showMetrics(metrics);
      toggleBtn.textContent = 'Resume';
      alert('Simulation complete — results shown in Metrics');
      return;
    }
    const ms = speedMsFromValue(parseInt(speedEl.value,10));
    loopTimer = setTimeout(stepLoop, ms);
  }

  function pauseResume(){
    running = !running;
    toggleBtn.textContent = running ? 'Pause' : 'Resume';
    if(running) stepLoop(); else clearTimeout(loopTimer);
  }

  function resetSim(){
    running=false; clearTimeout(loopTimer);
    simTime = 0; gantt=[]; waitingHistory=[]; currentPid=null; rrQueue=null; rrIndex=0; rrUsed=0;
    processes.forEach(p=>{ p.remaining = p.burst; p.start=null; p.finish=null; });
    refreshTable(); drawGantt(); drawQueue(); showMetrics({});
  }

  // add/remove helpers
  function addProcess(pid, arr, burst, pri){
    const p = {pid:String(pid), arrival:parseInt(arr,10), burst:parseInt(burst,10), remaining:parseInt(burst,10), priority:parseInt(pri,10), start:null, finish:null};
    processes.push(p); assignColor(p.pid); rebuildLegend(); refreshTable();
  }

  function removeSelected(){
    const selIndex = [...tableBody.children].findIndex(r=>r.classList.contains('selected'));
    if(selIndex === -1){ alert('Select a row'); return; }
    const pid = tableBody.children[selIndex].children[0].textContent;
    processes = processes.filter(p=>p.pid !== pid);
    rebuildLegend(); refreshTable();
  }

  // UI events wiring
  startBtn.onclick = startSimulation;
  toggleBtn.onclick = pauseResume;
  resetBtn.onclick = resetSim;
  document.getElementById('removeSelected').onclick = removeSelected;

  openAdd.onclick = ()=> showModal(true);
  m_cancel.onclick = ()=> showModal(false);
  m_add.onclick = ()=>{
    const pid = m_pid.value.trim() || ('P'+(processes.length+1));
    const arr = parseInt(m_arr.value||'0',10); const burst = parseInt(m_burst.value||'1',10); const pri = parseInt(m_pri.value||'0',10);
    addProcess(pid, arr, burst, pri);
    m_pid.value=''; m_arr.value='0'; m_burst.value='1'; m_pri.value='0';
    showModal(false);
  };

  q_add.onclick = ()=>{
    const pid = q_pid.value.trim() || ('P'+(processes.length+1));
    addProcess(pid, q_arr.value||0, q_burst.value||1, q_pr.value||0);
    q_pid.value=''; q_arr.value='0'; q_burst.value='1'; q_pr.value='0';
  };

  function showModal(yes){
    if(yes){ addModal.classList.remove('hidden'); addModal.setAttribute('aria-hidden','false'); }
    else { addModal.classList.add('hidden'); addModal.setAttribute('aria-hidden','true'); }
  }

  // THEME: manage light/dark and persist
  function applyTheme(theme){
    if(theme === 'light'){
      document.documentElement.style.setProperty('--bg', '#f7fbfc');
      document.documentElement.style.setProperty('--panel', '#ffffff');
      document.documentElement.style.setProperty('--text', '#0f1724');
      document.documentElement.style.setProperty('--muted', '#52636b');
      document.documentElement.style.setProperty('--idle', '#d1d5db');
      document.documentElement.style.setProperty('--accent', '#2b6cb0');
      themeToggleEl.textContent = '☀️ Light';
      document.body.classList.add('light-theme');
    } else {
      document.documentElement.style.setProperty('--bg', '#04111a');
      document.documentElement.style.setProperty('--panel', '#07121a');
      document.documentElement.style.setProperty('--text', '#ffffff');
      document.documentElement.style.setProperty('--muted', '#9aa6b2');
      document.documentElement.style.setProperty('--idle', '#374151');
      document.documentElement.style.setProperty('--accent', '#2b6cb0');
      themeToggleEl.textContent = '🌙 Dark';
      document.body.classList.remove('light-theme');
    }
    // redraw canvases so theme takes effect
    drawGantt(); drawQueue();
  }

  // initialize theme from storage or system
  let savedTheme = localStorage.getItem('ganttTheme');
  if(!savedTheme){
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    savedTheme = prefersDark ? 'dark' : 'light';
  }
  applyTheme(savedTheme);

  themeToggleEl.addEventListener('click', ()=>{
    const cur = localStorage.getItem('ganttTheme') || (document.body.classList.contains('light-theme') ? 'light' : 'dark');
    const next = cur === 'light' ? 'dark' : 'light';
    localStorage.setItem('ganttTheme', next);
    applyTheme(next);
  });

  // live label update — update immediately on input
  function updateSpeedLabel(){
    const v = speedEl.value || speedEl.min || 3;
    speedLabel.textContent = speedLabelText(v);
  }
  speedEl.addEventListener('input', ()=>{
    updateSpeedLabel();
    // if simulation is running, the new ms will be picked up on the next tick because stepLoop
    // uses speedMsFromValue() for scheduling. No need to restart the loop.
  });

  // sensible default if slider didn't have a value
  if(!speedEl.value) {
    // check for slider attributes; prefer midpoint
    const minV = Number.isFinite(parseFloat(speedEl.min)) ? parseInt(speedEl.min,10) : 1;
    const maxV = Number.isFinite(parseFloat(speedEl.max)) ? parseInt(speedEl.max,10) : 10;
    speedEl.value = Math.round((minV + maxV) / 2);
  }
  updateSpeedLabel();

  // initial draw
  refreshTable(); drawGantt(); drawQueue();

})();
