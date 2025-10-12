// js/modelLoader.js
// Full viewer that uses import map to resolve "three" to an ESM build (recommended).
// Ensure your index.html includes an importmap mapping "three" to a valid three.module.js URL:
// <script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.150.1/build/three.module.js"}}</script>
// And loads this file with: <script type="module" src="./js/modelLoader.js"></script>

import * as THREE from 'three';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/controls/OrbitControls.js';
import { OBJLoader } from 'https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/loaders/MTLLoader.js';
import { RoomEnvironment } from 'https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/environments/RoomEnvironment.js';
import * as BufferGeometryUtils from 'https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/utils/BufferGeometryUtils.js';

// -------------------- configuration & caches (added) --------------------
const PBR_BASE = 'Metal048C_2K-JPG';
const PBR_FOLDER = './textures/';
const ROOT_MTL = './yang.mtl'; // set to '' to disable
const MTL_TEXTURE_PATH = '/textures/';

let rootMaterials = null;
const modelCache = {};

// --- ADDED: missing globals used by createViewerIfNeeded / loader logic ---
const CHARS_DIR = './chars/';

let viewerRenderer = null;
let viewerScene = null;
let viewerCamera = null;
let viewerControls = null;
let viewerCanvas = null;
let viewerContainer = null;
let viewerPMREM = null;
let viewerCurrentWrapper = null;

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

    // replace original closeBtn creation with close + maximize buttons
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

    // store previous inline styles so we can restore
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

      updateRendererForSize();              // <- 新增
    }

    function _restoreFromMaximized() {
      if (!viewerContainer) return;
      if (!_prevViewerStylesForMax) {
        // fallback: hide if no prev styles
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

      updateRendererForSize();              // <- 新增
    }

    // toggle handlers
    maxBtn.addEventListener('click', (ev) => {
      try {
        if (viewerContainer && viewerContainer.dataset.maximized === '1') _restoreFromMaximized();
        else _applyMaximized();
      } catch (e) {}
    });

    closeBtn.addEventListener('click', () => {
      try {
        if (viewerContainer && viewerContainer.dataset.maximized === '1') {
          // if maximized, restore first then hide
          _restoreFromMaximized();
        }
      } catch (e) {}
      if (viewerContainer) viewerContainer.style.display = 'none';
    });

    viewerContainer.appendChild(maxBtn);
    viewerContainer.appendChild(closeBtn);

    // adjust maximized size on resize
    window.addEventListener('resize', () => {
      try {
        if (viewerContainer && viewerContainer.dataset.maximized === '1') {
          // keep it centered at 75% of viewport
          const w = Math.floor(window.innerWidth * 0.85);
          const h = Math.floor(window.innerHeight * 0.85);
          viewerContainer.style.left = `${Math.floor((window.innerWidth - w) / 2)}px`;
          viewerContainer.style.top = `${Math.floor((window.innerHeight - h) / 2)}px`;
          viewerContainer.style.width = `${w}px`;
          viewerContainer.style.height = `${h}px`;
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
  viewerRenderer.setPixelRatio(window.devicePixelRatio || 1);
  viewerRenderer.setSize(viewerContainer.clientWidth, viewerContainer.clientHeight, false);
  viewerRenderer.setClearColor(0x000000, 0);

  viewerScene = new THREE.Scene();

  try {
    viewerPMREM = new THREE.PMREMGenerator(viewerRenderer);
    viewerPMREM.compileEquirectangularShader?.();
    try {
      const roomEnv = new RoomEnvironment();
      viewerScene.environment = viewerPMREM.fromScene(roomEnv, 0.04).texture;
    } catch (e) {
      // ignore environment creation failure
    }
  } catch (e) {
    viewerPMREM = null;
  }

  viewerScene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(10, 20, 10);
  viewerScene.add(dir);

  viewerCamera = new THREE.PerspectiveCamera(50, viewerContainer.clientWidth / viewerContainer.clientHeight, 0.01, 1000);
  viewerCamera.position.set(0, 0.8, 2);

  try {
    viewerControls = new OrbitControls(viewerCamera, viewerRenderer.domElement);
    viewerControls.enableDamping = true;
    viewerControls.dampingFactor = 0.08;
  } catch (e) {
    viewerControls = null;
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
    } catch (e) {
      console.warn('viewer resize failed', e);
    }
  });

  (function animate() {
    requestAnimationFrame(animate);
    if (viewerControls) {
      try { viewerControls.update(); } catch (e) {}
    }
    if (viewerRenderer && viewerScene && viewerCamera) viewerRenderer.render(viewerScene, viewerCamera);
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
  } catch (e) {
    return false;
  }
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

// -------------------- texture / material / tangent helpers (added) --------------------
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

// Replace existing ensureTangentsForGeometry with this safer version
let _mikkTSpaceInitWarned = false;
function ensureTangentsForGeometry(geometry) {
  if (!geometry || !geometry.isBufferGeometry) return;
  if (!geometry.attributes.uv) return;
  if (geometry.attributes.tangent) return;

  try {
    // Prefer the newer API if available (computeMikkTSpaceTangents).
    if (typeof BufferGeometryUtils !== 'undefined' && typeof BufferGeometryUtils.computeMikkTSpaceTangents === 'function') {
      try {
        BufferGeometryUtils.computeMikkTSpaceTangents(geometry);
        return;
      } catch (err) {
        if (!_mikkTSpaceInitWarned) {
          console.warn('computeMikkTSpaceTangents unavailable/failed — skipping tangent generation.');
          _mikkTSpaceInitWarned = true;
        }
        return;
      }
    }
    // Fallback to computeTangents only if present (wrap to avoid noisy throws)
    if (typeof BufferGeometryUtils !== 'undefined' && typeof BufferGeometryUtils.computeTangents === 'function') {
      try {
        BufferGeometryUtils.computeTangents(geometry);
        return;
      } catch (err) {
        if (!_mikkTSpaceInitWarned) {
          console.warn('computeTangents failed — skipping tangent generation.');
          _mikkTSpaceInitWarned = true;
        }
        return;
      }
    }
  } catch (e) {
    if (!_mikkTSpaceInitWarned) {
      console.warn('ensureTangentsForGeometry failed, skipping tangents:', e && e.message ? e.message : e);
      _mikkTSpaceInitWarned = true;
    }
  }
}

async function applyPBRTexturesToMesh(mesh) {
  const geom = mesh.geometry;
  if (!geom || !geom.isBufferGeometry || !geom.attributes.uv) {
    mesh.material = mesh.material || new THREE.MeshStandardMaterial({ color: 0xffffff });
    mesh.material.needsUpdate = true;
    return;
  }

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.0, roughness: 1.0 });
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
  } catch (e) {
    console.warn('applyPBRTexturesToMesh load error', e);
  }

  mesh.material = mat;
  mesh.material.needsUpdate = true;
}

// -------------------- root MTL preload (added) --------------------
async function preloadRootMtlIfNeeded() {
  if (!ROOT_MTL || rootMaterials) return;
  const mtlLoader = new MTLLoader();

  try {
    try {
      const rCheck = await fetch(ROOT_MTL, { method: 'HEAD' });
      if (!rCheck || !rCheck.ok) throw new Error('root MTL head failed');
    } catch (e) {
      // HEAD may fail on some servers; continue with GET attempt
    }
    const rm = await new Promise((res, rej) => mtlLoader.load(ROOT_MTL, res, undefined, rej));
    if (rm) {
      rootMaterials = rm;
      try { rootMaterials.preload(); } catch(e) {}
      for (const key of Object.keys(rootMaterials.materials || {})) {
        const mat = rootMaterials.materials[key];
        if (!mat) continue;
        if (mat.map && mat.map.image && mat.map.image.src) mat.map.encoding = THREE.sRGBEncoding;
      }
      console.log('root MTL preloaded:', ROOT_MTL);
    }
  } catch (e) {
    console.warn('preloadRootMtlIfNeeded error', e);
    rootMaterials = null;
  }
}

// -------------------- OBJ loading --------------------
async function loadObj(resolvedObjPath) {
  // cache
  if (modelCache[resolvedObjPath]) return modelCache[resolvedObjPath].clone(true);

  const mtlLoader = new MTLLoader();
  const objLoader = new OBJLoader();

  // Try to use root materials if available
  if (rootMaterials) {
    try { objLoader.setMaterials(rootMaterials); } catch (e) { /* ignore */ }
  } else if (ROOT_MTL) {
    try {
      await preloadRootMtlIfNeeded();
      if (rootMaterials) {
        try { objLoader.setMaterials(rootMaterials); } catch (e) { /* ignore */ }
      }
    } catch (e) {
      // intentionally silent
    }
  }
  // ---------------------------------------------------------------------------------------
  // Load OBJ
  const object = await new Promise((res, rej) => {
    try {
      objLoader.load(resolvedObjPath, res, undefined, err => rej(err));
    } catch (err) {
      rej(err);
    }
  });

  // Client-side mesh fixes & fallback textures
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
          // suppressed noisy console.warn; keep internal trace if dev needs it
          // console.debug('Generated planar UVs for', child.name || resolvedObjPath);
        } catch (e) {
          // quietly ignore UV generation failures
        }
      }
      try { ensureTangentsForGeometry(geom); } catch (e) { /* ignore */ }
    }

    // fallback texture assignment
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
          // old HEAD-based loop -> new direct-load attempt
          await tryApplyFallbackTexture(mat, base);
        }
      }
    })());
  });

  try { await Promise.all(fallbackTasks); } catch (e) { /* non-fatal */ }

  // Optionally replace materials with rootMaterials clone - keep but non-forcing
  if (rootMaterials) {
    const mats = rootMaterials.materials || {};
    const firstMat = Object.values(mats)[0] || null;
    if (firstMat) {
      object.traverse(child => {
        if (!child.isMesh) return;
        try { child.material = firstMat.clone(); } catch (e) { /* ignore */ }
      });
    }
  }

  // Apply PBR textures to each mesh (non-blocking but awaited)
  const meshList = [];
  object.traverse(child => { if (child.isMesh) meshList.push(child); });
  try { await Promise.all(meshList.map(m => applyPBRTexturesToMesh(m))); } catch (e) {}

  modelCache[resolvedObjPath] = object.clone(true);
  return object.clone(true);
}

// -------------------- dispose helper --------------------
function disposeWrapper(wrapper) {
  if (!wrapper) return;
  wrapper.traverse((child) => {
    if (child.isMesh) {
      try { if (child.geometry) child.geometry.dispose(); } catch (e) {}
      const disposeMaterial = (m) => {
        if (!m) return;
        if (Array.isArray(m)) return m.forEach(disposeMaterial);
        try {
          for (const k in m) {
            if (m[k] && m[k].isTexture) m[k].dispose();
          }
        } catch (e) {}
        try { if (m.dispose) m.dispose(); } catch (e) {}
      };
      disposeMaterial(child.material);
    }
  });
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

    if (viewerCurrentWrapper) {
      viewerScene.remove(viewerCurrentWrapper);
      disposeWrapper(viewerCurrentWrapper);
      viewerCurrentWrapper = null;
    }

    const wrapper = new THREE.Object3D();
    wrapper.add(obj);
    wrapper.position.set(0, 0, 0);
    wrapper.updateMatrixWorld(true);
    viewerScene.add(wrapper);
    viewerCurrentWrapper = wrapper;

    const box = new THREE.Box3().setFromObject(wrapper);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.0001);
    const fov = (viewerCamera.fov * Math.PI) / 180;
    const distance = (maxDim * 0.6) / Math.tan(fov / 2);

    viewerCamera.position.copy(new THREE.Vector3(center.x, center.y + maxDim * 0.15, center.z + distance));
    viewerCamera.near = Math.max(maxDim / 100, 0.01);
    viewerCamera.far = Math.max(1000, maxDim * 200);
    viewerCamera.updateProjectionMatrix();
    viewerCamera.lookAt(center);

    if (viewerControls) {
      try {
        viewerControls.target.copy(center);
        viewerControls.update();
      } catch (e) {}
    }

    if (viewerContainer) viewerContainer.style.display = 'block';

    try {
      updateRendererForSize();
    } catch (e) { console.warn('viewer sync/render failed', e); }

  } catch (e) {
    console.error('Failed to load obj for viewer', e);
    if (viewerContainer) viewerContainer.style.display = 'none';
  }
}

function hideViewer() {
  if (viewerContainer) viewerContainer.style.display = 'none';
}

// Hover debounce: only switch after pointer stays on a box for 500ms
let _hoverTimer = null;
const _hoverDelay = 500; // ms
let _lastHoverFilename = null;

window.addEventListener('hoverOnBox', (ev) => {
  try {
    const filename = ev.detail && ev.detail.filename;
    if (!filename) return;

    // If already scheduled for same filename, do nothing
    if (_hoverTimer && _lastHoverFilename === filename) return;

    // Reset previous timer
    if (_hoverTimer) {
      clearTimeout(_hoverTimer);
      _hoverTimer = null;
    }

    _lastHoverFilename = filename;
    _hoverTimer = setTimeout(() => {
      _hoverTimer = null;
      // fire show; ignore promise rejection
      try { showObjectForFilename(filename); } catch (e) { /* ignore */ }
    }, _hoverDelay);
  } catch (e) { console.warn(e); }
});

// When hiding/cancelling, clear pending hover action
window.addEventListener('hideBoxByFilename', () => {
  try {
    if (_hoverTimer) { clearTimeout(_hoverTimer); _hoverTimer = null; }
    _lastHoverFilename = null;
    hideViewer();
  } catch (e) { /* ignore */ }
});

// Immediate show (no delay) for explicit show requests (e.g., click)
window.addEventListener('showObjByFilename', (ev) => {
  try {
    const filename = ev.detail;
    if (!filename) return;
    if (_hoverTimer) { clearTimeout(_hoverTimer); _hoverTimer = null; }
    _lastHoverFilename = filename;
    showObjectForFilename(filename);
  } catch (e) { console.warn(e); }
});

// -------------------- events & API --------------------
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

// expose API
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
// -------------------- end of file --------------------

// 更新 renderer/camera/纹理以适应当前 viewerContainer 尺寸，避免模糊
function updateRendererForSize() {
  if (!viewerRenderer || !viewerContainer) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2); // 限制最大 DPR，避免性能问题
  viewerRenderer.setPixelRatio(ratio);

  // 使用 clientWidth/clientHeight（CSS 像素），setSize 会根据 pixelRatio 设置 drawing buffer
  const w = Math.max(1, viewerContainer.clientWidth);
  const h = Math.max(1, viewerContainer.clientHeight);
  viewerRenderer.setSize(w, h, false);

  if (viewerCamera) {
    viewerCamera.aspect = w / h;
    viewerCamera.updateProjectionMatrix();
  }

  // 提高已加载纹理的各向异性以改善放大时的清晰度
  try {
    const maxAniso = (viewerRenderer.capabilities && viewerRenderer.capabilities.getMaxAnisotropy)
      ? viewerRenderer.capabilities.getMaxAnisotropy()
      : (viewerRenderer.capabilities ? viewerRenderer.capabilities.getMaxAnisotropy?.() : 1);
    // traverse scene textures
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
  } catch (e) {
    // 忽略
  }

  // 最后渲染一帧保证画面清晰
  try { viewerRenderer.render(viewerScene, viewerCamera); } catch (e) {}
}
