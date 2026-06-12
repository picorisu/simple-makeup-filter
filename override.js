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
    nasoA: 0,      // ほうれい線消し 0-2（0で無効。顔検出を使用。1超でぼかし・範囲も強化）
    lipThresh: 0.575, // 唇除外しきい値（Cr）。下げるほど赤みの弱い唇も除外される
    skinRange: 1.0,   // 肌色判定の広さ。肌のトーンが判定から外れる人は上げる
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
    shadowColor: '#9e5a73',  // 際（いちばん濃い色）
    shadowColor2: '#c98da1', // 中間
    shadowColor3: '#e8c9c4', // 上（ハイライト寄り）
    shadowUse2: true, // 中間色を使うか
    shadowUse3: true, // 上色を使うか
    shadowA: 0,      // アイシャドウ濃さ 0-1
    shadowH: 1.0,    // アイシャドウ高さ 0.5-2.0
    shadowW: 1.0,    // アイシャドウ幅 0.8-1.4
    shadowSoft: 1.0, // アイシャドウぼかし 0.5-3.0
    shadowBias: 1.0, // 際色の量 1.0=均等 〜 3.0=際色を高さの2/3まで引っ張る
    linerColor: '#2b1d1a',
    linerA: 0,     // アイライン濃さ 0-1
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
  // 上まぶたの際（目尻→目頭の順）
  const EYE_TOP_L = [33, 246, 161, 160, 159, 158, 157, 173, 133];
  const EYE_TOP_R = [263, 466, 388, 387, 386, 385, 384, 398, 362];
  const CHEEK_L = 205;
  const CHEEK_R = 425;
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
      ctx.lineWidth = Math.max(1, faceW * 0.008);
      for (const eye of [EYE_TOP_L, EYE_TOP_R]) {
        ctx.beginPath();
        // [0] が目尻。まぶたの際よりほんの少し上をなぞる
        const off = faceW * 0.002;
        ctx.moveTo(lm[eye[0]].x * W + upX * off, lm[eye[0]].y * H + upY * off);
        for (let k = 1; k < eye.length; k++) {
          ctx.lineTo(lm[eye[k]].x * W + upX * off, lm[eye[k]].y * H + upY * off);
        }
        ctx.stroke();
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
    const patchCanvas = document.createElement('canvas'); // ほうれい線消し用の作業バッファ
    const maskCanvas = document.createElement('canvas');

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
          patchCanvas.width = W;
          patchCanvas.height = H;
          maskCanvas.width = W;
          maskCanvas.height = H;
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
        gl.uniform1f(uniforms.lipThresh, settings.lipThresh);
        gl.uniform1f(uniforms.skinRange, settings.skinRange);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        ctx.drawImage(glCanvas, 0, 0);

        // 2) メイク・ほうれい線消し: いずれかが有効なときだけ顔検出を回す（不要時は負荷ゼロ）
        const makeupOn = on &&
          (settings.lipA > 0 || settings.blushA > 0 || settings.browA > 0 ||
           settings.nasoA > 0 || settings.shadowA > 0 || settings.linerA > 0);
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
