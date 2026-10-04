// chartManager.js
export class IMUChartManager {
    /**
     * @param {HTMLElement} containerElement 
     * @param {Function} onSeekCallback - Called when user clicks/drags chart to scrub video
     */
    constructor(containerElement, onSeekCallback) {
      this.container = containerElement;
      this.onSeekCallback = onSeekCallback;
      this.plot = null;
      this.data = null;
      this.isDragging = false;
    }
  
    init(timeData, seriesArrays, seriesLabels) {
      if (this.plot) {
        this.plot.destroy();
      }
      this.container.innerHTML = '';
  
      this.data = [timeData, ...seriesArrays];
  
      // Palette for lines
      const colors = ["#ff5555", "#50fa7b", "#8be9fd", "#ffb86c", "#bd93f9", "#ff79c6"];
  
      const seriesConfig = [
        { label: "Time", value: (u, v) => v == null ? "-" : v.toFixed(3) + "s" }
      ];
  
      seriesLabels.forEach((label, idx) => {
        seriesConfig.push({
          label: label,
          stroke: colors[idx % colors.length],
          width: 1.5,
          points: { show: false }
        });
      });
  
      const opts = {
        width: this.container.clientWidth || 960,
        height: 240,
        scales: {
          x: { time: false }
        },
        series: seriesConfig,
        axes: [
          { stroke: "#aaa", grid: { stroke: "#2a2a2a" } },
          { stroke: "#aaa", grid: { stroke: "#2a2a2a" } }
        ],
        cursor: {
          drag: { x: false, y: false },
          sync: { key: "sharedTime" },
          points: { show: false }
        }
      };
  
      // Instantiate uPlot
      this.plot = new window.uPlot(opts, this.data, this.container);
      this._attachScrubEvents();
    }
  
    _attachScrubEvents() {
      const over = this.plot.over;
  
      // Enable dragging scrub bar across chart to seek video
      over.addEventListener('mousedown', (e) => {
        this.isDragging = true;
        this._handleChartSeek(e);
      });
  
      window.addEventListener('mousemove', (e) => {
        if (this.isDragging) {
          this._handleChartSeek(e);
        }
      });
  
      window.addEventListener('mouseup', () => {
        this.isDragging = false;
      });
    }
  
    _handleChartSeek(e) {
      const rect = this.plot.over.getBoundingClientRect();
      const leftPx = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const timeVal = this.plot.posToVal(leftPx, 'x');
      
      if (this.onSeekCallback && timeVal != null) {
        this.onSeekCallback(timeVal);
      }
    }
  
    /**
     * Moves the vertical scrubber indicator to the specified presentation time.
     * @param {number} timeSec 
     */
    setScrubberTime(timeSec) {
      if (!this.plot) return;
      const leftPx = this.plot.valToPos(timeSec, 'x', true);
      // Draw cursor without triggering change hooks
      this.plot.setCursor({ left: leftPx, top: 40 });
    }
  
    resize(width) {
      if (this.plot) {
        this.plot.setSize({ width, height: 240 });
      }
    }
  }