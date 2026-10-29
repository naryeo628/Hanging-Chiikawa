(function (): void {
  'use strict';

  const PET_SIZE = 50;
  const SPRITE_MAX_SIDE = 256;
  const BACKGROUND_WHITE_THRESHOLD = 235;
  const BACKGROUND_ALPHA_THRESHOLD = 10;

  const AREA_SIDE_MARGIN = 30;

  const MAX_DT = 0.033;
  const CLICK_MAX_DURATION = 250;
  const CLICK_MAX_DISTANCE = 6;

  const STRING_LENGTH_JITTER = 25;
  const STRING_WIDTH = 2;
  const STRING_COLOR = '#3b2a1e';
  const STRING_SPREAD_RATIO = 0.28;
  const STRING_OVERLAP_RATIO = 0.7;

  const SPRING_STIFFNESS = 30;
  const DAMPING = 1.4;
  const MAX_ANGLE = 1.2;
  const MAX_VELOCITY = 7;
  const BRUSH_IMPULSE = 0.12;
  const BRUSH_REACH = 1.0;
  const CLICK_IMPULSE = 5;

  const IDLE_SWAY_AMPLITUDE = 0.04;
  const IDLE_SWAY_SPEED_MIN = 0.8;
  const IDLE_SWAY_SPEED_MAX = 1.4;

  const DEFAULT_SETTINGS: AppSettings = {
    dragEnabled: true,
    reactionsEnabled: true,
    autoWalkEnabled: true,
    clickThrough: true,
    pinMode: 'desktop',
    rowStartPercent: 10,
    rowSpacing: 80,
    stringLength: 60,
    characters: [],
  };

  interface Pet {
    entry: CharacterEntry;
    sprite: HTMLCanvasElement | null;
    anchorX: number;
    stringJitter: number;
    angle: number;
    velocity: number;
    swayPhase: number;
    swaySpeed: number;
    dragging: boolean;
    pointerDownTime: number;
    pointerDownX: number;
    pointerDownY: number;
    pointerMoved: boolean;
  }

  const canvasElCheck = document.getElementById('pet-canvas');
  if (!(canvasElCheck instanceof HTMLCanvasElement)) {
    throw new Error('canvas not found');
  }
  const canvasEl: HTMLCanvasElement = canvasElCheck;
  const contextCheck = canvasEl.getContext('2d');
  if (!contextCheck) {
    throw new Error('2d context not available');
  }
  const context: CanvasRenderingContext2D = contextCheck;

  let pets: Pet[] = [];
  let windowWidth = window.innerWidth;
  let windowHeight = window.innerHeight;
  let mouseEventsIgnored = true;
  let lastFrameTime = 0;
  let activeDragPet: Pet | null = null;
  let settings: AppSettings = DEFAULT_SETTINGS;

  function randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function setIgnoreMouseEvents(ignore: boolean): void {
    if (mouseEventsIgnored === ignore) {
      return;
    }
    mouseEventsIgnored = ignore;
    window.petAPI.setIgnoreMouseEvents(ignore);
  }

  function updateMouseCapture(x: number, y: number): void {
    setIgnoreMouseEvents(settings.clickThrough || findPetAt(x, y) === null);
  }

  function isVisible(pet: Pet): boolean {
    return pet.entry.visible;
  }

  function anchorXFor(index: number, count: number): number {
    const margin = AREA_SIDE_MARGIN + PET_SIZE / 2;
    const gaps = Math.max(count - 1, 1);
    const spacing = Math.min(settings.rowSpacing, Math.max((windowWidth - margin * 2) / gaps, 0));
    const start = clamp(windowWidth * (settings.rowStartPercent / 100), margin, windowWidth - margin - spacing * gaps);
    return start + index * spacing;
  }

  function buildSprite(img: HTMLImageElement): HTMLCanvasElement {
    const scale = Math.min(1, SPRITE_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const work = document.createElement('canvas');
    work.width = width;
    work.height = height;
    const workContext = work.getContext('2d', { willReadFrequently: true });
    if (!workContext) {
      return work;
    }
    workContext.drawImage(img, 0, 0, width, height);
    const imageData = workContext.getImageData(0, 0, width, height);
    const px = imageData.data;

    const isBackground = (p: number): boolean => {
      const i = p * 4;
      return (
        px[i + 3] < BACKGROUND_ALPHA_THRESHOLD ||
        (px[i] >= BACKGROUND_WHITE_THRESHOLD && px[i + 1] >= BACKGROUND_WHITE_THRESHOLD && px[i + 2] >= BACKGROUND_WHITE_THRESHOLD)
      );
    };

    // 가장자리에서 이어진 흰색/투명 영역만 배경으로 보고 지운다(캐릭터 안쪽 흰색은 유지).
    const visited = new Uint8Array(width * height);
    const stack: number[] = [];
    const visit = (x: number, y: number): void => {
      if (x < 0 || y < 0 || x >= width || y >= height) {
        return;
      }
      const p = y * width + x;
      if (visited[p] || !isBackground(p)) {
        return;
      }
      visited[p] = 1;
      stack.push(p);
    };
    for (let x = 0; x < width; x++) {
      visit(x, 0);
      visit(x, height - 1);
    }
    for (let y = 0; y < height; y++) {
      visit(0, y);
      visit(width - 1, y);
    }
    while (stack.length > 0) {
      const p = stack.pop() as number;
      px[p * 4 + 3] = 0;
      const x = p % width;
      const y = (p - x) / width;
      visit(x + 1, y);
      visit(x - 1, y);
      visit(x, y + 1);
      visit(x, y - 1);
    }
    workContext.putImageData(imageData, 0, 0);

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (px[(y * width + x) * 4 + 3] > 0) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
    if (maxX < 0) {
      return work;
    }
    const cropWidth = maxX - minX + 1;
    const cropHeight = maxY - minY + 1;
    const side = Math.max(cropWidth, cropHeight);
    const out = document.createElement('canvas');
    out.width = side;
    out.height = side;
    const outContext = out.getContext('2d');
    if (outContext) {
      outContext.drawImage(work, minX, minY, cropWidth, cropHeight, (side - cropWidth) / 2, (side - cropHeight) / 2, cropWidth, cropHeight);
    }
    return out;
  }

  function loadSprite(pet: Pet): void {
    window.petAPI.getCharacterImage(pet.entry.id).then((url) => {
      if (!url) {
        return;
      }
      const img = new Image();
      img.onload = (): void => {
        pet.sprite = buildSprite(img);
      };
      img.src = url;
    });
  }

  function createPet(entry: CharacterEntry): Pet {
    const pet: Pet = {
      entry,
      sprite: null,
      anchorX: 0,
      stringJitter: randomRange(-STRING_LENGTH_JITTER, STRING_LENGTH_JITTER),
      angle: 0,
      velocity: 0,
      swayPhase: Math.random() * Math.PI * 2,
      swaySpeed: randomRange(IDLE_SWAY_SPEED_MIN, IDLE_SWAY_SPEED_MAX),
      dragging: false,
      pointerDownTime: 0,
      pointerDownX: 0,
      pointerDownY: 0,
      pointerMoved: false,
    };
    loadSprite(pet);
    return pet;
  }

  function syncPets(): void {
    const existing = new Map(pets.map((pet) => [pet.entry.id, pet]));
    pets = settings.characters.map((entry) => {
      const pet = existing.get(entry.id);
      if (pet) {
        pet.entry = entry;
        return pet;
      }
      return createPet(entry);
    });
    if (activeDragPet && !pets.includes(activeDragPet)) {
      activeDragPet = null;
    }
  }

  function layoutPets(): void {
    const visible = pets.filter(isVisible);
    visible.forEach((pet, index) => {
      pet.anchorX = anchorXFor(index, visible.length);
    });
  }

  function resizeCanvas(): void {
    windowWidth = window.innerWidth;
    windowHeight = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = Math.round(windowWidth * dpr);
    canvasEl.height = Math.round(windowHeight * dpr);
    canvasEl.style.width = windowWidth + 'px';
    canvasEl.style.height = windowHeight + 'px';
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    layoutPets();
  }

  function stringLengthOf(pet: Pet): number {
    return Math.max(settings.stringLength + pet.stringJitter, 10);
  }

  function petCenter(pet: Pet): { x: number; y: number } {
    const distance = stringLengthOf(pet) + PET_SIZE / 2;
    return {
      x: pet.anchorX - distance * Math.sin(pet.angle),
      y: distance * Math.cos(pet.angle),
    };
  }

  function hitTest(pet: Pet, x: number, y: number, reach: number): boolean {
    if (!isVisible(pet)) {
      return false;
    }
    const center = petCenter(pet);
    const dx = x - center.x;
    const dy = y - center.y;
    return Math.sqrt(dx * dx + dy * dy) <= (PET_SIZE / 2) * reach;
  }

  function findPetAt(x: number, y: number): Pet | null {
    for (let i = pets.length - 1; i >= 0; i--) {
      if (hitTest(pets[i], x, y, 1)) {
        return pets[i];
      }
    }
    return null;
  }

  function addImpulse(pet: Pet, impulse: number): void {
    pet.velocity = clamp(pet.velocity + impulse, -MAX_VELOCITY, MAX_VELOCITY);
  }

  function dragTo(pet: Pet, x: number, y: number): void {
    const distance = stringLengthOf(pet) + PET_SIZE / 2;
    const dx = pet.anchorX - x;
    const dy = Math.max(y, distance * 0.3);
    pet.angle = clamp(Math.atan2(dx, dy), -MAX_ANGLE, MAX_ANGLE);
    pet.velocity = 0;
  }

  function onPointerMove(ev: MouseEvent): void {
    if (activeDragPet) {
      const pet = activeDragPet;
      dragTo(pet, ev.clientX, ev.clientY);
      const moveDx = ev.clientX - pet.pointerDownX;
      const moveDy = ev.clientY - pet.pointerDownY;
      if (Math.sqrt(moveDx * moveDx + moveDy * moveDy) > CLICK_MAX_DISTANCE) {
        pet.pointerMoved = true;
      }
      return;
    }

    for (const pet of pets) {
      if (hitTest(pet, ev.clientX, ev.clientY, BRUSH_REACH)) {
        addImpulse(pet, ev.movementX * BRUSH_IMPULSE);
      }
    }

    updateMouseCapture(ev.clientX, ev.clientY);
  }

  function onPointerDown(ev: MouseEvent): void {
    const pet = findPetAt(ev.clientX, ev.clientY);
    if (!pet) {
      return;
    }
    pet.pointerDownTime = performance.now();
    pet.pointerDownX = ev.clientX;
    pet.pointerDownY = ev.clientY;
    pet.pointerMoved = false;

    if (settings.dragEnabled) {
      pet.dragging = true;
      activeDragPet = pet;
    }
  }

  function finishPointer(pet: Pet, ev: MouseEvent): void {
    const moveDx = ev.clientX - pet.pointerDownX;
    const moveDy = ev.clientY - pet.pointerDownY;
    const moved = pet.pointerMoved || Math.sqrt(moveDx * moveDx + moveDy * moveDy) > CLICK_MAX_DISTANCE;
    const duration = performance.now() - pet.pointerDownTime;

    if (!moved && duration <= CLICK_MAX_DURATION && settings.reactionsEnabled) {
      const center = petCenter(pet);
      addImpulse(pet, ev.clientX >= center.x ? -CLICK_IMPULSE : CLICK_IMPULSE);
    }
  }

  function onPointerUp(ev: MouseEvent): void {
    if (activeDragPet) {
      const pet = activeDragPet;
      activeDragPet = null;
      pet.dragging = false;
      finishPointer(pet, ev);
      updateMouseCapture(ev.clientX, ev.clientY);
      return;
    }

    const pet = findPetAt(ev.clientX, ev.clientY);
    if (!pet) {
      return;
    }
    finishPointer(pet, ev);
  }

  function stepSwing(pet: Pet, dt: number): void {
    pet.swayPhase += dt * pet.swaySpeed;
    const rest = settings.autoWalkEnabled ? Math.sin(pet.swayPhase) * IDLE_SWAY_AMPLITUDE : 0;
    const acceleration = -SPRING_STIFFNESS * (pet.angle - rest) - DAMPING * pet.velocity;
    pet.velocity += acceleration * dt;
    pet.angle += pet.velocity * dt;
    if (Math.abs(pet.angle) > MAX_ANGLE) {
      pet.angle = clamp(pet.angle, -MAX_ANGLE, MAX_ANGLE);
      pet.velocity = 0;
    }
  }

  function drawPlaceholder(pet: Pet): void {
    const size = PET_SIZE;
    context.beginPath();
    context.arc(0, size / 2, size / 2, 0, Math.PI * 2);
    context.fillStyle = 'rgba(200, 200, 200, 0.9)';
    context.fill();
    context.strokeStyle = 'rgba(120, 120, 120, 0.9)';
    context.lineWidth = 2;
    context.stroke();
  }

  function drawPet(pet: Pet): void {
    const size = PET_SIZE;
    const spread = size * STRING_SPREAD_RATIO;

    context.save();
    context.translate(pet.anchorX, 0);
    context.rotate(pet.angle);

    context.strokeStyle = STRING_COLOR;
    context.lineWidth = STRING_WIDTH;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(-spread, 0);
    context.lineTo(-spread, stringLengthOf(pet) + size * STRING_OVERLAP_RATIO);
    context.moveTo(spread, 0);
    context.lineTo(spread, stringLengthOf(pet) + size * STRING_OVERLAP_RATIO);
    context.stroke();

    context.translate(0, stringLengthOf(pet));
    if (pet.sprite) {
      context.drawImage(pet.sprite, -size / 2, 0, size, size);
    } else {
      drawPlaceholder(pet);
    }

    context.restore();
  }

  function render(timestamp: number): void {
    if (!lastFrameTime) {
      lastFrameTime = timestamp;
    }
    const dt = Math.min((timestamp - lastFrameTime) / 1000, MAX_DT);
    lastFrameTime = timestamp;

    context.clearRect(0, 0, windowWidth, windowHeight);

    for (const pet of pets) {
      if (!isVisible(pet)) {
        continue;
      }
      if (!pet.dragging) {
        stepSwing(pet, dt);
      }
      drawPet(pet);
    }

    requestAnimationFrame(render);
  }

  function init(): void {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mouseup', onPointerUp);
    window.petAPI.onSettingsChanged((updated) => {
      settings = updated;
      if (settings.clickThrough) {
        setIgnoreMouseEvents(true);
      }
      syncPets();
      layoutPets();
    });
    requestAnimationFrame(render);
  }

  init();
})();
