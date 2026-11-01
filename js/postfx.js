// Flou de mouvement radial (« zoom blur ») pour l'écran (ordinateur, téléphone).
// - centré sur le point de fuite (direction du déplacement), net au centre, de plus en plus flou vers les bords ;
// - intensité proportionnelle à la vitesse ;
// - la profondeur sert de masque : le pod du joueur et le cockpit, qui se déplacent avec la caméra, restent nets,
//   et leurs pixels ne « bavent » pas sur le décor.
// Désactivé en VR (inconfort et coût d'une passe plein écran par œil).
import * as THREE from 'three';

const VERT = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = `
  #include <packing>
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 uCenter;
  uniform float uAmount;
  uniform float uAspect;
  uniform float uNear;
  uniform float uFar;
  uniform float uMaskNear;
  uniform float uMaskFar;
  uniform int uTaps;
  varying vec2 vUv;
  float viewDist(vec2 uv) {
    return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar);
  }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec4 base = texture2D(tColor, vUv);
    vec2 dir = vUv - uCenter;
    float r = length(dir * vec2(uAspect, 1.0));
    float d0 = viewDist(vUv);
    float k = uAmount * smoothstep(0.06, 0.75, r) * smoothstep(uMaskNear, uMaskFar, d0);
    vec4 acc = base;
    float wsum = 1.0;
    if (k > 0.0004) {
      float jit = hash(gl_FragCoord.xy);
      for (int i = 1; i <= 12; i++) {
        if (i > uTaps) break;
        float t = (float(i) - jit) / float(uTaps);
        vec2 uv = vUv - dir * k * t;
        // les échantillons qui tombent sur le pod (proche) ne comptent pas : pas de traînée du pod sur le décor
        float w = smoothstep(uMaskNear - 6.0, uMaskNear + 4.0, viewDist(uv));
        acc += texture2D(tColor, uv) * w;
        wsum += w;
      }
    }
    gl_FragColor = acc / wsum;
    #include <colorspace_fragment>
  }`;

export class MotionBlur {
  constructor(renderer) {
    this.renderer = renderer;
    const ext = renderer.extensions;
    const halfOk = ext.has('EXT_color_buffer_half_float') || ext.has('EXT_color_buffer_float');
    this.type = halfOk ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.samples = 4;
    this.taps = 10;
    this.rt = null;
    this.size = new THREE.Vector2();
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null }, tDepth: { value: null },
        uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uAmount: { value: 0 }, uAspect: { value: 1 },
        uNear: { value: 0.1 }, uFar: { value: 1000 }, uMaskNear: { value: 16 }, uMaskFar: { value: 40 },
        uTaps: { value: 10 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.center = new THREE.Vector2(0.5, 0.5);
    this._v = new THREE.Vector3();
  }

  // qualité : samples MSAA et nombre d'échantillons du flou
  setQuality(q) {
    const samples = q === 'basse' ? 0 : q === 'moyenne' ? 2 : 4;
    this.taps = q === 'basse' ? 6 : q === 'moyenne' ? 8 : 10;
    if (samples !== this.samples) {
      this.samples = samples;
      this.disposeTarget();
    }
  }

  disposeTarget() {
    if (this.rt) {
      this.rt.depthTexture.dispose();
      this.rt.dispose();
      this.rt = null;
    }
  }

  ensureTarget() {
    this.renderer.getDrawingBufferSize(this.size);
    const w = Math.max(1, Math.floor(this.size.x)), h = Math.max(1, Math.floor(this.size.y));
    if (this.rt && this.rt.width === w && this.rt.height === h) return;
    this.disposeTarget();
    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.UnsignedIntType;
    this.rt = new THREE.WebGLRenderTarget(w, h, {
      type: this.type,
      samples: this.samples,
      depthBuffer: true,
      depthTexture: depth,
    });
    this.rt.depthTexture = depth;
  }

  // Point de fuite : projection d'un point lointain dans la direction du déplacement.
  updateCenter(camera, vel, dt) {
    const v = this._v;
    camera.updateMatrixWorld();
    if (vel.lengthSq() < 1) v.set(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    else v.copy(vel).normalize();
    v.multiplyScalar(1500).add(camera.getWorldPosition(new THREE.Vector3()));
    v.project(camera);
    let x = 0.5, y = 0.5;
    if (v.z < 1 && Math.abs(v.x) < 3 && Math.abs(v.y) < 3) {
      x = Math.min(0.85, Math.max(0.15, v.x * 0.5 + 0.5));
      y = Math.min(0.85, Math.max(0.15, v.y * 0.5 + 0.5));
    }
    const a = 1 - Math.exp(-8 * dt);
    this.center.x += (x - this.center.x) * a;
    this.center.y += (y - this.center.y) * a;
  }

  // amount : étalement maximal (fraction de la distance au centre), maskNear/maskFar : distances nettes -> floues
  render(scene, camera, amount, maskNear, maskFar) {
    const r = this.renderer;
    this.ensureTarget();
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    r.setRenderTarget(null);
    const u = this.mat.uniforms;
    u.tColor.value = this.rt.texture;
    u.tDepth.value = this.rt.depthTexture;
    u.uCenter.value.copy(this.center);
    u.uAmount.value = amount;
    u.uAspect.value = this.size.x / this.size.y;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uMaskNear.value = maskNear;
    u.uMaskFar.value = maskFar;
    u.uTaps.value = this.taps;
    r.render(this.scene, this.cam);
  }
}
