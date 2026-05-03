/**
 * Авторазделение составного скриншота (сетка постов) по визуальным промежуткам.
 * Только браузер: анализ пикселей, без сервера.
 */
(function (global) {
  "use strict";

  var MIN_SIDE_TRY = 380;
  var MIN_CELL = 40;
  var MAX_CELLS = 24;
  var GUTTER_FRAC = 0.82;
  var MIN_GUTTER_RUN = 2;
  var BG_SAMPLE = 3;
  var COLOR_TOL = 38;

  function median(arr) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function (a, b) {
      return a - b;
    });
    return s[(s.length / 2) | 0];
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var u = URL.createObjectURL(file);
      var im = new Image();
      im.onload = function () {
        URL.revokeObjectURL(u);
        resolve(im);
      };
      im.onerror = function () {
        URL.revokeObjectURL(u);
        reject(new Error("IMAGE"));
      };
      im.src = u;
    });
  }

  function sampleEdgeBackground(data, w, h) {
    var rs = [],
      gs = [],
      bs = [];
    var d = data.data;
    function push(i) {
      rs.push(d[i]);
      gs.push(d[i + 1]);
      bs.push(d[i + 2]);
    }
    var t, x, y;
    for (t = 0; t < BG_SAMPLE; t++) {
      for (x = 0; x < w; x++) {
        push((t * w + x) * 4);
        push(((h - 1 - t) * w + x) * 4);
      }
      for (y = 0; y < h; y++) {
        push((y * w + t) * 4);
        push((y * w + (w - 1 - t)) * 4);
      }
    }
    return { r: median(rs), g: median(gs), b: median(bs) };
  }

  function matchBg(r, g, b, bg) {
    var dr = r - bg.r;
    var dg = g - bg.g;
    var db = b - bg.b;
    if (dr * dr + dg * dg + db * db <= COLOR_TOL * COLOR_TOL) return true;
    var lum = (r + g + b) / 3;
    var blum = (bg.r + bg.g + bg.b) / 3;
    if (blum > 195 && lum > 228) return true;
    if (blum < 90 && lum < blum + 28) return true;
    return false;
  }

  function columnGutterFrac(data, w, h, bg) {
    var d = data.data;
    var out = new Float32Array(w);
    var x, y, i, c;
    for (x = 0; x < w; x++) {
      c = 0;
      for (y = 0; y < h; y++) {
        i = (y * w + x) * 4;
        if (matchBg(d[i], d[i + 1], d[i + 2], bg)) c++;
      }
      out[x] = c / h;
    }
    return out;
  }

  function rowGutterFrac(data, w, h, bg) {
    var d = data.data;
    var out = new Float32Array(h);
    var x, y, i, c;
    for (y = 0; y < h; y++) {
      c = 0;
      for (x = 0; x < w; x++) {
        i = (y * w + x) * 4;
        if (matchBg(d[i], d[i + 1], d[i + 2], bg)) c++;
      }
      out[y] = c / w;
    }
    return out;
  }

  function findHighRuns(score, len, thresh, minRun) {
    var runs = [];
    var i = 0;
    while (i < len) {
      if (score[i] < thresh) {
        i++;
        continue;
      }
      var s = i;
      while (i < len && score[i] >= thresh) i++;
      var e = i - 1;
      if (e - s + 1 >= minRun) runs.push({ start: s, end: e });
    }
    return runs;
  }

  function contentSlicesFromGutters(gutterRuns, length, minSlice) {
    var slices = [];
    var cur = 0;
    var k, run;
    for (k = 0; k < gutterRuns.length; k++) {
      run = gutterRuns[k];
      if (run.start > cur && run.start - cur >= minSlice) slices.push([cur, run.start - 1]);
      cur = run.end + 1;
    }
    if (length - cur >= minSlice) slices.push([cur, length - 1]);
    return slices;
  }

  function smooth1d(a, len, rad) {
    var b = new Float32Array(len);
    var i, j, s, n;
    for (i = 0; i < len; i++) {
      s = 0;
      n = 0;
      for (j = Math.max(0, i - rad); j <= Math.min(len - 1, i + rad); j++) {
        s += a[j];
        n++;
      }
      b[i] = s / n;
    }
    return b;
  }

  function boundariesFromCuts(natDim, cutsNorm) {
    var eps = Math.max(2 / natDim, 1e-4);
    var sorted = cutsNorm
      .slice()
      .filter(function (t) {
        return t > eps && t < 1 - eps;
      })
      .sort(function (a, b) {
        return a - b;
      });
    var unique = [];
    sorted.forEach(function (t) {
      if (!unique.length || t - unique[unique.length - 1] > eps) unique.push(t);
    });
    var px = unique.map(function (u) {
      return Math.round(u * natDim);
    });
    var out = [0];
    px.forEach(function (x) {
      var last = out[out.length - 1];
      if (x > last && x < natDim) out.push(x);
    });
    if (natDim > out[out.length - 1]) out.push(natDim);
    return out;
  }

  function rectsFromBoundaryArrays(bx, by) {
    var rects = [];
    var i, j, x0, x1, y0, y1, w, h;
    for (i = 0; i < bx.length - 1; i++) {
      for (j = 0; j < by.length - 1; j++) {
        x0 = bx[i];
        x1 = bx[i + 1];
        y0 = by[j];
        y1 = by[j + 1];
        w = x1 - x0;
        h = y1 - y0;
        if (w >= MIN_CELL && h >= MIN_CELL) rects.push({ x: x0, y: y0, w: w, h: h });
      }
    }
    return rects;
  }

  /**
   * Разрез по долям ширины/высоты (0–1). Линии — внутренние границы между ячейками.
   * @param {File} file
   * @param {number[]} vCutsNorm — вертикали (доля по X)
   * @param {number[]} hCutsNorm — горизонтали (доля по Y)
   * @returns {Promise<Blob[]>}
   */
  function splitByNormalizedCuts(file, vCutsNorm, hCutsNorm) {
    return loadImage(file).then(function (img) {
      var natW = img.naturalWidth;
      var natH = img.naturalHeight;
      var bx = boundariesFromCuts(natW, vCutsNorm || []);
      var by = boundariesFromCuts(natH, hCutsNorm || []);
      var rects = rectsFromBoundaryArrays(bx, by);
      if (!rects.length) return Promise.resolve([]);
      return Promise.all(
        rects.map(function (r) {
          return cropToBlob(img, natW, natH, r);
        })
      ).then(function (blobs) {
        return blobs.filter(Boolean);
      });
    });
  }

  function rectsFromSlices(colSlices, rowSlices) {
    var rects = [];
    var ci, ri, x0, y0, x1, y1;
    for (ci = 0; ci < colSlices.length; ci++) {
      for (ri = 0; ri < rowSlices.length; ri++) {
        x0 = colSlices[ci][0];
        x1 = colSlices[ci][1];
        y0 = rowSlices[ri][0];
        y1 = rowSlices[ri][1];
        rects.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
      }
    }
    return rects;
  }

  function trimRect(data, w, h, bg, rx, ry, rw, rh) {
    var d = data.data;
    function isContent(px, py) {
      var i = (py * w + px) * 4;
      return !matchBg(d[i], d[i + 1], d[i + 2], bg);
    }
    var x, y, top, bottom, left, right, any;
    top = ry;
    bottom = ry + rh - 1;
    left = rx;
    right = rx + rw - 1;
    for (y = ry; y < ry + rh; y++) {
      any = false;
      for (x = rx; x < rx + rw; x++) {
        if (isContent(x, y)) {
          any = true;
          break;
        }
      }
      if (any) {
        top = y;
        break;
      }
    }
    for (y = ry + rh - 1; y >= ry; y--) {
      any = false;
      for (x = rx; x < rx + rw; x++) {
        if (isContent(x, y)) {
          any = true;
          break;
        }
      }
      if (any) {
        bottom = y;
        break;
      }
    }
    for (x = rx; x < rx + rw; x++) {
      any = false;
      for (y = top; y <= bottom; y++) {
        if (isContent(x, y)) {
          any = true;
          break;
        }
      }
      if (any) {
        left = x;
        break;
      }
    }
    for (x = rx + rw - 1; x >= rx; x--) {
      any = false;
      for (y = top; y <= bottom; y++) {
        if (isContent(x, y)) {
          any = true;
          break;
        }
      }
      if (any) {
        right = x;
        break;
      }
    }
    if (left > right || top > bottom) return { x: rx, y: ry, w: rw, h: rh };
    return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  }

  function mapRectToNatural(r, scaleInv) {
    return {
      x: Math.round(r.x * scaleInv),
      y: Math.round(r.y * scaleInv),
      w: Math.max(1, Math.round(r.w * scaleInv)),
      h: Math.max(1, Math.round(r.h * scaleInv)),
    };
  }

  function cropToBlob(img, natW, natH, rect) {
    var cw = Math.min(rect.w, natW - rect.x);
    var ch = Math.min(rect.h, natH - rect.y);
    if (cw < MIN_CELL || ch < MIN_CELL) return null;
    var c = document.createElement("canvas");
    c.width = cw;
    c.height = ch;
    var ctx = c.getContext("2d");
    ctx.drawImage(img, rect.x, rect.y, cw, ch, 0, 0, cw, ch);
    return new Promise(function (resolve) {
      c.toBlob(function (blob) {
        resolve(blob);
      }, "image/png");
    });
  }

  /**
   * @param {File} file
   * @returns {Promise<{ useOriginalOnly: boolean, blobs?: Blob[], hint?: string }>}
   */
  function trySplit(file) {
    return loadImage(file).then(function (img) {
      var natW = img.naturalWidth;
      var natH = img.naturalHeight;
      if (natW < MIN_SIDE_TRY || natH < MIN_SIDE_TRY) {
        return Promise.resolve({ useOriginalOnly: true, hint: "" });
      }

      var maxSide = 960;
      var scale = Math.min(1, maxSide / Math.max(natW, natH));
      var w = Math.max(1, Math.round(natW * scale));
      var h = Math.max(1, Math.round(natH * scale));
      var canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      var data = ctx.getImageData(0, 0, w, h);
      var bg = sampleEdgeBackground(data, w, h);

      var colF = columnGutterFrac(data, w, h, bg);
      var rowF = rowGutterFrac(data, w, h, bg);
      colF = smooth1d(colF, w, 1);
      rowF = smooth1d(rowF, h, 1);

      var colRuns = findHighRuns(colF, w, GUTTER_FRAC, MIN_GUTTER_RUN);
      var rowRuns = findHighRuns(rowF, h, GUTTER_FRAC, MIN_GUTTER_RUN);

      var minSlice = Math.max(MIN_CELL, Math.floor(Math.min(w, h) * 0.04));
      var colSlices = contentSlicesFromGutters(colRuns, w, minSlice);
      var rowSlices = contentSlicesFromGutters(rowRuns, h, minSlice);

      if (colSlices.length <= 1 && rowSlices.length <= 1 && natW >= natH * 1.15) {
        var nCol = natW / natH > 2.2 ? 4 : 3;
        var cell = w / nCol;
        var rectsScaled = [];
        var ic;
        for (ic = 0; ic < nCol; ic++) {
          var xa = Math.floor(ic * cell);
          var xb = Math.floor((ic + 1) * cell) - 1;
          rectsScaled.push(trimRect(data, w, h, bg, xa, 0, xb - xa + 1, h));
        }
        return finalizeRects(img, natW, natH, scale, rectsScaled);
      }

      if (colSlices.length === 0) colSlices.push([0, w - 1]);
      if (rowSlices.length === 0) rowSlices.push([0, h - 1]);

      var rects0 = rectsFromSlices(colSlices, rowSlices);
      var rectsScaled = rects0
        .map(function (r) {
          return trimRect(data, w, h, bg, r.x, r.y, r.w, r.h);
        })
        .filter(function (r) {
          return r.w >= minSlice && r.h >= minSlice;
        });

      return finalizeRects(img, natW, natH, scale, rectsScaled);
    });
  }

  function finalizeRects(img, natW, natH, scale, rectsScaled) {
    var scaleInv = 1 / scale;
    var natRects = rectsScaled.map(function (r) {
      return mapRectToNatural(r, scaleInv);
    });
    natRects = natRects.filter(function (r) {
      return r.w >= MIN_CELL && r.h >= MIN_CELL;
    });
    if (natRects.length <= 1) {
      return Promise.resolve({
        useOriginalOnly: true,
        hint: "Сетка не распознана — используйте целый скриншот или загрузите посты отдельными файлами.",
      });
    }
    var maxA = 0;
    var ti;
    for (ti = 0; ti < natRects.length; ti++) {
      maxA = Math.max(maxA, natRects[ti].w * natRects[ti].h);
    }
    if (maxA > natW * natH * 0.92) {
      return Promise.resolve({
        useOriginalOnly: true,
        hint: "Похоже на одно целое изображение — загрузите посты отдельно или оставьте скриншот как есть.",
      });
    }

    natRects = natRects.slice(0, MAX_CELLS);

    return Promise.all(
      natRects.map(function (r) {
        return cropToBlob(img, natW, natH, r);
      })
    ).then(function (blobs) {
      var good = [];
      var goodRects = [];
      var bi;
      for (bi = 0; bi < blobs.length; bi++) {
        if (blobs[bi]) {
          good.push(blobs[bi]);
          goodRects.push(natRects[bi]);
        }
      }
      if (good.length <= 1) {
        return {
          useOriginalOnly: true,
          hint: "Не удалось выделить несколько постов — оставлен исходный файл.",
        };
      }
      return {
        useOriginalOnly: false,
        blobs: good,
        naturalRects: goodRects,
        naturalWidth: natW,
        naturalHeight: natH,
      };
    });
  }

  global.BrandAnalyzerScreenshotSplit = {
    trySplit: trySplit,
    splitByNormalizedCuts: splitByNormalizedCuts,
  };
})(typeof window !== "undefined" ? window : self);
