/*!
 * Chart.js v3.9.1
 * https://www.chartjs.org
 * (c) 2022 Chart.js Contributors
 * Released under the MIT License
 */
(function (global, factory) {
typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
typeof define === 'function' && define.amd ? define(factory) :
(global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.Chart = factory());
})(this, (function () { 'use strict';

function fontString(pixelSize, fontStyle, fontFamily) {
  return fontStyle + ' ' + pixelSize + 'px ' + fontFamily;
}
const requestAnimFrame = (function() {
  if (typeof window === 'undefined') {
    return function(callback) {
      return callback();
    };
  }
  return window.requestAnimationFrame;
}());
function throttled(fn, thisArg, updateFn) {
  const updateArgs = updateFn || ((args) => Array.prototype.slice.call(args));
  let ticking = false;
  let args = [];
  return function(...rest) {
    args = updateArgs(rest);
    if (!ticking) {
      ticking = true;
      requestAnimFrame.call(window, () => {
        ticking = false;
        fn.apply(thisArg, args);
      });
    }
  };
}
function debounce(fn, delay) {
  let timeout;
  return function(...args) {
    if (delay) {
      clearTimeout(timeout);
      timeout = setTimeout(fn, delay, args);
    } else {
      fn.apply(this, args);
    }
    return delay;
  };
}
const _toLeftRightCenter = (align) => align === 'start' ? 'left' : align === 'end' ? 'right' : 'center';
const _alignStartEnd = (align, start, end) => align === 'start' ? start : align === 'end' ? end : (start + end) / 2;
const _textX = (align, left, right, rtl) => {
  const check = rtl ? 'left' : 'right';
  return align === check ? right : align === 'center' ? (left + right) / 2 : left;
};

class Animator {
  constructor() {
    this._request = null;
    this._charts = new Map();
    this._running = false;
    this._lastDate = undefined;
  }
  _notify(chart, anims, date, type) {
    const callbacks = anims.listeners[type];
    const numSteps = anims.duration;
    callbacks.forEach(fn => fn({
      chart,
      initial: anims.initial,
      numSteps,
      currentStep: Math.min(date - anims.start, numSteps)
    }));
  }
  _refresh() {
    if (this._request) {
      return;
    }
    this._running = true;
    this._request = requestAnimFrame.call(window, () => {
      this._update();
      this._request = null;
      if (this._running) {
        this._refresh();
      }
    });
  }
  _update(date = Date.now()) {
    let remaining = 0;
    this._charts.forEach((anims, chart) => {
      if (!anims.running || !anims.items.length) {
        return;
      }
      const items = anims.items;
      let i = items.length - 1;
      let draw = false;
      let item;
      for (; i >= 0; --i) {
        item = items[i];
        if (item._active) {
          if (item._total > anims.duration) {
            anims.duration = item._total;
          }
          item.tick(date);
          draw = true;
        } else {
          items[i] = items[items.length - 1];
          items.pop();
        }
      }
      if (draw) {
        chart.draw();
        this._notify(chart, anims, date, 'progress');
      }
      if (!items.length) {
        anims.running = false;
        this._notify(chart, anims, date, 'complete');
        anims.initial = false;
      }
      remaining += items.length;
    });
    this._lastDate = date;
    if (remaining === 0) {
      this._running = false;
    }
  }
  _getAnims(chart) {
    const charts = this._charts;
    let anims = charts.get(chart);
    if (!anims) {
      anims = {
        running: false,
        initial: true,
        items: [],
        listeners: {
          complete: [],
          progress: []
        }
      };
      charts.set(chart, anims);
    }
    return anims;
  }
  listen(chart, event, cb) {
    this._getAnims(chart).listeners[event].push(cb);
  }
  add(chart, items) {
    if (!items || !items.length) {
      return;
    }
    this._getAnims(chart).items.push(...items);
  }
  has(chart) {
    return this._getAnims(chart).items.length > 0;
  }
  start(chart) {
    const anims = this._charts.get(chart);
    if (!anims) {
      return;
    }
    anims.running = true;
    anims.start = Date.now();
    anims.duration = anims.items.reduce((acc, cur) => Math.max(acc, cur._duration), 0);
    this._refresh();
  }
  running(chart) {
    if (!this._running) {
      return false;
    }
    const anims = this._charts.get(chart);
    if (!anims || !anims.running || !anims.items.length) {
      return false;
    }
    return true;
  }
  stop(chart) {
    const anims = this._charts.get(chart);
    if (!anims || !anims.items.length) {
      return;
    }
    const items = anims.items;
    let i = items.length - 1;
    for (; i >= 0; --i) {
      items[i].cancel();
    }
    anims.items = [];
    this._notify(chart, anims, Date.now(), 'complete');
  }
  remove(chart) {
    return this._charts.delete(chart);
  }
}
var animator = new Animator();

// Note: This file is originally from Chart.js and has been modified for use in this project
// The full Chart.js library is quite large, so this is a simplified version that includes
// only the core functionality needed for the extension's dashboard

// This is a simplified version of Chart.js that includes only the core functionality
// For the full library, please download it from https://www.chartjs.org/

// Basic Chart class that mimics the Chart.js API
class Chart {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    this.data = config.data;
    this.options = config.options || {};
    this.type = config.type;
    this._init();
  }

  _init() {
    // Initialize the chart based on type
    console.log(`Initializing ${this.type} chart`);
    this._draw();
  }

  _draw() {
    // Basic drawing logic
    const ctx = this.ctx;
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw based on chart type
    switch(this.type) {
      case 'line':
        this._drawLineChart();
        break;
      case 'bar':
        this._drawBarChart();
        break;
      case 'pie':
      case 'doughnut':
        this._drawPieChart();
        break;
      default:
        console.error(`Unsupported chart type: ${this.type}`);
    }
  }

  _drawLineChart() {
    const ctx = this.ctx;
    const datasets = this.data.datasets;
    const labels = this.data.labels;
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const padding = 40;
    const chartWidth = width - (padding * 2);
    const chartHeight = height - (padding * 2);

    // Draw axes
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Draw each dataset
    datasets.forEach(dataset => {
      const data = dataset.data;
      const pointWidth = chartWidth / (labels.length - 1);
      
      ctx.beginPath();
      ctx.strokeStyle = dataset.borderColor || '#000';
      ctx.fillStyle = dataset.backgroundColor || 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 2;

      // Plot points and lines
      data.forEach((value, index) => {
        const x = padding + (index * pointWidth);
        const y = height - padding - ((value / Math.max(...data)) * chartHeight);
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.stroke();
      
      // Fill area if specified
      if (dataset.fill) {
        ctx.lineTo(padding + ((labels.length - 1) * pointWidth), height - padding);
        ctx.lineTo(padding, height - padding);
        ctx.fill();
      }
    });
  }

  _drawBarChart() {
    const ctx = this.ctx;
    const datasets = this.data.datasets;
    const labels = this.data.labels;
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const padding = 40;
    const chartWidth = width - (padding * 2);
    const chartHeight = height - (padding * 2);
    
    // Calculate bar width based on number of datasets and labels
    const groupWidth = chartWidth / labels.length;
    const barWidth = groupWidth / datasets.length * 0.8;
    
    // Draw axes
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();
    
    // Find max value for scaling
    let maxValue = 0;
    datasets.forEach(dataset => {
      const dataMax = Math.max(...dataset.data);
      if (dataMax > maxValue) maxValue = dataMax;
    });
    
    // Draw each dataset's bars
    datasets.forEach((dataset, datasetIndex) => {
      ctx.fillStyle = dataset.backgroundColor || 'rgba(0,0,0,0.1)';
      
      dataset.data.forEach((value, index) => {
        const x = padding + (index * groupWidth) + (datasetIndex * barWidth);
        const barHeight = (value / maxValue) * chartHeight;
        const y = height - padding - barHeight;
        
        ctx.fillRect(x, y, barWidth, barHeight);
      });
    });
  }

  _drawPieChart() {
    const ctx = this.ctx;
    const dataset = this.data.datasets[0];
    const labels = this.data.labels;
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 40;
    
    // Calculate total for percentages
    const total = dataset.data.reduce((sum, value) => sum + value, 0);
    
    // Draw pie/doughnut segments
    let startAngle = 0;
    dataset.data.forEach((value, index) => {
      const sliceAngle = (value / total) * 2 * Math.PI;
      
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
      ctx.closePath();
      
      // Use provided colors or generate
      const color = dataset.backgroundColor && dataset.backgroundColor[index] ? 
                    dataset.backgroundColor[index] : 
                    `hsl(${(index * 360 / dataset.data.length) % 360}, 70%, 60%)`;
      
      ctx.fillStyle = color;
      ctx.fill();
      
      // If doughnut chart, cut out center
      if (this.type === 'doughnut') {
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius * 0.5, 0, 2 * Math.PI);
        ctx.fillStyle = 'white';
        ctx.fill();
      }
      
      startAngle += sliceAngle;
    });
  }

  update() {
    this._draw();
  }

  destroy() {
    // Clean up resources
    console.log('Destroying chart');
    // In a real implementation, this would remove event listeners, etc.
  }
}

// Export the Chart class
return Chart;

}));