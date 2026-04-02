// ====================================
// GLTF Viewer 2.0 - Three.js Logic
// ====================================

let scene, camera, renderer, controls, transformControls, model;
let ambientLight, directionalLight;
let modelGroups = [];
let initialCameraPosition = { x: 0, y: 1, z: 2 };
let edgesVisible = false;
let wireframeVisible = false;
let raycaster, pointer;
let selectedParts = [];
let selectionHelpers = [];
const showSelectionBoxes = false;
let autoRotateEnabled = false;
let cameraTween = null;
let toastHost = null;
let hasUserInteracted = false;
let autoRotateAngle = 0;
let autoRotateRadius = 0;
let autoRotateHeight = 0;
let initialModelRotationY = 0;
let startupModelRotationY = -THREE.MathUtils.degToRad(90);
let autoRotateStartTime = 0;
let autoRotateDelayMs = 900;
let modelCenterOffset = { x: 0, y: 0, z: 0 };
let explodeEnabled = false;
let explodeTween = null;
let explodeProgress = 0;
let explodeDistanceScale = 1;
let explodeBaseDistance = 1;
let explodeCenter = new THREE.Vector3(0, 0, 0);
const explodePartData = new WeakMap();
const initialNodeState = new WeakMap();
let initialStateNodes = [];
let measureMode = 'none';
let measurePoints = [];
let measureHelpers = [];
let measureSnapPriority = 'vertex';
const MEASURE_MM_PER_UNIT = 1000;
const MEASURE_TRIANGLE_SNAP_LIMIT = 12000;
const MEASURE_SNAP_RESOLUTION = 0.01;
let commentMode = false;
let commentAnnotations = [];
let commentHelpers = [];
let commentsVisible = true;
let selectedCommentId = '';
const COMMENT_STORAGE_PREFIX = 'viewer-comments::';
const COMMENT_XML_VERSION = '1';
let commentStorageKey = '';

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

function getPartActionState(part) {
    let state = partActionState.get(part);
    if (state) return state;

    state = {
        isOpen: false,
        currentValue: 0,
        animationFrameId: 0,
        animationToken: 0,
        transformType: null,
        axis: 'y',
        baseValue: 0,
        configId: null
    };

    partActionState.set(part, state);
    return state;
}

function readPartTransformValue(part, actionType, axis) {
    if (actionType === 'hinge') {
        return part.rotation[axis];
    }
    return part.position[axis];
}

function writePartTransformValue(part, actionType, axis, value) {
    if (actionType === 'hinge') {
        part.rotation[axis] = value;
        return;
    }
    part.position[axis] = value;
}

function captureInitialModelState() {
    initialStateNodes = [];
    if (!model) return;

    model.traverse((node) => {
        if (!node || node.name === '__edges__') return;
        initialNodeState.set(node, {
            position: node.position.clone(),
            quaternion: node.quaternion.clone(),
            scale: node.scale.clone(),
            visible: node.visible
        });
        initialStateNodes.push(node);
    });
}

function restoreInitialModelState() {
    if (!model || initialStateNodes.length === 0) return;

    initialStateNodes.forEach((node) => {
        const state = initialNodeState.get(node);
        if (!state) return;
        node.position.copy(state.position);
        node.quaternion.copy(state.quaternion);
        node.scale.copy(state.scale);
        node.visible = state.visible;
        node.updateMatrixWorld(true);
    });
}

function resetPartActionStates() {
    if (initialStateNodes.length === 0) return;

    initialStateNodes.forEach((node) => {
        const state = partActionState.get(node);
        if (!state) return;
        if (state.animationFrameId) {
            cancelAnimationFrame(state.animationFrameId);
        }
        state.isOpen = false;
        state.currentValue = 0;
        state.animationFrameId = 0;
        state.animationToken += 1;
        state.transformType = null;
        state.axis = 'y';
        state.baseValue = 0;
        state.configId = null;
    });
}

function setMeasureStatus(text) {
    const status = document.getElementById('measure-status');
    if (!status) return;
    status.textContent = text || '';
}

function updateMeasureButtons() {
    setButtonActiveState('btn-measure-distance', measureMode === 'distance');
    setButtonActiveState('btn-measure-angle', measureMode === 'angle');

    const snapButton = document.getElementById('btn-measure-snap');
    if (snapButton) {
        const isVertexOnly = measureSnapPriority === 'vertex';
        snapButton.textContent = `Snap Points: ${isVertexOnly ? 'On' : 'Off'}`;
        setButtonActiveState('btn-measure-snap', isVertexOnly);
    }
}

function updateCommentButtons() {
    const button = document.getElementById('btn-comment-mode');
    if (button) {
        button.textContent = `Comment Mode: ${commentMode ? 'On' : 'Off'}`;
        setButtonActiveState('btn-comment-mode', commentMode);
    }

    const visibilityButton = document.getElementById('btn-comment-visibility');
    if (visibilityButton) {
        visibilityButton.textContent = `Comments: ${commentsVisible ? 'Hide' : 'Show'}`;
        setButtonActiveState('btn-comment-visibility', commentsVisible);
    }

    const hasSelection = !!selectedCommentId;
    const editButton = document.getElementById('btn-comment-edit');
    if (editButton) {
        setButtonActiveState('btn-comment-edit', hasSelection);
    }

    const deleteButton = document.getElementById('btn-comment-delete');
    if (deleteButton) {
        setButtonActiveState('btn-comment-delete', hasSelection);
    }
}

function setSelectedComment(commentId = '') {
    selectedCommentId = commentId || '';
    commentAnnotations.forEach((annotation) => {
        if (!annotation || !annotation.container) return;
        const marker = annotation.marker;
        if (marker && marker.material) {
            marker.material.color.setHex(annotation.id === selectedCommentId ? 0x67c8ff : 0xffd166);
        }
    });
    updateCommentButtons();
}

function findCommentById(commentId) {
    return commentAnnotations.find((annotation) => annotation && annotation.id === commentId) || null;
}

function findCommentIdFromObject(object) {
    let scan = object;
    while (scan) {
        if (scan.userData && scan.userData.commentId) {
            return scan.userData.commentId;
        }
        scan = scan.parent;
    }
    return '';
}

function toggleCommentsVisibility() {
    commentsVisible = !commentsVisible;
    commentHelpers.forEach((obj) => {
        obj.visible = commentsVisible;
    });
    updateCommentButtons();
    showToast(commentsVisible ? 'Comments shown' : 'Comments hidden');
}

function detachObjectFromParent(obj) {
    if (!obj) return;
    if (obj.parent) {
        obj.parent.remove(obj);
        return;
    }
    if (scene) {
        scene.remove(obj);
    }
}

function getCommentStorageKey() {
    const modelPath = getUrlParam('model') || 'unknown-model';
    return `${COMMENT_STORAGE_PREFIX}${modelPath}`;
}

function getCurrentModelPath() {
    return getUrlParam('model') || '';
}

function getCommentsApiUrl() {
    // viewer.js is loaded as a classic script (not ES module), so avoid import.meta.
    // Use global override from viewer.html in production, else local middleware endpoint.
    if (typeof window !== 'undefined' && typeof window.COMMENTS_API_URL === 'string' && window.COMMENTS_API_URL.trim()) {
        return window.COMMENTS_API_URL.trim();
    }
    return '/api/comments';
}

function getProjectNameFromModelPath(modelPath) {
    // Extract project name from path like "projects/Campervan-bed/glb/model.glb"
    const match = modelPath.match(/projects\/([^/]+)/);
    return match ? match[1] : null;
}

async function saveCommentsToServer(xmlPayload) {
    const modelPath = getCurrentModelPath();
    if (!modelPath) throw new Error('Missing model path');

    const project = getProjectNameFromModelPath(modelPath);
    if (!project) throw new Error('Invalid project path');

    const apiUrl = getCommentsApiUrl();
    const url = `${apiUrl}?modelPath=${encodeURIComponent(modelPath)}&project=${encodeURIComponent(project)}`;

    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ modelPath, xml: xmlPayload })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to save comments');
    }
}

async function loadCommentsFromServer() {
    const modelPath = getCurrentModelPath();
    if (!modelPath) return '';

    const project = getProjectNameFromModelPath(modelPath);
    if (!project) return '';

    const apiUrl = getCommentsApiUrl();
    const url = `${apiUrl}?modelPath=${encodeURIComponent(modelPath)}&project=${encodeURIComponent(project)}`;

    const response = await fetch(url, {
        method: 'GET'
    });

    if (response.status === 404) {
        return '';
    }

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to load comments');
    }

    return response.text();
}

async function deleteCommentsOnServer() {
    const modelPath = getCurrentModelPath();
    if (!modelPath) throw new Error('Missing model path');

    const project = getProjectNameFromModelPath(modelPath);
    if (!project) throw new Error('Invalid project path');

    const apiUrl = getCommentsApiUrl();
    const url = `${apiUrl}?modelPath=${encodeURIComponent(modelPath)}&project=${encodeURIComponent(project)}`;

    const response = await fetch(url, {
        method: 'DELETE'
    });

    if (!response.ok && response.status !== 404) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to delete comments');
    }
}

function getNodePathFromRoot(node, root) {
    if (!node || !root) return '';
    if (node === root) return 'root';

    const indices = [];
    let current = node;
    while (current && current !== root) {
        const parent = current.parent;
        if (!parent) return '';
        const index = parent.children.indexOf(current);
        if (index < 0) return '';
        indices.push(index);
        current = parent;
    }

    if (current !== root) return '';
    return `root/${indices.reverse().join('/')}`;
}

function resolveNodePathFromRoot(root, path) {
    if (!root || !path || typeof path !== 'string') return null;
    if (path === 'root') return root;
    if (!path.startsWith('root/')) return null;

    const segments = path.slice(5).split('/').filter(Boolean);
    let current = root;
    for (let i = 0; i < segments.length; i += 1) {
        const index = Number(segments[i]);
        if (!Number.isInteger(index) || index < 0 || !current.children || index >= current.children.length) {
            return null;
        }
        current = current.children[index];
    }
    return current;
}

function makeAnnotationLabelSprite(text, color = '#ffffff') {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(12, 16, 28, 0.88)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
    ctx.lineWidth = 4;
    const pad = 6;
    const w = canvas.width - pad * 2;
    const h = canvas.height - pad * 2;
    const r = 28;
    const x = pad;
    const y = pad;

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = '600 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const displayText = String(text || '').slice(0, 120);
    ctx.fillText(displayText, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false
    });
    return new THREE.Sprite(material);
}

function disposeObjectResources(obj) {
    if (!obj) return;
    obj.traverse((child) => {
        if (child.geometry && typeof child.geometry.dispose === 'function') {
            child.geometry.dispose();
        }
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach((m) => {
                    if (m && m.map && typeof m.map.dispose === 'function') m.map.dispose();
                    if (m && typeof m.dispose === 'function') m.dispose();
                });
            } else {
                if (child.material.map && typeof child.material.map.dispose === 'function') child.material.map.dispose();
                if (typeof child.material.dispose === 'function') child.material.dispose();
            }
        }
    });
}

function serializeCommentsToXml() {
    const safe = (value) => String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const lines = [`<comments version="${COMMENT_XML_VERSION}">`];
    commentAnnotations.forEach((item) => {
        lines.push(
            `  <comment id="${safe(item.id)}" partPath="${safe(item.partPath)}" x="${item.localPoint.x}" y="${item.localPoint.y}" z="${item.localPoint.z}"><![CDATA[${String(item.text || '')}]]></comment>`
        );
    });
    lines.push('</comments>');
    return lines.join('\n');
}

function saveComments() {
    if (!commentStorageKey) {
        commentStorageKey = getCommentStorageKey();
    }

    const payload = serializeCommentsToXml();

    // Keep a local fallback copy for offline/debug scenarios.
    try {
        localStorage.setItem(commentStorageKey, payload);
    } catch (error) {
        console.warn('Unable to save comments:', error);
    }

    saveCommentsToServer(payload).catch((error) => {
        console.warn('Unable to save comments to server:', error);
        showToast('Comment saved locally (server unavailable)');
    });
}

function addCommentAnnotation(part, localPoint, text, id = null, persist = true, partPath = '') {
    if (!scene || !part || !localPoint || !text) return;

    const safeId = id || `c-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const pointClone = localPoint.clone();
    const safePath = partPath || getNodePathFromRoot(part, model);
    if (!safePath) return;

    const container = new THREE.Group();
    container.name = '__comment__';
    container.position.copy(pointClone);
    container.userData.commentId = safeId;

    const lift = Math.max(0.08, explodeBaseDistance * 0.2);
    const labelPos = new THREE.Vector3(0, lift, 0);
    const arrowDirection = new THREE.Vector3(0, -1, 0);
    const arrowLength = Math.max(0.06, lift * 0.9);

    const arrow = new THREE.ArrowHelper(arrowDirection, labelPos, arrowLength, 0xffd166, arrowLength * 0.26, arrowLength * 0.14);
    const marker = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.0025, explodeBaseDistance * 0.008), 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffd166 })
    );
    marker.position.set(0, 0, 0);
    marker.userData.commentId = safeId;

    const label = makeAnnotationLabelSprite(text, '#ffe7ad');
    if (label) {
        const labelScale = Math.max(0.2, explodeBaseDistance * 0.2);
        label.scale.set(labelScale * 2.2, labelScale * 0.55, 1);
        label.position.copy(labelPos.clone().add(new THREE.Vector3(0, Math.max(0.02, explodeBaseDistance * 0.04), 0)));
        label.userData.commentId = safeId;
    }

    container.add(arrow);
    container.add(marker);
    if (label) {
        container.add(label);
    }

    container.visible = commentsVisible;
    part.add(container);
    commentHelpers.push(container);

    commentAnnotations.push({
        id: safeId,
        text: String(text),
        partPath: safePath,
        localPoint: pointClone,
        part,
        container,
        marker
    });

    if (persist) {
        saveComments();
    }
}

function clearComments(deleteStorage = false) {
    if (scene && commentHelpers.length > 0) {
        commentHelpers.forEach((obj) => {
            detachObjectFromParent(obj);
            disposeObjectResources(obj);
        });
    }
    commentHelpers = [];
    commentAnnotations = [];
    commentsVisible = true;
    selectedCommentId = '';

    if (!commentStorageKey) {
        commentStorageKey = getCommentStorageKey();
    }

    if (deleteStorage) {
        try {
            localStorage.removeItem(commentStorageKey);
        } catch (error) {
            console.warn('Unable to clear comments:', error);
        }

        deleteCommentsOnServer().catch((error) => {
            console.warn('Unable to clear comments on server:', error);
            showToast('Could not delete comments on server');
        });
    }

    updateCommentButtons();
}

function removeCommentAnnotationById(commentId) {
    const annotation = findCommentById(commentId);
    if (!annotation) return false;

    if (annotation.container) {
        detachObjectFromParent(annotation.container);
        disposeObjectResources(annotation.container);
        commentHelpers = commentHelpers.filter((obj) => obj !== annotation.container);
    }

    commentAnnotations = commentAnnotations.filter((item) => item.id !== commentId);
    return true;
}

async function loadComments() {
    clearComments(false);
    if (!commentStorageKey) {
        commentStorageKey = getCommentStorageKey();
    }

    let raw = null;
    try {
        raw = await loadCommentsFromServer();
    } catch (error) {
        console.warn('Unable to read comments from server:', error);
        try {
            raw = localStorage.getItem(commentStorageKey);
        } catch (fallbackError) {
            console.warn('Unable to read local fallback comments:', fallbackError);
            return;
        }
    }

    if (!raw) return;

    let parsedComments = [];
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(raw, 'application/xml');
        if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
            throw new Error('Invalid XML');
        }

        const nodes = Array.from(xmlDoc.getElementsByTagName('comment'));
        parsedComments = nodes.map((node) => ({
            id: node.getAttribute('id') || '',
            partPath: node.getAttribute('partPath') || '',
            x: Number(node.getAttribute('x')),
            y: Number(node.getAttribute('y')),
            z: Number(node.getAttribute('z')),
            text: node.textContent || ''
        }));
    } catch (error) {
        console.warn('Invalid comment XML payload:', error);
        return;
    }

    if (!Array.isArray(parsedComments)) return;

    parsedComments.forEach((item) => {
        if (!item || !item.partPath) return;
        if (!Number.isFinite(item.x) || !Number.isFinite(item.y) || !Number.isFinite(item.z)) return;
        const part = resolveNodePathFromRoot(model, item.partPath);
        if (!part) return;
        addCommentAnnotation(
            part,
            new THREE.Vector3(item.x, item.y, item.z),
            String(item.text || ''),
            item.id || null,
            false,
            item.partPath
        );
    });

    commentHelpers.forEach((obj) => {
        obj.visible = commentsVisible;
    });
    updateCommentButtons();
}

function toggleCommentMode() {
    commentMode = !commentMode;
    if (commentMode && measureSnapPriority === 'vertex') {
        // While commenting, disable point snap to avoid accidental snap bias.
        measureSnapPriority = 'auto';
        updateMeasureButtons();
    }
    if (!commentMode) {
        setSelectedComment('');
    }
    updateCommentButtons();
    showToast(commentMode ? 'Comment mode on: click model to add note' : 'Comment mode off');
}

function editSelectedComment() {
    if (!selectedCommentId) {
        showToast('Select a comment first');
        return;
    }

    const annotation = findCommentById(selectedCommentId);
    if (!annotation) {
        showToast('Comment not found');
        return;
    }

    const nextText = window.prompt('Edit comment text:', annotation.text || '');
    if (!nextText || !nextText.trim()) return;

    annotation.text = nextText.trim();
    saveComments();
    loadComments().catch((error) => {
        console.warn('Unable to refresh comments after edit:', error);
    });
    showToast('Comment updated');
}

function deleteSelectedComment() {
    if (!selectedCommentId) {
        showToast('Select a comment first');
        return;
    }

    const annotation = findCommentById(selectedCommentId);
    if (!annotation) {
        showToast('Comment not found');
        return;
    }

    const confirmed = window.confirm('Delete this comment?');
    if (!confirmed) return;

    const removedId = selectedCommentId;
    removeCommentAnnotationById(selectedCommentId);
    setSelectedComment('');
    saveComments();
    showToast(`Comment deleted (${removedId})`);
}

function handleCommentPick(hit) {
    if (!hit || !hit.point) return;

    const existingCommentId = findCommentIdFromObject(hit.object);
    if (existingCommentId) {
        setSelectedComment(existingCommentId);
        showToast('Comment selected');
        return;
    }

    const part = getModelRootChild(hit.object);
    if (!part) {
        showToast('Click directly on a part');
        return;
    }

    const snappedPoint = getSnappedMeasurePoint(hit) || hit.point.clone();
    const localPoint = part.worldToLocal(snappedPoint.clone());
    const text = window.prompt('Comment text:');
    if (!text || !text.trim()) return;

    addCommentAnnotation(part, localPoint, text.trim(), null, true, getNodePathFromRoot(part, model));
    setSelectedComment('');
    showToast('Comment saved');
}

function toggleMeasureVertexSnap() {
    measureSnapPriority = measureSnapPriority === 'vertex' ? 'auto' : 'vertex';

    updateMeasureButtons();
    showToast(measureSnapPriority === 'vertex' ? 'Snap points on (vertices only)' : 'Snap points off');

    if (measureMode === 'distance') {
        setMeasureStatus('Distance: pick 2 points (mm)');
    } else if (measureMode === 'angle') {
        setMeasureStatus('Angle: pick 3 points');
    }
}

function clearMeasurements(resetMode = true) {
    if (scene && measureHelpers.length > 0) {
        measureHelpers.forEach((obj) => {
            detachObjectFromParent(obj);
            disposeObjectResources(obj);
        });
    }
    measureHelpers = [];
    measurePoints = [];
    if (resetMode) {
        measureMode = 'none';
    }
    updateMeasureButtons();
    setMeasureStatus('');
}

function setMeasureMode(mode) {
    const normalizedMode = mode === 'distance' || mode === 'angle' ? mode : 'none';
    if (normalizedMode === measureMode) {
        clearMeasurements(true);
        showToast('Measure mode off');
        return;
    }

    clearMeasurements(false);
    measureMode = normalizedMode;
    updateMeasureButtons();

    if (measureMode === 'distance') {
        setMeasureStatus('Distance: pick 2 points (mm)');
        showToast('Distance measure on');
    } else if (measureMode === 'angle') {
        setMeasureStatus('Angle: pick 3 points');
        showToast('Angle measure on');
    } else {
        setMeasureStatus('');
    }
}

function addMeasureMarker(point, color = 0xffd166) {
    if (!scene || !point) return;
    const radius = Math.max(0.0022, explodeBaseDistance * 0.009);
    const marker = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 12, 10),
        new THREE.MeshBasicMaterial({ color })
    );
    marker.position.copy(point);
    scene.add(marker);
    measureHelpers.push(marker);
}

function addMeasureLine(start, end, color = 0x67c8ff) {
    if (!scene || !start || !end) return;
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const line = new THREE.Line(geometry, material);
    scene.add(line);
    measureHelpers.push(line);
}

function addMeasureLabel(text, point, color = '#ffffff') {
    if (!scene || !point) return;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(6, 10, 18, 0.86)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    const r = 28;
    const w = canvas.width - 8;
    const h = canvas.height - 8;
    const x = 4;
    const y = 4;
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = '700 42px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false
    });

    const sprite = new THREE.Sprite(material);
    const baseScale = Math.max(0.18, explodeBaseDistance * 0.18);
    sprite.scale.set(baseScale * 1.9, baseScale * 0.48, 1);
    sprite.position.copy(point);
    scene.add(sprite);
    measureHelpers.push(sprite);
}

function closestPointOnSegment(point, a, b, out) {
    const ab = b.clone().sub(a);
    const denom = ab.lengthSq();
    if (denom <= 1e-12) {
        out.copy(a);
        return out;
    }
    const t = THREE.MathUtils.clamp(point.clone().sub(a).dot(ab) / denom, 0, 1);
    out.copy(a).add(ab.multiplyScalar(t));
    return out;
}

function quantizeValue(value, step) {
    if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
    return Math.round(value / step) * step;
}

function quantizeVector(vector, step) {
    if (!vector) return vector;
    vector.set(
        quantizeValue(vector.x, step),
        quantizeValue(vector.y, step),
        quantizeValue(vector.z, step)
    );
    return vector;
}

function getSnappedMeasurePoint(hit) {
    if (!hit || !hit.object || !hit.point) return null;
    const object = hit.object;
    const geometry = object.geometry;
    if (!geometry || !geometry.attributes || !geometry.attributes.position) {
        return hit.point.clone();
    }

    const positions = geometry.attributes.position;
    const index = geometry.index;
    const localHit = object.worldToLocal(hit.point.clone());

    const temp = new THREE.Vector3();
    const va = new THREE.Vector3();
    const vb = new THREE.Vector3();
    const vc = new THREE.Vector3();
    const edgeCandidate = new THREE.Vector3();
    const bestVertex = new THREE.Vector3();
    const bestEdge = new THREE.Vector3();

    let bestVertexDistSq = Infinity;
    for (let i = 0; i < positions.count; i += 1) {
        temp.fromBufferAttribute(positions, i);
        const d = temp.distanceToSquared(localHit);
        if (d < bestVertexDistSq) {
            bestVertexDistSq = d;
            bestVertex.copy(temp);
        }
    }

    let bestEdgeDistSq = Infinity;
    const triangleCount = Math.floor((index ? index.count : positions.count) / 3);
    const maxTriangles = Math.min(triangleCount, MEASURE_TRIANGLE_SNAP_LIMIT);

    for (let t = 0; t < maxTriangles; t += 1) {
        const aIndex = index ? index.getX(t * 3) : t * 3;
        const bIndex = index ? index.getX(t * 3 + 1) : t * 3 + 1;
        const cIndex = index ? index.getX(t * 3 + 2) : t * 3 + 2;
        if (aIndex >= positions.count || bIndex >= positions.count || cIndex >= positions.count) {
            continue;
        }

        va.fromBufferAttribute(positions, aIndex);
        vb.fromBufferAttribute(positions, bIndex);
        vc.fromBufferAttribute(positions, cIndex);

        closestPointOnSegment(localHit, va, vb, edgeCandidate);
        let d = edgeCandidate.distanceToSquared(localHit);
        if (d < bestEdgeDistSq) {
            bestEdgeDistSq = d;
            bestEdge.copy(edgeCandidate);
        }

        closestPointOnSegment(localHit, vb, vc, edgeCandidate);
        d = edgeCandidate.distanceToSquared(localHit);
        if (d < bestEdgeDistSq) {
            bestEdgeDistSq = d;
            bestEdge.copy(edgeCandidate);
        }

        closestPointOnSegment(localHit, vc, va, edgeCandidate);
        d = edgeCandidate.distanceToSquared(localHit);
        if (d < bestEdgeDistSq) {
            bestEdgeDistSq = d;
            bestEdge.copy(edgeCandidate);
        }
    }

    let snappedLocal = bestVertex;
    if (measureSnapPriority === 'vertex') {
        snappedLocal = bestVertex;
    } else if (measureSnapPriority === 'edge') {
        snappedLocal = Number.isFinite(bestEdgeDistSq) && bestEdgeDistSq < Infinity ? bestEdge : bestVertex;
    } else {
        snappedLocal = bestEdgeDistSq < bestVertexDistSq ? bestEdge : bestVertex;
    }

    quantizeVector(snappedLocal, MEASURE_SNAP_RESOLUTION);

    return object.localToWorld(snappedLocal.clone());
}

function handleMeasurePick(hit) {
    if (!hit || measureMode === 'none') return;

    if ((measureMode === 'distance' && measurePoints.length >= 2) ||
        (measureMode === 'angle' && measurePoints.length >= 3)) {
        clearMeasurements(false);
    }

    const pickedPoint = getSnappedMeasurePoint(hit);
    if (!pickedPoint) return;
    measurePoints.push(pickedPoint);
    addMeasureMarker(pickedPoint);

    if (measureMode === 'distance') {
        if (measurePoints.length < 2) {
            setMeasureStatus('Distance: pick 2 points (mm)');
            return;
        }

        addMeasureLine(measurePoints[0], measurePoints[1], 0x67c8ff);
        const distanceMm = measurePoints[0].distanceTo(measurePoints[1]) * MEASURE_MM_PER_UNIT;
        const mid = measurePoints[0].clone().add(measurePoints[1]).multiplyScalar(0.5);
        const labelPos = mid.clone().add(new THREE.Vector3(0, Math.max(0.02, explodeBaseDistance * 0.06), 0));
        const labelText = `${distanceMm.toFixed(1)} mm`;
        addMeasureLabel(labelText, labelPos, '#8fe3ff');
        setMeasureStatus(`Distance: ${labelText}`);
        return;
    }

    if (measureMode === 'angle') {
        if (measurePoints.length === 2) {
            addMeasureLine(measurePoints[0], measurePoints[1], 0xffba66);
            setMeasureStatus('Angle: pick 3 points');
            return;
        }

        if (measurePoints.length === 3) {
            addMeasureLine(measurePoints[1], measurePoints[2], 0xffba66);
            const v1 = measurePoints[0].clone().sub(measurePoints[1]).normalize();
            const v2 = measurePoints[2].clone().sub(measurePoints[1]).normalize();
            const angleRad = v1.angleTo(v2);
            const angleDeg = THREE.MathUtils.radToDeg(angleRad);
            const vertex = measurePoints[1].clone();
            const bisector = v1.clone().add(v2);
            if (bisector.lengthSq() < 1e-10) {
                bisector.set(0, 1, 0);
            } else {
                bisector.normalize();
            }
            const labelPos = vertex.add(bisector.multiplyScalar(Math.max(0.05, explodeBaseDistance * 0.16)));
            const angleText = `${angleDeg.toFixed(2)}°`;
            addMeasureLabel(angleText, labelPos, '#ffd38b');
            setMeasureStatus(`Angle: ${angleText}`);
        }
    }
}

function triggerSelectedPartAction() {
    const selectedPart = getPrimarySelectedPart();
    if (!selectedPart) {
        showToast('Select one part first');
        return;
    }

    const config = getActionConfigForPart(selectedPart);
    if (!config) {
        showToast(`No move action configured for: ${selectedPart.name || 'Part'}`);
        return;
    }

    const state = getPartActionState(selectedPart);
    const targetOpenState = !state.isOpen;

    if (state.transformType !== config.actionType || state.axis !== config.axis || state.configId !== config.id) {
        state.transformType = config.actionType;
        state.axis = config.axis;
        state.baseValue = readPartTransformValue(selectedPart, config.actionType, config.axis) - state.currentValue;
        state.configId = config.id;
    }

    if (state.animationFrameId) {
        cancelAnimationFrame(state.animationFrameId);
        state.animationFrameId = 0;
    }

    const token = state.animationToken + 1;
    state.animationToken = token;

    const startValue = state.currentValue;
    const endValue = targetOpenState ? config.openValue : 0;
    const durationMs = Math.max(80, config.durationMs || 400);
    const startTime = performance.now();

    function step() {
        if (!model || !selectedPart) return;
        if (state.animationToken !== token) return;

        const elapsed = performance.now() - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        const eased = easeInOutCubic(progress);
        const value = startValue + (endValue - startValue) * eased;

        state.currentValue = value;
        writePartTransformValue(selectedPart, config.actionType, config.axis, state.baseValue + value);

        if (progress < 1) {
            state.animationFrameId = requestAnimationFrame(step);
            return;
        }

        state.animationFrameId = 0;
        state.currentValue = endValue;
        state.isOpen = targetOpenState;
    }

    step();
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
    camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 800);
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
    controls.autoRotateSpeed = 0.6;
    controls.addEventListener('start', markViewerInteracted, false);

    // Transform controls for direct drag movement on selected parts.
    transformControls = new THREE.TransformControls(camera, renderer.domElement);
    transformControls.setMode('translate');
    // Use local space so drag axes follow part orientation instead of world axes.
    transformControls.setSpace('local');
    transformControls.size = 0.8;
    transformControls.enabled = false;
    transformControls.visible = false;
    transformControls.addEventListener('dragging-changed', (event) => {
        controls.enabled = !event.value;
        if (event.value) {
            markViewerInteracted();
        }
    });
    transformControls.addEventListener('objectChange', () => {
        markViewerInteracted();
    });
    scene.add(transformControls);

    // Picking helpers for click-based part selection
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();
    renderer.domElement.addEventListener('click', onCanvasClick, false);
    renderer.domElement.addEventListener('pointerdown', markViewerInteracted, false);
    renderer.domElement.addEventListener('wheel', markViewerInteracted, { passive: true });
    renderer.domElement.addEventListener('touchstart', markViewerInteracted, { passive: true });

    setAutoRotateState(false, 0.6);
    updateMeasureButtons();
    updateCommentButtons();

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
    if (autoRotateEnabled && !cameraTween && camera && controls) {
        updateAutoRotateOrbit();
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

function setAutoRotateState(enabled, speed = 0.6) {
    autoRotateEnabled = enabled;
    if (controls && enabled) {
        syncAutoRotateOrbitState();
    }

    updateButtonText('btn-auto-rotate', `Auto Rotate: ${autoRotateEnabled ? 'On' : 'Off'}`);
    setButtonActiveState('btn-auto-rotate', autoRotateEnabled);
}

function syncAutoRotateOrbitState() {
    // No longer needed for Z-axis rotation
}

function updateAutoRotateOrbit() {
    if (!model) return;

    if (autoRotateStartTime > 0) {
        const elapsed = performance.now() - autoRotateStartTime;
        if (elapsed < autoRotateDelayMs) {
            return;
        }
        autoRotateStartTime = 0;
    }

    // Spin only on Y axis - geometry is already centered at origin
    model.rotation.x = 0;
    model.rotation.z = 0;
    model.rotation.y = initialModelRotationY + autoRotateAngle;
    autoRotateAngle += 0.0035;
}

function markViewerInteracted() {
    if (hasUserInteracted) return;

    hasUserInteracted = true;
    if (autoRotateEnabled) {
        setAutoRotateState(false);
    }
}

// ====================================
// Load GLTF Model
// ====================================
function loadModel(modelPath) {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');

    loadingEl.style.display = 'block';
    errorEl.style.display = 'none';
    commentStorageKey = `${COMMENT_STORAGE_PREFIX}${modelPath}`;

    function finishLoadedModel(gltf) {
        model = gltf.scene;
        clearSelectionHelpers();
        selectedParts = [];
        explodeEnabled = false;
        explodeProgress = 0;
        explodeDistanceScale = 1;
        if (explodeTween && explodeTween.frameId) {
            cancelAnimationFrame(explodeTween.frameId);
        }
        explodeTween = null;

        // Calculate bounding box and center model
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        // Translate all geometry to center at origin
        model.traverse((child) => {
            if (child.geometry) {
                child.geometry.translate(-center.x, -center.y, -center.z);
            }
        });

        // Model is now centered at origin, no position offset needed
        model.position.set(0, 0, 0);
        explodeCenter.set(0, 0, 0);
        explodeBaseDistance = Math.max(0.25, Math.max(size.x, size.y, size.z) * 0.58);

        // Apply a fixed startup yaw so models open square instead of diagonal.
        model.rotation.y = startupModelRotationY;
        initialModelRotationY = startupModelRotationY;

        // Add to scene
        scene.add(model);

        // Overlay edge lines on every mesh
        addEdgeLines(model);

        // Auto-scale camera based on model size
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.3; // Slightly zoomed out default framing
        camera.position.set(0, cameraZ * 0.03, cameraZ * 1.02);
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

        autoRotateStartTime = performance.now();

        syncAutoRotateOrbitState();

        // Extract groups for visibility toggles
        extractGroups(model);
        showAllParts();
        setExplodeButtonState();
        updateExplodeDistanceLabel();
        clearMeasurements();
        const explodeSlider = document.getElementById('explode-distance-slider');
        if (explodeSlider) {
            explodeSlider.value = '1';
        }

        captureInitialModelState();
        loadComments().catch((error) => {
            console.warn('Unable to load comments:', error);
        });
        updateCommentButtons();

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

    if (explodeTween && explodeTween.frameId) {
        cancelAnimationFrame(explodeTween.frameId);
    }
    explodeTween = null;
    explodeEnabled = false;
    explodeProgress = 0;
    explodeDistanceScale = 1;

    restoreInitialModelState();
    resetPartActionStates();
    clearSelection();
    syncTransformControlTarget();

    if (modelGroups.length > 0) {
        modelGroups.forEach((group) => {
            group.visible = !!group.object.visible;
        });
        syncGroupCheckboxes();
    }

    setExplodeButtonState();
    updateExplodeDistanceLabel();
    clearMeasurements();
    const explodeSlider = document.getElementById('explode-distance-slider');
    if (explodeSlider) {
        explodeSlider.value = '1';
    }

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
        syncAutoRotateOrbitState();
        cameraTween = null;
    }
}

function getExplodeTargets() {
    if (!model) return [];

    if (modelGroups.length > 0) {
        return modelGroups
            .map((group) => group && group.object)
            .filter((obj, index, arr) => obj && arr.indexOf(obj) === index);
    }

    const directChildren = model.children.filter((child) => child && child.name !== '__edges__');
    if (directChildren.length > 1) {
        return directChildren;
    }

    // Some GLBs wrap all geometry under one root node. In that case explode its children.
    if (directChildren.length === 1 && directChildren[0].children && directChildren[0].children.length > 0) {
        return directChildren[0].children.filter((child) => child && child.name !== '__edges__');
    }

    return directChildren;
}

function getDeterministicDirectionIndex(part) {
    const seedSource = String((part && (part.uuid || part.name || part.id)) || 'part');
    let hash = 0;
    for (let i = 0; i < seedSource.length; i += 1) {
        hash = ((hash << 5) - hash + seedSource.charCodeAt(i)) | 0;
    }

    return Math.abs(hash % 6);
}

function getDeterministicHash(part) {
    const seedSource = String((part && (part.uuid || part.name || part.id)) || 'part');
    let hash = 0;
    for (let i = 0; i < seedSource.length; i += 1) {
        hash = ((hash << 5) - hash + seedSource.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

function getDeterministicSpreadFactor(part) {
    const hash = getDeterministicHash(part);
    const unit = (hash % 1000) / 1000; // 0..0.999
    return 0.95 + unit * 0.6; // 0.95x .. 1.55x
}

function ensureExplodePartData(part) {
    let data = explodePartData.get(part);
    if (data) return data;

    const origin = part.position.clone();
    const box = new THREE.Box3().setFromObject(part);
    const partCenter = box.getCenter(new THREE.Vector3());
    const delta = partCenter.clone().sub(explodeCenter);
    const direction = new THREE.Vector3();

    if (delta.lengthSq() < 1e-8) {
        // Deterministically distribute center-overlapping parts across 6 cardinal directions.
        switch (getDeterministicDirectionIndex(part)) {
            case 0:
                direction.set(1, 0, 0);
                break;
            case 1:
                direction.set(-1, 0, 0);
                break;
            case 2:
                direction.set(0, 1, 0);
                break;
            case 3:
                direction.set(0, -1, 0);
                break;
            case 4:
                direction.set(0, 0, 1);
                break;
            default:
                direction.set(0, 0, -1);
                break;
        }
    } else {
        const absX = Math.abs(delta.x);
        const absY = Math.abs(delta.y);
        const absZ = Math.abs(delta.z);

        // Snap to one of 6 axes: right/left, top/bottom, front/back.
        if (absX >= absY && absX >= absZ) {
            direction.set(Math.sign(delta.x) || 1, 0, 0);
        } else if (absY >= absX && absY >= absZ) {
            direction.set(0, Math.sign(delta.y) || 1, 0);
        } else {
            direction.set(0, 0, Math.sign(delta.z) || 1);
        }
    }

    data = {
        origin,
        direction,
        spreadFactor: getDeterministicSpreadFactor(part)
    };
    explodePartData.set(part, data);
    return data;
}

function setExplodeProgress(progress) {
    explodeProgress = Math.max(0, Math.min(1, progress));
    const targets = getExplodeTargets();
    if (targets.length === 0) return;

    const offsets = [];
    const averageOffset = new THREE.Vector3(0, 0, 0);

    targets.forEach((part, index) => {
        const data = ensureExplodePartData(part);
        const distance = explodeBaseDistance * explodeDistanceScale * data.spreadFactor;
        const offset = data.direction.clone().multiplyScalar(distance * explodeProgress);
        offsets[index] = offset;
        averageOffset.add(offset);
    });

    averageOffset.multiplyScalar(1 / targets.length);

    targets.forEach((part, index) => {
        const data = ensureExplodePartData(part);
        const centeredOffset = offsets[index].clone().sub(averageOffset);
        part.position.copy(data.origin).add(centeredOffset);
    });
}

function setExplodeButtonState() {
    updateButtonText('btn-explode', `Explode: ${explodeEnabled ? 'On' : 'Off'}`);
    setButtonActiveState('btn-explode', explodeEnabled);

    const sliderControl = document.getElementById('explode-distance-control');
    if (sliderControl) {
        sliderControl.classList.toggle('is-hidden', !explodeEnabled);
    }
}

function toggleExplodeView() {
    if (!model) {
        showToast('Load a model first');
        return;
    }

    const targets = getExplodeTargets();
    if (targets.length === 0) {
        showToast('No parts available to explode');
        return;
    }

    if (explodeTween && explodeTween.frameId) {
        cancelAnimationFrame(explodeTween.frameId);
    }

    const targetEnabled = !explodeEnabled;
    const startProgress = explodeProgress;
    const endProgress = targetEnabled ? 1 : 0;

    // Show slider immediately when turning explode on.
    const sliderControl = document.getElementById('explode-distance-control');
    if (sliderControl && targetEnabled) {
        sliderControl.classList.remove('is-hidden');
    }

    explodeTween = {
        startTime: performance.now(),
        duration: 520,
        startProgress,
        endProgress,
        frameId: 0
    };

    function step() {
        if (!explodeTween) return;
        const elapsed = performance.now() - explodeTween.startTime;
        const progress = Math.min(1, elapsed / explodeTween.duration);
        const eased = easeInOutCubic(progress);
        const current = explodeTween.startProgress + (explodeTween.endProgress - explodeTween.startProgress) * eased;
        setExplodeProgress(current);

        if (progress < 1) {
            explodeTween.frameId = requestAnimationFrame(step);
            return;
        }

        explodeEnabled = targetEnabled;
        setExplodeButtonState();
        explodeTween = null;
    }

    step();
}

function updateExplodeDistanceLabel() {
    const label = document.getElementById('explode-distance-value');
    if (!label) return;
    label.textContent = `${explodeDistanceScale.toFixed(1)}x`;
}

function setExplodeDistance(value) {
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue)) return;
    explodeDistanceScale = Math.min(4, Math.max(0, nextValue));
    updateExplodeDistanceLabel();
    setExplodeProgress(explodeProgress);
}

function onExplodeDistanceSliderInput(event) {
    if (!event || !event.target) return;
    setExplodeDistance(event.target.value);
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
    if (!scene || selectedParts.length === 0 || !showSelectionBoxes) return;

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
    syncTransformControlTarget();
    setButtonActiveState('btn-isolate', false);
}

function syncTransformControlTarget() {
    if (!transformControls) return;

    const primary = getPrimarySelectedPart();
    if (!primary || !primary.visible) {
        transformControls.detach();
        transformControls.enabled = false;
        transformControls.visible = false;
        return;
    }

    transformControls.attach(primary);
    transformControls.enabled = true;
    transformControls.visible = true;
}

function nudgeSelectedPart(dx, dy, dz) {
    const primary = getPrimarySelectedPart();
    if (!primary) {
        showToast('Select one part first');
        return false;
    }

    primary.position.x += dx;
    primary.position.y += dy;
    primary.position.z += dz;
    syncTransformControlTarget();
    markViewerInteracted();
    return true;
}

function getPrimarySelectedPart() {
    return selectedParts.length > 0 ? selectedParts[0] : null;
}

function clearSelection() {
    setSelectedParts([]);
}

function getModelRootChild(object) {
    if (!model || !object) return null;

    // Prefer explicit group objects when available.
    if (modelGroups.length > 0) {
        let scan = object;
        while (scan && scan !== model) {
            const matchedGroup = modelGroups.find((group) => group.object === scan);
            if (matchedGroup) {
                return matchedGroup.object;
            }
            scan = scan.parent;
        }
    }

    // If model is wrapped in a single root, pick the first child under that wrapper.
    if (model.children.length === 1) {
        const wrapper = model.children[0];
        let scan = object;
        while (scan && scan.parent && scan.parent !== wrapper) {
            scan = scan.parent;
        }
        if (scan && scan.parent === wrapper) {
            return scan;
        }
    }

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

    if (measureMode !== 'none') {
        if (hits.length > 0) {
            handleMeasurePick(hits[0]);
        }
        return;
    }

    if (commentMode) {
        // In comment mode, prioritize annotation objects so mesh surfaces
        // do not steal clicks from existing comment markers/labels/arrows.
        const commentHits = raycaster
            .intersectObjects(commentHelpers, true)
            .filter((hit) => !!findCommentIdFromObject(hit.object));

        if (commentHits.length > 0) {
            handleCommentPick(commentHits[0]);
        } else if (hits.length > 0) {
            handleCommentPick(hits[0]);
        } else {
            setSelectedComment('');
        }
        return;
    }

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

    syncTransformControlTarget();
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
    hasUserInteracted = true;
    setAutoRotateState(!autoRotateEnabled, 1.0);
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

    const nudgeStep = event.shiftKey ? 0.1 : 0.03;

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
        case 'm':
            triggerSelectedPartAction();
            break;
        case 'x':
            toggleExplodeView();
            break;
        case 'escape':
            showAllParts();
            clearSelection();
            break;
        case 'arrowleft':
            if (!nudgeSelectedPart(-nudgeStep, 0, 0)) return;
            break;
        case 'arrowright':
            if (!nudgeSelectedPart(nudgeStep, 0, 0)) return;
            break;
        case 'arrowup':
            if (!nudgeSelectedPart(0, 0, -nudgeStep)) return;
            break;
        case 'arrowdown':
            if (!nudgeSelectedPart(0, 0, nudgeStep)) return;
            break;
        case 'pageup':
            if (!nudgeSelectedPart(0, nudgeStep, 0)) return;
            break;
        case 'pagedown':
            if (!nudgeSelectedPart(0, -nudgeStep, 0)) return;
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
    updateExplodeDistanceLabel();
    loadProjectData();
});
