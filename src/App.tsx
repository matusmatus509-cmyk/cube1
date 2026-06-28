import { useEffect, useRef, useState, useCallback } from 'react';
import { CubeScene } from './cube/CubeScene';
import { isSolved, MoveType } from './cube/CubeState';

const SCRAMBLE_MOVES: MoveType[] = ['U', "U'", 'D', "D'", 'F', "F'", 'B', "B'", 'L', "L'", 'R', "R'"];

const MOVE_GROUPS = [
  { label: 'Top / Bottom', color: '#ffdd00', moves: ['U', "U'", 'D', "D'"] as MoveType[] },
  { label: 'Front / Back', color: '#009b48', moves: ['F', "F'", 'B', "B'"] as MoveType[] },
  { label: 'Left / Right', color: '#ff5900', moves: ['L', "L'", 'R', "R'"] as MoveType[] },
  { label: 'Middle Slices', color: '#0046ad', moves: ['M', "M'", 'E', "E'", 'S', "S'"] as MoveType[] },
];

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const cubeSceneRef = useRef<CubeScene | null>(null);
  const [solved, setSolved] = useState(true);
  const [moveCount, setMoveCount] = useState(0);
  const [showMoves, setShowMoves] = useState(false);
  const [scrambling, setScrambling] = useState(false);
  const [showSolvedBanner, setShowSolvedBanner] = useState(false);
  const scrambleRef = useRef(false);
  const moveCountRef = useRef(0);

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new CubeScene(mountRef.current);
    cubeSceneRef.current = scene;

    scene.setOnStateChange((state) => {
      const s = isSolved(state);
      setSolved(s);
      if (s) {
        setShowSolvedBanner(true);
        setTimeout(() => setShowSolvedBanner(false), 3000);
      }
    });

    return () => {
      scene.destroy();
      cubeSceneRef.current = null;
    };
  }, []);

  const handleScramble = useCallback(() => {
    if (!cubeSceneRef.current || scrambling) return;
    setScrambling(true);
    scrambleRef.current = true;
    moveCountRef.current = 0;
    setMoveCount(0);
    setSolved(false);
    setShowSolvedBanner(false);

    const total = 20;
    let count = 0;
    let lastFace = '';

    const executeNext = () => {
      if (count >= total || !scrambleRef.current) {
        setScrambling(false);
        scrambleRef.current = false;
        return;
      }
      let move: MoveType;
      do {
        move = SCRAMBLE_MOVES[Math.floor(Math.random() * SCRAMBLE_MOVES.length)];
      } while (move[0] === lastFace);
      lastFace = move[0];
      cubeSceneRef.current?.executeMove(move);
      count++;
      moveCountRef.current = count;
      setMoveCount(count);
      setTimeout(executeNext, 90);
    };

    executeNext();
  }, [scrambling]);

  const handleReset = useCallback(() => {
    if (!cubeSceneRef.current) return;
    scrambleRef.current = false;
    setScrambling(false);
    cubeSceneRef.current.reset();
    cubeSceneRef.current.resetRotation();
    setMoveCount(0);
    setSolved(true);
    setShowSolvedBanner(false);
  }, []);

  const handleMove = useCallback((move: MoveType) => {
    if (!cubeSceneRef.current) return;
    cubeSceneRef.current.executeMove(move);
    setMoveCount(prev => prev + 1);
    setSolved(false);
  }, []);

  const handleResetView = useCallback(() => {
    cubeSceneRef.current?.resetRotation();
  }, []);

  return (
    <div className="app-container">
      <div className="bg-layer" />

      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="cube-icon-wrap">
            <CubeIconSVG />
          </div>
          <button className="menu-btn" onClick={() => setShowMoves(v => !v)}>
            <span>MENU</span>
            <HamburgerIcon />
          </button>
        </div>

        <div className="header-center">
          <h1 className="game-title">
            <span className="title-c">C</span>
            <span className="title-u">U</span>
            <span className="title-b">B</span>
            <span className="title-e">E</span>
            <span className="title-m">M</span>
            <span className="title-i">I</span>
            <span className="title-x">X</span>
          </h1>
        </div>

        <div className="header-right">
          <div className="stat-pill">
            <span className="stat-label">MOVES</span>
            <span className="stat-value">{moveCount}</span>
          </div>
          <div className={`status-pill ${solved ? 'status-solved' : 'status-mixing'}`}>
            {solved ? '✓ SOLVED' : '● MIXING'}
          </div>
        </div>
      </header>

      {/* Solved Banner */}
      {showSolvedBanner && (
        <div className="solved-banner">
          🎉 CUBE SOLVED! 🎉
        </div>
      )}

      {/* Cube Canvas Area */}
      <div className="cube-area">
        <div
          ref={mountRef}
          className="canvas-container"
          style={{ touchAction: 'none' }}
        />
        <p className="cube-hint">
          Swipe on cube to rotate layer • Drag outside to rotate view
        </p>
      </div>

      {/* Bottom Controls */}
      <div className="controls">
        <button
          className={`btn btn-scramble ${scrambling ? 'is-scrambling' : ''}`}
          onClick={handleScramble}
          disabled={scrambling}
        >
          <ShuffleIcon />
          <span>{scrambling ? `SCRAMBLING... ${moveCount}/20` : 'SCRAMBLE'}</span>
        </button>

        <button className="btn btn-view" onClick={handleResetView} title="Reset View">
          <ResetViewIcon />
          <span>VIEW</span>
        </button>

        <button className="btn btn-reset" onClick={handleReset} title="Reset Cube">
          <ResetIcon />
          <span>RESET</span>
        </button>
      </div>

      {/* Move Panel Drawer */}
      {showMoves && (
        <>
          <div className="drawer-overlay" onClick={() => setShowMoves(false)} />
          <div className="moves-panel">
            <div className="moves-header">
              <h3>MANUAL MOVES</h3>
              <button className="close-btn" onClick={() => setShowMoves(false)}>✕</button>
            </div>
            <p className="moves-desc">Tap any notation to apply that move to the cube.</p>
            {MOVE_GROUPS.map(group => (
              <div key={group.label} className="move-group">
                <div className="move-group-label" style={{ color: group.color }}>{group.label}</div>
                <div className="move-buttons">
                  {group.moves.map(move => (
                    <button
                      key={move}
                      className="move-btn"
                      onClick={() => handleMove(move)}
                    >
                      {move}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="notation-help">
              <h4>Notation Guide</h4>
              <div className="notation-grid">
                <span><b>U</b> = Top CW</span>
                <span><b>U'</b> = Top CCW</span>
                <span><b>D</b> = Bottom CW</span>
                <span><b>D'</b> = Bottom CCW</span>
                <span><b>F</b> = Front CW</span>
                <span><b>F'</b> = Front CCW</span>
                <span><b>B</b> = Back CW</span>
                <span><b>B'</b> = Back CCW</span>
                <span><b>L</b> = Left CW</span>
                <span><b>L'</b> = Left CCW</span>
                <span><b>R</b> = Right CW</span>
                <span><b>R'</b> = Right CCW</span>
                <span><b>M</b> = Middle (L dir)</span>
                <span><b>E</b> = Equator (D dir)</span>
                <span><b>S</b> = Standing (F dir)</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---- SVG Icons ----

function CubeIconSVG() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect x="1" y="1" width="13" height="13" rx="2" fill="#ff5900"/>
      <rect x="18" y="1" width="13" height="13" rx="2" fill="#009b48"/>
      <rect x="1" y="18" width="13" height="13" rx="2" fill="#0046ad"/>
      <rect x="18" y="18" width="13" height="13" rx="2" fill="#ffdd00"/>
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" fill="white">
      <rect width="18" height="2.5" rx="1.25"/>
      <rect y="5.75" width="18" height="2.5" rx="1.25"/>
      <rect y="11.5" width="18" height="2.5" rx="1.25"/>
    </svg>
  );
}

function ShuffleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 3 21 3 21 8"/>
      <line x1="4" y1="20" x2="21" y2="3"/>
      <polyline points="21 16 21 21 16 21"/>
      <line x1="15" y1="15" x2="21" y2="21"/>
    </svg>
  );
}

function ResetViewIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 4v6h6"/>
      <path d="M3.51 15a9 9 0 1 0 .49-3.41"/>
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10"/>
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
    </svg>
  );
}
