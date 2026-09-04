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
    if (!data || !data.vector) return; // Safeguard against empty touches
    
    const maxRadius = 50; // based on joystick size
    const dist = Math.min(data.distance, maxRadius);
    
    // data.vector provides normalized values between -1 and 1
    let newVx = Math.round((dist / maxRadius) * data.vector.x * 127);
    let newVy = Math.round((dist / maxRadius) * data.vector.y * 127); 

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
    if (!data || !data.vector) return; // Safeguard against empty touches
    
    const maxRadius = 50; 
    const dist = Math.min(data.distance, maxRadius);
    
    let newW = Math.round((dist / maxRadius) * data.vector.x * 127);
    
    if (Math.abs(newW) < DEADZONE) newW = 0;
    wRef.current = newW;
  };

  const handleRotationEnd = () => {
    wRef.current = 0;
    setUiControls(prev => ({ ...prev, w: 0 }));
  };

  const isConnected = connectionStatus === 'Connected';
  const estimatedRpm = ((telemetry.pwm / 255) * MAX_MOTOR_RPM).toFixed(0);

  // --- STYLES FOR COMPACT MOBILE LANDSCAPE ---
  const styles = {
    appWrapper: {
      width: '100vw',
      height: '100dvh', // Modern CSS: Accounts for mobile URL bars
      backgroundColor: '#151518',
      display: 'flex', flexDirection: 'column',
      padding: '10px 15px', // Tighter padding
      boxSizing: 'border-box',
      touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      overflow: 'hidden'
    },
    header: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: '10px', flex: '0 0 auto'
    },
    headerTitle: {
      color: '#ffffff', margin: 0, fontSize: '16px', fontWeight: 'bold', letterSpacing: '1px'
    },
    headerControls: {
      display: 'flex', gap: '10px', alignItems: 'center'
    },
    badge: {
      padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold',
      backgroundColor: isConnected ? 'rgba(76, 175, 80, 0.15)' : 'rgba(244, 67, 54, 0.15)',
      color: isConnected ? '#4CAF50' : '#F44336',
      border: `1px solid ${isConnected ? '#4CAF50' : '#F44336'}`
    },
    menuBtn: {
      background: 'transparent', border: '1px solid #444', borderRadius: '8px',
      color: '#fff', padding: '2px 10px', fontSize: '14px', cursor: 'pointer'
    },
    telemetryRow: {
      display: 'flex', justifyContent: 'space-between', gap: '10px',
      width: '100%', marginBottom: '10px', flex: '0 0 auto'
    },
    card: {
      flex: 1, backgroundColor: '#1E1E24', borderRadius: '12px',
      padding: '8px', textAlign: 'center', border: '1px solid #2A2A35',
      boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
    },
    cardTitle: { 
      color: '#8A8A9E', fontSize: '10px', fontWeight: 'bold', margin: '0 0 4px 0', textTransform: 'uppercase' 
    },
    cardValue: { margin: 0, fontSize: '18px', fontWeight: '800' },
    joystickRow: {
      display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      flex: '1 1 auto', width: '100%', minHeight: 0 // Allows shrinking without cutoff
    },
    joystickPanel: {
      backgroundColor: '#1E1E24', borderRadius: '16px', padding: '10px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      border: '1px solid #2A2A35', width: '180px',
      boxShadow: '0 8px 16px rgba(0,0,0,0.4)'
    },
    joystickTitle: { color: '#E0E0E0', margin: '0 0 10px 0', fontSize: '14px', fontWeight: '500' },
    joystickBase: {
      position: 'relative', width: '110px', height: '110px',
      backgroundColor: '#111', borderRadius: '50%',
      border: '3px solid #222',
      boxShadow: 'inset 0px 4px 10px rgba(0,0,0,0.8), 0 0 15px rgba(0,0,0,0.5)'
    },
    statusText: {
      fontFamily: 'monospace', background: '#121212', padding: '6px 12px',
      borderRadius: '8px', marginTop: '10px', fontSize: '11px', fontWeight: 'bold'
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
            <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: '#8A8A9E' }}>~ {estimatedRpm} RPM</p>
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
                  color: '#00E5FF', size: 100, restOpacity: 0.9 
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
                  color: '#B388FF', size: 100, lockX: true, restOpacity: 0.9 
                }}
                style={{ width: '100%', height: '100%', position: 'absolute' }}
                onMove={handleRotationMove} onEnd={handleRotationEnd}
              />
            </div>
            <div style={{...styles.statusText, color: '#B388FF'}}>
              Omega: {uiControls.w}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

export default RobotDashboard;