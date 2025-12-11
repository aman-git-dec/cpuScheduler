// gantt.js
// Exports initGantt(canvasEl, queueCanvasEl, tooltipEl, legendEl) and draw functions.
// Does not change scheduler state.

import { state } from './scheduler.js';

export const colorMap = {}; // pid -> color palette
const palette = ['#2b6cb0','#e76f51','#2a9d8f','#264653','#f4a261','#8d99ae','#e9c46a','#6a4c93','#06b6d4','#118ab2'];

export function assignColor(pid){
  if (colorMap[pid]) return colorMap[pid];
  const idx = Object.keys(colorMap).length % palette.length;
  colorMap[pid] = palette[idx];
  return colorMap[pid];
}

let canvas, ctx, queueCanvas, qctx, tooltip, legendEl;
let barRects = []; // for hover hit-testing

export function initGantt(canvasEl, queueCanvasEl, tooltipEl, legendElement) {
  canvas = canvasEl; ctx = canvas.getContext('2d');
  queueCanvas = queueCanvasEl; qctx = queueCanvas.getContext('2d');
  tooltip = tooltipEl; legendEl = legendElement;
  canvas.addEventListener('mousemove', _onMouseMove);
  canvas.addEventListener('mouseleave', ()=> tooltip.classList.add('hidden'));
}

// draw gantt chart from state.gantt
export function drawGantt() {
  if (!canvas) return;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = '#04111a'; ctx.fillRect(0,0,W,H);

  const maxTime = Math.max(state.simTime+1, ...state.gantt.map(g=>g[2]), 1);
  const pxPerUnit = Math.max(10, Math.floor((W-140)/maxTime));
  const unique = [...new Set(state.gantt.map(g=>g[0]))];
  if (unique.indexOf('idle') !== -1) { unique.splice(unique.indexOf('idle'),1); unique.push('idle'); }
  const yStart = 30, rowH = 22;
  const yMap = {}; unique.forEach((pid,i)=> yMap[pid]=i);

  // left labels (reverse so first pid appears at top)
  ctx.fillStyle = '#9fb7c6'; ctx.font = '13px Segoe UI';
  unique.slice().reverse().forEach((pid,i)=>{
    const y = yStart + i*(rowH+10) + rowH/1.2;
    ctx.fillText(pid, 8, y);
  });

  barRects = [];
  for (const [pid,s,e] of state.gantt) {
    const x = 100 + s*pxPerUnit;
    const w = Math.max(1, (e - s)*pxPerUnit);
    const rowIdx = yMap[pid];
    const y = yStart + (unique.length - 1 - rowIdx)*(rowH+10);
    ctx.fillStyle = pid === 'idle' ? '#374151' : (colorMap[pid] || assignColor(pid));
    ctx.fillRect(x, y, w, rowH);
    ctx.fillStyle = 'white'; ctx.font = '12px Segoe UI'; ctx.textAlign = 'center';
    ctx.fillText(pid, x + Math.max(10, w/2), y + rowH/1.6);
    barRects.push({pid, start:s, end:e, x, y, w, h:rowH});
  }

  // axis and ticks
  ctx.fillStyle = '#9aa6b2'; ctx.font = '12px Segoe UI'; ctx.textAlign = 'center';
  const axisY = H - 12;
  ctx.fillText('Time', W/2, H-2);
  for (let t=0;t<=maxTime;t++){
    const x = 100 + t*pxPerUnit;
    ctx.fillText(String(t), x, axisY);
    ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.moveTo(x, yStart-10); ctx.lineTo(x, axisY-8); ctx.stroke();
  }

  _rebuildLegend();
}

// queue chart
export function drawQueue() {
  if (!queueCanvas) return;
  qctx.clearRect(0,0,queueCanvas.width,queueCanvas.height);
  const W = queueCanvas.width, H = queueCanvas.height;
  qctx.fillStyle = '#04111a'; qctx.fillRect(0,0,W,H);
  if (!state.waitingHistory.length) {
    qctx.fillStyle = '#9aa6b2'; qctx.font = '12px Segoe UI';
    qctx.fillText('Time', W/2, H-6);
    qctx.save(); qctx.translate(12, H/2); qctx.rotate(-Math.PI/2); qctx.fillText('Waiting Length', 0, 0); qctx.restore();
    return;
  }
  const times = state.waitingHistory.map(a=>a[0]);
  const lens = state.waitingHistory.map(a=>a[1]);
  const maxT = Math.max(...times);
  const maxL = Math.max(1, ...lens);
  qctx.strokeStyle = '#2b6cb0'; qctx.lineWidth = 2; qctx.beginPath();
  for (let i=0;i<times.length;i++){
    const x = 40 + (times[i]/maxT)*(W-80);
    const y = 20 + (H-60)*(1 - lens[i]/maxL);
    if (i===0) qctx.moveTo(x,y); else qctx.lineTo(x,y);
  }
  qctx.stroke();
  // fill below
  qctx.lineTo(W-40, H-20); qctx.lineTo(40, H-20); qctx.closePath();
  qctx.fillStyle = 'rgba(43,108,176,0.12)'; qctx.fill();
  // points
  qctx.fillStyle = '#06b6d4';
  for (let i=0;i<times.length;i++){
    const x = 40 + (times[i]/maxT)*(W-80);
    const y = 20 + (H-60)*(1 - lens[i]/maxL);
    qctx.beginPath(); qctx.arc(x,y,3,0,Math.PI*2); qctx.fill();
  }
  qctx.fillStyle = '#9aa6b2'; qctx.font = '12px Segoe UI';
  qctx.fillText('Time', W/2, H-6);
  qctx.save(); qctx.translate(12, H/2); qctx.rotate(-Math.PI/2); qctx.fillText('Waiting Length', 0, 0); qctx.restore();
}

// legend
function _rebuildLegend() {
  if (!legendEl) return;
  legendEl.innerHTML = '';
  for (const pid of Object.keys(colorMap)) {
    const div = document.createElement('div'); div.className = 'item';
    const sw = document.createElement('span'); sw.className = 'swatch'; sw.style.background = colorMap[pid];
    const lbl = document.createElement('span'); lbl.textContent = pid;
    div.appendChild(sw); div.appendChild(lbl);
    legendEl.appendChild(div);
  }
}

// mouse hover handler for tooltip
function _onMouseMove(e) {
  if (!tooltip || !canvas) return;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const hit = barRects.find(b => mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h);
  if (hit) {
    tooltip.classList.remove('hidden');
    tooltip.textContent = `${hit.pid}  |  ${hit.start} → ${hit.end}`;
    const left = Math.min(window.innerWidth - 180, e.clientX + 12);
    const top = Math.max(10, e.clientY - 30);
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  } else tooltip.classList.add('hidden');
}

// expose map so other modules can use it
export { barRects as _barRects };
