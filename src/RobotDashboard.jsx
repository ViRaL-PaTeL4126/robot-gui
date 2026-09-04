import React, { useState, useEffect, useRef, useMemo } from 'react';
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

  // --- SAFETY FEATURE: Stop robot if you switch browser tabs ---
  useEffect(() => {
    const handleEmergencyStop = () => {
      vxRef.current = 0; vyRef.current = 0; wRef.current = 0;
      setUiControls({ vx: 0, vy: 0, w: 0 });
    };
    window.addEventListener('blur', handleEmergencyStop);
    return () => window.removeEventListener('blur', handleEmergencyStop);
  }, []);

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
      setUiControls(prev => {
        if (prev.vx !== vxRef.current || prev.vy !== vyRef.current || prev.w !== wRef.current) {
          return { vx: vxRef.current, vy: vyRef.current, w: wRef.current };
        }
        return prev;
      });

      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        const commandPacket = { type: "control", vx: vxRef.current, vy: vyRef.current, w: wRef.current };
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
    if (!data || !data.vector) return; 
    let newVx = Math.round(data.vector.x * 127);
    let newVy = Math.round(data.vector.y * 127); 

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
  const handleRotationMove = (evt, data) => {
    if (!data || !data.vector) return; 
    let newW = Math.round(data.vector.x * 127);
    if (Math.abs(newW) < DEADZONE) newW = 0;
    wRef.current = newW;
  };

  const handleRotationEnd = () => {
    wRef.current = 0;
    setUiControls(prev => ({ ...prev, w: 0 }));
  };

  // --- MEMOIZED JOYSTICKS ---
  const MemoizedTranslationJoystick = useMemo(() => (
    <ReactNipple
      options={{ mode: 'static', position: { top: '50%', left: '50%' }, color: '#00E5FF', size: 120, restOpacity: 0.9, catchDistance: 150 }}
      style={{ width: '100%', height: '100%', position: 'absolute' }}
      onMove={handleTranslationMove} onEnd={handleTranslationEnd}
    />
  ), []);

  const MemoizedRotationJoystick = useMemo(() => (
    <ReactNipple
      options={{ mode: 'static', position: { top: '50%', left: '50%' }, color: '#B388FF', size: 120, lockX: true, restOpacity: 0.9, catchDistance: 150 }}
      style={{ width: '100%', height: '100%', position: 'absolute' }}
      onMove={handleRotationMove} onEnd={handleRotationEnd}
    />
  ), []);

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
    // This container limits the max width so it looks great on a 4K desktop monitor!
    contentContainer: {
      display: 'flex', flexDirection: 'row',
      width: '100%', maxWidth: '1000px', height: '100%',
      justifyContent: 'space-between', alignItems: 'center', gap: '15px'
    },
    sidePanel: {
      flex: '0 0 auto',
      width: 'clamp(160px, 25vw, 240px)', // Flexibly resizes based on screen
      backgroundColor: '#1E1E24', borderRadius: '16px', padding: '20px 10px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      border: '1px solid #2A2A35', boxShadow: '0 8px 16px rgba(0,0,0,0.4)'
    },
    centerPanel: {
      flex: '1 1 auto',
      display: 'flex', flexDirection: 'column', justifyContent: 'center'
    },
    header: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'
    },
    headerTitle: { color: '#ffffff', margin: 0, fontSize: '18px', fontWeight: 'bold', letterSpacing: '1px' },
    badge: {
      padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold',
      backgroundColor: isConnected ? 'rgba(76, 175, 80, 0.15)' : 'rgba(244, 67, 54, 0.15)',
      color: isConnected ? '#4CAF50' : '#F44336',
      border: `1px solid ${isConnected ? '#4CAF50' : '#F44336'}`
    },
    telemetryGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' },
    card: {
      backgroundColor: '#1E1E24', borderRadius: '12px', padding: '12px 5px',
      textAlign: 'center', border: '1px solid #2A2A35', boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
    },
    cardTitle: { color: '#8A8A9E', fontSize: '10px', fontWeight: 'bold', margin: '0 0 6px 0', textTransform: 'uppercase' },
    cardValue: { margin: 0, fontSize: '20px', fontWeight: '800' },
    joystickTitle: { color: '#E0E0E0', margin: '0 0 15px 0', fontSize: '14px', fontWeight: '500' },
    joystickBase: {
      position: 'relative', width: '130px', height: '130px',
      backgroundColor: '#111', borderRadius: '50%', border: '3px solid #222',
      boxShadow: 'inset 0px 4px 10px rgba(0,0,0,0.8), 0 0 15px rgba(0,0,0,0.5)'
    },
    statusText: {
      fontFamily: 'monospace', background: '#121212', padding: '6px 12px',
      borderRadius: '8px', marginTop: '15px', fontSize: '12px', fontWeight: 'bold'
    }
  };

  return (
    <>
      {/* THE FIX: user-drag: none completely disables native dragging on desktop */}
      <style>{`
        body, html { margin: 0; padding: 0; overflow: hidden; background-color: #151518; }
        * { 
          box-sizing: border-box; 
          touch-action: none; 
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
              {MemoizedTranslationJoystick}
            </div>
            <div style={{...styles.statusText, color: '#00E5FF'}}>
              Vx: {uiControls.vx.toString().padStart(4, ' ')} | Vy: {uiControls.vy.toString().padStart(4, ' ')}
            </div>
          </div>

          {/* CENTER COLUMN */}
          <div style={styles.centerPanel}>
            <div style={styles.header}>
              <h2 style={styles.headerTitle}>C-DRIVES</h2>
              <div style={styles.badge}>{connectionStatus}</div>
            </div>

            <div style={styles.telemetryGrid}>
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
          </div>

          {/* RIGHT COLUMN */}
          <div style={styles.sidePanel}>
            <h3 style={styles.joystickTitle}>Rotation</h3>
            <div style={styles.joystickBase}>
              {MemoizedRotationJoystick}
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