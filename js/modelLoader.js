// js/modelLoader.js
// Full viewer that uses import map to resolve "three" to an ESM build.
// Load with: <script type="module" src="./js/modelLoader.js"></script>

import * as THREE from 'three';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/controls/OrbitControls.js';
import { OBJLoader } from 'https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/loaders/MTLLoader.js';
import { RoomEnvironment } from 'https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/environments/RoomEnvironment.js';
import * as BufferGeometryUtils from 'https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/utils/BufferGeometryUtils.js';

// -------------------- configuration & caches --------------------
const PBR_BASE = 'Metal048C_2K-JPG';
const PBR_FOLDER = './textures/';
const ROOT_MTL = './yang.mtl'; // set to '' to disable
const MTL_TEXTURE_PATH = '/textures/';
const CHARS_DIR = './chars/';

let rootMaterials = null;
const modelCache = {};

// -------------------- viewer globals --------------------
let viewerRenderer = null;
let viewerScene = null;
let viewerCamera = null;
let viewerControls = null;
let viewerCanvas = null;
let viewerContainer = null;
let viewerPMREM = null;
let viewerCurrentWrapper = null;

// -------------------- auto orbit state & control --------------------
let _autoOrbitRunning = false;
let _autoOrbitReq = null;
let _autoOrbitStart = 0;
let _autoOrbitCenter = new THREE.Vector3();
let _autoOrbitRadius = 1;
let _autoOrbitSpeed = 0.85;
let _autoOrbitYawAmp = 0.07;
let _autoOrbitPitchAmp = 0.04;
let _autoOrbitVerticalAmp = 0.02;
let _autoOrbitIdleTimeout = 1000;
let _autoOrbitIdleTimer = null;
let _autoOrbitInteractionBound = false;

// -------------------- render scheduling (reduce CPU when idle) --------------------
let _needsRender = false;
let _lastAnimateTick = 0;
const MIN_IDLE_POLL_MS = 250; // when idle, poll less frequently

function requestRender() { _needsRender = true; }

// 辅助：计算当前摄像机相对于 center 的水平角（azimuth，弧度）
function computeCameraAzimuth(center) {
  if (!viewerCamera) return 0;
  const camPos = viewerCamera.position;
  const dx = camPos.x - center.x;
  const dz = camPos.z - center.z;
  return Math.atan2(dz, dx); // 返回 [-PI, PI]
}
// Module-top-level helper — use everywhere
function repositionCameraToFit(wrapper, options = {}) {
  // options: { distanceFactorLandscape, distanceFactorPortrait, verticalOffsetFactor, ensureRAF }
  if (!wrapper || !viewerCamera) return null;
  try {
    const landscapeFactor = options.distanceFactorLandscape ?? 0.6;
    const portraitFactor = options.distanceFactorPortrait ?? 1.2;
    const verticalOffsetFactor = options.verticalOffsetFactor ?? 0.15;

    const box = new THREE.Box3().setFromObject(wrapper);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.0001);
    const fov = (viewerCamera.fov * Math.PI) / 180;
    const isLandscape = window.innerWidth > window.innerHeight;
    const distanceFactor = isLandscape ? landscapeFactor : portraitFactor;
    const distance = (maxDim * distanceFactor) / Math.tan(fov / 2);

    // place camera (front view)
    viewerCamera.position.set(center.x, center.y + maxDim * verticalOffsetFactor, center.z + distance);
    viewerCamera.near = Math.max(maxDim / 100, 0.01);
    viewerCamera.far = Math.max(1000, maxDim * 200);
    viewerCamera.updateProjectionMatrix();
    viewerCamera.lookAt(center);

    if (viewerControls) {
      try { viewerControls.target.copy(center); viewerControls.update(); } catch (e) {}
    }

    requestRender();
    // return reference values for callers (e.g., startAutoOrbit can reuse radius)
    return { center: center.clone(), distance, maxDim, fov, isLandscape };
  } catch (e) {
    console.warn('repositionCameraToFit failed', e);
    return null;
  }
}

// 修改 startAutoOrbit：在启动时将 _autoOrbitStart 校正为当前相机角度
function startAutoOrbit(options = {}) {
  if (_autoOrbitRunning) return;
  _autoOrbitSpeed = options.speed ?? _autoOrbitSpeed;
  _autoOrbitYawAmp = options.yawAmp ?? _autoOrbitYawAmp;
  _autoOrbitPitchAmp = options.pitchAmp ?? _autoOrbitPitchAmp;
  _autoOrbitVerticalAmp = options.verticalAmp ?? _autoOrbitVerticalAmp;

  // compute initialAngle so orbit is aligned with current camera orientation
  let initialAngle = 0;
  if (viewerCurrentWrapper && viewerCamera) {
    try {
      const box = new THREE.Box3().setFromObject(viewerCurrentWrapper);
      const center = box.getCenter(new THREE.Vector3());
      initialAngle = computeCameraAzimuth(center);

      // prefer to preserve current horizontal camera distance to avoid first-frame jump
      const camPos = viewerCamera.position;
      const dx = camPos.x - center.x;
      const dz = camPos.z - center.z;
      const horizDist = Math.hypot(dx, dz);

      _autoOrbitCenter.copy(center);

      if (isFinite(horizDist) && horizDist > 1e-6) {
        _autoOrbitRadius = horizDist;
      } else {
        // fallback: compute radius using same logic as repositionCameraToFit
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 0.0001);
        const fov = (viewerCamera.fov * Math.PI) / 180;
        const isLandscape = window.innerWidth > window.innerHeight;
        const distanceFactor = isLandscape ? 0.6 : 1.2;
        _autoOrbitRadius = (maxDim * distanceFactor) / Math.tan(fov / 2);
      }
    } catch (e) {
      // robust fallback if any computation fails
      _autoOrbitCenter.set(0, 0, 0);
      const cam = viewerCamera.position;
      _autoOrbitRadius = Math.hypot(cam.x - _autoOrbitCenter.x, cam.z - _autoOrbitCenter.z) || 2.0;
    }
  } else if (viewerCamera) {
    // no wrapper: orbit around world origin, preserve current cam distance
    _autoOrbitCenter.set(0, 0, 0);
    const cam = viewerCamera.position;
    initialAngle = Math.atan2(cam.z - _autoOrbitCenter.z, cam.x - _autoOrbitCenter.x);
    _autoOrbitRadius = Math.hypot(cam.x - _autoOrbitCenter.x, cam.z - _autoOrbitCenter.z) || 2.0;
  } else {
    // nothing to orbit
    return;
  }

  // align time base so baseAngle(0) == initialAngle
  _autoOrbitStart = (performance.now() / 1000) - (initialAngle / (_autoOrbitSpeed || 1e-6));
  _autoOrbitRunning = true;
  if (!_autoOrbitReq) _autoOrbitReq = requestAnimationFrame(_autoOrbitStep);
  requestRender();
}



function stopAutoOrbit() {
  _autoOrbitRunning = false;
  if (_autoOrbitReq) { cancelAnimationFrame(_autoOrbitReq); _autoOrbitReq = null; }
  if (_autoOrbitIdleTimer) { clearTimeout(_autoOrbitIdleTimer); _autoOrbitIdleTimer = null; }
}

function _autoOrbitStep(nowMs) {
  _autoOrbitReq = null;
  if (!_autoOrbitRunning) return;
  const t = nowMs / 1000;
  const elapsed = t - _autoOrbitStart;

  if (viewerCurrentWrapper && viewerCamera) {
    const box = new THREE.Box3().setFromObject(viewerCurrentWrapper);
    box.getCenter(_autoOrbitCenter);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.0001);
    _autoOrbitRadius = (maxDim * 0.6) / Math.tan((viewerCamera.fov * Math.PI) / 180 / 2);
  } else {
    _autoOrbitCenter.set(0, 0, 0);
    _autoOrbitRadius = 2.0;
  }

  const baseAngle = elapsed * _autoOrbitSpeed;
  const yawOffset = Math.sin(elapsed * 0.6) * _autoOrbitYawAmp;
  const pitchOffset = Math.sin(elapsed * 0.9) * _autoOrbitPitchAmp;
  const vertOffset = Math.sin(elapsed * 1.1) * _autoOrbitVerticalAmp;

  const camX = _autoOrbitCenter.x + Math.cos(baseAngle + yawOffset) * _autoOrbitRadius;
  const camZ = _autoOrbitCenter.z + Math.sin(baseAngle + yawOffset) * _autoOrbitRadius;
  const camY = _autoOrbitCenter.y + (_autoOrbitRadius * 0.15) + vertOffset + Math.tan(pitchOffset) * _autoOrbitRadius * 0.05;

  if (viewerCamera) {
    viewerCamera.position.set(camX, camY, camZ);
    viewerCamera.lookAt(_autoOrbitCenter);
    viewerCamera.updateProjectionMatrix();
  }
  if (viewerControls) {
    try { viewerControls.target.copy(_autoOrbitCenter); viewerControls.update(); } catch (e) {}
  }

  requestRender();
  _autoOrbitReq = requestAnimationFrame(_autoOrbitStep);
}

function _onViewerUserInteraction() {
  stopAutoOrbit();
  if (_autoOrbitIdleTimer) { clearTimeout(_autoOrbitIdleTimer); _autoOrbitIdleTimer = null; }
  _autoOrbitIdleTimer = setTimeout(() => {
    _autoOrbitStart = performance.now() / 1000;
    
  }, _autoOrbitIdleTimeout);
  requestRender();
}

function _bindAutoOrbitInteraction(containerEl) {
  if (!containerEl || _autoOrbitInteractionBound) return;
  const ev = _onViewerUserInteraction;
  containerEl.addEventListener('pointerdown', ev, { passive: true });
  containerEl.addEventListener('wheel', ev, { passive: true });
  containerEl.addEventListener('touchstart', ev, { passive: true });
  containerEl.addEventListener('mousemove', ev, { passive: true });
  _autoOrbitInteractionBound = true;
}

// -------------------- create viewer --------------------
async function createViewerIfNeeded() {
  if (viewerRenderer) return;

  viewerContainer = document.getElementById('obj-viewer');
  if (!viewerContainer) {
    viewerContainer = document.createElement('div');
    viewerContainer.id = 'obj-viewer';
    Object.assign(viewerContainer.style, {
      position: 'fixed',
      right: '12px',
      bottom: '12px',
      width: '30vw',
      height: '30vh',
      minWidth: '320px',
      minHeight: '240px',
      background: 'rgba(10,10,10,0.5)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '6px',
      zIndex: 99999,
      overflow: 'hidden',
      display: 'none',
      boxShadow: '0 8px 30px rgba(0,0,0,0.5)'
    });

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    Object.assign(closeBtn.style, {
      position: 'absolute',
      right: '6px',
      top: '4px',
      zIndex: 100000,
      background: 'transparent',
      color: '#fff',
      border: 'none',
      fontSize: '38px',
      cursor: 'pointer',
      padding: '2px 6px'
    });

    const maxBtn = document.createElement('button');
    maxBtn.innerHTML = '⤢';
    maxBtn.title = 'Maximize';
    Object.assign(maxBtn.style, {
      position: 'absolute',
      right: '56px',
      top: '4px',
      zIndex: 100000,
      background: 'transparent',
      color: '#fff',
      border: 'none',
      fontSize: '38px',
      cursor: 'pointer',
      padding: '2px 6px'
    });

    let _prevViewerStylesForMax = null;

    function _applyMaximized() {
      if (!viewerContainer) return;
      if (!viewerContainer.dataset.maximized || viewerContainer.dataset.maximized !== '1') {
        _prevViewerStylesForMax = {
          left: viewerContainer.style.left,
          right: viewerContainer.style.right,
          top: viewerContainer.style.top,
          bottom: viewerContainer.style.bottom,
          width: viewerContainer.style.width,
          height: viewerContainer.style.height,
          minWidth: viewerContainer.style.minWidth,
          minHeight: viewerContainer.style.minHeight,
          zIndex: viewerContainer.style.zIndex,
          display: viewerContainer.style.display
        };
      }
      const w = Math.floor(window.innerWidth * 0.85);
      const h = Math.floor(window.innerHeight * 0.85);
      viewerContainer.style.left = `${Math.floor((window.innerWidth - w) / 2)}px`;
      viewerContainer.style.top = `${Math.floor((window.innerHeight - h) / 2)}px`;
      viewerContainer.style.right = 'auto';
      viewerContainer.style.bottom = 'auto';
      viewerContainer.style.width = `${w}px`;
      viewerContainer.style.height = `${h}px`;
      viewerContainer.style.minWidth = '0';
      viewerContainer.style.minHeight = '0';
      viewerContainer.style.zIndex = '1000000';
      viewerContainer.style.display = 'block';
      viewerContainer.dataset.maximized = '1';
      maxBtn.title = 'Restore';
      stopAutoOrbit();
      updateRendererForSize();
      // wait a frame so DOM layout updates and renderer size takes effect
      requestAnimationFrame(() => {
        try { if (viewerCurrentWrapper) repositionCameraToFit(viewerCurrentWrapper); } catch(e) {}
        // restart orbit after reposition
        stopAutoOrbit();
        setTimeout(() => startAutoOrbit({ speed:0.35, yawAmp:0.07, pitchAmp:0.04, verticalAmp:0.02 }), 50);
        requestRender();
      });
    }

    function _restoreFromMaximized() {
      if (!viewerContainer) return;
      if (!_prevViewerStylesForMax) {
        viewerContainer.dataset.maximized = '0';
        maxBtn.title = 'Maximize';
        return;
      }
      const s = _prevViewerStylesForMax;
      viewerContainer.style.left = s.left || '';
      viewerContainer.style.right = s.right || '';
      viewerContainer.style.top = s.top || '';
      viewerContainer.style.bottom = s.bottom || '';
      viewerContainer.style.width = s.width || '';
      viewerContainer.style.height = s.height || '';
      viewerContainer.style.minWidth = s.minWidth || '';
      viewerContainer.style.minHeight = s.minHeight || '';
      viewerContainer.style.zIndex = s.zIndex || 99999;
      viewerContainer.style.display = s.display || 'block';
      viewerContainer.dataset.maximized = '0';
      maxBtn.title = 'Maximize';
      _prevViewerStylesForMax = null;
      updateRendererForSize();
      requestAnimationFrame(() => {
        try { if (viewerCurrentWrapper) repositionCameraToFit(viewerCurrentWrapper); } catch(e) {}
        requestRender();
      });
    }

    maxBtn.addEventListener('click', (ev) => {
      try {
        if (viewerContainer && viewerContainer.dataset.maximized === '1') _restoreFromMaximized();
        else _applyMaximized();
      } catch (e) {}
    });

    closeBtn.addEventListener('click', () => {
      try {
        if (viewerContainer && viewerContainer.dataset.maximized === '1') _restoreFromMaximized();
      } catch (e) {}
      if (viewerContainer) {
        try { stopAutoOrbit(); } catch (e) {}
        viewerContainer.style.display = 'none';
        requestRender();
      }
    });

    viewerContainer.appendChild(maxBtn);
    viewerContainer.appendChild(closeBtn);

    window.addEventListener('resize', () => {
      try {
        if (viewerContainer && viewerContainer.dataset.maximized === '1') {
          const w = Math.floor(window.innerWidth * 0.85);
          const h = Math.floor(window.innerHeight * 0.85);
          viewerContainer.style.left = `${Math.floor((window.innerWidth - w) / 2)}px`;
          viewerContainer.style.top = `${Math.floor((window.innerHeight - h) / 2)}px`;
          viewerContainer.style.width = `${w}px`;
          viewerContainer.style.height = `${h}px`;
          updateRendererForSize();
        } else {
          updateRendererForSize();
        }
      } catch (e) {}
    });

    const label = document.createElement('div');
    label.id = 'obj-viewer-label';
    Object.assign(label.style, {
      position: 'absolute',
      left: '8px',
      top: '6px',
      zIndex: 100000,
      color: '#fff',
      fontSize: '12px',
      pointerEvents: 'none',
      opacity: '0.9',
    });
    viewerContainer.appendChild(label);

    viewerCanvas = document.createElement('canvas');
    viewerCanvas.style.width = '100%';
    viewerCanvas.style.height = '100%';
    viewerCanvas.style.display = 'block';
    viewerContainer.appendChild(viewerCanvas);
    document.body.appendChild(viewerContainer);
  }

  viewerRenderer = new THREE.WebGLRenderer({ canvas: viewerCanvas, antialias: true, alpha: true });
  viewerRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  viewerRenderer.setSize(viewerContainer.clientWidth, viewerContainer.clientHeight, false);
  viewerRenderer.setClearColor(0x000000, 0);

  viewerScene = new THREE.Scene();

  try {
    viewerPMREM = new THREE.PMREMGenerator(viewerRenderer);
    viewerPMREM.compileEquirectangularShader?.();
    try {
      const roomEnv = new RoomEnvironment();
      viewerScene.environment = viewerPMREM.fromScene(roomEnv, 0.04).texture;
    } catch (e) {}
  } catch (e) { viewerPMREM = null; }

  viewerScene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(10, 20, 10);
  viewerScene.add(dir);

  // ---- viewerCamera must be created before calling repositionCameraToFit ----
  viewerCamera = new THREE.PerspectiveCamera(50, viewerContainer.clientWidth / viewerContainer.clientHeight, 0.01, 1000);
  viewerCamera.position.set(0, 0.8, 2);

  try {
    viewerControls = new OrbitControls(viewerCamera, viewerRenderer.domElement);
    viewerControls.enableDamping = true;
    viewerControls.dampingFactor = 0.08;
    // only render on control change to avoid constant expensive renders
    viewerControls.addEventListener('change', () => requestRender());
  } catch (e) { viewerControls = null; }

  // safe initial camera fit after camera and controls exist
  if (viewerCurrentWrapper) {
    requestAnimationFrame(() => {
      try { repositionCameraToFit(viewerCurrentWrapper); } catch (e) {}
    });
  }

  if (viewerCanvas) {
    viewerCanvas.style.touchAction = 'auto';
    viewerCanvas.style.pointerEvents = 'auto';
  }

  window.addEventListener('resize', () => {
    if (!viewerRenderer) return;
    try {
      viewerRenderer.setSize(viewerContainer.clientWidth, viewerContainer.clientHeight, false);
      if (viewerCamera) {
        viewerCamera.aspect = viewerContainer.clientWidth / viewerContainer.clientHeight;
        viewerCamera.updateProjectionMatrix();

      }
      requestRender();
    } catch (e) { console.warn('viewer resize failed', e); }
  });

  (function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    // If nothing requires rendering and auto orbit is not running, skip heavy render and poll slower
    if (!_needsRender && !_autoOrbitRunning) {
      // poll less frequently when idle
      if (now - _lastAnimateTick < MIN_IDLE_POLL_MS) return;
      _lastAnimateTick = now;
      return;
    }
    _lastAnimateTick = now;
    // update controls damping when present
    if (viewerControls) {
      try { viewerControls.update(); } catch (e) {}
    }
    try { if (viewerRenderer && viewerScene && viewerCamera) viewerRenderer.render(viewerScene, viewerCamera); } catch (e) {}
    _needsRender = false;
  })();
}

// -------------------- path helpers & existence check --------------------
function getObjPathFromFilename(fname) {
  if (!fname) return null;
  if (fname.startsWith('/') || fname.startsWith('./') || fname.includes('://')) return fname;
  return `${CHARS_DIR}${fname}`;
}

async function existsPath(url) {
  try {
    const headRes = await fetch(url, { method: 'HEAD' });
    if (headRes && headRes.ok) return true;
  } catch (e) {}
  try {
    const getRes = await fetch(url, { method: 'GET' });
    return !!(getRes && getRes.ok);
  } catch (e) { return false; }
}

async function resolveFirstExistingObjPath(prefix, maxTry = 300) {
  if (!prefix) return null;
  if (prefix.endsWith('.obj')) {
    const p = getObjPathFromFilename(prefix);
    return (await existsPath(p)) ? p : null;
  }
  for (let i = 0; i < maxTry; i++) {
    const idx = String(i).padStart(3, '0');
    const sCandidate = `${prefix}_${idx}_s.obj`;
    const nCandidate = `${prefix}_${idx}.obj`;
    const sPath = getObjPathFromFilename(sCandidate);
    if (await existsPath(sPath)) return sPath;
    const nPath = getObjPathFromFilename(nCandidate);
    if (await existsPath(nPath)) return nPath;
  }
  return null;
}

// -------------------- texture / material / tangent helpers --------------------
const texLoader = new THREE.TextureLoader();
function loadTexturePromise(url, options = {}) {
  return new Promise((res, rej) => {
    texLoader.load(url,
      t => {
        if (options.encoding !== undefined) t.encoding = options.encoding;
        if (options.flipY !== undefined) t.flipY = options.flipY;
        res(t);
      },
      undefined,
      err => rej(err)
    );
  });
}

let _mikkTSpaceInitWarned = false;
function ensureTangentsForGeometry(geometry) {
  if (!geometry || !geometry.isBufferGeometry) return;
  if (!geometry.attributes.uv) return;
  if (geometry.attributes.tangent) return;
  try {
    if (typeof BufferGeometryUtils !== 'undefined' && typeof BufferGeometryUtils.computeMikkTSpaceTangents === 'function') {
      try { BufferGeometryUtils.computeMikkTSpaceTangents(geometry); return; } catch (err) {
        if (!_mikkTSpaceInitWarned) { console.warn('computeMikkTSpaceTangents unavailable/failed — skipping tangent generation.'); _mikkTSpaceInitWarned = true; }
        return;
      }
    }
    if (typeof BufferGeometryUtils !== 'undefined' && typeof BufferGeometryUtils.computeTangents === 'function') {
      try { BufferGeometryUtils.computeTangents(geometry); return; } catch (err) {
        if (!_mikkTSpaceInitWarned) { console.warn('computeTangents failed — skipping tangent generation.'); _mikkTSpaceInitWarned = true; }
        return;
      }
    }
  } catch (e) {
    if (!_mikkTSpaceInitWarned) { console.warn('ensureTangentsForGeometry failed, skipping tangents:', e && e.message ? e.message : e); _mikkTSpaceInitWarned = true; }
  }
}

async function applyPBRTexturesToMesh(mesh) {
  const geom = mesh.geometry;
  if (!geom || !geom.isBufferGeometry || !geom.attributes.uv) {
    mesh.material = mesh.material || new THREE.MeshStandardMaterial({ color: 0xffffff });
    mesh.material.needsUpdate = true;
    return;
  }

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.0, roughness: 1.0, side: THREE.DoubleSide });
  try {
    const [
      colorMap,
      normalMap,
      roughnessMap,
      metalnessMap
    ] = await Promise.all([
      loadTexturePromise(`${PBR_FOLDER}${PBR_BASE}_Color.jpg`, { encoding: THREE.sRGBEncoding, flipY: false }).catch(() => null),
      loadTexturePromise(`${PBR_FOLDER}${PBR_BASE}_NormalGL.jpg`, { flipY: false }).catch(() => null),
      loadTexturePromise(`${PBR_FOLDER}${PBR_BASE}_Roughness.jpg`, { flipY: false }).catch(() => null),
      loadTexturePromise(`${PBR_FOLDER}${PBR_BASE}_Metalness.jpg`, { flipY: false }).catch(() => null)
    ]);
    if (colorMap) { mat.map = colorMap; mat.map.encoding = THREE.sRGBEncoding; }
    if (normalMap) { mat.normalMap = normalMap; mat.normalScale = new THREE.Vector2(1, 1); mat.normalMap.encoding = THREE.LinearEncoding; }
    if (roughnessMap) { mat.roughnessMap = roughnessMap; mat.roughness = 1.0; mat.roughnessMap.encoding = THREE.LinearEncoding; }
    if (metalnessMap) { mat.metalnessMap = metalnessMap; mat.metalness = 1.0; mat.metalnessMap.encoding = THREE.LinearEncoding; }
  } catch (e) { console.warn('applyPBRTexturesToMesh load error', e); }
  mesh.material = mat;
  mesh.material.needsUpdate = true;
}

// -------------------- root MTL preload --------------------
async function preloadRootMtlIfNeeded() {
  if (!ROOT_MTL || rootMaterials) return;
  const mtlLoader = new MTLLoader();
  try {
    try {
      const rCheck = await fetch(ROOT_MTL, { method: 'HEAD' });
      if (!rCheck || !rCheck.ok) throw new Error('root MTL head failed');
    } catch (e) {}
    const rm = await new Promise((res, rej) => mtlLoader.load(ROOT_MTL, res, undefined, rej));
    if (rm) {
      rootMaterials = rm;
      try { rootMaterials.preload(); } catch(e) {}
      for (const key of Object.keys(rootMaterials.materials || {})) {
        const mat = rootMaterials.materials[key];
        if (!mat) continue;
        if (mat.map && mat.map.image && mat.map.image.src) mat.map.encoding = THREE.sRGBEncoding;
      }
    }
  } catch (e) { console.warn('preloadRootMtlIfNeeded error', e); rootMaterials = null; }
}

// -------------------- OBJ loading --------------------
async function loadObj(resolvedObjPath) {
  if (modelCache[resolvedObjPath]) return modelCache[resolvedObjPath].clone(true);

  const mtlLoader = new MTLLoader();
  const objLoader = new OBJLoader();

  if (rootMaterials) {
    try { objLoader.setMaterials(rootMaterials); } catch (e) {}
  } else if (ROOT_MTL) {
    try {
      await preloadRootMtlIfNeeded();
      if (rootMaterials) { try { objLoader.setMaterials(rootMaterials); } catch (e) {} }
    } catch (e) {}
  }

  const object = await new Promise((res, rej) => {
    try { objLoader.load(resolvedObjPath, res, undefined, err => rej(err)); } catch (err) { rej(err); }
  });

  const fallbackTasks = [];
  object.traverse(child => {
    if (!child.isMesh) return;
    const geom = child.geometry;
    if (geom && geom.isBufferGeometry) {
      if (!geom.attributes.uv) {
        try {
          if (!geom.boundingBox) geom.computeBoundingBox();
          const bb = geom.boundingBox;
          const pos = geom.attributes.position;
          const uv = new Float32Array(pos.count * 2);
          const spanX = Math.max(bb.max.x - bb.min.x, 1e-6);
          const spanY = Math.max(bb.max.y - bb.min.y, 1e-6);
          for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), y = pos.getY(i);
            uv[i*2] = (x - bb.min.x) / spanX;
            uv[i*2+1] = (y - bb.min.y) / spanY;
          }
          geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        } catch (e) {}
      }
      try { ensureTangentsForGeometry(geom); } catch (e) {}
    }

    fallbackTasks.push((async () => {
      if (!child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (mat.map) mat.map.encoding = THREE.sRGBEncoding;
        if (mat.normalMap) mat.normalMap.encoding = THREE.LinearEncoding;
        if (mat.roughnessMap) mat.roughnessMap.encoding = THREE.LinearEncoding;
        if (mat.metalnessMap) mat.metalnessMap.encoding = THREE.LinearEncoding;
        if (!mat.map) {
          const base = (child.name && child.name.length) ? child.name.split('_')[0] : (resolvedObjPath.split('/').pop().split('_')[0] || '').replace('.obj','');
          await tryApplyFallbackTexture(mat, base);
        }
      }
    })());
  });

  try { await Promise.all(fallbackTasks); } catch (e) {}

  if (rootMaterials) {
    const mats = rootMaterials.materials || {};
    const firstMat = Object.values(mats)[0] || null;
    if (firstMat) {
      object.traverse(child => { if (!child.isMesh) return; try { child.material = firstMat.clone(); } catch (e) {} });
    }
  }

  const meshList = [];
  object.traverse(child => { if (child.isMesh) meshList.push(child); });
  try { await Promise.all(meshList.map(m => applyPBRTexturesToMesh(m))); } catch (e) {}

  modelCache[resolvedObjPath] = object.clone(true);
  return object.clone(true);
}

// -------------------- dispose helper --------------------
function disposeWrapper(wrapper) {
  try { stopAutoOrbit(); } catch (e) {}
  if (!wrapper) return;
  wrapper.traverse((child) => {
    if (child.isMesh) {
      try { if (child.geometry) child.geometry.dispose(); } catch (e) {}
      const disposeMaterial = (m) => {
        if (!m) return;
        if (Array.isArray(m)) return m.forEach(disposeMaterial);
        try { for (const k in m) { if (m[k] && m[k].isTexture) m[k].dispose(); } } catch (e) {}
        try { if (m.dispose) m.dispose(); } catch (e) {}
      };
      disposeMaterial(child.material);
    }
  });
  requestRender();
}

// -------------------- show / hide viewer --------------------
async function showObjectForFilename(filename) {
  if (!filename) return;
  await createViewerIfNeeded();

  const baseNoExt = filename.replace(/\.[^.]+$/, '');
  const sCandidate = `${baseNoExt}_s.obj`;
  const normalCandidate = `${baseNoExt}.obj`;

  let chosen = null;
  try {
    const sPath = getObjPathFromFilename(sCandidate);
    if (await existsPath(sPath)) chosen = sPath;
    else {
      const nPath = getObjPathFromFilename(normalCandidate);
      if (await existsPath(nPath)) chosen = nPath;
      else {
        const maybeChar = baseNoExt.split('_')[0];
        chosen = await resolveFirstExistingObjPath(maybeChar);
      }
    }
  } catch (e) {
    console.warn('showObjectForFilename path resolution failed', e);
  }

  const label = document.getElementById('obj-viewer-label');
  if (label) label.textContent = filename;

  if (!chosen) {
    if (viewerContainer) viewerContainer.style.display = 'none';
    console.warn('No obj found for', filename);
    return;
  }

  try {
    const obj = await loadObj(chosen);

    // remove previous
    if (viewerCurrentWrapper) {
      try { viewerScene.remove(viewerCurrentWrapper); } catch (e) {}
      try { disposeWrapper(viewerCurrentWrapper); } catch (e) {}
      viewerCurrentWrapper = null;
    }

    // add new wrapper
    const wrapper = new THREE.Object3D();
    wrapper.add(obj);
    wrapper.position.set(0, 0, 0);
    wrapper.updateMatrixWorld(true);
    viewerScene.add(wrapper);
    viewerCurrentWrapper = wrapper;

    // ensure container is visible and renderer/camera are sized
    if (viewerContainer) viewerContainer.style.display = 'block';
    try { updateRendererForSize(); } catch (e) { console.warn('updateRendererForSize failed', e); }

    // wait a frame for layout/renderer resize to take effect, then position camera and start interactions
    requestAnimationFrame(() => {
      try {
        repositionCameraToFit(wrapper);                       // centralized positioning (handles landscape/portrait)
      } catch (e) {
        // fallback: compute a conservative camera placement if reposition fails
        try {
          const box = new THREE.Box3().setFromObject(wrapper);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z, 0.0001);
          const fov = (viewerCamera && viewerCamera.fov ? (viewerCamera.fov * Math.PI) / 180 : Math.PI / 3);
          const isLandscape = window.innerWidth > window.innerHeight;
          const distanceFactor = isLandscape ? 0.6 : 1.2; // <-- 统一改为 0.3（竖屏）
          const distance = (maxDim * distanceFactor) / Math.tan(fov / 2);
          if (viewerCamera) {
            viewerCamera.position.copy(new THREE.Vector3(center.x, center.y + maxDim * 0.15, center.z + distance));
            viewerCamera.near = Math.max(maxDim / 100, 0.01);
            viewerCamera.far = Math.max(1000, maxDim * 200);
            viewerCamera.updateProjectionMatrix();
            viewerCamera.lookAt(center);
            if (viewerControls) { try { viewerControls.target.copy(center); viewerControls.update(); } catch (e) {} }
          }
        } catch (err) {
          console.warn('fallback camera placement failed', err);
        }
      }

      try { _bindAutoOrbitInteraction(viewerContainer); } catch (e) { console.warn('_bindAutoOrbitInteraction failed', e); }

      setTimeout(() => {
        try { startAutoOrbit({ speed: 0.35, yawAmp: 0.07, pitchAmp: 0.04, verticalAmp: 0.02 }); } catch (e) {}
      }, 1000);

      requestRender();
    });

  } catch (e) {
    console.error('Failed to load obj for viewer', e);
    if (viewerContainer) viewerContainer.style.display = 'none';
  }
}

function hideViewer() {
  try { stopAutoOrbit(); } catch (e) {}
  if (viewerContainer) viewerContainer.style.display = 'none';
  requestRender();
}
// -------------------- hover debounce to avoid rapid switching --------------------
let _hoverTimer = null;
const _hoverDelay = 500;
let _lastHoverFilename = null;

window.addEventListener('hoverOnBox', (ev) => {
  try {
    const filename = ev.detail && ev.detail.filename;
    if (!filename) return;
    if (_hoverTimer && _lastHoverFilename === filename) return;
    if (_hoverTimer) { clearTimeout(_hoverTimer); _hoverTimer = null; }
    _lastHoverFilename = filename;
    _hoverTimer = setTimeout(() => {
      _hoverTimer = null;
      try { showObjectForFilename(filename); } catch (e) {}
    }, _hoverDelay);
  } catch (e) { console.warn(e); }
});

window.addEventListener('hideBoxByFilename', () => {
  try {
    if (_hoverTimer) { clearTimeout(_hoverTimer); _hoverTimer = null; }
    _lastHoverFilename = null;
    hideViewer();
  } catch (e) {}
});

window.addEventListener('showObjByFilename', (ev) => {
  try {
    const filename = ev.detail;
    if (!filename) return;
    if (_hoverTimer) { clearTimeout(_hoverTimer); _hoverTimer = null; }
    _lastHoverFilename = filename;
    showObjectForFilename(filename);
  } catch (e) { console.warn(e); }
});

// attach redundant listeners for compatibility with existing code that expects immediate behavior
window.addEventListener('hoverOnBox', (ev) => {
  try {
    const filename = ev.detail && ev.detail.filename;
    if (filename) showObjectForFilename(filename);
  } catch (e) { console.warn(e); }
});
window.addEventListener('hideBoxByFilename', () => { hideViewer(); });
window.addEventListener('showObjByFilename', (ev) => {
  const filename = ev.detail;
  if (filename) showObjectForFilename(filename);
});

// -------------------- expose API --------------------
window.modelLoaders = window.modelLoaders || {};
Object.assign(window.modelLoaders, {
  getObjPathFromFilename,
  existsPath,
  resolveFirstExistingObjPath,
  loadObj,
  disposeWrapper,
  showObjectForFilename,
  hideViewer,
  findMatchingImages: typeof findMatchingImages === 'function' ? findMatchingImages : undefined,
  findMatchingObjs: typeof findMatchingObjs === 'function' ? findMatchingObjs : undefined,
  filterDisplayChars: typeof filterDisplayChars === 'function' ? filterDisplayChars : undefined
});

// -------------------- update renderer / camera / textures for size --------------------
function updateRendererForSize() {
  if (!viewerRenderer || !viewerContainer) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  viewerRenderer.setPixelRatio(ratio);

  const w = Math.max(1, viewerContainer.clientWidth);
  const h = Math.max(1, viewerContainer.clientHeight);
  viewerRenderer.setSize(w, h, false);

  if (viewerCamera) {
    viewerCamera.aspect = w / h;
    viewerCamera.updateProjectionMatrix();
  }

  try {
    const maxAniso = (viewerRenderer.capabilities && viewerRenderer.capabilities.getMaxAnisotropy)
      ? viewerRenderer.capabilities.getMaxAnisotropy()
      : (viewerRenderer.capabilities ? viewerRenderer.capabilities.getMaxAnisotropy?.() : 1);
    if (viewerScene) {
      viewerScene.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mat of mats) {
          if (!mat) continue;
          const applyTex = (map) => {
            if (!map) return;
            try {
              if (typeof map.generateMipmaps === 'boolean') map.generateMipmaps = true;
              if (typeof map.anisotropy !== 'undefined' && maxAniso) map.anisotropy = maxAniso;
              map.needsUpdate = true;
            } catch (e) {}
          };
          applyTex(mat.map);
          applyTex(mat.normalMap);
          applyTex(mat.roughnessMap);
          applyTex(mat.metalnessMap);
        }
      });
    }
  } catch (e) {}

  try { viewerRenderer.render(viewerScene, viewerCamera); } catch (e) {}
  requestRender();
}
