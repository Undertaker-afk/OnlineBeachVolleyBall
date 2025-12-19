import * as BABYLON from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';
import { joinRoom } from 'trystero/torrent';

// Define Room type based on joinRoom return type
type Room = ReturnType<typeof joinRoom>;

export type GameMode = 'local' | 'pvcpu' | 'online';
export type Role = 'host' | 'client';

interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GameState {
  p1: PlayerState;
  p2: PlayerState;
  ball: BallState;
  scoreP1: number;
  scoreP2: number;
  isBallActive: boolean;
  lastHitSide: number; // -1, 1, or 0
  hitCount: number;
}

interface InputState {
    left: boolean;
    right: boolean;
    jump: boolean;
}

const GRAVITY = -0.5;
const JUMP_FORCE = 15.0;
const MOVE_SPEED = 8.0;
const BALL_GRAVITY = -0.4;
const NET_HEIGHT = 4.0;
const PLAYER_RADIUS = 1.0;
const PLAYER_HEIGHT = 3.5;
const BALL_RADIUS = 0.8;
const BALL_SERVE_Y = 6.5;

export class VolleyGame {
  private engine: BABYLON.Engine;
  private scene: BABYLON.Scene;
  private canvas: HTMLCanvasElement;

  private p1Mesh!: BABYLON.Mesh;
  private p2Mesh!: BABYLON.Mesh;
  private ballMesh!: BABYLON.Mesh;
  private scoreText!: GUI.TextBlock;
  private ballSlider!: GUI.Rectangle;
  private ballSliderMarker!: GUI.Rectangle;

  private state: GameState;

  private mode: GameMode;
  private role: Role;
  private roomId: string | null;

  private room: Room | null = null;
  private sendState: ((data: GameState) => void) | null = null;
  private sendInput: ((data: InputState) => void) | null = null;
  private remoteInput: InputState = { left: false, right: false, jump: false };
  private lastHitTime: number = 0;
  private serveOffset: number = 0.5;

  private inputMap: { [key: string]: boolean } = {};

  constructor(canvas: HTMLCanvasElement, mode: GameMode, role: Role, roomId: string | null) {
    this.canvas = canvas;
    this.mode = mode;
    this.role = role;
    this.roomId = roomId;
    this.engine = new BABYLON.Engine(canvas, true);
    
    this.state = {
      p1: { x: -5, y: PLAYER_HEIGHT / 2, vx: 0, vy: 0 },
      p2: { x: 5, y: PLAYER_HEIGHT / 2, vx: 0, vy: 0 },
      ball: { x: -5, y: BALL_SERVE_Y, vx: 0, vy: 0 },
      scoreP1: 0,
      scoreP2: 0,
      isBallActive: false,
      lastHitSide: 0,
      hitCount: 0
    };

    this.scene = this.createScene();
    
    if (this.mode === 'online' && this.roomId) {
      this.initNetwork();
    }

    this.setupInputs();

    this.engine.runRenderLoop(() => {
      this.update();
      this.scene.render();
    });

    window.addEventListener('resize', () => {
      this.engine.resize();
    });
  }

  private createScene(): BABYLON.Scene {
    const scene = new BABYLON.Scene(this.engine);
    scene.clearColor = new BABYLON.Color4(0.5, 0.8, 1, 1); // Sky blue

    const camera = new BABYLON.FreeCamera("camera1", new BABYLON.Vector3(0, 10, -25), scene);
    camera.setTarget(BABYLON.Vector3.Zero());

    const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.7;

    // Ground
    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 30, height: 10 }, scene);
    const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
    groundMat.diffuseColor = new BABYLON.Color3(1, 0.9, 0.5); // Sand
    ground.material = groundMat;

    // Net
    const net = BABYLON.MeshBuilder.CreateBox("net", { width: 0.2, height: NET_HEIGHT, depth: 10 }, scene);
    net.position.y = NET_HEIGHT / 2;
    const netMat = new BABYLON.StandardMaterial("netMat", scene);
    netMat.diffuseColor = new BABYLON.Color3(0.8, 0.8, 0.8);
    net.material = netMat;

    // Players
    this.p1Mesh = BABYLON.MeshBuilder.CreateCapsule("p1", { radius: PLAYER_RADIUS, height: PLAYER_HEIGHT }, scene);
    const p1Mat = new BABYLON.StandardMaterial("p1Mat", scene);
    p1Mat.diffuseColor = new BABYLON.Color3(1, 0, 0);
    this.p1Mesh.material = p1Mat;

    this.p2Mesh = BABYLON.MeshBuilder.CreateCapsule("p2", { radius: PLAYER_RADIUS, height: PLAYER_HEIGHT }, scene);
    const p2Mat = new BABYLON.StandardMaterial("p2Mat", scene);
    p2Mat.diffuseColor = new BABYLON.Color3(0, 0, 1);
    this.p2Mesh.material = p2Mat;

    // Ball
    this.ballMesh = BABYLON.MeshBuilder.CreateSphere("ball", { diameter: BALL_RADIUS * 2 }, scene);
    const ballMat = new BABYLON.StandardMaterial("ballMat", scene);
    ballMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
    this.ballMesh.material = ballMat;

    // UI
    const advancedTexture = GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");
    this.scoreText = new GUI.TextBlock();
    this.scoreText.text = "0 - 0";
    this.scoreText.color = "white";
    this.scoreText.fontSize = 48;
    this.scoreText.top = "-40%";
    advancedTexture.addControl(this.scoreText);

    // Ball Slider UI
    this.ballSlider = new GUI.Rectangle();
    this.ballSlider.width = "400px";
    this.ballSlider.height = "20px";
    this.ballSlider.cornerRadius = 10;
    this.ballSlider.color = "white";
    this.ballSlider.thickness = 2;
    this.ballSlider.background = "rgba(0,0,0,0.5)";
    this.ballSlider.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.ballSlider.top = "-20px";
    advancedTexture.addControl(this.ballSlider);

    this.ballSliderMarker = new GUI.Rectangle();
    this.ballSliderMarker.width = "20px";
    this.ballSliderMarker.height = "20px";
    this.ballSliderMarker.cornerRadius = 10;
    this.ballSliderMarker.color = "yellow";
    this.ballSliderMarker.thickness = 0;
    this.ballSliderMarker.background = "yellow";
    this.ballSliderMarker.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.ballSlider.addControl(this.ballSliderMarker);

    return scene;
  }

  private initNetwork() {
    if (!this.roomId) return;
    
    // Trystero
    this.room = joinRoom({ appId: 'beach-volley-game' }, this.roomId);
    
    const [sendState, getState] = this.room.makeAction('state');
    const [sendInput, getInput] = this.room.makeAction('input');
    
    // Cast to correct types
    this.sendState = sendState as unknown as (data: GameState) => void;
    this.sendInput = sendInput as unknown as (data: InputState) => void;

    if (this.role === 'client') {
      getState((data: unknown) => {
        // Simple reconciliation: just overwrite state for now
        // Ideally we interpolate
        this.state = data as GameState;
      });
    } else {
      getInput((data: unknown) => {
        this.remoteInput = data as InputState;
      });
    }

    this.room.onPeerJoin((peerId: string) => {
      console.log('Peer joined', peerId);
    });
  }

  private setupInputs() {
    window.addEventListener("keydown", (evt) => {
      this.inputMap[evt.key.toLowerCase()] = true;
    });
    window.addEventListener("keyup", (evt) => {
      this.inputMap[evt.key.toLowerCase()] = false;
    });
  }

  private update() {
    const dt = this.engine.getDeltaTime() / 1000;
    if (dt > 0.1) return; // Lag spike prevention

    // Game Logic only runs on Host or Local
    if (this.mode === 'local' || this.mode === 'pvcpu' || (this.mode === 'online' && this.role === 'host')) {
      this.updatePhysics(dt);
      
      // If Host, send state
      if (this.mode === 'online' && this.sendState) {
        this.sendState(this.state);
      }
    } else if (this.mode === 'online' && this.role === 'client') {
      // Client sends inputs
      if (this.sendInput) {
        // Let's allow client to use AWD or JIL or Arrows
        const left = this.inputMap['a'] || this.inputMap['j'] || this.inputMap['arrowleft'];
        const right = this.inputMap['d'] || this.inputMap['l'] || this.inputMap['arrowright'];
        const jump = this.inputMap['w'] || this.inputMap['i'] || this.inputMap['arrowup'];
        this.sendInput({ left, right, jump });
      }
    }

    // Sync Meshes to State
    this.p1Mesh.position.x = this.state.p1.x;
    this.p1Mesh.position.y = this.state.p1.y;
    this.p2Mesh.position.x = this.state.p2.x;
    this.p2Mesh.position.y = this.state.p2.y;
    this.ballMesh.position.x = this.state.ball.x;
    this.ballMesh.position.y = this.state.ball.y;
    
    this.scoreText.text = `${this.state.scoreP1} - ${this.state.scoreP2}`;

    // Update Slider
    // Ball x range is roughly -12 to 12. Slider is 0 to 1.
    // 0 = -12, 1 = 12 -> 24 width
    // pos = (x + 12) / 24
    let sliderPos = (this.state.ball.x + 12) / 24;
    sliderPos = Math.max(0, Math.min(1, sliderPos));
    // Slider width is 400px. Marker width is 20px.
    // Max left is 380px? Or simpler percentage.
    this.ballSliderMarker.left = `${sliderPos * 100}%`;
    // We need to account for marker width to center it, but left alignment 0% puts it at left edge.
    // Let's adjust slightly: left is center of marker? No, default is left edge.
    // To center marker on value: left = calc(value% - 10px).
    // GUI doesn't support calc easily in all versions, but let's try pixel offset if possible or just % - %width/2
    // 20px of 400px is 5%. So subtract 2.5%?
    this.ballSliderMarker.left = `${(sliderPos * 95)}%`; // Simple approximation
  }

  private updatePhysics(dt: number) {
    // Player 1 Input
    let p1Dir = 0;
    let p1Jump = false;

    if (this.mode === 'local') {
      if (this.inputMap['a']) p1Dir = -1;
      if (this.inputMap['d']) p1Dir = 1;
      if (this.inputMap['w']) p1Jump = true;
    } else if (this.mode === 'online') {
      // Host is always P1
      if (this.inputMap['a']) p1Dir = -1;
      if (this.inputMap['d']) p1Dir = 1;
      if (this.inputMap['w']) p1Jump = true;
    } else if (this.mode === 'pvcpu') {
        if (this.inputMap['a']) p1Dir = -1;
        if (this.inputMap['d']) p1Dir = 1;
        if (this.inputMap['w']) p1Jump = true;
    }

    // Player 2 Input
    let p2Dir = 0;
    let p2Jump = false;

    if (this.mode === 'local') {
      if (this.inputMap['j']) p2Dir = -1;
      if (this.inputMap['l']) p2Dir = 1;
      if (this.inputMap['i']) p2Jump = true;
    } else if (this.mode === 'online') {
      // Client is P2
      if (this.remoteInput.left) p2Dir = -1;
      if (this.remoteInput.right) p2Dir = 1;
      if (this.remoteInput.jump) p2Jump = true;
    } else if (this.mode === 'pvcpu') {
        // Advanced AI
        let targetX = 5; // Default center position

        if (this.state.isBallActive) {
            // Ball is active.
            // If ball is on my side (x > 0), I generally want to be to the right of it to hit it left.
            // If ball is on other side, I prepare.

            const simDt = 0.016; // Fixed time step for prediction stability

            // If ball is moving towards me (vx > 0) or is already on my side
            if (this.state.ball.vx > 0.1 || this.state.ball.x > 0) {
                 // Predict trajectory
                let simX = this.state.ball.x;
                let simY = this.state.ball.y;
                let simVx = this.state.ball.vx;
                let simVy = this.state.ball.vy;
                
                let foundIntercept = false;

                // Simulate ahead
                for (let i = 0; i < 120; i++) {
                    simVy += BALL_GRAVITY;
                    simX += simVx * simDt; 
                    simY += simVy * simDt;
                    
                    // Net check
                    if (Math.abs(simX) < 0.2 && simY < NET_HEIGHT) {
                        simVx *= -0.8;
                    }
                    
                    // Wall check
                     if (simX < -11 || simX > 11) {
                        simVx *= -0.8;
                    }

                    // Check for interception
                    // We want to hit it when it's reachable.
                    // If it's on my side (simX > 0)
                    if (simX > 0) {
                        // Priority 1: Hittable in air
                        if (simY < 4.0 && simY > 1.0) {
                            targetX = simX;
                            foundIntercept = true;
                            break;
                        }
                        // Priority 2: About to hit ground
                        if (simY < BALL_RADIUS) {
                            targetX = simX;
                            foundIntercept = true;
                            break;
                        }
                    }
                }

                if (foundIntercept) {
                    // Apply Strategy Offset
                    if (this.state.lastHitSide !== 1) {
                         // Receiving: Hit Forward (Left). Be on Right.
                         targetX += 0.6; // Increased from 0.3 for safety
                    } else if (this.state.hitCount === 1) {
                         // Setting: Hit High/Net.
                         targetX += 0.2;
                    } else {
                         // Spiking.
                         targetX += 0.5;
                    }
                } else {
                    // No intercept found in 2 seconds? 
                    // Maybe it's looping high or staying on other side.
                    // If on my side, track x.
                    if (this.state.ball.x > 0) {
                        targetX = this.state.ball.x + 0.6;
                    }
                }
            } else {
                 // Ball moving away to P1
                 targetX = 5;
            }
        } else {
             // Ball inactive (Serve)
             targetX = 5;
             // If ball is on my side, move to serve position
             if (this.state.ball.x > 0) {
                 targetX = this.state.ball.x + this.serveOffset;
             }
        }

        // Clamp targetX to court
        if (targetX > 10) targetX = 10;
        if (targetX < 0.5) targetX = 0.5;

        // Move towards targetX
        // Add deadzone to prevent jitter
        if (this.state.p2.x < targetX - 0.2) p2Dir = 1;
        else if (this.state.p2.x > targetX + 0.2) p2Dir = -1;
        else {
             // Within deadzone. Stop moving to prevent jitter.
             // Unless we need to fine tune for serve?
             // For serve, precision helps.
             if (!this.state.isBallActive && this.state.ball.x > 0) {
                  if (this.state.p2.x < targetX - 0.05) p2Dir = 1;
                  else if (this.state.p2.x > targetX + 0.05) p2Dir = -1;
             }
        }
        
        // Jump logic
        // If ball is close and high enough, jump
        if (this.state.isBallActive && this.state.ball.x > 0 && Math.abs(this.state.p2.x - this.state.ball.x) < 1.0 && this.state.ball.y < 5.0 && this.state.ball.y > 2.5) {
             // Only jump if falling? Or if reachable.
             p2Jump = true;
        } else if (!this.state.isBallActive && this.state.ball.x > 0 && Math.abs(this.state.p2.x - this.state.ball.x) < 1.0) {
             // Serve jump
             p2Jump = true;
        }
    }


    // Update P1
    this.updatePlayer(this.state.p1, p1Dir, p1Jump, dt, -1);
    // Update P2
    this.updatePlayer(this.state.p2, p2Dir, p2Jump, dt, 1);

    // Update Ball
    this.updateBall(dt);
  }

  private updatePlayer(p: PlayerState, dir: number, jump: boolean, dt: number, side: number) {
    // Movement
    p.vx = dir * MOVE_SPEED;
    p.x += p.vx * dt;
    
    // Jump
    if (jump && p.y <= PLAYER_HEIGHT / 2 + 0.1) {
      p.vy = JUMP_FORCE;
    }

    // Gravity
    p.vy += GRAVITY; 
    p.y += p.vy * dt;

    // Ground collision
    if (p.y < PLAYER_HEIGHT / 2) {
      p.y = PLAYER_HEIGHT / 2;
      p.vy = 0;
    }

    // Net collision / Court boundaries
    // P1 is left (-10 to 0), P2 is right (0 to 10)
    if (side === -1) {
      if (p.x > -0.5) p.x = -0.5; // Net at 0
      if (p.x < -10) p.x = -10;
    } else {
      if (p.x < 0.5) p.x = 0.5;
      if (p.x > 10) p.x = 10;
    }
  }

  private updateBall(dt: number) {
    if (this.state.isBallActive) {
        this.state.ball.vy += BALL_GRAVITY; // Gravity
        
        this.state.ball.x += this.state.ball.vx * dt;
        this.state.ball.y += this.state.ball.vy * dt;
    }

    // Ground Collision (Score)
    if (this.state.ball.y < BALL_RADIUS) {
      // Bounce or Score
      // If it hits ground, score.
      // Left side = P2 Point, Right side = P1 Point
      if (this.state.ball.x < 0) {
        this.state.scoreP2++;
        this.resetBall(1); // Serve to P2
      } else {
        this.state.scoreP1++;
        this.resetBall(-1); // Serve to P1
      }
      return; // Stop processing this frame after reset
    }

    // Net Collision
    // Net is Box at 0, height NET_HEIGHT, width 0.2
    if (this.state.isBallActive && Math.abs(this.state.ball.x) < 0.1 + BALL_RADIUS && this.state.ball.y < NET_HEIGHT) {
      // Hit net
      // Simple bounce x
      this.state.ball.vx *= -0.8;
      // Push out
      if (this.state.ball.x < 0) this.state.ball.x = -0.1 - BALL_RADIUS - 0.01;
      else this.state.ball.x = 0.1 + BALL_RADIUS + 0.01;
    }

    // Wall boundaries (optional)
    if (this.state.ball.x < -11 || this.state.ball.x > 11) {
        this.state.ball.vx *= -0.8;
        if (this.state.ball.x < -11) this.state.ball.x = -11;
        if (this.state.ball.x > 11) this.state.ball.x = 11;
    }

    // Player Collision
    this.checkPlayerCollision(this.state.p1, -1);
    this.checkPlayerCollision(this.state.p2, 1);
  }

  private checkPlayerCollision(p: PlayerState, side: number) {
    // Capsule Collision Logic
    // Segment of player
    const halfH = PLAYER_HEIGHT / 2;
    const segHalfLen = halfH - PLAYER_RADIUS; // Length from center to center of caps
    
    // Player is vertical. X is p.x. Y range: [p.y - segHalfLen, p.y + segHalfLen]
    
    // Find closest point on segment to ball
    const dy = this.state.ball.y - p.y;
    const clampedDy = Math.max(-segHalfLen, Math.min(segHalfLen, dy));
    
    const closestX = p.x;
    const closestY = p.y + clampedDy;
    
    const dx = this.state.ball.x - closestX;
    const distY = this.state.ball.y - closestY; // Should be same as dy - clampedDy
    
    const dist = Math.sqrt(dx*dx + distY*distY);
    const minDist = PLAYER_RADIUS + BALL_RADIUS;

    if (dist < minDist) {
      // Collision

      // Check for debounce
      const now = Date.now();
      if (now - this.lastHitTime < 300) { // 300ms debounce
          // Just push out, no hit logic?
          // Or just allow physics but don't count hit?
          // If we allow physics, it might look like double hit.
          // Let's just return to avoid glitchy repeated collisions.
          return;
      }
      this.lastHitTime = now;

      this.state.isBallActive = true; // Activate ball

      // Hit Counting
      if (this.state.lastHitSide === side) {
          this.state.hitCount++;
          if (this.state.hitCount > 3) {
              // Fault!
              if (side === -1) {
                  this.state.scoreP2++;
                  this.resetBall(1);
              } else {
                  this.state.scoreP1++;
                  this.resetBall(-1);
              }
              return;
          }
      } else {
          this.state.lastHitSide = side;
          this.state.hitCount = 1;
      }

      // Normalize normal
      let nx = dx / dist;
      let ny = distY / dist;
      
      if (dist === 0) {
          nx = 0; ny = 1; // Default up if exact overlap
      }

      // Reflect velocity
      // Basic impulse
      const strength = 12.0; // Bounce strength (Slower than 15.0)
      
      // Add player velocity influence
      this.state.ball.vx = nx * strength + p.vx * 0.5;

      this.state.ball.vy = ny * strength + p.vy * 0.5 + 5.0; // Add some up force always

      // Push ball out
      const push = minDist - dist + 0.01;
      this.state.ball.x += nx * push;
      this.state.ball.y += ny * push;
    }
  }

  private resetBall(serverSide: number) {
    this.state.ball.x = serverSide * 5;
    this.state.ball.y = BALL_SERVE_Y;
    this.state.ball.vx = 0;
    this.state.ball.vy = 0;
    this.state.isBallActive = false;
    this.state.lastHitSide = 0;
    this.state.hitCount = 0;
    this.serveOffset = (Math.random() * 2.0) + 0.5; // Random between 0.5 and 2.5
    
    // Reset players too?
    this.state.p1.x = -5;
    this.state.p1.y = PLAYER_HEIGHT / 2;
    this.state.p1.vx = 0;
    this.state.p1.vy = 0;

    this.state.p2.x = 5;
    this.state.p2.y = PLAYER_HEIGHT / 2;
    this.state.p2.vx = 0;
    this.state.p2.vy = 0;
  }

  public dispose() {
    this.engine.dispose();
    if (this.room) {
      this.room.leave();
    }
    // Remove listeners
  }
}
