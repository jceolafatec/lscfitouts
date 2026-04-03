import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

function fitCameraToObject(camera, controls, object) {
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const distance = (maxDim / 2) / Math.tan((camera.fov * Math.PI) / 360)
  camera.position.set(center.x + distance * 0.9, center.y + distance * 0.4, center.z + distance * 0.9)
  controls.target.copy(center)
  camera.near = maxDim / 100
  camera.far = maxDim * 100
  camera.updateProjectionMatrix()
  controls.update()
}

export function ThreeDViewer({ modelUrl }) {
  const hostRef = useRef(null)
  const rendererRef = useRef(null)
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  const rootModelRef = useRef(null)
  const animationRef = useRef(0)
  const explodeMapRef = useRef(new Map())
  const measurePointsRef = useRef([])
  const clipPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(1, 0, 0), 0))
  const sectionMeshRef = useRef([])
  const measureLineRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [wireframe, setWireframe] = useState(false)
  const [edges, setEdges] = useState(true)
  const [sectionEnabled, setSectionEnabled] = useState(false)
  const [sectionAxis, setSectionAxis] = useState('x')
  const [sectionOffset, setSectionOffset] = useState(0)
  const [explode, setExplode] = useState(0)
  const [measureEnabled, setMeasureEnabled] = useState(false)
  const [distanceLabel, setDistanceLabel] = useState('')

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0a0a)

    const camera = new THREE.PerspectiveCamera(50, host.clientWidth / host.clientHeight, 0.1, 2000)
    camera.position.set(5, 4, 5)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(host.clientWidth, host.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.localClippingEnabled = true
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.07

    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2)
    keyLight.position.set(8, 10, 8)
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.35)
    fillLight.position.set(-5, 5, -3)
    scene.add(fillLight)

    rendererRef.current = renderer
    sceneRef.current = scene
    cameraRef.current = camera
    controlsRef.current = controls

    const handleResize = () => {
      if (!host || !rendererRef.current || !cameraRef.current) return
      cameraRef.current.aspect = host.clientWidth / host.clientHeight
      cameraRef.current.updateProjectionMatrix()
      rendererRef.current.setSize(host.clientWidth, host.clientHeight)
    }

    const loop = () => {
      animationRef.current = requestAnimationFrame(loop)
      controls.update()
      renderer.render(scene, camera)
    }

    window.addEventListener('resize', handleResize)
    loop()

    return () => {
      cancelAnimationFrame(animationRef.current)
      window.removeEventListener('resize', handleResize)
      controls.dispose()
      renderer.dispose()
      host.removeChild(renderer.domElement)
      scene.clear()
    }
  }, [])

  useEffect(() => {
    const scene = sceneRef.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!scene || !camera || !controls || !modelUrl) return

    setLoading(true)
    setError('')

    if (rootModelRef.current) {
      scene.remove(rootModelRef.current)
      rootModelRef.current = null
    }

    const loader = new GLTFLoader()
    loader.load(
      modelUrl,
      (gltf) => {
        const model = gltf.scene
        rootModelRef.current = model
        explodeMapRef.current.clear()

        model.traverse((node) => {
          if (node.isMesh) {
            const edge = new THREE.LineSegments(
              new THREE.EdgesGeometry(node.geometry),
              new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 }),
            )
            edge.name = '__edge__'
            node.add(edge)
          }
        })

        scene.add(model)
        fitCameraToObject(camera, controls, model)
        setLoading(false)
      },
      undefined,
      () => {
        setError('Failed to load 3D model.')
        setLoading(false)
      },
    )
  }, [modelUrl])

  useEffect(() => {
    const model = rootModelRef.current
    if (!model) return
    model.traverse((node) => {
      if (!node.isMesh) return
      const mats = Array.isArray(node.material) ? node.material : [node.material]
      mats.forEach((mat) => {
        mat.wireframe = wireframe
        mat.needsUpdate = true
      })
      node.children.forEach((child) => {
        if (child.name === '__edge__') child.visible = edges
      })
    })
  }, [wireframe, edges])

  useEffect(() => {
    const model = rootModelRef.current
    if (!model) return

    const normal =
      sectionAxis === 'x' ? new THREE.Vector3(1, 0, 0) : sectionAxis === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1)

    clipPlaneRef.current.normal.copy(normal)
    clipPlaneRef.current.constant = sectionOffset

    sectionMeshRef.current = []
    model.traverse((node) => {
      if (!node.isMesh) return
      const mats = Array.isArray(node.material) ? node.material : [node.material]
      mats.forEach((mat) => {
        mat.clippingPlanes = sectionEnabled ? [clipPlaneRef.current] : []
        mat.clipShadows = sectionEnabled
        mat.needsUpdate = true
      })
      sectionMeshRef.current.push(node)
    })
  }, [sectionEnabled, sectionAxis, sectionOffset])

  useEffect(() => {
    const model = rootModelRef.current
    if (!model) return

    const center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3())

    model.traverse((node) => {
      if (!node.isMesh) return
      if (!explodeMapRef.current.has(node)) {
        explodeMapRef.current.set(node, node.position.clone())
      }
      const base = explodeMapRef.current.get(node)
      const worldPos = new THREE.Vector3()
      node.getWorldPosition(worldPos)
      const direction = worldPos.sub(center).normalize()
      node.position.copy(base.clone().add(direction.multiplyScalar(explode)))
    })
  }, [explode])

  useEffect(() => {
    const renderer = rendererRef.current
    const scene = sceneRef.current
    const camera = cameraRef.current
    const model = rootModelRef.current
    if (!renderer || !scene || !camera || !model) return

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()

    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xc8a45d })

    const clearMeasure = () => {
      measurePointsRef.current = []
      setDistanceLabel('')
      if (measureLineRef.current) {
        scene.remove(measureLineRef.current)
        measureLineRef.current.geometry.dispose()
        measureLineRef.current.material.dispose()
        measureLineRef.current = null
      }
    }

    if (!measureEnabled) {
      clearMeasure()
      return
    }

    const onClick = (event) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObject(model, true)
      if (!hits.length) return

      const point = hits[0].point.clone()
      measurePointsRef.current.push(point)

      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), markerMaterial)
      marker.position.copy(point)
      scene.add(marker)

      if (measurePointsRef.current.length === 2) {
        const [a, b] = measurePointsRef.current
        const geometry = new THREE.BufferGeometry().setFromPoints([a, b])
        const material = new THREE.LineBasicMaterial({ color: 0xc8a45d })
        const line = new THREE.Line(geometry, material)
        measureLineRef.current = line
        scene.add(line)

        const meters = a.distanceTo(b)
        setDistanceLabel(`${meters.toFixed(3)} m`)
        measurePointsRef.current = []
      }
    }

    renderer.domElement.addEventListener('click', onClick)
    return () => renderer.domElement.removeEventListener('click', onClick)
  }, [measureEnabled, modelUrl])

  const resetView = () => {
    if (!rootModelRef.current || !cameraRef.current || !controlsRef.current) return
    fitCameraToObject(cameraRef.current, controlsRef.current, rootModelRef.current)
  }

  const saveScreenshot = () => {
    if (!rendererRef.current) return
    const link = document.createElement('a')
    link.href = rendererRef.current.domElement.toDataURL('image/png')
    link.download = `lsc-model-${Date.now()}.png`
    link.click()
  }

  return (
    <div className="viewer-shell">
      <div className="viewer-toolbar">
        <button onClick={() => setEdges((v) => !v)}>Edges {edges ? 'On' : 'Off'}</button>
        <button onClick={() => setWireframe((v) => !v)}>Wireframe {wireframe ? 'On' : 'Off'}</button>
        <button onClick={resetView}>Fit Model</button>
        <button onClick={() => setSectionEnabled((v) => !v)}>Section {sectionEnabled ? 'On' : 'Off'}</button>
        <select value={sectionAxis} onChange={(e) => setSectionAxis(e.target.value)}>
          <option value="x">X plane</option>
          <option value="y">Y plane</option>
          <option value="z">Z plane</option>
        </select>
        <input
          type="range"
          min={-3}
          max={3}
          step={0.05}
          value={sectionOffset}
          onChange={(e) => setSectionOffset(Number(e.target.value))}
        />
        <label>Explode</label>
        <input type="range" min={0} max={2.5} step={0.05} value={explode} onChange={(e) => setExplode(Number(e.target.value))} />
        <button onClick={() => setMeasureEnabled((v) => !v)}>Measure {measureEnabled ? 'On' : 'Off'}</button>
        <button onClick={saveScreenshot}>Screenshot</button>
      </div>
      {distanceLabel && <div className="measure-badge">Distance: {distanceLabel}</div>}
      {loading && <div className="viewer-overlay">Loading 3D model...</div>}
      {error && <div className="panel-error">{error}</div>}
      <div className="viewer-canvas" ref={hostRef} />
    </div>
  )
}
