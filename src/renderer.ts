(function (): void {
  'use strict';

  const CHARACTER_CONFIGS: CharacterConfig[] = [
    { id: 'chiikawa', image: 'assets/characters/chiikawa.png', size: 50 },
    { id: 'hachiware', image: 'assets/characters/hachiware.png', size: 50 },
    { id: 'usagi', image: 'assets/characters/usagi.png', size: 50 },
    { id: 'momonga', image: 'assets/characters/momonga.png', size: 50 },
  ];

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
    characters: { chiikawa: true, hachiware: true, usagi: true, momonga: true },
  };

  interface Pet {
    config: CharacterConfig;
    image: HTMLImageElement;
    imageLoaded: boolean;
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
    return settings.characters[pet.config.id];
  }

  function anchorXFor(index: number): number {
    const margin = AREA_SIDE_MARGIN + CHARACTER_CONFIGS[0].size / 2;
    const gaps = Math.max(CHARACTER_CONFIGS.length - 1, 1);
    const spacing = Math.min(settings.rowSpacing, Math.max((windowWidth - margin * 2) / gaps, 0));
    const start = clamp(windowWidth * (settings.rowStartPercent / 100), margin, windowWidth - margin - spacing * gaps);
    return start + index * spacing;
  }

  function createPet(config: CharacterConfig, index: number): Pet {
    const img = new Image();
    const pet: Pet = {
      config,
      image: img,
      imageLoaded: false,
      anchorX: anchorXFor(index),
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
    img.onload = (): void => {
      pet.imageLoaded = true;
    };
    img.onerror = (): void => {
      pet.imageLoaded = false;
    };
    img.src = config.image;
    return pet;
  }

  function layoutPets(): void {
    pets.forEach((pet, index) => {
      pet.anchorX = anchorXFor(index);
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
    const distance = stringLengthOf(pet) + pet.config.size / 2;
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
    return Math.sqrt(dx * dx + dy * dy) <= (pet.config.size / 2) * reach;
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
    const distance = stringLengthOf(pet) + pet.config.size / 2;
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
    const size = pet.config.size;
    context.beginPath();
    context.arc(0, size / 2, size / 2, 0, Math.PI * 2);
    context.fillStyle = 'rgba(200, 200, 200, 0.9)';
    context.fill();
    context.strokeStyle = 'rgba(120, 120, 120, 0.9)';
    context.lineWidth = 2;
    context.stroke();
  }

  function drawPet(pet: Pet): void {
    const size = pet.config.size;
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
    if (pet.imageLoaded) {
      context.drawImage(pet.image, -size / 2, 0, size, size);
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
    pets = CHARACTER_CONFIGS.map(createPet);
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
      layoutPets();
    });
    requestAnimationFrame(render);
  }

  init();
})();
