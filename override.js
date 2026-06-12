// MAIN world で動く。Meet が呼ぶ getUserMedia を横取りして
// WebGL で加工した映像ストリームを返す。映像は一切外部に送らない。
// メイク（リップ・チーク・眉）は MediaPipe Face Mesh（拡張内に同梱、ローカル実行）で追従する。
(() => {
  'use strict';

  // 設定値は bridge.js の初回送信（storage の全量）で届く。
  // MAIN world への複数ファイル注入は環境により defaults.js が落ちることが確認されたため、
  // このファイルは defaults.js に依存しない（manifest の MAIN world エントリにも含めない）
  const settings = { __base: null };

  window.addEventListener('mbf-settings', (e) => {
    try {
      const s = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
      if (!s || typeof s !== 'object') return;
      // __base（MediaPipe の読み込み元）はスクリプト読み込みに直結するため特別扱い:
      // 拡張オリジンの形式のみ許可し、一度設定されたら以降の上書きを拒否する。
      // MAIN world のイベントはページ上の他スクリプトからも偽装発火できるため
      if (typeof s.__base === 'string' && settings.__base === null &&
          /^chrome-extension:\/\/[a-p]{32}\/$/.test(s.__base)) {
        settings.__base = s.__base;
      }
      delete s.__base;
      // 既知の設定キーだけ受け入れる（偽装イベントによる未知キー注入の遮断）。
      // defaults.js が読めていない環境ではリストが作れないため、全キー受け入れに
      // フォールバックする（遮断は防御の上乗せであり、必須機能を壊してはいけない）
      const known = globalThis.MBF_DEFAULTS;
      for (const k of Object.keys(s)) {
        if (!known || k in known) settings[k] = s[k];
      }
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
uniform float uLipThresh;
uniform float uSkinRange;

// YCbCr 色空間での肌色判定。肌なら1、それ以外（目・髪・服・背景）なら0に滑らかに落ちる。
// uSkinRange で許容窓の広さを、uLipThresh で唇（強い赤み）の除外位置を調整できる
float skinMask(vec3 rgb) {
  float cb = -0.169 * rgb.r - 0.331 * rgb.g + 0.5 * rgb.b + 0.5;
  float cr = 0.5 * rgb.r - 0.419 * rgb.g - 0.081 * rgb.b + 0.5;
  float hwB = 0.105 * uSkinRange; // cb 窓の半幅（中心 0.40）
  float hwR = 0.09 * uSkinRange;  // cr 窓の半幅（中心 0.615）
  float mb = smoothstep(0.40 - hwB - 0.025, 0.40 - hwB + 0.025, cb)
           * (1.0 - smoothstep(0.40 + hwB - 0.025, 0.40 + hwB + 0.025, cb));
  float mr = smoothstep(0.615 - hwR - 0.025, 0.615 - hwR + 0.025, cr)
           * (1.0 - smoothstep(0.615 + hwR - 0.025, 0.615 + hwR + 0.025, cr));
  // 唇除外: 肌より赤みが強い画素はマスクから外してシャープに保つ
  float lip = smoothstep(uLipThresh, uLipThresh + 0.04, cr);
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
        sat: gl.getUniformLocation(prog, 'uSat'),
        lipThresh: gl.getUniformLocation(prog, 'uLipThresh'),
        skinRange: gl.getUniformLocation(prog, 'uSkinRange')
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
      // MediaPipe のログだけに厳密マッチさせる（Meet 本来のログを巻き込まないように）:
      // 例 "W0612 17:24:13.735000 1880752 face_landmarker_graph.cc:180] ..." / "INFO: Created TensorFlow ..."
      const isMediapipeLog = (a) =>
        typeof a === 'string' &&
        (/^[WIEF]\d{4} \d{2}:\d{2}:\d{2}\.\d+\s+\d+\s+\S+\.(cc|h):\d+\]/.test(a) || /^INFO: /.test(a));
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
  // 上まぶたの際（目尻→目頭の順）
  const EYE_TOP_L = [33, 246, 161, 160, 159, 158, 157, 173, 133];
  const EYE_TOP_R = [263, 466, 388, 387, 386, 385, 384, 398, 362];
  // 下まぶたの際
  const EYE_BOT_L = [33, 7, 163, 144, 145, 153, 154, 155, 133];
  const EYE_BOT_R = [263, 249, 390, 373, 374, 380, 381, 382, 362];
  const CHEEK_L = 205;
  const CHEEK_R = 425;
  // 鼻筋の付け根（眉頭の下あたり）
  const NOSE_TOP_L = 193;
  const NOSE_TOP_R = 417;
  // フェイスライン（耳下→顎へ）
  const JAW_L = [93, 132, 58, 172, 136, 150, 149, 176, 148];
  const JAW_R = [323, 361, 288, 397, 365, 379, 378, 400, 377];
  const ALA_L = 49;    // 左小鼻の外側
  const ALA_R = 279;   // 右小鼻の外側
  const MOUTH_L = 61;  // 左口角
  const MOUTH_R = 291; // 右口角
  const NOSE_TIP = 1;
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

  // ほうれい線消し: 小鼻→口角のラインに沿った楕円領域だけ、強くぼかした画像を
  // ソフトマスク付きで上書きする。領域外は一切触らないので全体のシャープさは保たれる
  function drawNasoFix(ctx, srcCanvas, patch, mask, lm, W, H) {
    const raw = settings.nasoA;
    if (raw <= 0) return;
    // 1.0 までは不透明度、それ以上はぼかしの強さとパッチの太さを増やして消す力を上げる
    const a = Math.min(1, raw);
    const boost = Math.max(1, raw);

    const faceW = Math.hypot(
      (lm[FACE_RIGHT].x - lm[FACE_LEFT].x) * W,
      (lm[FACE_RIGHT].y - lm[FACE_LEFT].y) * H
    );
    const mctx = mask.getContext('2d');
    mctx.clearRect(0, 0, W, H);

    for (const [alaI, mouthI] of [[ALA_L, MOUTH_L], [ALA_R, MOUTH_R]]) {
      const ax = lm[alaI].x * W, ay = lm[alaI].y * H;
      const mx = lm[mouthI].x * W, my = lm[mouthI].y * H;
      const len = Math.hypot(mx - ax, my - ay);
      const angle = Math.atan2(my - ay, mx - ax);
      // 中点を鼻先と反対方向（頬側）へ少し逃がす＝実際の溝の位置に寄せる
      let px = -(my - ay) / len, py = (mx - ax) / len;
      const nx = lm[NOSE_TIP].x * W, ny = lm[NOSE_TIP].y * H;
      let cx = (ax + mx) / 2, cy = (ay + my) / 2;
      if ((cx + px - nx) ** 2 + (cy + py - ny) ** 2 < (cx - px - nx) ** 2 + (cy - py - ny) ** 2) {
        px = -px; py = -py;
      }
      cx += px * faceW * 0.02;
      cy += py * faceW * 0.02;

      mctx.save();
      mctx.translate(cx, cy);
      mctx.rotate(angle);
      const ry = faceW * 0.05 * boost; // boost でパッチの太さも広がる
      mctx.scale((len * 0.7) / ry, 1); // 溝に沿った細長い楕円
      const g = mctx.createRadialGradient(0, 0, 0, 0, 0, ry);
      g.addColorStop(0, `rgba(0,0,0,${a})`);
      g.addColorStop(0.7, `rgba(0,0,0,${a * 0.6})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      mctx.fillStyle = g;
      mctx.beginPath();
      mctx.arc(0, 0, ry, 0, Math.PI * 2);
      mctx.fill();
      mctx.restore();
    }

    const pctx = patch.getContext('2d');
    pctx.clearRect(0, 0, W, H);
    pctx.filter = `blur(${Math.max(2, faceW * 0.02 * boost)}px)`;
    pctx.drawImage(srcCanvas, 0, 0);
    pctx.filter = 'none';
    pctx.globalCompositeOperation = 'destination-in';
    pctx.drawImage(mask, 0, 0);
    pctx.globalCompositeOperation = 'source-over';

    ctx.drawImage(patch, 0, 0);
  }

  // クマ・目の下の線消し: 下まぶたの少し下の楕円領域に、ぼかし + 明るさを少し
  // 持ち上げたパッチを貼る（コンシーラー相当）。目自体には掛からないよう下げて配置
  function drawEyebagFix(ctx, srcCanvas, patch, mask, lm, W, H) {
    const line = settings.eyebagLine;
    const bright = settings.eyebagBright;
    if (line <= 0 && bright <= 0) return;
    // パッチの不透明度は2機能のうち強い方に合わせる
    const a = Math.min(1, Math.max(line, bright));
    const boost = Math.max(1, line);

    const faceW = Math.hypot(
      (lm[FACE_RIGHT].x - lm[FACE_LEFT].x) * W,
      (lm[FACE_RIGHT].y - lm[FACE_LEFT].y) * H
    );
    const roll = Math.atan2(
      (lm[FACE_RIGHT].y - lm[FACE_LEFT].y) * H,
      (lm[FACE_RIGHT].x - lm[FACE_LEFT].x) * W
    );
    const downX = -Math.sin(roll), downY = Math.cos(roll);

    const mctx = mask.getContext('2d');
    mctx.clearRect(0, 0, W, H);

    for (const eye of [EYE_BOT_L, EYE_BOT_R]) {
      const p = eye.map((i) => [lm[i].x * W, lm[i].y * H]);
      let cx = 0, cy = 0;
      for (const q of p) { cx += q[0]; cy += q[1]; }
      cx /= p.length; cy /= p.length;
      const eyeW = Math.hypot(p[p.length - 1][0] - p[0][0], p[p.length - 1][1] - p[0][1]);
      // 目の真下に少し下げて配置（目にパッチが掛かるとぼやけた目になるため）
      cx += downX * faceW * 0.055;
      cy += downY * faceW * 0.055;

      const ry = faceW * 0.035 * boost;
      mctx.save();
      mctx.translate(cx, cy);
      mctx.rotate(roll);
      mctx.scale((eyeW * 0.65) / ry, 1);
      const g = mctx.createRadialGradient(0, 0, 0, 0, 0, ry);
      g.addColorStop(0, `rgba(0,0,0,${a})`);
      g.addColorStop(0.7, `rgba(0,0,0,${a * 0.6})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      mctx.fillStyle = g;
      mctx.beginPath();
      mctx.arc(0, 0, ry, 0, Math.PI * 2);
      mctx.fill();
      mctx.restore();
    }

    const pctx = patch.getContext('2d');
    pctx.clearRect(0, 0, W, H);
    // ぼかしで線を消し、brightness でクマの暗さを持ち上げる（それぞれ独立に効く）
    const blurPx = line > 0 ? Math.max(2, faceW * 0.015 * boost) : 0;
    pctx.filter = `blur(${blurPx}px) brightness(${1 + 0.16 * bright})`;
    pctx.drawImage(srcCanvas, 0, 0);
    pctx.filter = 'none';
    pctx.globalCompositeOperation = 'destination-in';
    pctx.drawImage(mask, 0, 0);
    pctx.globalCompositeOperation = 'source-over';

    ctx.drawImage(patch, 0, 0);
  }

  function drawMakeup(ctx, lm, W, H) {
    const faceW = Math.hypot(
      (lm[FACE_RIGHT].x - lm[FACE_LEFT].x) * W,
      (lm[FACE_RIGHT].y - lm[FACE_LEFT].y) * H
    );
    // 首をかしげても描画が顔のラインに沿うよう、顔の傾き（ロール角）を求める
    const roll = Math.atan2(
      (lm[FACE_RIGHT].y - lm[FACE_LEFT].y) * H,
      (lm[FACE_RIGHT].x - lm[FACE_LEFT].x) * W
    );
    // 顔基準の「上」方向ベクトル
    const upX = Math.sin(roll), upY = -Math.cos(roll);

    ctx.save();
    // multiply 合成 = 元の肌の陰影や唇の質感を残したまま色だけ重なる（口紅っぽい質感）
    ctx.globalCompositeOperation = 'multiply';

    // リップの輪郭: lipW > 1 なら唇の中心から外側へ拡大（オーバーリップ）
    let lipOuterPts = null;
    if (settings.lipA > 0 || settings.lipGloss > 0) {
      lipOuterPts = LIPS_OUTER.map((i) => [lm[i].x * W, lm[i].y * H]);
      if (settings.lipW !== 1) {
        let lcx = 0, lcy = 0;
        for (const p of lipOuterPts) { lcx += p[0]; lcy += p[1]; }
        lcx /= lipOuterPts.length; lcy /= lipOuterPts.length;
        // 口角を結ぶ向き（横）と直交方向（縦）に分解し、縦をメインに伸縮する。
        // 横は 1/4 だけ追従（完全固定だと口角の形が崩れるため）
        let mdx = (lm[MOUTH_R].x - lm[MOUTH_L].x) * W;
        let mdy = (lm[MOUTH_R].y - lm[MOUTH_L].y) * H;
        const ml = Math.hypot(mdx, mdy) || 1;
        mdx /= ml; mdy /= ml;
        const sV = settings.lipW;
        const sH = 1 + (settings.lipW - 1) * 0.25;
        lipOuterPts = lipOuterPts.map(([x, y]) => {
          const dx = x - lcx, dy = y - lcy;
          const h = dx * mdx + dy * mdy;   // 横成分
          const vx = dx - h * mdx, vy = dy - h * mdy; // 縦成分
          return [lcx + h * sH * mdx + vx * sV, lcy + h * sH * mdy + vy * sV];
        });
      }
    }
    const traceLip = () => {
      ctx.moveTo(lipOuterPts[0][0], lipOuterPts[0][1]);
      for (let k = 1; k < lipOuterPts.length; k++) ctx.lineTo(lipOuterPts[k][0], lipOuterPts[k][1]);
      ctx.closePath();
      tracePath(ctx, lm, LIPS_INNER, W, H);
    };

    if (settings.lipA > 0) {
      ctx.filter = `blur(${Math.max(1, faceW * 0.008)}px)`;
      ctx.fillStyle = hexToRgba(settings.lipColor, settings.lipA * 0.7);
      ctx.beginPath();
      traceLip();
      ctx.fill('evenodd'); // 内側ループをくり抜く＝歯に色が乗らない
    }

    if (settings.lipGloss > 0) {
      // ツヤ: 唇の領域にクリップした上で、下唇の中央に screen 合成の光を置く。
      // クリップしているので光が唇からはみ出さない
      ctx.save();
      ctx.beginPath();
      traceLip();
      ctx.clip('evenodd');
      ctx.globalCompositeOperation = 'screen';
      ctx.filter = `blur(${Math.max(1, faceW * 0.006)}px)`;
      // 下唇の中央（外側の底 17 と内側の底 14 の中間）
      const cx4 = ((lm[17].x + lm[14].x) / 2) * W;
      const cy4 = ((lm[17].y + lm[14].y) / 2) * H;
      // 口角を結ぶ向きに沿った横長の光
      const mAngle = Math.atan2(
        (lm[MOUTH_R].y - lm[MOUTH_L].y) * H,
        (lm[MOUTH_R].x - lm[MOUTH_L].x) * W
      );
      const mouthW = Math.hypot(
        (lm[MOUTH_R].x - lm[MOUTH_L].x) * W,
        (lm[MOUTH_R].y - lm[MOUTH_L].y) * H
      );
      const ry4 = faceW * 0.013;
      ctx.translate(cx4, cy4);
      ctx.rotate(mAngle);
      ctx.scale((mouthW * 0.3) / ry4, 1);
      const g4 = ctx.createRadialGradient(0, 0, 0, 0, 0, ry4);
      g4.addColorStop(0, `rgba(255,255,255,${settings.lipGloss * 0.55})`);
      g4.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g4;
      ctx.beginPath();
      ctx.arc(0, 0, ry4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.globalCompositeOperation = 'multiply'; // 後続のメイク描画用に戻す
    }

    if (settings.blushA > 0) {
      ctx.filter = 'none';
      const r = faceW * 0.13;
      const aspect = Math.max(1, settings.blushShape); // 横:縦 の比率
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

    if (settings.shadowA > 0) {
      // アイシャドウ: 上まぶたの際ラインを顔基準の上方向へ押し出した帯を塗る。
      // 際側が濃く上端へ向かって薄くなるよう、ぼかし + multiply で馴染ませる
      ctx.filter = `blur(${Math.max(2, faceW * 0.015 * settings.shadowSoft)}px)`;
      const lift = faceW * 0.055 * settings.shadowH;
      const dirX = Math.cos(roll), dirY = Math.sin(roll); // 顔基準の「横」方向
      const widen = settings.shadowW - 1;
      for (const eye of [EYE_TOP_L, EYE_TOP_R]) {
        let lid = eye.map((i) => [lm[i].x * W, lm[i].y * H]);
        // 幅: 目の中心を基準に、顔の横方向にだけ伸縮（高さは変えない）
        if (widen !== 0) {
          let cx = 0, cy = 0;
          for (const p of lid) { cx += p[0]; cy += p[1]; }
          cx /= lid.length; cy /= lid.length;
          lid = lid.map(([x, y]) => {
            const d = (x - cx) * dirX + (y - cy) * dirY;
            return [x + dirX * d * widen, y + dirY * d * widen];
          });
        }
        // グラデーション: 際 → (中間) → (上)。オフの色は飛ばして使う色だけ等間隔に並べる。
        // 1色のときは同じ色が上に向かって薄く抜ける
        let gx = 0, gy = 0;
        for (const p of lid) { gx += p[0]; gy += p[1]; }
        gx /= lid.length; gy /= lid.length;
        const a = settings.shadowA;
        const colors = [settings.shadowColor];
        if (settings.shadowUse2) colors.push(settings.shadowColor2);
        if (settings.shadowUse3) colors.push(settings.shadowColor3);
        const g = ctx.createLinearGradient(gx, gy, gx + upX * lift, gy + upY * lift);
        // 際色を plateau の高さまでベタで保ち、そこから上をグラデーションにする
        const plateau = 1 - 1 / Math.max(1, settings.shadowBias);
        if (colors.length === 1) {
          g.addColorStop(0, hexToRgba(colors[0], a * 0.5));
          g.addColorStop(plateau, hexToRgba(colors[0], a * 0.5));
          g.addColorStop(1, hexToRgba(colors[0], a * 0.1));
        } else {
          g.addColorStop(0, hexToRgba(colors[0], a * 0.5));
          colors.forEach((c, i) => {
            const t = i / (colors.length - 1);
            g.addColorStop(plateau + t * (1 - plateau), hexToRgba(c, a * (0.5 - 0.25 * t)));
          });
        }
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(lid[0][0], lid[0][1]);
        for (let k = 1; k < lid.length; k++) ctx.lineTo(lid[k][0], lid[k][1]);
        // 上方向へ押し出した辺を逆順でたどって閉じる（目尻・目頭側は少し狭める）
        for (let k = lid.length - 1; k >= 0; k--) {
          const edge = k === 0 || k === lid.length - 1 ? 0.4 : 1;
          ctx.lineTo(lid[k][0] + upX * lift * edge, lid[k][1] + upY * lift * edge);
        }
        ctx.closePath();
        ctx.fill();
      }
    }

    if (settings.linerA > 0) {
      // アイライン: 上まつげの際に沿った線。目尻側をわずかに太くする
      ctx.filter = `blur(${Math.max(0.5, faceW * 0.002)}px)`;
      ctx.strokeStyle = hexToRgba(settings.linerColor, settings.linerA * 0.85);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const lw = Math.max(0.8, faceW * 0.008 * settings.linerW);
      ctx.lineWidth = lw;
      for (const eye of [EYE_TOP_L, EYE_TOP_R]) {
        // [0] が目尻、末尾が目頭。上下位置はスライダーで調整可能（目・メガネによりズレるため）
        const off = faceW * (settings.linerY ?? 0.002);
        const pts = eye.map((i) => [lm[i].x * W + upX * off, lm[i].y * H + upY * off]);
        // round cap は端点から線幅の半分はみ出すため、目頭側の終点を
        // ひとつ手前の点の方向へ半幅ぶん引っ込めて、丸い端がちょうど目頭で止まるようにする
        const last = pts[pts.length - 1], prev = pts[pts.length - 2];
        let bx = prev[0] - last[0], by = prev[1] - last[1];
        const bl = Math.hypot(bx, by) || 1;
        const back = Math.min(bl, lw * 0.6);
        last[0] += (bx / bl) * back;
        last[1] += (by / bl) * back;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
        ctx.stroke();

        // 目尻の跳ね上げ: 目頭→目尻の向きを基準に、指定角度だけ上へ振った
        // 先細りの三角形を描き足す
        if (settings.linerWing > 0) {
          const ox = lm[eye[0]].x * W, oy = lm[eye[0]].y * H;          // 目尻
          const ix = lm[eye[eye.length - 1]].x * W, iy = lm[eye[eye.length - 1]].y * H; // 目頭
          let dx = ox - ix, dy = oy - iy;
          const dl = Math.hypot(dx, dy) || 1;
          dx /= dl; dy /= dl;
          // 上方向（upX, upY）へ linerWingUp 度ぶん回転
          const rad = (settings.linerWingUp * Math.PI) / 180;
          const wx = dx * Math.cos(rad) + upX * Math.sin(rad);
          const wy = dy * Math.cos(rad) + upY * Math.sin(rad);
          const len = faceW * 0.06 * settings.linerWing;
          ctx.fillStyle = hexToRgba(settings.linerColor, settings.linerA * 0.85);
          ctx.beginPath();
          // 根元は ライン幅 × linerWingW、先端は点＝自然な先細り
          const hw = lw * 0.6 * settings.linerWingW;
          ctx.moveTo(ox - upX * hw, oy - upY * hw);
          ctx.lineTo(ox + upX * hw, oy + upY * hw);
          ctx.lineTo(ox + wx * len, oy + wy * len);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    if (settings.noseA > 0) {
      // ノーズシャドウ: 鼻筋の付け根→小鼻のラインに沿った細長い影を左右に落とす
      ctx.filter = `blur(${Math.max(1, faceW * 0.012 * settings.noseSoft)}px)`;
      // 内側寄せ: 上端は鼻筋の付け根（眉間側）、下端は鼻先へ向けて寄せる
      const bx = lm[168].x * W, by = lm[168].y * H; // 眉間（鼻筋の上端中心）
      const tipX = lm[NOSE_TIP].x * W, tipY = lm[NOSE_TIP].y * H;
      const inn = settings.noseIn;
      for (const [topI, alaI] of [[NOSE_TOP_L, ALA_L], [NOSE_TOP_R, ALA_R]]) {
        const tx2 = lm[topI].x * W + (bx - lm[topI].x * W) * inn;
        const ty2 = lm[topI].y * H + (by - lm[topI].y * H) * inn;
        const ax = lm[alaI].x * W + (tipX - lm[alaI].x * W) * inn;
        const ay = lm[alaI].y * H + (tipY - lm[alaI].y * H) * inn;
        const len = Math.hypot(ax - tx2, ay - ty2);
        const angle = Math.atan2(ay - ty2, ax - tx2);
        const cx2 = (tx2 + ax) / 2, cy2 = (ty2 + ay) / 2;
        const ry = faceW * 0.018 * settings.noseW;
        ctx.save();
        ctx.translate(cx2, cy2);
        ctx.rotate(angle);
        ctx.scale((len * 0.55) / ry, 1);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
        g.addColorStop(0, hexToRgba(settings.shadeColor, settings.noseA * 0.3));
        g.addColorStop(1, hexToRgba(settings.shadeColor, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, ry, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    if (settings.jawA > 0) {
      // 輪郭シェーディング: フェイスラインを少し内側へオフセットした帯に影を落として
      // 輪郭をシャープに見せる。強くぼかして「影」として馴染ませる
      ctx.filter = `blur(${Math.max(2, faceW * 0.025 * settings.jawSoft)}px)`;
      ctx.strokeStyle = hexToRgba(settings.shadeColor, settings.jawA * 0.3);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = faceW * 0.05;
      const nx2 = lm[NOSE_TIP].x * W, ny2 = lm[NOSE_TIP].y * H;
      for (const jaw of [JAW_L, JAW_R]) {
        ctx.beginPath();
        jaw.forEach((i, k) => {
          // 鼻先方向（顔の内側）へ少し寄せる＝帯が背景にはみ出さない
          let x = lm[i].x * W, y = lm[i].y * H;
          const dx2 = nx2 - x, dy2 = ny2 - y;
          const dl2 = Math.hypot(dx2, dy2) || 1;
          x += (dx2 / dl2) * faceW * 0.03;
          y += (dy2 / dl2) * faceW * 0.03;
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
    }

    if (settings.hiA > 0 || settings.hiCheekA > 0 || settings.hiChinA > 0) {
      // ハイライト: 顔の高い位置に明るさを乗せる（screen 合成）。
      // multiply とは逆に「光が当たってる」見え方になる
      ctx.globalCompositeOperation = 'screen';

      // 回転楕円のグラデーションを置くヘルパー（cx,cy 中心、angle 回転、rx×ry、alpha、soft=ぼかし係数）
      const glow = (cx3, cy3, angle, rx, ry, alpha, soft) => {
        ctx.filter = `blur(${Math.max(1, faceW * 0.01 * soft)}px)`;
        ctx.save();
        ctx.translate(cx3, cy3);
        ctx.rotate(angle);
        ctx.scale(rx / ry, 1);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
        g.addColorStop(0, hexToRgba(settings.hiColor, alpha));
        g.addColorStop(1, hexToRgba(settings.hiColor, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, ry, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };

      if (settings.hiA > 0) {
        // 鼻筋: 眉間→鼻先の中心線
        const tx3 = lm[168].x * W, ty3 = lm[168].y * H;
        const nx3 = lm[NOSE_TIP].x * W, ny3 = lm[NOSE_TIP].y * H;
        const len = Math.hypot(nx3 - tx3, ny3 - ty3);
        glow(
          (tx3 + nx3) / 2, (ty3 + ny3) / 2,
          Math.atan2(ny3 - ty3, nx3 - tx3),
          len * 0.55, faceW * 0.012 * settings.hiW,
          settings.hiA * 0.4, settings.hiSoft
        );
      }

      if (settings.hiCheekA > 0) {
        // 頬骨の上（Cゾーン）: 目尻の下の高い位置に、頬骨に沿った楕円。
        // 横位置は左右対称（プラスで両方とも外側へ）、縦位置は顔の傾きに追従
        const rightX = Math.cos(roll), rightY = Math.sin(roll);
        const noseX2 = lm[NOSE_TIP].x * W, noseY2 = lm[NOSE_TIP].y * H;
        for (const idx of [117, 346]) {
          let x = lm[idx].x * W, y = lm[idx].y * H;
          // 外向きの符号: 鼻先から見てこの頬がどちら側かで決める
          const side = Math.sign((x - noseX2) * rightX + (y - noseY2) * rightY) || 1;
          x += (rightX * side * settings.hiCheekX + upX * settings.hiCheekY) * faceW;
          y += (rightY * side * settings.hiCheekX + upY * settings.hiCheekY) * faceW;
          glow(
            x, y,
            roll,
            faceW * 0.09 * settings.hiCheekW, faceW * 0.035 * settings.hiCheekW,
            settings.hiCheekA * 0.35, settings.hiCheekSoft
          );
        }
      }

      if (settings.hiChinA > 0) {
        // 顎先: 顎の先端から少し上に丸く
        const chinX = lm[152].x * W + upX * faceW * (0.035 + settings.hiChinY);
        const chinY = lm[152].y * H + upY * faceW * (0.035 + settings.hiChinY);
        glow(chinX, chinY, roll,
          faceW * 0.05 * settings.hiChinW, faceW * 0.035 * settings.hiChinW,
          settings.hiChinA * 0.35, settings.hiChinSoft);
      }

      ctx.globalCompositeOperation = 'multiply'; // 後続のメイク描画用に戻す
    }

    if (settings.browA > 0) {
      ctx.filter = `blur(${Math.max(1, faceW * 0.01)}px)`;
      ctx.fillStyle = hexToRgba(settings.browColor, settings.browA * 0.5);
      const bw = settings.browW;
      const taper = settings.browTaper;
      const noseX3 = lm[NOSE_TIP].x * W, noseY3 = lm[NOSE_TIP].y * H;
      for (const brow of [BROW_L, BROW_R]) {
        let pts = brow.map((i) => [lm[i].x * W, lm[i].y * H]);

        // 鼻からの距離で眉頭（近）→眉尻（遠）の進行度を点ごとに出す
        const ds = pts.map(([x, y]) => Math.hypot(x - noseX3, y - noseY3));
        const dmin = Math.min(...ds), dmax = Math.max(...ds);

        // 太さ: 重心を基準に縦方向だけ伸縮。眉尻に向かって taper 分だけ絞る
        let cy = 0;
        for (const p of pts) cy += p[1];
        cy /= pts.length;
        pts = pts.map(([x, y], i) => {
          const t = (ds[i] - dmin) / (dmax - dmin || 1);
          const s = bw * (1 - 0.85 * taper * t);
          let px = x, py = cy + (y - cy) * s;
          // アーチ: 山の位置（browPeak）を中心とした釣鐘カーブで上下にずらす
          if (settings.browArch !== 0) {
            const bell = Math.exp(-((t - settings.browPeak) ** 2) / 0.06);
            const lift = faceW * 0.05 * settings.browArch * bell;
            px += upX * lift;
            py += upY * lift;
          }
          // 眉尻の高さ: 眉尻に近いほど強く上下にずらす（t^2 で眉頭側は動かない）
          if (settings.browTail !== 0) {
            const lift = faceW * 0.06 * settings.browTail * t * t;
            px += upX * lift;
            py += upY * lift;
          }
          return [px, py];
        });

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

  // 直近の加工パイプラインの破棄関数。Meet はカメラ切替・再入室などで
  // getUserMedia を何度も呼ぶため、新しいパイプラインを作る前に古い方を
  // 確実に止めないと描画ループと WebGL コンテキストが溜まり続ける
  let disposeActive = null;

  function processStream(srcStream) {
    const videoTrack = srcStream.getVideoTracks()[0];
    if (!videoTrack) return srcStream;

    if (disposeActive) disposeActive();

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([videoTrack]);

    const glCanvas = document.createElement('canvas');
    // GL コンテキストは復元時に作り直すため再代入可能にしておく
    let GLS = createGL(glCanvas);
    glCanvas.addEventListener('webglcontextlost', (e) => {
      // preventDefault しないと restored イベントが来ない（=永遠に真っ黒）
      e.preventDefault();
    });
    glCanvas.addEventListener('webglcontextrestored', () => {
      // dispose 由来の lost→restored で死んだパイプラインに新コンテキストを作らない
      if (!running) return;
      try {
        GLS = createGL(glCanvas);
        GLS.gl.viewport(0, 0, glCanvas.width || 1, glCanvas.height || 1);
      } catch (e) {
        console.warn('[Meet Beauty Filter] WebGL 復元に失敗:', e);
      }
    });

    const outCanvas = document.createElement('canvas');
    const ctx = outCanvas.getContext('2d');
    const patchCanvas = document.createElement('canvas'); // ほうれい線消し用の作業バッファ
    const maskCanvas = document.createElement('canvas');

    let landmarker = null;
    let landmarkerRequested = false;
    let lastVideoTime = -1;
    let landmarks = null;

    let running = true;

    // play() はまれに失敗する（autoplay 制限等）。失敗すると映像が一切流れないため
    // 数回リトライし、それでもダメなら警告を残す
    const tryPlay = (attempt = 0) => {
      video.play().catch(() => {
        if (!running) return;
        if (attempt < 3) {
          setTimeout(() => tryPlay(attempt + 1), 300);
        } else {
          console.warn('[Meet Beauty Filter] video.play() に失敗。映像が表示されない場合はページを再読み込みしてください');
        }
      });
    };
    tryPlay();

    const render = () => {
      if (!running) return;
      const { gl, uniforms } = GLS;
      if (video.readyState >= 2 && video.videoWidth > 0) {
        const W = video.videoWidth;
        const H = video.videoHeight;
        if (glCanvas.width !== W || glCanvas.height !== H) {
          glCanvas.width = W;
          glCanvas.height = H;
          outCanvas.width = W;
          outCanvas.height = H;
          patchCanvas.width = W;
          patchCanvas.height = H;
          maskCanvas.width = W;
          maskCanvas.height = H;
          gl.viewport(0, 0, W, H);
        }

        // 1) WebGL: 美肌・明るさ・血色・彩度
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        // ?? は bridge の初回送信が届く前の一瞬のフォールバック（素通し相当の値）
        const on = settings.enabled ?? true;
        gl.uniform2f(uniforms.texel, 1 / W, 1 / H);
        gl.uniform1f(uniforms.smooth, on ? (settings.smooth ?? 0) : 0);
        gl.uniform1f(uniforms.bright, on ? (settings.bright ?? 0) : 0);
        gl.uniform1f(uniforms.warmth, on ? (settings.warmth ?? 0) : 0);
        gl.uniform1f(uniforms.sat, on ? (settings.sat ?? 1) : 1);
        gl.uniform1f(uniforms.lipThresh, settings.lipThresh ?? 0.575);
        gl.uniform1f(uniforms.skinRange, settings.skinRange ?? 1);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        ctx.drawImage(glCanvas, 0, 0);

        // 2) メイク・ほうれい線消し: いずれかが有効なときだけ顔検出を回す（不要時は負荷ゼロ）
        const makeupOn = on &&
          (settings.lipA > 0 || settings.lipGloss > 0 || settings.blushA > 0 || settings.browA > 0 ||
           settings.nasoA > 0 || settings.eyebagLine > 0 || settings.eyebagBright > 0 ||
           settings.shadowA > 0 || settings.linerA > 0 ||
           settings.noseA > 0 || settings.jawA > 0 ||
           settings.hiA > 0 || settings.hiCheekA > 0 || settings.hiChinA > 0);
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
          if (landmarks) {
            drawNasoFix(ctx, glCanvas, patchCanvas, maskCanvas, landmarks, W, H);
            drawEyebagFix(ctx, glCanvas, patchCanvas, maskCanvas, landmarks, W, H);
            drawMakeup(ctx, landmarks, W, H);
          }
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

    // パイプライン一式の破棄: 描画ループ停止・video解放・WebGLコンテキスト返却
    const dispose = () => {
      if (!running) return;
      running = false;
      video.srcObject = null;
      const lose = GLS.gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      if (disposeActive === dispose) disposeActive = null;
    };
    disposeActive = dispose;

    // Meet 側が出力トラックを stop したら元カメラも止める（カメラランプ消灯のため）
    const outTrack = outStream.getVideoTracks()[0];
    const origStop = outTrack.stop.bind(outTrack);
    outTrack.stop = () => {
      dispose();
      videoTrack.stop();
      origStop();
    };
    videoTrack.addEventListener('ended', () => {
      dispose();
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
