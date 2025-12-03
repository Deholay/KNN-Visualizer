// ========== Global Variables ==========
const UPLOAD_SCREEN = document.getElementById("upload-screen");
const MAIN_SCREEN = document.getElementById("main-screen");
const UPLOAD_AREA = document.getElementById("upload-area");
const CSV_FILE_INPUT = document.getElementById("csv-file-input");
const FILE_NAME_DISPLAY = document.getElementById("file-name");
const TEXT_PREDICTION = document.getElementById("prediction");
const K_NUMBER = document.getElementById("k-number");
const LOADING_INDICATOR = document.getElementById("loading");
const X_AXIS_SELECT = document.getElementById("x-axis-select");
const Y_AXIS_SELECT = document.getElementById("y-axis-select");
const CLASS_CHECKBOXES = document.getElementById("class-checkboxes");

// Color palette for classes (points/background colored, UI stays monochrome)
const COLOR_PALETTE = [
  { name: "1", hex: "#e74c3c", rgb: [231, 76, 60] },   // red
  { name: "2", hex: "#3498db", rgb: [52, 152, 219] },  // blue
  { name: "3", hex: "#f1c40f", rgb: [241, 196, 15] },  // yellow
  { name: "4", hex: "#2ecc71", rgb: [46, 204, 113] },  // green
  { name: "5", hex: "#9b59b6", rgb: [155, 89, 182] },  // purple
  { name: "6", hex: "#e67e22", rgb: [230, 126, 34] },  // orange
  { name: "7", hex: "#1abc9c", rgb: [26, 188, 156] },  // teal
  { name: "8", hex: "#e84393", rgb: [232, 67, 147] },  // pink
  { name: "9", hex: "#16a085", rgb: [22, 160, 133] },  // dark teal
  { name: "10", hex: "#d35400", rgb: [211, 84, 0] },   // dark orange
];

let canvas, ctx;
let rawData = [];
let headers = [];
let labelColumn = "";
let featureColumns = [];
let uniqueLabels = [];
let labelColorMap = {};

let xAxisFeature = "";
let yAxisFeature = "";
let selectedLabels = new Set();

let points = [];
let k = 3;
let kbackgroundColor = k;
let accuracy = 10;
let backgroundColor = null;
let showColoredZone = false;
let mousePosition = { x: 0, y: 0 };
let wheelTimeout = null;
let keyArrowTimeout = null;
let isRendering = false;
let backgroundWorker = null;
let isGenerating = false;

// ========== Initialize ==========
document.addEventListener("DOMContentLoaded", () => {
  setupUploadListeners();
});

// ========== Upload Functions ==========
function setupUploadListeners() {
  CSV_FILE_INPUT.addEventListener("change", handleFileSelect);

  UPLOAD_AREA.addEventListener("dragover", (e) => {
    e.preventDefault();
    UPLOAD_AREA.classList.add("dragover");
  });

  UPLOAD_AREA.addEventListener("dragleave", () => {
    UPLOAD_AREA.classList.remove("dragover");
  });

  UPLOAD_AREA.addEventListener("drop", (e) => {
    e.preventDefault();
    UPLOAD_AREA.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) {
      processCSVFile(file);
    } else {
      alert("Please upload a .csv file");
    }
  });

  document.getElementById("reload-csv").addEventListener("click", () => {
    resetToUploadScreen();
  });
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) {
    processCSVFile(file);
  }
}

function processCSVFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const csvContent = e.target.result;
    parseCSV(csvContent, file.name);
  };
  reader.readAsText(file);
}

// ========== CSV Parsing ==========
function parseCSV(csvContent, fileName) {
  const lines = csvContent.trim().split("\n");
  if (lines.length < 2) {
    alert("CSV file needs at least a header row and one data row");
    return;
  }

  headers = lines[0].split(",").map((h) => h.trim());
  labelColumn = headers[headers.length - 1];
  featureColumns = headers.slice(0, -1);

  if (featureColumns.length < 2) {
    alert("At least two feature columns are required");
    return;
  }

  rawData = [];
  const labelsSet = new Set();

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    if (values.length !== headers.length) continue;

    const row = {};
    let valid = true;

    featureColumns.forEach((col, idx) => {
      const num = parseFloat(values[idx]);
      if (isNaN(num)) valid = false;
      row[col] = num;
    });

    if (!valid) continue;

    row[labelColumn] = values[values.length - 1];
    labelsSet.add(row[labelColumn]);
    rawData.push(row);
  }

  if (rawData.length === 0) {
    alert("No valid data found");
    return;
  }

  uniqueLabels = Array.from(labelsSet).sort();
  labelColorMap = {};
  uniqueLabels.forEach((label, idx) => {
    labelColorMap[label] = COLOR_PALETTE[idx % COLOR_PALETTE.length];
  });

  selectedLabels = new Set(uniqueLabels);
  xAxisFeature = featureColumns[0];
  yAxisFeature = featureColumns[1];

  FILE_NAME_DISPLAY.textContent = fileName;
  switchToMainScreen();
}

// ========== Screen Switching ==========
function switchToMainScreen() {
  UPLOAD_SCREEN.style.display = "none";
  MAIN_SCREEN.style.display = "block";

  canvas = document.getElementById("canvas");
  ctx = canvas.getContext("2d");

  setupAxisSelectors();
  setupClassCheckboxes();
  setupEventListeners();
  resizeCanvas();
}

function resetToUploadScreen() {
  MAIN_SCREEN.style.display = "none";
  UPLOAD_SCREEN.style.display = "flex";
  CSV_FILE_INPUT.value = "";

  rawData = [];
  headers = [];
  points = [];
  backgroundColor = null;
  showColoredZone = false;
  document.getElementById("show-background").checked = false;
}

// ========== UI Setup ==========
function setupAxisSelectors() {
  X_AXIS_SELECT.innerHTML = "";
  featureColumns.forEach((col) => {
    const option = document.createElement("option");
    option.value = col;
    option.textContent = col;
    if (col === xAxisFeature) option.selected = true;
    X_AXIS_SELECT.appendChild(option);
  });

  Y_AXIS_SELECT.innerHTML = "";
  featureColumns.forEach((col) => {
    const option = document.createElement("option");
    option.value = col;
    option.textContent = col;
    if (col === yAxisFeature) option.selected = true;
    Y_AXIS_SELECT.appendChild(option);
  });

  X_AXIS_SELECT.addEventListener("change", () => {
    xAxisFeature = X_AXIS_SELECT.value;
    updatePoints();
    if (showColoredZone) generateBackgroundImage();
    renderCanvas();
  });

  Y_AXIS_SELECT.addEventListener("change", () => {
    yAxisFeature = Y_AXIS_SELECT.value;
    updatePoints();
    if (showColoredZone) generateBackgroundImage();
    renderCanvas();
  });
}

function setupClassCheckboxes() {
  CLASS_CHECKBOXES.innerHTML = "";

  uniqueLabels.forEach((label) => {
    const color = labelColorMap[label];

    const container = document.createElement("div");
    container.className = "class-checkbox-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `class-${label}`;
    checkbox.checked = true;

    const labelEl = document.createElement("label");
    labelEl.htmlFor = `class-${label}`;

    const colorDot = document.createElement("span");
    colorDot.className = "class-color-dot";
    colorDot.style.backgroundColor = color.hex;

    labelEl.appendChild(colorDot);
    labelEl.appendChild(document.createTextNode(`Class ${label}`));

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedLabels.add(label);
      } else {
        selectedLabels.delete(label);
      }
      updatePoints();
      if (showColoredZone) generateBackgroundImage();
      renderCanvas();
    });

    container.appendChild(checkbox);
    container.appendChild(labelEl);
    CLASS_CHECKBOXES.appendChild(container);
  });
}

function setupEventListeners() {
  window.addEventListener("mousemove", (event) => {
    mousePosition.x = event.clientX;
    mousePosition.y = event.clientY;
  });

  window.addEventListener("touchmove", (event) => {
    mousePosition.x = event.touches[0].clientX;
    mousePosition.y = event.touches[0].clientY;
  });

  window.addEventListener("resize", resizeCanvas);

  window.addEventListener("wheel", (event) => {
    if (event.deltaY > 0) {
      k = Math.max(1, k - 1);
    } else {
      k = Math.min(points.length, k + 1);
    }
    K_NUMBER.innerHTML = k;
    renderCanvas();

    clearTimeout(wheelTimeout);
    wheelTimeout = setTimeout(() => {
      if (showColoredZone) {
        generateBackgroundImage();
        renderCanvas();
      }
    }, 250);
  });

  const qualityCheckboxes = document.querySelectorAll('input[name$="quality"]');
  qualityCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", function () {
      accuracy = parseInt(this.value);
      qualityCheckboxes.forEach((qcb) => {
        qcb.checked = qcb === this;
      });
      if (showColoredZone) {
        generateBackgroundImage(accuracy);
        renderCanvas();
      }
      this.blur();
    });
  });

  document.getElementById("show-background").addEventListener("click", function () {
    showColoredZone = !showColoredZone;
    if (showColoredZone && (!backgroundColor || k !== kbackgroundColor)) {
      generateBackgroundImage();
      kbackgroundColor = k;
    }
    renderCanvas();
    this.blur();
  });

  canvas.addEventListener("mousemove", () => {
    renderCanvas();
  });

  canvas.addEventListener("touchmove", (event) => {
    event.preventDefault();
    renderCanvas();
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "Space") {
      toggleColoredZone();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp") {
      k = Math.min(points.length, k + 1);
      K_NUMBER.innerHTML = k;
      renderCanvas();
    } else if (event.key === "ArrowDown") {
      k = Math.max(1, k - 1);
      K_NUMBER.innerHTML = k;
      renderCanvas();
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      clearTimeout(keyArrowTimeout);
      keyArrowTimeout = setTimeout(() => {
        if (showColoredZone) {
          generateBackgroundImage();
          renderCanvas();
        }
      }, 250);
    }
  });
}

// ========== Data Processing ==========
function updatePoints() {
  if (rawData.length === 0) return;

  const filteredData = rawData.filter((row) => selectedLabels.has(row[labelColumn]));

  if (filteredData.length === 0) {
    points = [];
    return;
  }

  const xValues = filteredData.map((row) => row[xAxisFeature]);
  const yValues = filteredData.map((row) => row[yAxisFeature]);

  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);

  const padding = 60;
  const canvasWidth = canvas.width - padding * 2;
  const canvasHeight = canvas.height - padding * 2;

  points = filteredData.map((row) => {
    const xNorm = xMax !== xMin ? (row[xAxisFeature] - xMin) / (xMax - xMin) : 0.5;
    const yNorm = yMax !== yMin ? (row[yAxisFeature] - yMin) / (yMax - yMin) : 0.5;

    return {
      x: padding + xNorm * canvasWidth,
      y: canvas.height - padding - yNorm * canvasHeight,
      category: row[labelColumn],
      color: labelColorMap[row[labelColumn]],
      rawX: row[xAxisFeature],
      rawY: row[yAxisFeature],
    };
  });

  if (k > points.length) {
    k = Math.max(1, points.length);
    K_NUMBER.innerHTML = k;
  }
}

// ========== Drawing Functions ==========
function drawPoints() {
  points.forEach((p) => {
    ctx.fillStyle = p.color.hex;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

function drawCursorPrediction(x, y) {
  if (points.length === 0) return;

  const { prediction, nearest, maxDist } = knn(x, y);
  const predColor = labelColorMap[prediction];

  TEXT_PREDICTION.textContent = prediction;
  TEXT_PREDICTION.style.backgroundColor = predColor.hex;
  TEXT_PREDICTION.style.color = predColor.rgb[0] > 150 ? "#111" : "#fff";

  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fillStyle = predColor.hex;
  ctx.fill();
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.globalAlpha = 0.1;
  ctx.beginPath();
  ctx.arc(x, y, maxDist, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1;
  ctx.stroke();

  nearest.forEach((p) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();
  });
}

function knn(px, py) {
  const distances = points.map((p) => {
    const dist = Math.hypot(p.x - px, p.y - py);
    return { ...p, dist };
  });

  distances.sort((a, b) => a.dist - b.dist);
  const nearest = distances.slice(0, k);
  const categories = nearest.map((p) => p.category);

  const categoryCount = categories.reduce((acc, category) => {
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});

  const maxCount = Math.max(...Object.values(categoryCount));
  const mostFrequentCategories = Object.keys(categoryCount).filter(
    (category) => categoryCount[category] === maxCount
  );

  const prediction =
    mostFrequentCategories.length === 1
      ? mostFrequentCategories[0]
      : nearest.find((p) => mostFrequentCategories.includes(p.category)).category;

  const maxDist = nearest[k - 1]?.dist || 0;
  return { prediction, nearest, maxDist };
}

function toggleColoredZone() {
  showColoredZone = !showColoredZone;
  document.getElementById("show-background").checked = showColoredZone;

  if (showColoredZone && (!backgroundColor || k !== kbackgroundColor)) {
    generateBackgroundImage();
    kbackgroundColor = k;
  }

  renderCanvas();
}

// ========== Background Generation ==========
function generateBackgroundImage(quality = accuracy) {
  if (isGenerating || points.length === 0) return;
  isGenerating = true;
  LOADING_INDICATOR.classList.add("visible");

  if (backgroundWorker) {
    backgroundWorker.terminate();
  }

  backgroundWorker = new Worker("background-worker.js");

  backgroundWorker.onmessage = (e) => {
    if (e.data.type === "imageData") {
      backgroundColor = e.data.imageData;
      kbackgroundColor = k;
      renderCanvas();
      LOADING_INDICATOR.classList.remove("visible");
      isGenerating = false;
    }
    backgroundWorker = null;
  };

  backgroundWorker.onerror = (err) => {
    console.error("Worker error:", err);
    LOADING_INDICATOR.classList.remove("visible");
    isGenerating = false;
  };

  const colorMapForWorker = {};
  Object.keys(labelColorMap).forEach((label) => {
    const c = labelColorMap[label];
    colorMapForWorker[label] = [c.rgb[0], c.rgb[1], c.rgb[2], 255];
  });

  const workerData = {
    points: points.map((p) => ({
      x: p.x,
      y: p.y,
      category: p.category,
    })),
    k,
    accuracy: quality,
    width: canvas.width,
    height: canvas.height,
    colorMap: colorMapForWorker,
  };

  backgroundWorker.postMessage(workerData);
}

function drawBackgroundColor() {
  if (backgroundColor && showColoredZone) {
    ctx.putImageData(backgroundColor, 0, 0);
  } else {
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function renderCanvas() {
  if (!isRendering && canvas) {
    isRendering = true;
    requestAnimationFrame(() => {
      drawBackgroundColor();
      drawPoints();
      drawCursorPrediction(mousePosition.x, mousePosition.y);
      isRendering = false;
    });
  }
}

function resizeCanvas() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  backgroundColor = null;
  updatePoints();
  if (showColoredZone) {
    generateBackgroundImage();
  }
  renderCanvas();
}
