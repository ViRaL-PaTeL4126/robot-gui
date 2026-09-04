import React, { useState, useEffect, useRef } from 'react';
import ReactNippleWrapper from 'react-nipple';

const ReactNipple = ReactNippleWrapper.default ? ReactNippleWrapper.default : ReactNippleWrapper;

const ROBOT_IP = 'ws://192.168.4.1/ws';
const TRANSMIT_INTERVAL_MS = 50; 
const DEADZONE = 10; 
const MAX_MOTOR_RPM = 330;

function RobotDashboard() {
  const [telemetry, setTelemetry] = useState({ yaw: 0, pwm: 0, mode: 'WAITING...' });
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [uiControls, setUiControls] = useState({ vx: 0, vy: 0, w: 0 });
  
  const vxRef = useRef(0);
  const vyRef = useRef(0);
  const wRef = useRef(0);
  const socketRef = useRef(null);

  useEffect(() => {
    socketRef.current = new WebSocket(ROBOT_IP);

    socketRef.current.onopen = () => setConnectionStatus('Connected');
    socketRef.current.onclose = () => setConnectionStatus('Disconnected');
    socketRef.current.onerror = (error) => console.error("WebSocket Error:", error);

    socketRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setTelemetry(data);
      } catch (error) {
        console.error("Error parsing JSON:", error);
      }
    };

    const transmitLoop = setInterval(() => {
      setUiControls({ vx: vxRef.current, vy: vyRef.current, w: wRef.current });

      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        const commandPacket = {
          type: "control",
          vx: vxRef.current,
          vy: vyRef.current,
          w: wRef.current
        };
        socketRef.current.send(JSON.stringify(commandPacket));
      }
    }, TRANSMIT_INTERVAL_MS);

    return () => {
      clearInterval(transmitLoop);
      if (socketRef.current) socketRef.current.close();
    };
  }, []); 

  // --- TRANSLATION (LEFT JOYSTICK) ---
  const handleTranslationMove = (evt, data) => {
    const radius = 50; 
    let newVx = Math.round((data.instance.front.x / radius) * 127);
    let newVy = Math.round(((data.instance.front.y * -1) / radius) * 127); 

    newVx = Math.max(-127, Math.min(127, newVx));
    newVy = Math.max(-127, Math.min(127, newVy));

    if (Math.abs(newVx) < DEADZONE) newVx = 0;
    if (Math.abs(newVy) < DEADZONE) newVy = 0;

    vxRef.current = newVx;
    vyRef.current = newVy;
  };

  const handleTranslationEnd = () => {
    vxRef.current = 0;
    vyRef.current = 0;
    setUiControls(prev => ({ ...prev, vx: 0, vy: 0 }));
  };

  // --- ROTATION (RIGHT JOYSTICK) ---
  const handleRotationMove = (evt, data) => {
    const radius = 50; 
    let newW = Math.round((data.instance.front.x / radius) * 127);
    
    newW = Math.max(-127, Math.min(127, newW));
    if (Math.abs(newW) < DEADZONE) newW = 0;
    
    wRef.current = newW;
  };

  const handleRotationEnd = () => {
    wRef.current = 0;
    setUiControls(prev => ({ ...prev, w: 0 }));
  };

  const isConnected = connectionStatus === 'Connected';
  const estimatedRpm = ((telemetry.pwm / 255) * MAX_MOTOR_RPM).toFixed(0);

  // --- STYLES TARGETING HORIZONTAL MOBILE VIEW ---
  const styles = {
    appWrapper: {
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: '#151518',
      display: 'flex', flexDirection: 'column',
      padding: '15px 25px',
      touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
    },
    header: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: '15px'
    },
    headerTitle: {
      color: '#ffffff', margin: 0, fontSize: '18px', fontWeight: 'bold', letterSpacing: '1px'
    },
    headerControls: {
      display: 'flex', gap: '10px', alignItems: 'center'
    },
    badge: {
      padding: '6px 16px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold',
      backgroundColor: isConnected ? 'rgba(76, 175, 80, 0.15)' : 'rgba(244, 67, 54, 0.15)',
      color: isConnected ? '#4CAF50' : '#F44336',
      border: `1px solid ${isConnected ? '#4CAF50' : '#F44336'}`
    },
    menuBtn: {
      background: 'transparent', border: '1px solid #444', borderRadius: '8px',
      color: '#fff', padding: '4px 12px', fontSize: '16px', cursor: 'pointer'
    },
    telemetryRow: {
      display: 'flex', justifyContent: 'space-between', gap: '15px',
      width: '100%', marginBottom: '20px'
    },
    card: {
      flex: 1, backgroundColor: '#1E1E24', borderRadius: '12px',
      padding: '15px', textAlign: 'center', border: '1px solid #2A2A35',
      boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
    },
    cardTitle: { 
      color: '#8A8A9E', fontSize: '12px', fontWeight: 'bold', margin: '0 0 8px 0', textTransform: 'uppercase' 
    },
    cardValue: { margin: 0, fontSize: '24px', fontWeight: '800' },
    joystickRow: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
      flex: 1, width: '100%'
    },
    joystickPanel: {
      backgroundColor: '#1E1E24', borderRadius: '16px', padding: '20px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      border: '1px solid #2A2A35', width: '240px',
      boxShadow: '0 8px 16px rgba(0,0,0,0.4)'
    },
    joystickTitle: { color: '#E0E0E0', margin: '0 0 20px 0', fontSize: '16px', fontWeight: '500' },
    joystickBase: {
      position: 'relative', width: '150px', height: '150px',
      backgroundColor: '#111', borderRadius: '50%',
      border: '3px solid #222',
      boxShadow: 'inset 0px 4px 10px rgba(0,0,0,0.8), 0 0 15px rgba(0,0,0,0.5)'
    },
    statusText: {
      fontFamily: 'monospace', background: '#121212', padding: '8px 16px',
      borderRadius: '8px', marginTop: '20px', fontSize: '13px', fontWeight: 'bold'
    }
  };

  return (
    <>
      <style>{`
        body, html { margin: 0; padding: 0; overflow: hidden; background-color: #151518; }
        * { box-sizing: border-box; touch-action: none; }
      `}</style>

      <div style={styles.appWrapper}>
        
        {/* TOP BAR */}
        <div style={styles.header}>
          <h2 style={styles.headerTitle}>C-DRIVES</h2>
          <div style={styles.headerControls}>
            <div style={styles.badge}>{connectionStatus}</div>
            <button style={styles.menuBtn}>•••</button>
          </div>
        </div>

        {/* TELEMETRY ROW */}
        <div style={styles.telemetryRow}>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Heading</h3>
            <h2 style={{...styles.cardValue, color: '#00E5FF'}}>{telemetry.yaw.toFixed(1)}°</h2>
          </div>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Output</h3>
            <h2 style={{...styles.cardValue, color: '#FFB300'}}>{telemetry.pwm}</h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#8A8A9E' }}>~ {estimatedRpm} RPM</p>
          </div>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Mode</h3>
            <h2 style={{...styles.cardValue, color: '#B388FF'}}>{telemetry.mode}</h2>
          </div>
        </div>

        {/* JOYSTICK ROW */}
        <div style={styles.joystickRow}>
          
          {/* LEFT: Translation */}
          <div style={styles.joystickPanel}>
            <h3 style={styles.joystickTitle}>Translation</h3>
            <div style={styles.joystickBase}>
              <ReactNipple
                options={{ 
                  mode: 'static', position: { top: '50%', left: '50%' }, 
                  color: '#00E5FF', size: 110, restOpacity: 0.9 
                }}
                style={{ width: '100%', height: '100%', position: 'absolute' }}
                onMove={handleTranslationMove} onEnd={handleTranslationEnd}
              />
            </div>
            <div style={{...styles.statusText, color: '#00E5FF'}}>
              Vx: {uiControls.vx} | Vy: {uiControls.vy}
            </div>
          </div>

          {/* RIGHT: Rotation */}
          <div style={styles.joystickPanel}>
            <h3 style={styles.joystickTitle}>Rotation</h3>
            <div style={styles.joystickBase}>
              <ReactNipple
                options={{ 
                  mode: 'static', position: { top: '50%', left: '50%' }, 
                  color: '#B388FF', size: 110, lockX: true, restOpacity: 0.9 
                }}
                style={{ width: '100%', height: '100%', position: 'absolute' }}
                onMove={handleRotationMove} onEnd={handleRotationEnd}
              />
            </div>
            <div style={{...styles.statusText, color: '#B388FF'}}>
              Omega (w): {uiControls.w}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

export default RobotDashboard;