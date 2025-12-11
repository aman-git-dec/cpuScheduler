CPU Scheduling Visualizer

A fully interactive web-based simulator for classic CPU scheduling algorithms including FCFS, SJF, SRTF, Round Robin, and Priority Scheduling.
Visualizes Gantt charts, calculates metrics, and allows process creation dynamically.

📌 Features

✔ Interactive Gantt Chart

✔ Add / Remove Processes

✔ FCFS, SJF, SRTF, RR, Priority

✔ Auto-calculations:

Average Waiting Time

Average Turnaround Time

Throughput

CPU Utilization

✔ Real-time animation speed control

✔ Clean UI with dark theme

✔ Easy to customize or extend

📂 Project Structure
/project-root
│
├── index.html
├── style.css
├── script.js
│
└── /algo
      ├── fcfs.js
      ├── sjf.js
      ├── srtf.js
      ├── priority.js
      └── rr.js

📊 Example Process Set

Used for demonstrations:

[
    { pid: 'P1', arrival: 0, burst: 7, remaining: 7, priority: 2, start: null, finish: null },
    { pid: 'P2', arrival: 1, burst: 4, remaining: 4, priority: 1, start: null, finish: null },
    { pid: 'P3', arrival: 2, burst: 1, remaining: 1, priority: 3, start: null, finish: null },
    { pid: 'P4', arrival: 3, burst: 5, remaining: 5, priority: 2, start: null, finish: null },
    { pid: 'P5', arrival: 4, burst: 2, remaining: 2, priority: 1, start: null, finish: null }
]

🧮 CPU Scheduling Formulas
Average Waiting Time
AWT = ( Σ Waiting Times ) / Number of Processes

Average Turnaround Time
ATT = ( Σ Turnaround Times ) / Number of Processes

Throughput
Throughput = Number of Processes Completed / Total Time

CPU Utilization
CPU Utilization = ( Busy Time / Total Time ) × 100%

▶️ How to Run

Clone the repository

git clone https://github.com/your-username/cpu-scheduler.git


Open the project folder

Run

index.html


in any modern browser.

No server required.
Everything runs in pure HTML + CSS + JavaScript.

🛠 Technologies

HTML5

CSS3

Vanilla JavaScript
