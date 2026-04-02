// ====================================
// GLTF Viewer 2.0 - Three.js Logic
// ====================================

let scene, camera, renderer, controls, model;
let ambientLight, directionalLight;
let modelGroups = [];
let initialCameraPosition = { x: 0, y: 2, z: 5 };
let edgesVisible = true;
let wireframeVisible = false;
let raycaster, pointer;
let selectedParts = [];
let selectionHelpers = [];
let autoRotateEnabled = false;
let cameraTween = null;
let toastHost = null;

// ====================================
// Part Action Configuration
// ====================================
// Consumers can override defaults by setting window.PYTHA_VIEWER_ACTION_CONFIGS
// before this script runs.
const DEFAULT_PART_ACTION_CONFIGS = [
    {
        id: 'door-default',
        pattern: /door|panel-door|cabinet-door/i,
        actionType: 'hinge',
        axis: 'y',
        openValue: Math.PI / 2,
        durationMs: 450
    },
    {
        id: 'drawer-default',
        pattern: /drawer/i,
        actionType: 'slide',
        axis: 'z',
        openValue: 0.45,
        durationMs: 400
    }
];

function normalizeActionConfigEntry(entry, index) {
    const fallback = DEFAULT_PART_ACTION_CONFIGS[0];
    const safePattern = entry && entry.pattern instanceof RegExp ? entry.pattern : fallback.pattern;
    const safeType = entry && (entry.actionType === 'hinge' || entry.actionType === 'slide')
        ? entry.actionType
        : fallback.actionType;
    const safeAxis = entry && ['x', 'y', 'z'].includes(entry.axis) ? entry.axis : 'y';
    const safeOpenValue = entry && typeof entry.openValue === 'number' ? entry.openValue : fallback.openValue;
    const safeDurationMs = entry && typeof entry.durationMs === 'number' ? entry.durationMs : 450;

    return {
        id: entry && entry.id ? String(entry.id) : `action-${index + 1}`,
        pattern: safePattern,
        actionType: safeType,
        axis: safeAxis,
        openValue: safeOpenValue,
        durationMs: Math.max(80, safeDurationMs)
    };
}

const PART_ACTION_CONFIGS = Array.isArray(window.PYTHA_VIEWER_ACTION_CONFIGS)
    ? window.PYTHA_VIEWER_ACTION_CONFIGS.map((entry, index) => normalizeActionConfigEntry(entry, index))
    : DEFAULT_PART_ACTION_CONFIGS;

const partActionState = new WeakMap();

function getActionConfigForPart(part) {
    if (!part || !part.name) return null;
    const partName = String(part.name);
    return PART_ACTION_CONFIGS.find((config) => config.pattern.test(partName)) || null;
}

function getErrorMessage(error) {
    if (!error) return '';
    if (typeof error === 'string') return error;
    return String(error.message || error.reason || error);
}

function isImageDecodeError(error) {
    const msg = getErrorMessage(error).toLowerCase();
    return (
        msg.includes('image could not be decoded') ||
        msg.includes('the source image could not be decoded') ||
        (msg.includes('image') && msg.includes('decode')) ||
        msg === '[object event]'
    );
}

function isLikelyTextureEventError(error) {
    if (!error || typeof error !== 'object') return false;
    return String(error.type || '').toLowerCase() === 'error';
}

function patchImageLoaderWithPlaceholder() {
    const originalImageLoaderLoad = THREE.ImageLoader.prototype.load;

    THREE.ImageLoader.prototype.load = function patchedImageLoader(url, onLoad, onProgress, onError) {
        return originalImageLoaderLoad.call(
            this,
            url,
            onLoad,
            onProgress,
            function textureErrorHandler(error) {
                console.warn('Texture decode failed. Using placeholder texture for:', url);

                // Use a tiny neutral placeholder image so model geometry can still render.
                const placeholder = document.createElement('canvas');
                placeholder.width = 2;
                placeholder.height = 2;
                const ctx = placeholder.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = '#cfcfcf';
                    ctx.fillRect(0, 0, 2, 2);
                }

                if (typeof onLoad === 'function') {
                    onLoad(placeholder);
                }

                if (typeof onError === 'function') {
                    onError(error);
                }
            }
        );
    };

    return function restoreImageLoader() {
        THREE.ImageLoader.prototype.load = originalImageLoaderLoad;
    };
}

// ====================================
// Initialize Three.js Scene
// ====================================
function init() {
    const canvas = document.getElementById('model-canvas');
    const container = document.getElementById('viewer-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    // Camera
    camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(initialCameraPosition.x, initialCameraPosition.y, initialCameraPosition.z);

    // Renderer
    renderer = new THREE.WebGLRenderer({ 
        canvas: canvas,
        antialias: true,
        alpha: true
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    // Lighting
    ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 10, 7.5);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -10;
    directionalLight.shadow.camera.right = 10;
    directionalLight.shadow.camera.top = 10;
    directionalLight.shadow.camera.bottom = -10;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // Additional fill light
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-5, 5, -5);
    scene.add(fillLight);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 0.5;
    controls.maxDistance = 50;
    controls.maxPolarAngle = Math.PI;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 1.0;

    // Picking helpers for click-based part selection
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();
    renderer.domElement.addEventListener('click', onCanvasClick, false);

    // Keyboard actions
    window.addEventListener('keydown', onViewerKeydown, false);

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);

    // Start animation loop
    animate();
}

// ====================================
// Animation Loop
// ====================================
function animate() {
    requestAnimationFrame(animate);
    if (cameraTween) {
        updateCameraTween();
    }
    if (selectionHelpers.length > 0) {
        selectionHelpers.forEach((helper) => helper.update());
    }
    controls.update();
    renderer.render(scene, camera);
}

// ====================================
// Window Resize Handler
// ====================================
function onWindowResize() {
    const container = document.getElementById('viewer-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

// ====================================
// Load GLTF Model
// ====================================
function loadModel(modelPath) {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');

    loadingEl.style.display = 'block';
    errorEl.style.display = 'none';

    function finishLoadedModel(gltf) {
        model = gltf.scene;
        clearSelectionHelpers();
        selectedParts = [];

        // Calculate bounding box and center model
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        // Center the model
        model.position.x = -center.x;
        model.position.y = -center.y;
        model.position.z = -center.z;

        // Start model rotated 90 degrees for initial view
        model.rotation.y = Math.PI / 2;

        // Add to scene
        scene.add(model);

        // Overlay edge lines on every mesh
        addEdgeLines(model);

        // Auto-scale camera based on model size
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.5; // Add some padding
        camera.position.z = cameraZ;
        camera.updateProjectionMatrix();

        // Update controls target
        controls.target.set(0, 0, 0);
        controls.update();

        // Store initial camera position
        initialCameraPosition = {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z
        };

        // Extract groups for visibility toggles
        extractGroups(model);
        showAllParts();

        // Hide loading
        loadingEl.style.display = 'none';

        console.log('Model loaded successfully:', modelPath);
    }

    function attemptLoad(disableImageBitmap, tolerateTextureErrors) {
        const previousCreateImageBitmap = window.createImageBitmap;
        const restoreImageLoader = tolerateTextureErrors ? patchImageLoaderWithPlaceholder() : null;

        if (disableImageBitmap && typeof window.createImageBitmap !== 'undefined') {
            window.createImageBitmap = undefined;
        }

        const loader = new THREE.GLTFLoader();
        loader.load(
            modelPath,
            function (gltf) {
                if (restoreImageLoader) {
                    restoreImageLoader();
                }
                if (disableImageBitmap) {
                    window.createImageBitmap = previousCreateImageBitmap;
                }
                finishLoadedModel(gltf);
            },
            function (xhr) {
                const percent = xhr.total ? (xhr.loaded / xhr.total * 100).toFixed(0) : '...';
                loadingEl.textContent = disableImageBitmap
                    ? `Loading 3D model (compatibility mode)... ${percent}%`
                    : `Loading 3D model... ${percent}%`;
            },
            function (error) {
                if (restoreImageLoader) {
                    restoreImageLoader();
                }
                if (disableImageBitmap) {
                    window.createImageBitmap = previousCreateImageBitmap;
                }

                if (!disableImageBitmap && isImageDecodeError(error)) {
                    console.warn('Image decode failed. Retrying with compatibility texture loader.');
                    loadingEl.textContent = 'Texture decode issue detected. Retrying...';
                    attemptLoad(true, false);
                    return;
                }

                if (disableImageBitmap && !tolerateTextureErrors && (isImageDecodeError(error) || isLikelyTextureEventError(error))) {
                    console.warn('Compatibility load still failed. Retrying with placeholder textures.');
                    loadingEl.textContent = 'Some textures are not decodable. Loading with fallback textures...';
                    attemptLoad(true, true);
                    return;
                }

                console.error('Error loading model:', error);
                loadingEl.style.display = 'none';
                errorEl.style.display = 'block';
                errorEl.textContent = `Error loading model: ${getErrorMessage(error) || 'Unknown error'}. Please check the file path and format.`;
            }
        );
    }

    attemptLoad(false, false);
}

// ====================================
// Extract Groups from Model
// ====================================
function extractGroups(object) {
    modelGroups = [];
    const groupTogglesContainer = document.getElementById('group-toggles');
    groupTogglesContainer.innerHTML = '';

    object.traverse((child) => {
        if (child.isMesh && child.parent && child.parent.name) {
            const groupName = child.parent.name;
            if (!modelGroups.find(g => g.name === groupName)) {
                modelGroups.push({
                    name: groupName,
                    object: child.parent,
                    visible: true
                });

                // Create toggle checkbox
                const toggleDiv = document.createElement('div');
                toggleDiv.className = 'group-toggle';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `group-${groupName}`;
                checkbox.checked = true;
                checkbox.addEventListener('change', (e) => {
                    toggleGroupVisibility(groupName, e.target.checked);
                });

                const label = document.createElement('label');
                label.htmlFor = `group-${groupName}`;
                label.textContent = groupName || 'Unnamed Group';

                toggleDiv.appendChild(checkbox);
                toggleDiv.appendChild(label);
                groupTogglesContainer.appendChild(toggleDiv);
            }
        }
    });

    // Show group controls if we have groups
    if (modelGroups.length > 0) {
        console.log(`Found ${modelGroups.length} groups in model`);
    }
}

// ====================================
// Toggle Group Visibility
// ====================================
function toggleGroupVisibility(groupName, visible) {
    const group = modelGroups.find(g => g.name === groupName);
    if (group) {
        group.object.visible = visible;
        group.visible = visible;

        if (!visible && selectedParts.includes(group.object)) {
            setSelectedParts(selectedParts.filter((part) => part !== group.object));
        }
    }
}

// ====================================
// Toggle Group Controls Panel
// ====================================
function toggleGroupControls() {
    const panel = document.getElementById('group-controls');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

// ====================================
// Reset Camera to Initial Position
// ====================================
function resetCamera() {
    if (!camera || !controls) return;
    startCameraTween(
        new THREE.Vector3(initialCameraPosition.x, initialCameraPosition.y, initialCameraPosition.z),
        new THREE.Vector3(0, 0, 0),
        700
    );
}

function ensureToastHost() {
    if (toastHost) return toastHost;

    toastHost = document.createElement('div');
    toastHost.id = 'viewer-toast-host';
    toastHost.style.position = 'fixed';
    toastHost.style.left = '50%';
    toastHost.style.bottom = '92px';
    toastHost.style.transform = 'translateX(-50%)';
    toastHost.style.zIndex = '40';
    toastHost.style.pointerEvents = 'none';
    document.body.appendChild(toastHost);
    return toastHost;
}

function showToast(message) {
    const host = ensureToastHost();
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.background = 'rgba(15, 15, 24, 0.92)';
    toast.style.color = 'rgba(255, 255, 255, 0.92)';
    toast.style.border = '1px solid rgba(255, 255, 255, 0.2)';
    toast.style.borderRadius = '999px';
    toast.style.padding = '8px 14px';
    toast.style.fontSize = '12px';
    toast.style.letterSpacing = '0.08em';
    toast.style.textTransform = 'uppercase';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'opacity 180ms ease, transform 180ms ease';
    toast.style.marginTop = '8px';

    host.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    window.setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px)';
        window.setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 220);
    }, 1500);
}

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function startCameraTween(targetPosition, targetLookAt, durationMs) {
    if (!camera || !controls || !targetPosition || !targetLookAt) return;

    cameraTween = {
        startTime: performance.now(),
        duration: Math.max(1, durationMs || 650),
        fromPosition: camera.position.clone(),
        toPosition: targetPosition.clone(),
        fromTarget: controls.target.clone(),
        toTarget: targetLookAt.clone(),
    };
}

function updateCameraTween() {
    if (!cameraTween || !camera || !controls) return;

    const elapsed = performance.now() - cameraTween.startTime;
    const progress = Math.min(1, elapsed / cameraTween.duration);
    const eased = easeInOutCubic(progress);

    camera.position.lerpVectors(cameraTween.fromPosition, cameraTween.toPosition, eased);
    controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, eased);

    if (progress >= 1) {
        camera.position.copy(cameraTween.toPosition);
        controls.target.copy(cameraTween.toTarget);
        cameraTween = null;
    }
}

function updateButtonText(id, text) {
    const button = document.getElementById(id);
    if (button) {
        button.textContent = text;
    }
}

function setButtonActiveState(id, isActive) {
    const button = document.getElementById(id);
    if (!button) return;

    if (isActive) {
        button.classList.add('active');
    } else {
        button.classList.remove('active');
    }
}

function forEachMeshMaterial(mesh, callback) {
    if (!mesh || !mesh.isMesh || !mesh.material) return;

    if (Array.isArray(mesh.material)) {
        mesh.material.forEach((mat) => {
            if (mat) callback(mat);
        });
        return;
    }

    callback(mesh.material);
}

function applyOpacityToPart(part, opacity) {
    if (!part) return;

    part.traverse((child) => {
        if (!child.isMesh) return;
        forEachMeshMaterial(child, (material) => {
            material.transparent = opacity < 1;
            material.opacity = opacity;
            material.needsUpdate = true;
        });
    });
}

function clearSelectionHelpers() {
    if (!scene || selectionHelpers.length === 0) return;
    selectionHelpers.forEach((helper) => scene.remove(helper));
    selectionHelpers = [];
}

function refreshSelectionHelpers() {
    clearSelectionHelpers();
    if (!scene || selectedParts.length === 0) return;

    selectedParts.forEach((part, index) => {
        const color = index === 0 ? 0x67c8ff : 0xffba66;
        const helper = new THREE.BoxHelper(part, color);
        selectionHelpers.push(helper);
        scene.add(helper);
    });
}

function setSelectedParts(parts) {
    const uniqueVisibleParts = [];
    (parts || []).forEach((part) => {
        if (!part || !part.visible || uniqueVisibleParts.includes(part)) return;
        uniqueVisibleParts.push(part);
    });

    selectedParts = uniqueVisibleParts;
    refreshSelectionHelpers();
    setButtonActiveState('btn-isolate', false);
}

function getPrimarySelectedPart() {
    return selectedParts.length > 0 ? selectedParts[0] : null;
}

function clearSelection() {
    setSelectedParts([]);
}

function getModelRootChild(object) {
    if (!model || !object) return null;

    let current = object;
    while (current && current.parent && current.parent !== model) {
        current = current.parent;
    }

    if (current && current.parent === model) {
        return current;
    }

    return null;
}

function syncGroupCheckboxes() {
    modelGroups.forEach((group) => {
        const checkbox = document.getElementById(`group-${group.name}`);
        if (checkbox) {
            checkbox.checked = !!group.object.visible;
        }
    });
}

function onCanvasClick(event) {
    if (!model || !raycaster || !pointer || event.button !== 0) return;

    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster
        .intersectObject(model, true)
        .filter((hit) => hit.object && hit.object.name !== '__edges__');

    if (hits.length === 0) {
        if (!event.shiftKey) {
            clearSelection();
        }
        return;
    }

    const part = getModelRootChild(hits[0].object);
    if (part) {
        if (event.shiftKey) {
            if (selectedParts.includes(part)) {
                setSelectedParts(selectedParts.filter((selected) => selected !== part));
            } else {
                setSelectedParts([...selectedParts, part]);
            }
        } else {
            setSelectedParts([part]);
        }
    }
}

function isolateSelection() {
    if (!model) return;
    if (selectedParts.length === 0) {
        showToast('Select a part first (Shift+Click for multi-select)');
        return;
    }

    const selectedSet = new Set(selectedParts);

    if (modelGroups.length > 0) {
        modelGroups.forEach((group) => {
            const isSelected = selectedSet.has(group.object);
            group.object.visible = isSelected;
            group.visible = isSelected;
            applyOpacityToPart(group.object, 1);
        });
        syncGroupCheckboxes();
    } else {
        model.children.forEach((child) => {
            child.visible = selectedSet.has(child);
        });
    }

    setButtonActiveState('btn-isolate', true);
}

function showAllParts() {
    if (!model) return;

    if (modelGroups.length > 0) {
        modelGroups.forEach((group) => {
            group.object.visible = true;
            group.visible = true;
            applyOpacityToPart(group.object, 1);
        });
        syncGroupCheckboxes();
    } else {
        model.children.forEach((child) => {
            child.visible = true;
        });
    }

    setButtonActiveState('btn-isolate', false);
}

function focusSelection() {
    if (!camera || !controls) return;
    if (selectedParts.length === 0) {
        showToast('Select a part first (Shift+Click for multi-select)');
        return;
    }

    const box = new THREE.Box3();
    selectedParts.forEach((part) => box.expandByObject(part));
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    if (!isFinite(maxDim) || maxDim <= 0) return;

    const fov = camera.fov * (Math.PI / 180);
    const distance = (maxDim / 2) / Math.tan(fov / 2) * 1.8;
    const viewDirection = camera.position.clone().sub(controls.target);
    if (viewDirection.lengthSq() < 0.0001) {
        viewDirection.set(1, 0.5, 1);
    }
    viewDirection.normalize();

    const newPosition = center.clone().add(viewDirection.multiplyScalar(distance));
    startCameraTween(newPosition, center, 650);
}

function toggleAutoRotate() {
    autoRotateEnabled = !autoRotateEnabled;
    if (controls) {
        controls.autoRotate = autoRotateEnabled;
        controls.autoRotateSpeed = 1.2;
    }

    updateButtonText('btn-auto-rotate', `Auto Rotate: ${autoRotateEnabled ? 'On' : 'Off'}`);
    setButtonActiveState('btn-auto-rotate', autoRotateEnabled);
}

function slugifyFilename(text) {
    return String(text || 'model')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'model';
}

function captureScreenshot() {
    if (!renderer) return;

    renderer.render(scene, camera);
    const link = document.createElement('a');
    const modelTitle = document.getElementById('modelTitle');
    const title = modelTitle ? modelTitle.textContent : 'model';
    link.download = `${slugifyFilename(title)}-${Date.now()}.png`;
    link.href = renderer.domElement.toDataURL('image/png');
    link.click();
}

function onViewerKeydown(event) {
    const target = event.target;
    const typingInField =
        target && (
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable
        );

    if (typingInField) return;

    const key = String(event.key || '').toLowerCase();
    switch (key) {
        case 'r':
            resetCamera();
            break;
        case 'e':
            toggleEdges();
            break;
        case 'w':
            toggleWireframe();
            break;
        case 'i':
            isolateSelection();
            break;
        case 'f':
            focusSelection();
            break;
        case 'a':
            toggleAutoRotate();
            break;
        case 'p':
            captureScreenshot();
            break;
        case 'escape':
            showAllParts();
            clearSelection();
            break;
        default:
            return;
    }

    event.preventDefault();
}

// ====================================
// Add Edge Lines to Model
// ====================================
function addEdgeLines(object) {
    object.traverse((child) => {
        if (child.isMesh) {
            try {
                const edges = new THREE.EdgesGeometry(child.geometry, 20);
                const lineMaterial = new THREE.LineBasicMaterial({
                    color: 0x000000,
                    transparent: true,
                    opacity: 0.6,
                    linewidth: 1,
                });
                const lineSegments = new THREE.LineSegments(edges, lineMaterial);
                lineSegments.name = '__edges__';
                child.add(lineSegments);
            } catch (e) {
                // Skip meshes whose geometry can't produce edges
            }
        }
    });
}

// ====================================
// Toggle Edge Lines
// ====================================
function toggleEdges() {
    if (!model) return;
    edgesVisible = !edgesVisible;
    model.traverse((child) => {
        if (child.name === '__edges__') {
            child.visible = edgesVisible;
        }
    });
    updateButtonText('btn-edges', `Edges: ${edgesVisible ? 'On' : 'Off'}`);
    setButtonActiveState('btn-edges', edgesVisible);
}

// ====================================
// Toggle Wireframe Mode
// ====================================
function toggleWireframe() {
    if (!model) return;

    wireframeVisible = !wireframeVisible;
    model.traverse((child) => {
        if (!child.isMesh) return;
        forEachMeshMaterial(child, (material) => {
            material.wireframe = wireframeVisible;
            material.needsUpdate = true;
        });
    });

    updateButtonText('btn-wire', `Wireframe: ${wireframeVisible ? 'On' : 'Off'}`);
    setButtonActiveState('btn-wire', wireframeVisible);
}

// ====================================
// Get URL Parameters
// ====================================
function getUrlParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

// ====================================
// Load Project Data & Model Info
// ====================================
async function loadProjectData() {
    try {
        const modelPath = getUrlParam('model');
        const projectId = getUrlParam('id');

        if (!modelPath) {
            throw new Error('No model path specified in URL');
        }

        // Try to load project data from JSON
        const response = await fetch('assets/data/projects.json');
        if (response.ok) {
            const projects = await response.json();
            const project = projectId 
                ? projects.find(p => p.id === projectId)
                : projects.find(p => p.model_path === modelPath);

            if (project) {
                document.getElementById('modelTitle').textContent = project.title || 'Untitled Model';
                document.getElementById('modelDescription').textContent = project.description || '';
                
                // Load related models (exclude current)
                loadRelatedModels(projects.filter(p => p.id !== project.id && p.model_path));
            } else {
                // Fallback if project not found
                document.getElementById('modelTitle').textContent = '3D Model Viewer';
                document.getElementById('modelDescription').textContent = modelPath;
            }
        }

        // Load the 3D model
        loadModel(modelPath);

    } catch (error) {
        console.error('Error loading project data:', error);
        document.getElementById('modelTitle').textContent = 'Error Loading Model';
        document.getElementById('modelDescription').textContent = error.message;
        document.getElementById('error').style.display = 'block';
        document.getElementById('error').textContent = error.message;
        document.getElementById('loading').style.display = 'none';
    }
}

// ====================================
// Load Related Models
// ====================================
function loadRelatedModels(projects) {
    const container = document.getElementById('relatedModels');
    if (!container || projects.length === 0) {
        return;
    }

    container.innerHTML = '';
    
    // Show max 3 related models
    projects.slice(0, 3).forEach(project => {
        const card = document.createElement('div');
        card.className = 'model-card';
        
        const img = project.image 
            ? `<img src="${project.image}" alt="${project.title}">`
            : `<div class="model-thumbnail-placeholder">No Image</div>`;
        
        card.innerHTML = `
            <a href="project-detail.html?model=${project.model_path}&id=${project.id}">
                ${img}
                <h3>${project.title}</h3>
            </a>
        `;
        
        container.appendChild(card);
    });
}

// ====================================
// Initialize on Page Load
// ====================================
window.addEventListener('DOMContentLoaded', () => {
    init();
    loadProjectData();
});
