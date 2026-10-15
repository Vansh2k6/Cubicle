import * as THREE from "three";

export function createOffice(container, hooks) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#e9eee7");
  const camera = new THREE.OrthographicCamera(-14, 14, 9, -9, 0.1, 150);
  camera.position.set(18, 21, 24);
  camera.lookAt(0, 0.7, 0);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch {
    const l = document.querySelector("#loading");
    l.innerHTML =
      "This office needs WebGL. Please enable hardware acceleration or open it in a modern browser.";
    return { reset() {}, highlight() {}, setKey() {} };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor("#e9eee7");
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.prepend(renderer.domElement);
  scene.add(new THREE.HemisphereLight("#fffaf0", "#b2baa4", 2.0));
  const sun = new THREE.DirectionalLight("#fff5df", 3.0);
  sun.position.set(-7, 19, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -17;
  sun.shadow.camera.right = 17;
  sun.shadow.camera.top = 17;
  sun.shadow.camera.bottom = -17;
  sun.shadow.normalBias = 0.045;
  sun.shadow.bias = -0.0003;
  sun.shadow.radius = 4;
  scene.add(sun);
  const fill = new THREE.DirectionalLight("#e2e9ff", 0.8);
  fill.position.set(10, 8, -7);
  scene.add(fill);
  const mats = new Map();
  function mat(color) {
    if (!mats.has(color))
      mats.set(
        color,
        new THREE.MeshStandardMaterial({ color, roughness: 0.86 }),
      );
    return mats.get(color);
  }
  function box(w, h, d, color, x, y, z, parent = scene) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function cyl(r1, r2, h, color, x, y, z, n = 12, parent = scene) {
    let m = new THREE.Mesh(
      new THREE.CylinderGeometry(r1, r2, h, n),
      mat(color),
    );
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  const colliders = [];
  const solid = (x, z, w, d) =>
    colliders.push({ x, z, w: w / 2 + 0.3, d: d / 2 + 0.3 });
  // A cutaway office, built from simple, deliberately chunky shapes.
  box(19, 0.35, 13, "#c7cabb", 0, -0.3, 0);
  box(18.8, 0.12, 12.8, "#e2ddcd", 0, -0.08, 0);
  for (let iz = 0; iz < 12; iz++) {
    for (let ix = 0; ix < 9; ix++) {
      const x = -8.35 + ix * 2.08,
        z = -5.83 + iz * 1.06;
      const colors = ["#ded9cb", "#e3dece", "#ddd7c7", "#e7e0d1"];
      box(2.065, 0.025, 1.047, colors[(ix + iz * 3) % 4], x, 0.001, z);
    }
  }
  box(19, 3.6, 0.22, "#ced7c5", 0, 1.7, -6.43);
  box(0.22, 3.6, 13, "#dce1cf", -9.43, 1.7, 0);
  box(19, 0.13, 0.3, "#e9ecdf", 0, 3.53, -6.43);
  box(0.3, 0.13, 13, "#e9ecdf", -9.43, 3.53, 0);
  box(18.7, 0.14, 0.09, "#e9e9db", 0, 0.1, -6.25);
  box(0.09, 0.14, 12.5, "#edebde", -9.25, 0.1, 0);
  // Windows, pale city silhouettes and white frames.
  function windowPanel(x, width) {
    box(width, 2.15, 0.12, "#f1f2e7", x, 2, -6.25);
    box(width - 0.18, 1.93, 0.06, "#d5e6e3", x, 2, -6.16);
    for (let i = 0; i < 4; i++) {
      const bx = x - width / 2 + 0.3 + (i * (width - 0.3)) / 4;
      box(
        0.35,
        0.5 + (i % 3) * 0.3,
        0.025,
        "#b9d0cc",
        bx,
        1.3 + (i % 3) * 0.15,
        -6.11,
      );
    }
    box(0.08, 2.1, 0.1, "#f8f7ec", x, 2, -6.06);
    box(width, 0.08, 0.1, "#f8f7ec", x, 1.95, -6.06);
    box(width + 0.2, 0.12, 0.4, "#eeede1", x, 0.92, -6.02);
  }
  windowPanel(-5.1, 5);
  windowPanel(3.1, 6.1);
  // Framed artwork and a wall clock.
  box(0.12, 1.5, 1.28, "#f5efdf", -9.24, 2.12, -3.2);
  box(0.14, 1.24, 1.02, "#b4bdae", -9.16, 2.12, -3.2);
  box(0.16, 0.45, 0.68, "#ddd4b9", -9.08, 1.98, -3.2);
  box(0.17, 0.38, 0.35, "#91a38a", -9.07, 2.3, -3.39);
  let clock = cyl(0.42, 0.42, 0.09, "#f5f2e6", -9.15, 2.7, 0.6, 32);
  clock.rotation.z = Math.PI / 2;
  box(0.11, 0.26, 0.035, "#697568", -9.08, 2.81, 0.6);
  box(0.11, 0.035, 0.19, "#697568", -9.07, 2.7, 0.68);
  function plant(x, z, scale = 1) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.scale.setScalar(scale);
    scene.add(g);
    cyl(0.35, 0.25, 0.54, "#e5dbc5", 0, 0.27, 0, 12, g);
    cyl(0.29, 0.29, 0.05, "#645c43", 0, 0.56, 0, 12, g);
    box(0.055, 0.88, 0.055, "#72805d", 0, 0.99, 0, g);
    for (let i = 0; i < 7; i++) {
      let a = i * 2.4;
      let leaf = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.45, 0),
        mat(i % 2 ? "#8d9d69" : "#6f8c60"),
      );
      leaf.scale.set(0.65, 1.35, 0.36);
      leaf.rotation.set(0.4, a, 0.35 * Math.cos(a));
      leaf.position.set(
        Math.cos(a) * 0.26,
        0.93 + i * 0.09,
        Math.sin(a) * 0.24,
      );
      leaf.castShadow = true;
      g.add(leaf);
    }
    solid(x, z, 0.45 * scale, 0.45 * scale);
  }
  plant(-8.35, -5.35, 1.35);
  plant(8, -5.3, 1.4);
  plant(8.2, 4.9, 1.2);
  plant(-8.45, 4.9, 1.05);
  function monitor(x, z, rotation = 0) {
    let g = new THREE.Group();
    g.position.set(x, 1.43, z);
    g.rotation.y = rotation;
    scene.add(g);
    box(0.55, 0.05, 0.35, "#666f6b", 0, 0, 0, g);
    box(0.1, 0.4, 0.1, "#5f6865", 0, 0.22, 0, g);
    box(1.34, 0.86, 0.09, "#47565a", 0, 0.71, 0, g);
    box(1.21, 0.71, 0.015, "#bfcece", 0, 0.71, 0.055, g);
    box(0.29, 0.64, 0.02, "#879f9a", -0.43, 0.71, 0.07, g);
    for (let j = 0; j < 3; j++)
      box(0.65, 0.035, 0.025, "#e6eeea", 0.17, 0.88 - j * 0.14, 0.07, g);
    box(0.75, 0.22, 0.02, "#a9bfc0", 0.15, 0.51, 0.07, g);
    box(0.75, 0.045, 0.26, "#d9dfd7", 0, 0.018, 0.62, g);
    for (let j = 0; j < 3; j++)
      box(0.64, 0.006, 0.012, "#a9b2ae", 0, 0.046, 0.54 + j * 0.07, g);
    box(0.16, 0.055, 0.24, "#c1c8be", 0.6, 0.04, 0.62, g);
  }
  function mug(x, z) {
    cyl(0.1, 0.09, 0.19, "#d3b589", x, 1.56, z, 12);
    cyl(0.078, 0.078, 0.009, "#765c43", x, 1.66, z, 12);
    let h = new THREE.Mesh(
      new THREE.TorusGeometry(0.065, 0.025, 5, 10),
      mat("#d3b589"),
    );
    h.position.set(x + 0.1, 1.58, z);
    scene.add(h);
  }
  function desk(x, z, w = 3.1) {
    box(w, 0.15, 1.4, "#c5a77e", x, 1.35, z);
    box(w - 0.12, 0.06, 1.3, "#dbc19b", x, 1.45, z);
    for (const dx of [-w / 2 + 0.18, w / 2 - 0.18])
      for (const dz of [-0.51, 0.51])
        box(0.09, 1.3, 0.09, "#e7e4d5", x + dx, 0.65, z + dz);
    solid(x, z, w, 1.4);
    monitor(x - 0.2, z - 0.26);
    mug(x + w / 2 - 0.4, z + 0.35);
    box(0.36, 0.055, 0.5, "#dedfcb", x - w / 2 + 0.3, 1.51, z + 0.3);
  }
  function chair(x, z, rotation = 0, color = "#a6b6a3") {
    let g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotation;
    scene.add(g);
    cyl(0.08, 0.08, 0.58, "#6d7b70", 0, 0.35, 0, 8, g);
    box(0.95, 0.17, 0.85, color, 0, 0.7, 0, g);
    box(0.95, 0.82, 0.15, color, 0, 1.06, -0.38, g);
    box(0.9, 0.055, 0.12, "#798375", 0, 0.12, 0, g);
    box(0.12, 0.055, 0.9, "#798375", 0, 0.12, 0, g);
    for (let i = -1; i <= 1; i += 2) {
      cyl(0.095, 0.095, 0.08, "#657465", 0.4 * i, 0.09, 0, 8, g);
      cyl(0.095, 0.095, 0.08, "#657465", 0, 0.09, 0.4 * i, 8, g);
    }
  }
  desk(-5.1, -3.7, 3.5);
  chair(-5.2, -5, 0, "#b3a4b7");
  desk(4.8, -3.7, 3.6);
  chair(4.6, -5, 0);
  desk(7.1, 0.0, 2.6);
  chair(7.2, 1.2, Math.PI);
  // A shared work island with a muted lilac rug.
  box(5.3, 0.025, 3.3, "#c8c7cb", 0.8, 0.045, -0.25);
  box(4.1, 0.14, 1.55, "#d3b58d", 0.5, 1.3, -0.6);
  box(3.98, 0.045, 1.42, "#dfc4a0", 0.5, 1.4, -0.6);
  for (let dx of [-1.3, 2.3])
    for (let dz of [-1.15, -0.05])
      box(0.09, 1.25, 0.09, "#eeede1", dx, 0.65, dz);
  solid(0.5, -0.6, 4.1, 1.55);
  monitor(0.05, -0.78);
  box(0.5, 0.05, 0.7, "#b3bcae", 1.8, 1.46, -0.5);
  box(0.43, 0.03, 0.65, "#efeee3", 1.79, 1.5, -0.49);
  cyl(0.16, 0.12, 0.22, "#e1d6c0", -0.9, 1.55, -0.85);
  cyl(0.23, 0.1, 0.4, "#89a27d", -0.9, 1.84, -0.85, 5);
  chair(-0.45, 0.8, Math.PI);
  chair(1.35, 0.8, Math.PI);
  // Lounge, coffee table, cabinet and tiny desk details.
  box(3.5, 0.025, 3.3, "#d4d6bf", -6.2, 0.045, 3.05);
  let sofa = new THREE.Group();
  sofa.position.set(-7.5, 0, 2.65);
  sofa.rotation.y = Math.PI / 2;
  scene.add(sofa);
  box(2.8, 0.55, 1.1, "#bd9c7c", 0, 0.5, 0, sofa);
  box(2.8, 0.8, 0.25, "#d1ad8c", 0, 0.94, -0.47, sofa);
  box(0.3, 0.7, 1.13, "#d7b293", -1.28, 0.7, 0, sofa);
  box(0.3, 0.7, 1.13, "#d7b293", 1.28, 0.7, 0, sofa);
  for (let x of [-0.68, 0.15, 0.75])
    box(0.73, 0.22, 0.87, "#e0bb98", x, 0.87, 0.06, sofa);
  box(0.55, 0.45, 0.22, "#ede5cf", -0.69, 1.15, -0.24, sofa);
  solid(-7.5, 2.65, 1.1, 2.8);
  cyl(0.72, 0.72, 0.11, "#c3a37f", -5.7, 0.71, 2.65, 24);
  for (let a of [0, 2.1, 4.2])
    box(
      0.07,
      0.65,
      0.07,
      "#9d876b",
      -5.7 + Math.cos(a) * 0.43,
      0.34,
      2.65 + Math.sin(a) * 0.43,
    );
  solid(-5.7, 2.65, 1.35, 1.35);
  box(0.36, 0.04, 0.45, "#eef0e5", -5.65, 0.79, 2.6);
  box(3.0, 1.17, 0.75, "#bbc5b3", -0.2, 0.6, -5.7);
  box(3.1, 0.1, 0.83, "#dfd6bc", -0.2, 1.24, -5.7);
  for (let x of [-1.15, -0.2, 0.75]) {
    box(0.86, 1.03, 0.025, "#c8d0be", x, 0.6, -5.31);
    box(0.22, 0.04, 0.05, "#8d9886", x, 0.85, -5.28);
  }
  solid(-0.2, -5.7, 3, 0.75);
  box(0.53, 0.7, 0.48, "#69766c", -0.9, 1.63, -5.7);
  box(0.39, 0.32, 0.03, "#3f4c45", -0.9, 1.65, -5.44);
  cyl(0.07, 0.07, 0.16, "#f0e8d2", -0.9, 1.39, -5.38);
  for (let i = 0; i < 3; i++)
    box(
      0.47,
      0.08,
      0.5,
      ["#b7aa96", "#9daa95", "#e9debd"][i],
      0.85,
      1.34 + i * 0.08,
      -5.7,
    );
  // Small wall sign drawn as a texture.
  const signCanvas = document.createElement("canvas");
  signCanvas.width = 512;
  signCanvas.height = 128;
  const sc = signCanvas.getContext("2d");
  sc.fillStyle = "#ced7c5";
  sc.fillRect(0, 0, 512, 128);
  sc.fillStyle = "#7b8a76";
  sc.font = "600 46px sans-serif";
  sc.textAlign = "center";
  sc.fillText("make room to grow.", 256, 80);
  const tex = new THREE.CanvasTexture(signCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  let sign = new THREE.Mesh(
    new THREE.PlaneGeometry(3.7, 0.92),
    new THREE.MeshBasicMaterial({ map: tex }),
  );
  sign.position.set(-0.2, 2.7, -6.28);
  scene.add(sign);
  function character(
    x,
    z,
    shirt,
    hair,
    skin = "#e9b787",
    pants = "#515c62",
    longHair = false,
  ) {
    const root = new THREE.Group();
    root.position.set(x, 0, z);
    scene.add(root);
    let body = new THREE.Group();
    root.add(body);
    box(0.65, 0.72, 0.36, shirt, 0, 1.06, 0, body);
    box(0.13, 0.37, 0.02, "#f0e9da", 0, 1.17, 0.19, body);
    box(0.64, 0.6, 0.56, skin, 0, 1.75, 0, body);
    box(0.68, 0.19, 0.6, hair, 0, 2.07, -0.01, body);
    box(0.18, 0.29, 0.59, hair, -0.25, 1.92, -0.01, body);
    box(
      0.68,
      longHair ? 0.57 : 0.22,
      0.12,
      hair,
      0,
      longHair ? 1.79 : 1.98,
      -0.28,
      body,
    );
    if (longHair) box(0.14, 0.55, 0.48, hair, 0.28, 1.77, -0.02, body);
    for (let dx of [-0.13, 0.13]) {
      box(0.055, 0.065, 0.012, "#3b342e", dx, 1.77, 0.285, body);
    }
    box(0.12, 0.022, 0.014, "#9b6653", 0, 1.6, 0.288, body);
    const arms = [],
      legs = [];
    for (const side of [-1, 1]) {
      let arm = new THREE.Group();
      arm.position.set(side * 0.47, 1.33, 0);
      body.add(arm);
      box(0.26, 0.49, 0.31, shirt, 0, -0.18, 0, arm);
      box(0.24, 0.22, 0.29, skin, 0, -0.51, 0, arm);
      arms.push(arm);
      let leg = new THREE.Group();
      leg.position.set(side * 0.18, 0.73, 0);
      body.add(leg);
      box(0.29, 0.59, 0.31, pants, 0, -0.28, 0, leg);
      box(0.31, 0.16, 0.43, "#f1eee0", 0, -0.57, 0.055, leg);
      legs.push(leg);
    }
    return { root, body, arms, legs };
  }
  const player = character(
    2.9,
    3.7,
    "#8e86bf",
    "#594132",
    "#e9bd8c",
    "#697079",
  );
  player.root.rotation.y = -0.65;
  const npcs = {
    maya: {
      ...character(
        -4.25,
        -1.7,
        "#a192b3",
        "#49362c",
        "#e1ae84",
        "#5d5969",
        true,
      ),
      name: "Maya",
      role: "Your manager",
    },
    jordan: {
      ...character(4.65, -1.6, "#c79463", "#3c332d", "#ba805c", "#626d62"),
      name: "Jordan",
      role: "Your teammate",
    },
    sam: {
      ...character(-4.5, 4.55, "#87a48d", "#b17d49", "#efc79a", "#758176"),
      name: "Sam",
      role: "People & culture",
    },
  };
  npcs.maya.root.rotation.y = 0.6;
  npcs.jordan.root.rotation.y = -0.5;
  npcs.sam.root.rotation.y = 0.5;
  function ring(radius, color) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(radius - 0.045, radius, 48),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.07;
    scene.add(mesh);
    return mesh;
  }
  const playerRing = ring(0.64, "#9783d3");
  const nearRing = ring(0.83, "#b4a2d7");
  nearRing.visible = false;
  const labels = document.querySelector("#scene-labels");
  const entries = { ...npcs, player: { ...player, name: "You", role: "" } };
  for (let [id, p] of Object.entries(entries)) {
    let el = document.createElement("div");
    el.className = `npc-label ${id === "player" ? "player" : ""}`;
    el.innerHTML = `${id === "maya" ? '<span class="npc-marker">···</span>' : ""}<strong>${p.name}${id === "maya" ? ' <span class="npc-star">◆</span>' : ""}</strong>${p.role ? `<small>${p.role}</small>` : ""}`;
    labels.appendChild(el);
    p.label = el;
  }
  let width = 1,
    height = 1;
  function resize() {
    width = container.clientWidth;
    height = container.clientHeight;
    renderer.setSize(width, height);
    const aspect = width / height;
    const vertical = Math.max(18, 27 / aspect);
    camera.left = (-vertical * aspect) / 2;
    camera.right = (vertical * aspect) / 2;
    camera.top = vertical / 2;
    camera.bottom = -vertical / 2;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();
  let keys = new Set(),
    target = null,
    near = null,
    moved = false,
    walkTime = 0,
    accumulator = 0,
    last = performance.now();
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function isInput(e) {
    return (
      /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) ||
      e.target.isContentEditable
    );
  }
  window.addEventListener("keydown", (e) => {
    if (isInput(e)) return;
    const k = e.key.toLowerCase();
    if (
      [
        "w",
        "a",
        "s",
        "d",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
      ].includes(k)
    ) {
      if (hooks.isPaused()) return;
      e.preventDefault();
      keys.add(k);
      target = null;
    }
    if (k === "e" && !e.repeat) {
      e.preventDefault();
      hooks.onTalk();
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => {
    keys.clear();
    target = null;
  });
  document.addEventListener("visibilitychange", () => {
    keys.clear();
    target = null;
    last = performance.now();
  });
  const raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2(),
    floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    hit = new THREE.Vector3();
  renderer.domElement.addEventListener("pointerdown", (e) => {
    if (hooks.isPaused()) return;
    container.focus({ preventScroll: true });
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    if (
      raycaster.ray.intersectPlane(floorPlane, hit) &&
      Math.abs(hit.x) < 8.7 &&
      Math.abs(hit.z) < 5.9
    )
      target = { x: hit.x, z: hit.z };
  });
  function allowed(x, z) {
    if (x < -8.95 || x > 8.95 || z < -5.95 || z > 5.95) return false;
    if (
      colliders.some((c) => Math.abs(x - c.x) < c.w && Math.abs(z - c.z) < c.d)
    )
      return false;
    return !Object.values(npcs).some(
      (p) => Math.hypot(x - p.root.position.x, z - p.root.position.z) < 0.7,
    );
  }
  function step(dt) {
    if (hooks.isPaused()) {
      keys.clear();
      target = null;
      return;
    }
    let dx = 0,
      dz = 0;
    let horizontal =
        (keys.has("d") || keys.has("arrowright") ? 1 : 0) -
        (keys.has("a") || keys.has("arrowleft") ? 1 : 0),
      vertical =
        (keys.has("s") || keys.has("arrowdown") ? 1 : 0) -
        (keys.has("w") || keys.has("arrowup") ? 1 : 0);
    dx = horizontal * 0.8 + vertical * 0.6;
    dz = -horizontal * 0.6 + vertical * 0.8;
    let p = player.root.position;
    if (target) {
      dx = target.x - p.x;
      dz = target.z - p.z;
      if (Math.hypot(dx, dz) < 0.1) {
        target = null;
        dx = dz = 0;
      }
    }
    const len = Math.hypot(dx, dz);
    if (len > 0.01) {
      dx = (dx / len) * dt * 3.3;
      dz = (dz / len) * dt * 3.3;
      let beforeX = p.x,
        beforeZ = p.z;
      if (allowed(p.x + dx, p.z)) p.x += dx;
      if (allowed(p.x, p.z + dz)) p.z += dz;
      if (Math.abs(p.x - beforeX) + Math.abs(p.z - beforeZ) < 0.001)
        target = null;
      player.root.rotation.y = Math.atan2(dx, dz);
      walkTime += dt * 10;
      if (!moved) {
        moved = true;
        hooks.onMove();
      }
    } else walkTime = 0;
    for (let i = 0; i < 2; i++) {
      player.legs[i].rotation.x = reducedMotion
        ? 0
        : Math.sin(walkTime) * (i ? 1 : -1) * 0.38;
      player.arms[i].rotation.x = reducedMotion
        ? 0
        : Math.sin(walkTime) * (i ? -1 : 1) * 0.32;
    }
    player.body.position.y = reducedMotion
      ? 0
      : Math.abs(Math.sin(walkTime)) * 0.035;
    let next = null,
      min = 2.05;
    for (let [id, n] of Object.entries(npcs)) {
      let d = Math.hypot(p.x - n.root.position.x, p.z - n.root.position.z);
      if (d < min) {
        next = id;
        min = d;
      }
    }
    if (next !== near) {
      near = next;
      hooks.onNear(near);
    }
    nearRing.visible = !!near;
    if (near) {
      nearRing.position.x = npcs[near].root.position.x;
      nearRing.position.z = npcs[near].root.position.z;
    }
    playerRing.position.x = p.x;
    playerRing.position.z = p.z;
    const mp = document.querySelector("#map-player");
    mp.setAttribute("cx", String(5 + ((p.x + 9) / 18) * 90));
    mp.setAttribute("cy", String(5 + ((p.z + 6) / 12) * 60));
  }
  let ready = false;
  const projection = new THREE.Vector3();
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    let delta = Math.min((now - last) / 1000, 0.08);
    last = now;
    accumulator += delta;
    while (accumulator >= 1 / 60) {
      step(1 / 60);
      accumulator -= 1 / 60;
    }
    for (let p of Object.values(entries)) {
      projection.copy(p.root.position);
      projection.y += 2.6;
      projection.project(camera);
      p.label.style.left = `${(projection.x * 0.5 + 0.5) * width}px`;
      p.label.style.top = `${(-projection.y * 0.5 + 0.5) * height}px`;
    }
    renderer.render(scene, camera);
    if (!ready) {
      ready = true;
      hooks.onReady();
    }
  }
  requestAnimationFrame(frame);
  return {
    reset() {
      player.root.position.set(2.9, 0, 3.7);
      player.root.rotation.y = -0.65;
      keys.clear();
      target = null;
      near = null;
      hooks.onNear(null);
      moved = false;
      document.querySelector("#move-hint").classList.remove("dismissed");
    },
    highlight(id) {
      Object.entries(npcs).forEach(([key, p]) =>
        p.label.classList.toggle("highlight", key === id),
      );
      setTimeout(() => npcs[id].label.classList.remove("highlight"), 7000);
    },
    setKey(key, pressed) {
      if (pressed) {
        keys.add(key.toLowerCase());
        target = null;
      } else keys.delete(key.toLowerCase());
    },
  };
}
