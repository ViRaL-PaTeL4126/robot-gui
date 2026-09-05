import React, { useState, useEffect, useRef } from 'react';

const ROBOT_IP = 'ws://192.168.4.1/ws';
const TRANSMIT_INTERVAL_MS = 50;
const DEADZONE = 10;
const MAX_MOTOR_RPM = 300; // rated motor RPM
const RECONNECT_DELAY_MS = 1500;

// ============================================================
//  CUSTOM JOYSTICK (native pointer events - no external library)
// ============================================================
function Joystick({ size = 130, knobSize = 54, color, lockX = false, onMove, onEnd }) {
  const baseRef = useRef(null);
  const draggingRef = useRef(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const maxDist = (size - knobSize) / 2;

  const updateFromEvent = (e) => {
    const rect = baseRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    if (lockX) dy = 0;

    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxDist) {
      const ratio = maxDist / dist;
      dx *= ratio;
      dy *= ratio;
    }

    setPos({ x: dx, y: dy });

    // Normalize to -1..1 (y inverted so "up" is positive, matches stick convention)
    const nx = dx / maxDist;
    const ny = -dy / maxDist;
    onMove && onMove({ x: nx, y: ny });
  };

  const handlePointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    updateFromEvent(e);
  };

  const handlePointerMove = (e) => {
    if (!draggingRef.current) return;
    updateFromEvent(e);
  };

  const handlePointerUp = () => {
    draggingRef.current = false;
    setPos({ x: 0, y: 0 });
    onEnd && onEnd();
  };

  return (
    <div
      ref={baseRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        touchAction: 'none',
        cursor: 'grab'
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: knobSize,
          height: knobSize,
          borderRadius: '50%',
          backgroundColor: color,
          left: '50%',
          top: '50%',
          transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
          transition: draggingRef.current ? 'none' : 'transform 0.15s ease-out',
          boxShadow: `0 0 20px ${color}88, 0 4px 10px rgba(0,0,0,0.5)`
        }}
      />
    </div>
  );
}

// ============================================================
//  MAIN DASHBOARD
// ============================================================
function RobotDashboard() {
  const [telemetry, setTelemetry] = useState({ yaw: 0, pwm: 0, mode: 'WAITING...' });
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [uiControls, setUiControls] = useState({ vx: 0, vy: 0, w: 0 });

  // Whether the user has pressed the connect button (drives both the socket
  // connection and fullscreen mode). Starts false -> button is red / idle.
  const [sessionActive, setSessionActive] = useState(false);

  const vxRef = useRef(0);
  const vyRef = useRef(0);
  const wRef = useRef(0);
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const mountedRef = useRef(true);

  // --- SAFETY FEATURE: Stop robot if you switch browser tabs ---
  useEffect(() => {
    const handleEmergencyStop = () => {
      vxRef.current = 0; vyRef.current = 0; wRef.current = 0;
      setUiControls({ vx: 0, vy: 0, w: 0 });
    };
    window.addEventListener('blur', handleEmergencyStop);
    return () => window.removeEventListener('blur', handleEmergencyStop);
  }, []);

  // --- Keep the session in sync with the browser's actual fullscreen state.
  // If the user backs out of fullscreen (e.g. presses Esc), treat that as
  // pressing the disconnect button too. ---
  useEffect(() => {
    const handleFsChange = () => {
      if (!document.fullscreenElement) {
        setSessionActive(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // --- WEBSOCKET CONNECTION (with auto-reconnect) - only runs while the
  // session is active, i.e. after the connect button has been pressed. ---
  useEffect(() => {
    if (!sessionActive) return;

    mountedRef.current = true;

    const connect = () => {
      if (!mountedRef.current) return;

      const socket = new WebSocket(ROBOT_IP);
      socketRef.current = socket;

      socket.onopen = () => {
        if (!mountedRef.current) return;
        setConnectionStatus('Connected');
      };

      socket.onclose = () => {
        if (!mountedRef.current) return;
        setConnectionStatus('Disconnected');
        vxRef.current = 0; vyRef.current = 0; wRef.current = 0;
        setUiControls({ vx: 0, vy: 0, w: 0 });
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };

      socket.onerror = (error) => {
        console.error('WebSocket Error:', error);
        socket.close();
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setTelemetry(data);
        } catch (error) {
          console.error('Error parsing JSON:', error);
        }
      };
    };

    connect();

    const transmitLoop = setInterval(() => {
      setUiControls(prev => {
        if (prev.vx !== vxRef.current || prev.vy !== vyRef.current || prev.w !== wRef.current) {
          return { vx: vxRef.current, vy: vyRef.current, w: wRef.current };
        }
        return prev;
      });

      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        const commandPacket = { type: 'control', vx: vxRef.current, vy: vyRef.current, w: wRef.current };
        socketRef.current.send(JSON.stringify(commandPacket));
      }
    }, TRANSMIT_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(transmitLoop);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
        socketRef.current = null;
      }
      setConnectionStatus('Disconnected');
    };
  }, [sessionActive]);

  // --- CONNECT / DISCONNECT + FULLSCREEN TOGGLE BUTTON ---
  const handleToggleSession = () => {
    if (!sessionActive) {
      setSessionActive(true);
      const el = document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(err => console.warn('Fullscreen request failed:', err));
      }
    } else {
      setSessionActive(false);
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(err => console.warn('Exit fullscreen failed:', err));
      }
    }
  };

  // --- GLOBAL / LOCAL FRAME TOGGLE BUTTON ---
  const isGlobalFrame = (telemetry.mode || '').includes('GLOBAL');
  const handleToggleFrame = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'frame', global: !isGlobalFrame }));
    }
  };

  // --- PWM STEP UP / DOWN BUTTONS (mirrors PS4 R1 / L1) ---
  const speedLevel = telemetry.speedLevel ?? 0;
  const maxSpeedLevel = telemetry.maxSpeedLevel ?? 5;
  const handleStepSpeed = (delta) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'speed', delta }));
    }
  };

  // --- TRANSLATION (LEFT JOYSTICK) ---
  const handleTranslationMove = ({ x, y }) => {
    let newVx = Math.round(x * 127);
    let newVy = Math.round(y * 127);

    if (Math.abs(newVx) < DEADZONE) newVx = 0;
    if (Math.abs(newVy) < DEADZONE) newVy = 0;

    vxRef.current = newVx;
    vyRef.current = newVy;
  };

  const handleTranslationEnd = () => {
    vxRef.current = 0; vyRef.current = 0;
    setUiControls(prev => ({ ...prev, vx: 0, vy: 0 }));
  };

  // --- ROTATION (RIGHT JOYSTICK) ---
  const handleRotationMove = ({ x }) => {
    let newW = Math.round(x * 127);
    if (Math.abs(newW) < DEADZONE) newW = 0;
    wRef.current = newW;
  };

  const handleRotationEnd = () => {
    wRef.current = 0;
    setUiControls(prev => ({ ...prev, w: 0 }));
  };

  const isConnected = connectionStatus === 'Connected';
  const estimatedRpm = ((telemetry.pwm / 255) * MAX_MOTOR_RPM).toFixed(0);

  // --- RESPONSIVE STYLES ---
  const styles = {
    appWrapper: {
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: '#151518',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      padding: '10px',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
    },
    contentContainer: {
      display: 'flex', flexDirection: 'row',
      width: '100%', maxWidth: '1000px', height: '100%',
      justifyContent: 'space-between', alignItems: 'center', gap: '15px'
    },
    sidePanel: {
      flex: '0 0 auto',
      width: 'clamp(160px, 25vw, 240px)',
      backgroundColor: '#1E1E24', borderRadius: '16px', padding: '20px 10px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      border: '1px solid #2A2A35', boxShadow: '0 8px 16px rgba(0,0,0,0.4)'
    },
    centerPanel: {
      flex: '1 1 auto',
      display: 'flex', flexDirection: 'column', justifyContent: 'center'
    },
    header: {
      display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '15px'
    },
    badge: {
      padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold',
      backgroundColor: isConnected ? 'rgba(76, 175, 80, 0.15)' : 'rgba(244, 67, 54, 0.15)',
      color: isConnected ? '#4CAF50' : '#F44336',
      border: `1px solid ${isConnected ? '#4CAF50' : '#F44336'}`
    },
    controlBar: {
      display: 'flex', gap: '10px', marginBottom: '15px'
    },
    connectButton: {
      flex: '1 1 auto',
      padding: '12px 10px',
      borderRadius: '10px',
      border: 'none',
      fontSize: '13px',
      fontWeight: 'bold',
      letterSpacing: '0.5px',
      cursor: 'pointer',
      color: '#ffffff',
      backgroundColor: isConnected ? '#2E7D32' : '#C62828',
      boxShadow: `0 4px 10px ${isConnected ? 'rgba(46,125,50,0.4)' : 'rgba(198,40,40,0.4)'}`,
      transition: 'background-color 0.2s ease'
    },
    frameButton: {
      flex: '1 1 auto',
      padding: '12px 10px',
      borderRadius: '10px',
      border: '1px solid #2A2A35',
      fontSize: '13px',
      fontWeight: 'bold',
      letterSpacing: '0.5px',
      cursor: isConnected ? 'pointer' : 'not-allowed',
      color: '#ffffff',
      backgroundColor: isGlobalFrame ? '#5E35B1' : '#00838F',
      opacity: isConnected ? 1 : 0.5,
      transition: 'background-color 0.2s ease'
    },
    stepRow: {
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: '10px', marginTop: '8px'
    },
    stepButton: (enabled) => ({
      width: '32px', height: '32px',
      borderRadius: '8px',
      border: '1px solid #2A2A35',
      backgroundColor: '#2A2A35',
      color: '#ffffff',
      fontSize: '16px',
      fontWeight: 'bold',
      cursor: enabled ? 'pointer' : 'not-allowed',
      opacity: enabled ? 1 : 0.4,
      lineHeight: '1'
    }),
    stepLevelText: {
      fontSize: '11px', color: '#8A8A9E', fontWeight: 'bold', minWidth: '40px', textAlign: 'center'
    },
    telemetryGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' },
    card: {
      backgroundColor: '#1E1E24', borderRadius: '12px', padding: '12px 5px',
      textAlign: 'center', border: '1px solid #2A2A35', boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
    },
    cardTitle: { color: '#8A8A9E', fontSize: '10px', fontWeight: 'bold', margin: '0 0 6px 0', textTransform: 'uppercase' },
    cardValue: { margin: 0, fontSize: '20px', fontWeight: '800' },
    wheelGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '10px' },
    wheelCard: {
      backgroundColor: '#1E1E24', borderRadius: '12px', padding: '10px 5px',
      textAlign: 'center', border: '1px solid #2A2A35'
    },
    wheelValue: { margin: 0, fontSize: '16px', fontWeight: '700', fontFamily: 'monospace' },
    joystickTitle: { color: '#E0E0E0', margin: '0 0 15px 0', fontSize: '14px', fontWeight: '500' },
    joystickBase: {
      position: 'relative', width: '130px', height: '130px',
      backgroundColor: '#111', borderRadius: '50%', border: '3px solid #222',
      boxShadow: 'inset 0px 4px 10px rgba(0,0,0,0.8), 0 0 15px rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    },
    statusText: {
      fontFamily: 'monospace', background: '#121212', padding: '6px 12px',
      borderRadius: '8px', marginTop: '15px', fontSize: '12px', fontWeight: 'bold'
    }
  };

  return (
    <>
      <style>{`
        body, html { margin: 0; padding: 0; overflow: hidden; background-color: #151518; }
        * {
          box-sizing: border-box;
          user-select: none;
          -webkit-user-select: none;
          -webkit-user-drag: none;
        }
      `}</style>

      <div style={styles.appWrapper}>
        <div style={styles.contentContainer}>

          {/* LEFT COLUMN */}
          <div style={styles.sidePanel}>
            <h3 style={styles.joystickTitle}>Translation</h3>
            <div style={styles.joystickBase}>
              <Joystick
                color="#00E5FF"
                onMove={handleTranslationMove}
                onEnd={handleTranslationEnd}
              />
            </div>
            <div style={{...styles.statusText, color: '#00E5FF'}}>
              Vx: {uiControls.vx.toString().padStart(4, ' ')} | Vy: {uiControls.vy.toString().padStart(4, ' ')}
            </div>
          </div>

          {/* CENTER COLUMN */}
          <div style={styles.centerPanel}>
            <div style={styles.header}>
              <div style={styles.badge}>{connectionStatus}</div>
            </div>

            <div style={styles.controlBar}>
              <button style={styles.connectButton} onClick={handleToggleSession}>
                {isConnected ? '■ DISCONNECT' : '▶ CONNECT'}
              </button>
              <button
                style={styles.frameButton}
                onClick={handleToggleFrame}
                disabled={!isConnected}
              >
                {isGlobalFrame ? '🌐 GLOBAL FRAME' : '🤖 ROBOT FRAME'}
              </button>
            </div>

            <div style={styles.telemetryGrid}>
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>Heading</h3>
                <h2 style={{...styles.cardValue, color: '#00E5FF'}}>{Number(telemetry.yaw || 0).toFixed(1)}°</h2>
              </div>
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>PWM</h3>
                <h2 style={{...styles.cardValue, color: '#FFB300'}}>{telemetry.pwm || 0}</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: '#8A8A9E' }}>~ {estimatedRpm} RPM</p>
                <div style={styles.stepRow}>
                  <button
                    style={styles.stepButton(isConnected && speedLevel > 0)}
                    onClick={() => handleStepSpeed(-1)}
                    disabled={!isConnected || speedLevel <= 0}
                  >
                    −
                  </button>
                  <span style={styles.stepLevelText}>Lvl {speedLevel}/{maxSpeedLevel}</span>
                  <button
                    style={styles.stepButton(isConnected && speedLevel < maxSpeedLevel)}
                    onClick={() => handleStepSpeed(1)}
                    disabled={!isConnected || speedLevel >= maxSpeedLevel}
                  >
                    +
                  </button>
                </div>
              </div>
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>Mode</h3>
                <h2 style={{...styles.cardValue, color: '#B388FF'}}>{telemetry.mode || 'IDLE'}</h2>
              </div>
            </div>

            <div style={styles.wheelGrid}>
              <div style={styles.wheelCard}>
                <h3 style={styles.cardTitle}>Wheel 1</h3>
                <h2 style={{...styles.wheelValue, color: '#4CE6A8'}}>{Number(telemetry.w1 || 0).toFixed(2)}</h2>
              </div>
              <div style={styles.wheelCard}>
                <h3 style={styles.cardTitle}>Wheel 2</h3>
                <h2 style={{...styles.wheelValue, color: '#4CE6A8'}}>{Number(telemetry.w2 || 0).toFixed(2)}</h2>
              </div>
              <div style={styles.wheelCard}>
                <h3 style={styles.cardTitle}>Wheel 3</h3>
                <h2 style={{...styles.wheelValue, color: '#4CE6A8'}}>{Number(telemetry.w3 || 0).toFixed(2)}</h2>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div style={styles.sidePanel}>
            <h3 style={styles.joystickTitle}>Rotation</h3>
            <div style={styles.joystickBase}>
              <Joystick
                color="#B388FF"
                lockX={true}
                onMove={handleRotationMove}
                onEnd={handleRotationEnd}
              />
            </div>
            <div style={{...styles.statusText, color: '#B388FF'}}>
              Omega: {uiControls.w.toString().padStart(4, ' ')}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

export default RobotDashboard;
