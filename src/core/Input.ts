export class InputManager {
  private keysDown: Set<string> = new Set();
  private keysJustPressed: Set<string> = new Set();
  private keysJustReleased: Set<string> = new Set();

  // Virtual buttons for mobile
  private virtualButtons: Record<string, boolean> = {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    action: false,
    pause: false,
  };

  private prevVirtualButtons: Record<string, boolean> = { ...this.virtualButtons };

  constructor() {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
  }

  private onKeyDown(e: KeyboardEvent) {
    // Prevent default scroll behavior for game keys
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    if (!this.keysDown.has(e.code)) {
      this.keysJustPressed.add(e.code);
    }
    this.keysDown.add(e.code);
  }

  private onKeyUp(e: KeyboardEvent) {
    this.keysDown.delete(e.code);
    this.keysJustReleased.add(e.code);
  }

  public setVirtualButton(button: string, pressed: boolean) {
    if (button in this.virtualButtons) {
      this.virtualButtons[button] = pressed;
    }
  }

  public update() {
    this.keysJustPressed.clear();
    this.keysJustReleased.clear();
    this.prevVirtualButtons = { ...this.virtualButtons };
  }

  public isLeft(): boolean {
    return this.keysDown.has('ArrowLeft') || this.keysDown.has('KeyA') || this.virtualButtons.left;
  }

  public isRight(): boolean {
    return this.keysDown.has('ArrowRight') || this.keysDown.has('KeyD') || this.virtualButtons.right;
  }

  public isUp(): boolean {
    return this.keysDown.has('ArrowUp') || this.keysDown.has('KeyW') || this.virtualButtons.up;
  }

  public isDown(): boolean {
    return this.keysDown.has('ArrowDown') || this.keysDown.has('KeyS') || this.virtualButtons.down;
  }

  public isUpJustPressed(): boolean {
    const vJust = this.virtualButtons.up && !this.prevVirtualButtons.up;
    return this.keysJustPressed.has('ArrowUp') || this.keysJustPressed.has('KeyW') || vJust;
  }

  public isDownJustPressed(): boolean {
    const vJust = this.virtualButtons.down && !this.prevVirtualButtons.down;
    return this.keysJustPressed.has('ArrowDown') || this.keysJustPressed.has('KeyS') || vJust;
  }

  public isLeftJustPressed(): boolean {
    const vJust = this.virtualButtons.left && !this.prevVirtualButtons.left;
    return this.keysJustPressed.has('ArrowLeft') || this.keysJustPressed.has('KeyA') || vJust;
  }

  public isRightJustPressed(): boolean {
    const vJust = this.virtualButtons.right && !this.prevVirtualButtons.right;
    return this.keysJustPressed.has('ArrowRight') || this.keysJustPressed.has('KeyD') || vJust;
  }

  public isSelectJustPressed(): boolean {
    const vJust = (this.virtualButtons.action && !this.prevVirtualButtons.action) ||
                  (this.virtualButtons.jump && !this.prevVirtualButtons.jump);
    return this.keysJustPressed.has('Enter') || this.keysJustPressed.has('Space') || vJust;
  }

  public isJump(): boolean {
    return this.keysDown.has('Space') || this.keysDown.has('KeyX') || this.keysDown.has('ArrowUp') || this.keysDown.has('KeyW') || this.virtualButtons.jump;
  }

  public isJumpActionJustPressed(): boolean {
    const vJust = this.virtualButtons.jump && !this.prevVirtualButtons.jump;
    return this.keysJustPressed.has('Space') || this.keysJustPressed.has('KeyX') || this.keysJustPressed.has('KeyZ') || vJust;
  }

  public isJumpJustPressed(): boolean {
    const vJust = this.virtualButtons.jump && !this.prevVirtualButtons.jump;
    return this.keysJustPressed.has('Space') || this.keysJustPressed.has('KeyX') || this.keysJustPressed.has('ArrowUp') || this.keysJustPressed.has('KeyW') || vJust;
  }

  public isActionJustPressed(): boolean {
    const vJust = this.virtualButtons.action && !this.prevVirtualButtons.action;
    return this.keysJustPressed.has('KeyE') || this.keysJustPressed.has('Enter') || vJust;
  }

  public isPauseJustPressed(): boolean {
    const vJust = this.virtualButtons.pause && !this.prevVirtualButtons.pause;
    return this.keysJustPressed.has('Escape') || this.keysJustPressed.has('KeyP') || vJust;
  }

  public isAnyKeyJustPressed(): boolean {
    return this.keysJustPressed.size > 0 || Object.values(this.virtualButtons).some((v) => v);
  }
}
