// app.js
import { WebCodecsFrameStepper } from './stepper.js';
import { IMUDataParser } from './csvParser.js';
import { IMUChartManager } from './chartManager.js';

// Setup Stepper
const canvas = document.getElementById('videoCanvas');
const stepper = new WebCodecsFrameStepper(canvas, 100);

// Setup Chart Manager with callback to seek video when graph is clicked
const chartContainer = document.getElementById('chartContainer');
const chartManager = new IMUChartManager(chartContainer, (timeSec) => {
  stopPlayback();
  seekByTime(timeSec);
});

// UI Elements
const videoDrop = document.getElementById('videoDrop');
const csvDrop = document.getElementById('csvDrop');
const videoInput = document.getElementById('videoInput');
const csvInput = document.getElementById('csvInput');
const btnStepBack = document.getElementById('btnStepBack');
const btnStepFwd = document.getElementById('btnStepFwd');
const btnPlay = document.getElementById('btnPlay');
const timeline = document.getElementById('timeline');
const frameReadout = document.getElementById('frameReadout');
const timeReadout = document.getElementById('timeReadout');

let isPlaying = false;
let playTimer = null;

function updateUI() {
  const current = stepper.currentIndex;
  const total = stepper.samples.length;
  timeline.value = current;
  frameReadout.innerText = `Frame: ${current + 1} / ${total}`;

  const sample = stepper.samples[current];
  if (sample) {
    const currentPtsSec = sample.cts / sample.timescale;
    timeReadout.innerText = `PTS: ${currentPtsSec.toFixed(3)}s`;
    
    // Synchronize uPlot vertical cursor
    chartManager.setScrubberTime(currentPtsSec);
  }
}

function seekByTime(timeSec) {
  if (stepper.samples.length === 0) return;
  
  // Find nearest frame index matching clicked timestamp
  let bestIndex = 0;
  let minDiff = Infinity;
  for (let i = 0; i < stepper.samples.length; i++) {
    const sTime = stepper.samples[i].cts / stepper.samples[i].timescale;
    const diff = Math.abs(sTime - timeSec);
    if (diff < minDiff) {
      minDiff = diff;
      bestIndex = i;
    } else {
      break; // Samples are sorted by CTS
    }
  }
  stepper.seekToFrame(bestIndex).then(updateUI);
}

// --- Video File Loading ---
videoDrop.onclick = () => videoInput.click();
videoInput.onchange = (e) => loadVideo(e.target.files[0]);
setupDropEvents(videoDrop, loadVideo);

async function loadVideo(file) {
  if (!file) return;
  videoDrop.style.display = 'none';
  await stepper.loadFile(file);

  timeline.max = stepper.samples.length - 1;
  timeline.disabled = false;
  btnStepBack.disabled = false;
  btnStepFwd.disabled = false;
  btnPlay.disabled = false;
  updateUI();
}

// --- CSV File Loading ---
csvDrop.onclick = () => csvInput.click();
csvInput.onchange = (e) => loadCSV(e.target.files[0]);
setupDropEvents(csvDrop, loadCSV);

async function loadCSV(file) {
  if (!file) return;
  try {
    const { data, seriesLabels } = await IMUDataParser.parse(file);
    chartManager.init(data[0], data.slice(1), seriesLabels);
    csvDrop.style.display = 'none';
    updateUI();
  } catch (err) {
    alert("Error parsing CSV: " + err.message);
  }
}

// app.js (Correction for dropEvents)
function setupDropEvents(elem, handler) {
    elem.ondragover = (e) => { 
      e.preventDefault(); 
      elem.classList.add('dragover'); 
    };
    
    elem.ondragleave = () => elem.classList.remove('dragover');
    
    elem.ondrop = (e) => {
      e.preventDefault(); // <-- THIS LINE STOPS THE BROWSER FROM OPENING A NEW TAB
      e.stopPropagation();
      elem.classList.remove('dragover');
      
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handler(e.dataTransfer.files[0]);
      }
    };
  }

// --- Playback Controls ---
function stopPlayback() {
  isPlaying = false;
  btnPlay.innerText = "Play";
  clearTimeout(playTimer);
}

btnStepBack.onclick = async () => {
  stopPlayback();
  await stepper.step(-1);
  updateUI();
};

btnStepFwd.onclick = async () => {
  stopPlayback();
  await stepper.step(1);
  updateUI();
};

timeline.oninput = async (e) => {
  stopPlayback();
  await stepper.seekToFrame(parseInt(e.target.value, 10));
  updateUI();
};

btnPlay.onclick = () => {
  if (isPlaying) {
    stopPlayback();
  } else {
    isPlaying = true;
    btnPlay.innerText = "Pause";
    runPlayLoop();
  }
};

async function runPlayLoop() {
  if (!isPlaying) return;
  if (stepper.currentIndex >= stepper.samples.length - 1) {
    stopPlayback();
    return;
  }
  const start = performance.now();
  await stepper.step(1);
  updateUI();

  const elapsed = performance.now() - start;
  const targetDelay = 1000 / stepper.fps;
  playTimer = setTimeout(runPlayLoop, Math.max(0, targetDelay - elapsed));
}

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (stepper.samples.length === 0) return;
  if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
    btnStepBack.click();
  } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
    btnStepFwd.click();
  } else if (e.key === ' ') {
    e.preventDefault();
    btnPlay.click();
  }
});

// Responsive resize
window.addEventListener('resize', () => {
  chartManager.resize(chartContainer.clientWidth);
});