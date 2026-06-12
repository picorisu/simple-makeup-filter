// MAIN world で動く。Meet が呼ぶ getUserMedia を横取りして
// WebGL で加工した映像ストリームを返す。映像は一切外部に送らない。
// メイク（リップ・チーク・眉）は MediaPipe Face Mesh（拡張内に同梱、ローカル実行）で追従する。
(() => {
  'use strict';

  const settings = {
    enabled: true,
    smooth: 0.6,   // 美肌の強さ 0-1
    bright: 0.05,  // 明るさ 0-0.3
    warmth: 0.04,  // 血色（暖色寄せ） 0-0.2
    sat: 1.05,     // 彩度 0.5-1.5
    lipColor: '#c2476e',
    lipA: 0,       // リップ濃さ 0-1（0で無効）
    blushColor: '#e8889a',
    blushA: 0,     // チーク濃さ 0-1
    blushShape: 1.6, // チーク形状 1.0=丸 〜 2.5=横長
    blushY: 0.06,    // チーク縦位置（顔幅比）。プラスで上、マイナスで下
    blushSoft: 1.3,  // チークぼかし 1.0=標準 〜 2.2=広くふんわり霞む
    browColor: '#5a3d2b',
    browA: 0,      // 眉濃さ 0-1
    browW: 1.0,    // 眉の太さ 0.25=極細 〜 1.05=やや太
    __base: null   // 拡張リソースのベースURL（bridge.js から受け取る）
  };

  window.addEventListener('mbf-settings', (e) => {
    try {
      const s = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
      if (s && typeof s === 'object') Object.assign(settings, s);
    } catch (err) {
      console.warn('[Meet Beauty Filter] 設定の受信に失敗:', err);
    }
  });
  // bridge 側に「準備できた」と知らせて初期設定をもらう
  window.dispatchEvent(new CustomEvent('mbf-ready'));

  // ---------- WebGL 美肌シェーダー ----------

  const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

  // バイラテラル風フィルター: 色が近い画素だけ平均する＝輪郭や目鼻は残して肌だけ滑らかに
  const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uSmooth;
uniform float uBright;
uniform float uWarmth;
uniform float uSat;

// YCbCr 色空間での肌色判定。肌なら1、それ以外（目・髪・服・背景）なら0に滑らかに落ちる
float skinMask(vec3 rgb) {
  float cb = -0.169 * rgb.r - 0.331 * rgb.g + 0.5 * rgb.b + 0.5;
  float cr = 0.5 * rgb.r - 0.419 * rgb.g - 0.081 * rgb.b + 0.5;
  float mb = smoothstep(0.27, 0.32, cb) * (1.0 - smoothstep(0.48, 0.53, cb));
  float mr = smoothstep(0.50, 0.55, cr) * (1.0 - smoothstep(0.68, 0.73, cr));
  // 唇除外: 肌より赤みが強い画素はマスクから外してシャープに保つ
  float lip = smoothstep(0.575, 0.615, cr);
  return mb * mr * (1.0 - lip);
}

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec4 c = texture2D(uTex, uv);
  float skin = skinMask(c.rgb);

  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  for (int i = -3; i <= 3; i++) {
    for (int j = -3; j <= 3; j++) {
      vec2 off = vec2(float(i), float(j)) * uTexel * 3.0;
      vec3 s = texture2D(uTex, uv + off).rgb;
      float d = distance(s, c.rgb);
      float w = exp(-float(i * i + j * j) / 12.0) * exp(-d * d * 20.0);
      sum += s * w;
      wsum += w;
    }
  }
  vec3 blurred = sum / wsum;

  // 美肌も影リフトも肌色の画素にだけ効かせる
  float strength = uSmooth * skin;
  vec3 col = mix(c.rgb, blurred, strength);
  float shadow = max(0.0, dot(blurred - c.rgb, vec3(0.333)));
  col = mix(col, blurred, clamp(shadow * 15.0, 0.0, 1.0) * strength);

  col += uBright;
  col.r += uWarmth;
  col.b -= uWarmth * 0.5;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSat);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
}`;

  function createGL(canvas) {
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL unavailable');

    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(sh));
      }
      return sh;
    };

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    return {
      gl,
      uniforms: {
        texel: gl.getUniformLocation(prog, 'uTexel'),
        smooth: gl.getUniformLocation(prog, 'uSmooth'),
        bright: gl.getUniformLocation(prog, 'uBright'),
        warmth: gl.getUniformLocation(prog, 'uWarmth'),
        sat: gl.getUniformLocation(prog, 'uSat')
      }
    };
  }

  // ---------- MediaPipe Face Mesh（メイク用ランドマーク） ----------

  let landmarkerPromise = null;
  function getLandmarker() {
    if (!settings.__base) return null;
    if (!landmarkerPromise) {
      const base = settings.__base;
      // Meet は Trusted Types を強制していて、MediaPipe 内部の script 読み込みが
      // 文字列 URL のままだと弾かれる。default ポリシーを用意して、
      // この拡張のリソース URL に限り通す（それ以外は従来どおりブロック）
      if (window.trustedTypes && trustedTypes.createPolicy) {
        try {
          trustedTypes.createPolicy('default', {
            createScriptURL: (url) => {
              if (url.startsWith(base)) return url;
              throw new TypeError('blocked by Meet Beauty Filter default policy: ' + url);
            }
          });
        } catch (e) {
          // 既に default ポリシーが存在する／CSP がポリシー名を制限している場合
          console.warn('[Meet Beauty Filter] Trusted Types ポリシー作成失敗:', e);
        }
      }
      // MediaPipe は内部ログ（W0612... / INFO: ... / xxx.cc:NN）を console.error/warn で
      // 吐くため、chrome://extensions に「エラー」として集計されてしまう。
      // そのパターンのみ debug に格下げし、本物のエラーはそのまま通す
      const isMediapipeLog = (a) =>
        typeof a === 'string' && /^(W\d{4}|I\d{4}|INFO:)|[a-z_]+\.cc:\d+/.test(a);
      for (const level of ['error', 'warn']) {
        const orig = console[level].bind(console);
        console[level] = (...args) => {
          if (isMediapipeLog(args[0])) {
            console.debug(...args);
          } else {
            orig(...args);
          }
        };
      }
      landmarkerPromise = import(base + 'vendor/vision_bundle.mjs')
        .then(({ FilesetResolver, FaceLandmarker }) =>
          FilesetResolver.forVisionTasks(base + 'vendor/wasm').then((fileset) =>
            FaceLandmarker.createFromOptions(fileset, {
              baseOptions: {
                modelAssetPath: base + 'vendor/face_landmarker.task',
                delegate: 'GPU'
              },
              runningMode: 'VIDEO',
              numFaces: 1
            })
          )
        )
        .catch((e) => {
          console.warn('[Meet Beauty Filter] Face Mesh 初期化失敗（メイク無効、美肌は動作）:', e);
          return null;
        });
    }
    return landmarkerPromise;
  }

  // Face Mesh 468点のうち使う領域のインデックス
  const LIPS_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
  const LIPS_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
  const BROW_L = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
  const BROW_R = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
  const CHEEK_L = 205;
  const CHEEK_R = 425;
  const FACE_LEFT = 234;
  const FACE_RIGHT = 454;

  function tracePath(ctx, lm, indices, W, H) {
    ctx.moveTo(lm[indices[0]].x * W, lm[indices[0]].y * H);
    for (let i = 1; i < indices.length; i++) {
      ctx.lineTo(lm[indices[i]].x * W, lm[indices[i]].y * H);
    }
    ctx.closePath();
  }

  function hexToRgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  function drawMakeup(ctx, lm, W, H) {
    const faceW = Math.hypot(
      (lm[FACE_RIGHT].x - lm[FACE_LEFT].x) * W,
      (lm[FACE_RIGHT].y - lm[FACE_LEFT].y) * H
    );

    ctx.save();
    // multiply 合成 = 元の肌の陰影や唇の質感を残したまま色だけ重なる（口紅っぽい質感）
    ctx.globalCompositeOperation = 'multiply';

    if (settings.lipA > 0) {
      ctx.filter = `blur(${Math.max(1, faceW * 0.008)}px)`;
      ctx.fillStyle = hexToRgba(settings.lipColor, settings.lipA * 0.7);
      ctx.beginPath();
      tracePath(ctx, lm, LIPS_OUTER, W, H);
      tracePath(ctx, lm, LIPS_INNER, W, H);
      ctx.fill('evenodd'); // 内側ループをくり抜く＝歯に色が乗らない
    }

    if (settings.blushA > 0) {
      ctx.filter = 'none';
      const r = faceW * 0.13;
      const aspect = Math.max(1, settings.blushShape); // 横:縦 の比率
      // 首をかしげても楕円が頬骨のラインに沿うよう、顔の傾き（ロール角）を求める
      const roll = Math.atan2(
        (lm[FACE_RIGHT].y - lm[FACE_LEFT].y) * H,
        (lm[FACE_RIGHT].x - lm[FACE_LEFT].x) * W
      );
      for (const idx of [CHEEK_L, CHEEK_R]) {
        const x = lm[idx].x * W;
        const y = lm[idx].y * H;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(roll);
        ctx.translate(0, -settings.blushY * faceW); // 顔の傾きに沿った上下オフセット
        ctx.scale(aspect, 1); // 横方向に引き伸ばして楕円化
        // ぼかし: soft を上げるほど広い半径に薄く伸ばす（総量はほぼ一定に保つ）。
        // 中間ストップで指数減衰っぽく落として、自然な「霞み」にする
        const soft = Math.min(2.2, Math.max(1, settings.blushSoft));
        const rEff = r * soft;
        const a = (settings.blushA * 0.45) / soft;
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rEff);
        g.addColorStop(0, hexToRgba(settings.blushColor, a));
        g.addColorStop(0.45, hexToRgba(settings.blushColor, a * 0.55));
        g.addColorStop(0.75, hexToRgba(settings.blushColor, a * 0.2));
        g.addColorStop(1, hexToRgba(settings.blushColor, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, rEff, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    if (settings.browA > 0) {
      ctx.filter = `blur(${Math.max(1, faceW * 0.01)}px)`;
      ctx.fillStyle = hexToRgba(settings.browColor, settings.browA * 0.5);
      const bw = settings.browW;
      for (const brow of [BROW_L, BROW_R]) {
        let pts = brow.map((i) => [lm[i].x * W, lm[i].y * H]);

        // 太さ: 重心を基準に縦方向だけ伸縮
        let cy = 0;
        for (const p of pts) cy += p[1];
        cy /= pts.length;
        pts = pts.map(([x, y]) => [x, cy + (y - cy) * bw]);

        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // ---------- ストリーム加工 ----------

  function processStream(srcStream) {
    const videoTrack = srcStream.getVideoTracks()[0];
    if (!videoTrack) return srcStream;

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([videoTrack]);
    video.play().catch(() => {});

    const glCanvas = document.createElement('canvas');
    const { gl, uniforms } = createGL(glCanvas);

    const outCanvas = document.createElement('canvas');
    const ctx = outCanvas.getContext('2d');

    let landmarker = null;
    let landmarkerRequested = false;
    let lastVideoTime = -1;
    let landmarks = null;

    let running = true;
    const render = () => {
      if (!running) return;
      if (video.readyState >= 2 && video.videoWidth > 0) {
        const W = video.videoWidth;
        const H = video.videoHeight;
        if (glCanvas.width !== W || glCanvas.height !== H) {
          glCanvas.width = W;
          glCanvas.height = H;
          outCanvas.width = W;
          outCanvas.height = H;
          gl.viewport(0, 0, W, H);
        }

        // 1) WebGL: 美肌・明るさ・血色・彩度
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        const on = settings.enabled;
        gl.uniform2f(uniforms.texel, 1 / W, 1 / H);
        gl.uniform1f(uniforms.smooth, on ? settings.smooth : 0);
        gl.uniform1f(uniforms.bright, on ? settings.bright : 0);
        gl.uniform1f(uniforms.warmth, on ? settings.warmth : 0);
        gl.uniform1f(uniforms.sat, on ? settings.sat : 1);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        ctx.drawImage(glCanvas, 0, 0);

        // 2) メイク: いずれかの濃さ > 0 のときだけ顔検出を回す（不要時は負荷ゼロ）
        const makeupOn = on && (settings.lipA > 0 || settings.blushA > 0 || settings.browA > 0);
        if (makeupOn && !landmarkerRequested && settings.__base) {
          landmarkerRequested = true;
          getLandmarker().then((l) => { landmarker = l; });
        }
        if (makeupOn && landmarker) {
          if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            try {
              const res = landmarker.detectForVideo(video, performance.now());
              landmarks = res.faceLandmarks && res.faceLandmarks[0] ? res.faceLandmarks[0] : null;
            } catch (e) {
              landmarks = null;
            }
          }
          if (landmarks) drawMakeup(ctx, landmarks, W, H);
        }
      }
      if (video.requestVideoFrameCallback) {
        video.requestVideoFrameCallback(render);
      } else {
        requestAnimationFrame(render);
      }
    };
    render();

    const fps = videoTrack.getSettings().frameRate || 30;
    const outStream = outCanvas.captureStream(fps);
    srcStream.getAudioTracks().forEach((t) => outStream.addTrack(t));

    // Meet 側が出力トラックを stop したら元カメラも止める（カメラランプ消灯のため）
    const outTrack = outStream.getVideoTracks()[0];
    const origStop = outTrack.stop.bind(outTrack);
    outTrack.stop = () => {
      running = false;
      videoTrack.stop();
      origStop();
    };
    videoTrack.addEventListener('ended', () => {
      running = false;
      outTrack.stop();
    });

    return outStream;
  }

  const origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    const stream = await origGUM(constraints);
    if (!constraints || !constraints.video) return stream;
    try {
      return processStream(stream);
    } catch (e) {
      console.warn('[Meet Beauty Filter] フィルター適用失敗、素の映像を使用:', e);
      return stream;
    }
  };
})();
