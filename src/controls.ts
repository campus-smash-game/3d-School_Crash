type Quality = 'auto' | 'low' | 'high';

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element: ${id}`);
  return element as T;
};

export class Controls {
  moveX = 0;
  moveZ = 0;
  lookX = 0;
  lookY = 0;
  jump = false;
  attack = false;
  pulse = false;
  sprint = false;
  active = false;
  onStart?: (startLocationId?: string) => void;
  onReset?: () => void;
  onQuality?: (value: Quality) => void;
  onSound?: (enabled: boolean) => void;
  onTravel?: (id: string) => void;

  private canvas: HTMLCanvasElement;
  private ui = byId('ui');
  private startButton = byId<HTMLButtonElement>('start-button');
  private startLabel = byId('start-label');
  private title = byId('welcome-title');
  private description = byId('welcome-description');
  private toast = byId('toast');
  private keys = new Set<string>();
  private ready = false;
  private locationsAvailable = false;
  private shuttleStops: { id: string; name: string }[] = [];
  private hasStarted = false;
  private touch = matchMedia('(pointer: coarse)').matches;
  private dragMode = false;
  private lockRequested = false;
  private stickX = 0;
  private stickY = 0;
  private stickPointer: number | null = null;
  private stickSurface: HTMLElement | null = null;
  private stickOriginX = 0;
  private stickOriginY = 0;
  private stickRadius = 44;
  private lookPointer: number | null = null;
  private actionPointers = new Map<HTMLElement, number>();
  private touchActions = new Set<HTMLElement>();
  private jumpTouchPointer: number | null = null;
  private jumpTouchPending = false;
  private lastLookX = 0;
  private lastLookY = 0;
  private touchLook = false;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private sound = true;
  private destroyedLabel = byId('destroyed-count');
  private totalLabel = byId('total-count');
  private progress = byId('score-progress');
  private fpsLabel = byId('fps-label');
  private targetLabel = byId('target-label');
  private crosshair = document.querySelector('.crosshair')!;
  private chargeProgress = byId('charge-progress');
  private chargeLabel = byId('charge-label');
  private pulseButton = byId<HTMLButtonElement>('pulse-button');
  private lastHud = { destroyed: -1, total: -1, fps: -1, target: '', charge: -1 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    document.body.classList.toggle('touch', this.touch);
    this.startButton.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch' || event.pointerType === 'pen') this.enableTouch();
      else if (event.pointerType === 'mouse' && !this.ignoreMouse(event)) this.enableMouse();
    });
    this.startButton.addEventListener('click', () => this.start());
    byId('reload-button').addEventListener('click', () => window.location.reload());
    byId('map-button').addEventListener('click', () => this.openTravel());
    byId('travel-button').addEventListener('click', () => {
      if (!this.ready || !this.locationsAvailable) return;
      const select = byId<HTMLSelectElement>('travel-select');
      if (!this.shuttleStops.some(stop => stop.id === select.value)) return;
      this.clearInput();
      const name = select.selectedOptions[0]?.textContent ?? '선택한 정류장';
      if (this.hasStarted) this.onTravel?.(select.value);
      this.notify(`${name}에서 탐험을 시작해요.`);
      this.start();
    });
    byId('pause-button').addEventListener('click', () => this.pause());
    byId('reset-button').addEventListener('click', () => {
      if (!this.ready) return;
      this.clearInput();
      this.onReset?.();
      this.notify('부서진 물체를 처음 모습으로 복원했어요.');
    });
    byId<HTMLSelectElement>('quality').addEventListener('change', (event) => {
      const value = (event.target as HTMLSelectElement).value as Quality;
      this.onQuality?.(value);
    });
    byId('sound-button').addEventListener('click', () => {
      this.sound = !this.sound;
      const button = byId('sound-button');
      button.setAttribute('aria-pressed', String(this.sound));
      button.setAttribute('aria-label', this.sound ? '소리 끄기' : '소리 켜기');
      this.onSound?.(this.sound);
    });
    document.addEventListener('keydown', (event) => this.keyDown(event));
    document.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
      this.updateMovement();
    });
    window.addEventListener('blur', () => this.pause());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === this.canvas) {
        this.lockRequested = false;
        this.dragMode = false;
        if (!this.active || this.touch) document.exitPointerLock();
      } else if (this.active && !this.touch && !this.dragMode && !this.lockRequested) {
        this.pause();
      }
    });
    document.addEventListener('pointerlockerror', () => this.useDragMode());
    document.addEventListener('mousemove', (event) => {
      if (this.active && !this.touch && document.pointerLockElement === this.canvas) {
        this.lookX += event.movementX;
        this.lookY += event.movementY;
      }
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('pointerdown', (event) => this.lookStart(event));
    canvas.addEventListener('pointermove', (event) => this.lookMove(event));
    canvas.addEventListener('pointerup', (event) => this.lookEnd(event));
    canvas.addEventListener('pointercancel', (event) => this.lookEnd(event));
    canvas.addEventListener('lostpointercapture', (event) => {
      if (event.pointerId === this.lookPointer) this.lookPointer = null;
      if (event.pointerId === this.stickPointer) this.releaseStick();
    });
    this.bindJoystick();
    this.bindAction('attack-button', () => { this.attack = true; });
    this.bindAction('jump-button', () => { this.jump = true; }, true);
    this.bindAction('pulse-button', () => { this.pulse = true; });
    window.addEventListener('resize', () => this.clearInput());
    window.addEventListener('orientationchange', () => this.clearInput());
  }

  setLoading(message:string):void {
    if(this.ready)return;
    byId('loading-status').textContent=message;
  }

  setReady(): void {
    this.ready = true;
    this.ui.dataset.state = 'landing';
    this.startButton.disabled = false;
    this.startLabel.textContent = '캠퍼스 들어가기';
    this.setSettingsDisabled(false);
  }

  setError(message: string): void {
    this.ready = false;
    this.active = false;
    this.lockRequested = false;
    this.clearInput();
    this.startButton.disabled = true;
    this.setSettingsDisabled(true);
    this.ui.dataset.state = 'error';
    this.title.textContent = '잠시 멈췄어요.';
    this.description.textContent = '게임 화면을 다시 불러와 주세요.';
    byId('error-message').textContent = message;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  private setSettingsDisabled(disabled: boolean): void {
    this.startButton.disabled = disabled || (!this.hasStarted && !this.locationsAvailable);
    byId<HTMLSelectElement>('quality').disabled = disabled;
    byId<HTMLButtonElement>('sound-button').disabled = disabled;
    byId<HTMLButtonElement>('reset-button').disabled = disabled;
    byId<HTMLSelectElement>('travel-select').disabled = disabled || !this.locationsAvailable;
    byId<HTMLButtonElement>('travel-button').disabled = disabled || !this.locationsAvailable;
  }

  setShuttleStops(stops: { id: string; name: string }[]): void {
    this.shuttleStops = stops;
    byId('travel-label').textContent = this.hasStarted ? '이동할 정류장' : '시작 정류장';
    byId<HTMLSelectElement>('travel-select').setAttribute('aria-label', this.hasStarted ? '이동할 교내 셔틀 정류장' : '시작할 교내 셔틀 정류장');
    byId('travel-button-label').textContent = this.hasStarted ? '이동' : '여기서 시작';
    this.populateLocations(stops);
  }

  private populateLocations(locations: { id: string; name: string }[]): void {
    const select = byId<HTMLSelectElement>('travel-select');
    const previous = select.value;
    select.replaceChildren();
    for (const location of locations) {
      const option = document.createElement('option');
      option.value = location.id;
      option.textContent = location.name;
      select.append(option);
    }
    if (locations.some((location) => location.id === previous)) select.value = previous;
    this.locationsAvailable = locations.length > 0;
    this.setSettingsDisabled(!this.ready);
  }

  updateLocation(name: string): void {
    byId('location-name').textContent = name;
    byId('minimap-location').textContent = name;
  }

  private openTravel(): void {
    if (!this.ready) return;
    this.pause();
    byId<HTMLSelectElement>('travel-select').focus();
  }

  private start(): void {
    if (!this.ready) return;
    const startId = !this.hasStarted
      ? byId<HTMLSelectElement>('travel-select').value : undefined;
    if (!this.hasStarted && !this.shuttleStops.some(stop => stop.id === startId)) return;
    this.hasStarted = true;
    this.active = true;
    this.ui.dataset.state = 'playing';
    this.onStart?.(startId);
    byId('travel-label').textContent = '이동할 정류장';
    byId<HTMLSelectElement>('travel-select').setAttribute('aria-label', '이동할 교내 셔틀 정류장');
    byId('travel-button-label').textContent = '이동';
    if (!this.touch) this.requestLock();
  }

  pause(): void {
    if (!this.active) return;
    this.active = false;
    this.lockRequested = false;
    this.clearInput();
    this.ui.dataset.state = 'paused';
    this.title.innerHTML = '잠깐 쉬어도,<br /><span>괜찮아요.</span>';
    this.description.innerHTML = '부서진 풍경은 그대로.<br />준비되면 다시 걸어 보세요.';
    this.startLabel.textContent = '계속 둘러보기';
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  private requestLock(): void {
    if (this.lockRequested) return;
    if (!this.canvas.requestPointerLock) {
      this.useDragMode();
      return;
    }
    this.lockRequested = true;
    try {
      const result = this.canvas.requestPointerLock();
      if (result && typeof result.catch === 'function') result.catch(() => this.useDragMode());
    } catch {
      this.useDragMode();
    }
  }

  private useDragMode(): void {
    this.lockRequested = false;
    if (this.touch) { this.dragMode = false; return; }
    if (document.pointerLockElement === this.canvas) {
      this.dragMode = false;
      return;
    }
    this.dragMode = true;
    if (this.active) this.notify('마우스를 누른 채 움직이면 시점이 바뀌어요. F 키로 발사할 수 있어요.');
  }

  private keyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
    if (event.code === 'Escape') {
      if (this.active) this.pause();
      return;
    }
    if (event.code === 'KeyM' && !event.repeat) {
      event.preventDefault();
      this.openTravel();
      return;
    }
    if (!this.active) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    this.keys.add(event.code);
    if (!event.repeat) {
      if (event.code === 'Space') this.jump = true;
      if (event.code === 'KeyE') this.pulse = true;
      if (event.code === 'KeyF') this.attack = true;
      if (event.code === 'KeyR') {
        this.clearInput();
        this.onReset?.();
        this.notify('부서진 물체를 처음 모습으로 복원했어요.');
      }
    }
    this.updateMovement();
  }

  private updateMovement(): void {
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight');
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const forward = this.keys.has('KeyW') || this.keys.has('ArrowUp');
    const backward = this.keys.has('KeyS') || this.keys.has('ArrowDown');
    this.moveX = Number(right) - Number(left) + this.stickX;
    this.moveZ = Number(forward) - Number(backward) + this.stickY;
    const length = Math.hypot(this.moveX, this.moveZ);
    if (length > 1) { this.moveX /= length; this.moveZ /= length; }
    this.sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  private enableTouch(): void {
    if (this.touch) return;
    this.clearInput();
    this.touch = true;
    this.dragMode = false;
    this.lockRequested = false;
    document.body.classList.add('touch');
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  private ignoreMouse(event: PointerEvent): boolean {
    const source = (event as PointerEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } }).sourceCapabilities;
    return event.pointerType === 'mouse' && (source?.firesTouchEvents === true || this.stickPointer !== null || this.lookPointer !== null && this.touchLook || this.touchActions.size > 0);
  }

  private enableMouse(): void {
    if (!this.touch) return;
    this.clearInput();
    this.touch = false;
    this.dragMode = false;
    this.lockRequested = false;
    document.body.classList.remove('touch');
  }

  private lookStart(event: PointerEvent): void {
    if (!this.active) return;
    event.preventDefault();
    if (this.ignoreMouse(event)) return;
    const touchPointer = event.pointerType === 'touch' || event.pointerType === 'pen';
    if (touchPointer) {
      this.enableTouch();
      const zone = byId('move-zone').getBoundingClientRect();
      if (event.clientX >= zone.left && event.clientX <= zone.right && event.clientY >= zone.top && event.clientY <= zone.bottom) {
        this.beginStick(event, this.canvas);
        return;
      }
      const bounds = this.canvas.getBoundingClientRect();
      if (event.clientX < bounds.left + bounds.width * .46) return;
    } else if (event.pointerType === 'mouse' && this.touch) {
      this.enableMouse();
      this.requestLock();
      return;
    }
    if (!this.touch && document.pointerLockElement === this.canvas) {
      if (event.button === 0) this.attack = true;
      if (event.button === 2) this.pulse = true;
      return;
    }
    if (!this.touch && !this.dragMode) {
      this.requestLock();
      return;
    }
    if (this.lookPointer !== null) return;
    this.lookPointer = event.pointerId;
    this.touchLook = touchPointer;
    this.lastLookX = event.clientX;
    this.lastLookY = event.clientY;
    this.canvas.setPointerCapture(event.pointerId);
  }

  private lookMove(event: PointerEvent): void {
    if (this.active && event.pointerId === this.stickPointer) {
      this.moveStick(event);
      return;
    }
    if (!this.active || event.pointerId !== this.lookPointer) return;
    const bounds = this.canvas.getBoundingClientRect();
    const scale = this.touchLook ? Math.max(1, Math.min(1.8, 600 / Math.max(1, Math.min(bounds.width, bounds.height)))) : 1;
    this.lookX += (event.clientX - this.lastLookX) * scale;
    this.lookY += (event.clientY - this.lastLookY) * scale;
    this.lastLookX = event.clientX;
    this.lastLookY = event.clientY;
  }

  private lookEnd(event: PointerEvent): void {
    if (event.pointerId === this.stickPointer) {
      this.endStick(event);
      return;
    }
    if (event.pointerId !== this.lookPointer) return;
    this.lookPointer = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  }

  private bindJoystick(): void {
    const zone = byId('move-zone');
    zone.addEventListener('pointerdown', (event) => this.beginStick(event, zone));
    zone.addEventListener('pointermove', (event) => {
      if (this.active && event.pointerId === this.stickPointer) this.moveStick(event);
    });
    zone.addEventListener('pointerup', (event) => this.endStick(event));
    zone.addEventListener('pointercancel', (event) => this.endStick(event));
    zone.addEventListener('lostpointercapture', (event) => {
      if (event.pointerId === this.stickPointer) this.releaseStick();
    });
  }

  private beginStick(event: PointerEvent, surface: HTMLElement): void {
    if (!this.active || this.stickPointer !== null) return;
    event.preventDefault();
    event.stopPropagation();
    if (this.ignoreMouse(event)) return;
    if (event.pointerType === 'mouse') {
      this.enableMouse();
      this.requestLock();
      return;
    }
    this.enableTouch();
    this.stickPointer = event.pointerId;
    this.stickSurface = surface;
    this.stickOriginX = event.clientX;
    this.stickOriginY = event.clientY;
    const joystick = byId('joystick');
    this.stickRadius = Math.max(32, joystick.getBoundingClientRect().width * .42);
    joystick.style.left = `${event.clientX}px`;
    joystick.style.top = `${event.clientY}px`;
    joystick.classList.add('engaged');
    surface.setPointerCapture(event.pointerId);
    this.moveStick(event);
  }

  private moveStick(event: PointerEvent): void {
    const dx = event.clientX - this.stickOriginX;
    const dy = event.clientY - this.stickOriginY;
    const distance = Math.hypot(dx, dy);
    const deadZone = this.stickRadius * .1;
    const amount = Math.max(0, Math.min(1, (distance - deadZone) / (this.stickRadius - deadZone)));
    this.stickX = distance > 0 ? dx / distance * amount : 0;
    this.stickY = distance > 0 ? -dy / distance * amount : 0;
    const visualScale = distance > this.stickRadius ? this.stickRadius / distance : 1;
    byId('joystick-thumb').style.transform = `translate(${dx * visualScale}px,${dy * visualScale}px)`;
    this.updateMovement();
  }

  private endStick(event: PointerEvent): void {
    if (event.pointerId !== this.stickPointer) return;
    const surface = this.stickSurface;
    this.releaseStick();
    if (surface?.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
  }

  private releaseStick(): void {
    this.stickPointer = null;
    this.stickSurface = null;
    this.stickX = 0;
    this.stickY = 0;
    byId('joystick-thumb').style.transform = '';
    byId('joystick').classList.remove('engaged');
    byId('joystick').style.left = '';
    byId('joystick').style.top = '';
    this.updateMovement();
  }

  private bindAction(id: string, action: () => void, holdTouchJump = false): void {
    const button = byId(id);
    button.addEventListener('pointerdown', (event) => {
      if (!this.active || this.actionPointers.has(button)) return;
      event.preventDefault();
      event.stopPropagation();
      if (this.ignoreMouse(event)) return;
      const touchPointer = event.pointerType === 'touch' || event.pointerType === 'pen';
      if (touchPointer) this.enableTouch();
      button.setPointerCapture(event.pointerId);
      this.actionPointers.set(button, event.pointerId);
      if (touchPointer) this.touchActions.add(button);
      button.classList.add('pressed');
      if (holdTouchJump && touchPointer) {
        this.jumpTouchPointer = event.pointerId;
        this.jumpTouchPending = true;
      } else action();
    });
    const end = (event: PointerEvent) => {
      if (this.actionPointers.get(button) !== event.pointerId) return;
      this.actionPointers.delete(button);
      this.touchActions.delete(button);
      if (this.jumpTouchPointer === event.pointerId) {
        this.jumpTouchPointer = null;
        if (event.type !== 'pointerup') this.jumpTouchPending = false;
      }
      button.classList.remove('pressed');
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
    };
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end);
    button.addEventListener('lostpointercapture', end);
  }

  private clearInput(): void {
    this.keys.clear();
    if (this.stickPointer !== null && this.stickSurface?.hasPointerCapture(this.stickPointer)) {
      this.stickSurface.releasePointerCapture(this.stickPointer);
    }
    if (this.lookPointer !== null && this.canvas.hasPointerCapture(this.lookPointer)) {
      this.canvas.releasePointerCapture(this.lookPointer);
    }
    for (const [button, pointerId] of this.actionPointers) {
      if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
      button.classList.remove('pressed');
    }
    this.actionPointers.clear();
    this.touchActions.clear();
    this.jumpTouchPointer = null;
    this.jumpTouchPending = false;
    this.releaseStick();
    this.moveX = this.moveZ = this.lookX = this.lookY = 0;
    this.jump = this.attack = this.pulse = this.sprint = false;
    this.lookPointer = null;
    document.querySelectorAll('.pressed').forEach((button) => button.classList.remove('pressed'));
  }

  consumeLook(): { x: number; y: number } {
    const value = { x: this.lookX, y: this.lookY };
    this.lookX = this.lookY = 0;
    return value;
  }
  consumeJump(): boolean {
    const value = this.jump || this.jumpTouchPending || this.jumpTouchPointer !== null;
    this.jump = false;
    this.jumpTouchPending = false;
    return value;
  }
  consumeAttack(): boolean { const value = this.attack; this.attack = false; return value; }
  consumePulse(): boolean { const value = this.pulse; this.pulse = false; return value; }

  updateHud(destroyed: number, total: number, fps: number, target: string, charge: number): void {
    if (destroyed !== this.lastHud.destroyed || total !== this.lastHud.total) {
      this.destroyedLabel.textContent = String(destroyed);
      this.totalLabel.textContent = ` / ${total}`;
      this.progress.style.width = `${total ? destroyed / total * 100 : 0}%`;
      this.lastHud.destroyed = destroyed;
      this.lastHud.total = total;
    }
    const roundedFps = Math.round(fps);
    if (roundedFps !== this.lastHud.fps) {
      this.fpsLabel.textContent = String(roundedFps);
      this.lastHud.fps = roundedFps;
    }
    if (target !== this.lastHud.target) {
      this.targetLabel.textContent = target;
      this.crosshair.classList.toggle('has-target', Boolean(target));
      this.lastHud.target = target;
    }
    const percent = Math.round(Math.max(0, Math.min(1, charge)) * 100);
    if (percent !== this.lastHud.charge) {
      this.chargeProgress.style.width = `${percent}%`;
      this.chargeLabel.textContent = percent >= 100 ? '준비' : `${percent}%`;
      this.pulseButton.classList.toggle('cooldown', percent < 100);
      this.pulseButton.setAttribute('aria-label', percent >= 100 ? '강화탄' : `강화탄 충전 ${percent}%`);
      this.lastHud.charge = percent;
    }
  }

  notify(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.add('visible');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.classList.remove('visible'), 2600);
  }
}
