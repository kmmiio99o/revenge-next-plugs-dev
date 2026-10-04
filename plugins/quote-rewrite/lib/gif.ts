/**
 * Single-frame GIF encoder that runs inside the renderer WebView.
 *
 * Split into three parts:
 *   1. median-cut palette built from a 40k-pixel sample of the card,
 *   2. Floyd–Steinberg dithering with a 6-bit-per-channel nearest-colour
 *      cache so gradients (the avatar scrim) do not band,
 *   3. GIF89a assembly + standard variable-width LZW.
 *
 * Exposed as source text rather than a normal module because the encoder has
 * to live inside the HTML document — the WebView cannot import plugin code.
 */
export const GIF_ENCODER_SOURCE = `
function encodeGif(rgba, width, height) {
  var pixelCount = width * height;

  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function bytesToBase64(arr) {
    var out = '';
    var i = 0;
    for (; i + 2 < arr.length; i += 3) {
      var n = (arr[i] << 16) | (arr[i + 1] << 8) | arr[i + 2];
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
    }
    var rem = arr.length - i;
    if (rem === 1) {
      var a = arr[i] << 16;
      out += B64[(a >> 18) & 63] + B64[(a >> 12) & 63] + '==';
    } else if (rem === 2) {
      var b = (arr[i] << 16) | (arr[i + 1] << 8);
      out += B64[(b >> 18) & 63] + B64[(b >> 12) & 63] + B64[(b >> 6) & 63] + '=';
    }
    return out;
  }

  // ---- palette: median cut over a bounded sample ----
  var stride = Math.max(1, Math.floor(pixelCount / 40000));
  var samples = [];
  for (var i = 0; i < pixelCount; i += stride) {
    var o = i * 4;
    samples.push((rgba[o] << 16) | (rgba[o + 1] << 8) | rgba[o + 2]);
  }
  if (samples.length === 0) samples.push(0);

  function measure(bucket) {
    var rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0;
    for (var i = bucket.lo; i < bucket.hi; i++) {
      var v = samples[i];
      var r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
      if (r < rmin) rmin = r;
      if (r > rmax) rmax = r;
      if (g < gmin) gmin = g;
      if (g > gmax) gmax = g;
      if (b < bmin) bmin = b;
      if (b > bmax) bmax = b;
    }
    bucket.wr = (rmax - rmin) * 2;
    bucket.wg = (gmax - gmin) * 4;
    bucket.wb = (bmax - bmin) * 3;
    bucket.span = Math.max(bucket.wr, bucket.wg, bucket.wb);
    bucket.score = bucket.span * (bucket.hi - bucket.lo);
  }

  var buckets = [{ lo: 0, hi: samples.length }];
  measure(buckets[0]);

  while (buckets.length < 256) {
    var target = null;
    for (var i = 0; i < buckets.length; i++) {
      var b = buckets[i];
      if (b.hi - b.lo < 2 || b.span <= 0) continue;
      if (!target || b.score > target.score) target = b;
    }
    if (!target) break;

    var shift = 16;
    if (target.wg >= target.wr && target.wg >= target.wb) shift = 8;
    else if (target.wb >= target.wr && target.wb >= target.wg) shift = 0;

    var slice = samples.slice(target.lo, target.hi);
    slice.sort(function (a, b2) {
      return ((a >> shift) & 255) - ((b2 >> shift) & 255);
    });
    for (var i = 0; i < slice.length; i++) samples[target.lo + i] = slice[i];

    var mid = (target.lo + target.hi) >> 1;
    if (mid <= target.lo) mid = target.lo + 1;
    var right = { lo: mid, hi: target.hi };
    target.hi = mid;
    measure(target);
    measure(right);
    buckets.push(right);
  }

  var size = buckets.length;
  var pr = new Int32Array(size), pg = new Int32Array(size), pb = new Int32Array(size);
  for (var i = 0; i < size; i++) {
    var bucket = buckets[i];
    var rs = 0, gs = 0, bs = 0, n = 0;
    for (var j = bucket.lo; j < bucket.hi; j++) {
      var v = samples[j];
      rs += (v >> 16) & 255;
      gs += (v >> 8) & 255;
      bs += v & 255;
      n++;
    }
    if (n === 0) n = 1;
    pr[i] = Math.round(rs / n);
    pg[i] = Math.round(gs / n);
    pb[i] = Math.round(bs / n);
  }
  if (size === 0) {
    size = 1;
    pr = Int32Array.from([0]);
    pg = Int32Array.from([0]);
    pb = Int32Array.from([0]);
  }

  var cache = new Int16Array(64 * 64 * 64);
  cache.fill(-1);
  function nearest(r, g, b) {
    var key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    var hit = cache[key];
    if (hit >= 0) return hit;
    var best = 0, bd = 1e12;
    for (var i = 0; i < size; i++) {
      var dr = r - pr[i], dg = g - pg[i], db = b - pb[i];
      var d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
      if (d < bd) { bd = d; best = i; }
    }
    cache[key] = best;
    return best;
  }

  // ---- quantise with Floyd-Steinberg error diffusion ----
  var indices = new Uint8Array(pixelCount);
  var er = new Float32Array(pixelCount);
  var eg = new Float32Array(pixelCount);
  var eb = new Float32Array(pixelCount);
  function clamp8(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var i = y * width + x;
      var o = i * 4;
      var r = clamp8(rgba[o] + er[i]);
      var g = clamp8(rgba[o + 1] + eg[i]);
      var b = clamp8(rgba[o + 2] + eb[i]);
      var idx = nearest(r, g, b);
      indices[i] = idx;
      var nr = r - pr[idx], ng = g - pg[idx], nb = b - pb[idx];
      if (x + 1 < width) {
        er[i + 1] += nr * 0.4375;
        eg[i + 1] += ng * 0.4375;
        eb[i + 1] += nb * 0.4375;
      }
      if (y + 1 < height) {
        var below = i + width;
        if (x > 0) {
          er[below - 1] += nr * 0.1875;
          eg[below - 1] += ng * 0.1875;
          eb[below - 1] += nb * 0.1875;
        }
        er[below] += nr * 0.3125;
        eg[below] += ng * 0.3125;
        eb[below] += nb * 0.3125;
        if (x + 1 < width) {
          er[below + 1] += nr * 0.0625;
          eg[below + 1] += ng * 0.0625;
          eb[below + 1] += nb * 0.0625;
        }
      }
    }
  }

  // ---- LZW, LSB-first as GIF requires ----
  function lzw(pixels, minCodeSize) {
    var clearCode = 1 << minCodeSize;
    var eoiCode = clearCode + 1;
    var codeSize = minCodeSize + 1;
    var nextCode = eoiCode + 1;
    var table = new Map();
    var out = [];
    var cur = 0, curBits = 0;

    function emit(code) {
      cur |= code << curBits;
      curBits += codeSize;
      while (curBits >= 8) {
        out.push(cur & 255);
        cur >>= 8;
        curBits -= 8;
      }
    }

    if (pixels.length === 0) {
      emit(clearCode);
      emit(eoiCode);
      if (curBits > 0) out.push(cur & 255);
      return out;
    }

    emit(clearCode);
    var prefix = pixels[0];
    for (var i = 1; i < pixels.length; i++) {
      var k = pixels[i];
      var key = (prefix << 8) | k;
      var found = table.get(key);
      if (found !== undefined) {
        prefix = found;
        continue;
      }
      emit(prefix);
      if (nextCode === 4096) {
        emit(clearCode);
        table = new Map();
        codeSize = minCodeSize + 1;
        nextCode = eoiCode + 1;
      } else {
        if (nextCode >= (1 << codeSize) && codeSize < 12) codeSize++;
        table.set(key, nextCode++);
      }
      prefix = k;
    }
    emit(prefix);
    emit(eoiCode);
    if (curBits > 0) out.push(cur & 255);
    return out;
  }

  // ---- GIF89a container ----
  var padded = 1;
  while (padded < size) padded <<= 1;
  if (padded < 4) padded = 4;
  var bits = 0;
  while ((1 << bits) < padded) bits++;
  var minCodeSize = Math.max(2, bits);

  var bytes = [];
  function pushStr(s) {
    for (var i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i) & 255);
  }
  function pushU16(v) {
    bytes.push(v & 255, (v >> 8) & 255);
  }

  pushStr('GIF89a');
  pushU16(width);
  pushU16(height);
  bytes.push(0x80 | 0x70 | (bits - 1));
  bytes.push(0);
  bytes.push(0);
  for (var i = 0; i < padded; i++) {
    if (i < size) bytes.push(pr[i], pg[i], pb[i]);
    else bytes.push(0, 0, 0);
  }
  bytes.push(0x2c);
  pushU16(0);
  pushU16(0);
  pushU16(width);
  pushU16(height);
  bytes.push(0);
  bytes.push(minCodeSize);

  var blocks = lzw(indices, minCodeSize);
  for (var p = 0; p < blocks.length; p += 255) {
    var end = Math.min(p + 255, blocks.length);
    bytes.push(end - p);
    for (var i = p; i < end; i++) bytes.push(blocks[i]);
  }
  bytes.push(0);
  bytes.push(0x3b);

  return bytesToBase64(bytes);
}
`.trim()
