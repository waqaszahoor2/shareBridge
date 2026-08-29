'use client';

import { useEffect, useRef, useState } from 'react';

export default function Hero3DVisual() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || 420);
    let height = (canvas.height = canvas.parentElement?.clientHeight || 420);

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };

    window.addEventListener('resize', handleResize);

    // 3D Nodes representation
    const nodeCount = 28;
    const nodes: { x: number; y: number; z: number; vx: number; vy: number; vz: number; radius: number; color: string }[] = [];
    const colors = ['#7960ff', '#4d6cff', '#00f2fe', '#8a2be2', '#3a86ff'];

    for (let i = 0; i < nodeCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = 110 + Math.random() * 50;

      nodes.push({
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.sin(phi) * Math.sin(theta),
        z: r * Math.cos(phi),
        vx: (Math.random() - 0.5) * 0.008,
        vy: (Math.random() - 0.5) * 0.008,
        vz: (Math.random() - 0.5) * 0.008,
        radius: Math.random() * 3.5 + 2,
        color: colors[i % colors.length]
      });
    }

    let angleX = 0;
    let angleY = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const focalLength = 320;

      angleX += 0.006;
      angleY += 0.008;

      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);
      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);

      // Projected points
      const projected: { px: number; py: number; scale: number; color: string; radius: number; z: number }[] = [];

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];

        // 3D Rotation
        let y1 = n.y * cosX - n.z * sinX;
        let z1 = n.y * sinX + n.z * cosX;

        let x2 = n.x * cosY + z1 * sinY;
        let z2 = -n.x * sinY + z1 * cosY;

        const scale = focalLength / (focalLength + z2);
        const px = cx + x2 * scale;
        const py = cy + y1 * scale;

        projected.push({ px, py, scale, color: n.color, radius: n.radius, z: z2 });
      }

      // Draw 3D Connection Lines
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const p1 = projected[i];
          const p2 = projected[j];
          const dx = p1.px - p2.px;
          const dy = p1.py - p2.py;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 110) {
            const alpha = Math.max(0, (1 - dist / 110) * 0.45);
            ctx.beginPath();
            ctx.moveTo(p1.px, p1.py);
            ctx.lineTo(p2.px, p2.py);
            ctx.strokeStyle = `rgba(121, 96, 255, ${alpha})`;
            ctx.lineWidth = 1.2 * p1.scale;
            ctx.stroke();
          }
        }
      }

      // Draw Center Glowing 3D Core
      const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 90);
      grad.addColorStop(0, 'rgba(121, 96, 255, 0.45)');
      grad.addColorStop(0.5, 'rgba(77, 108, 255, 0.15)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, 90, 0, Math.PI * 2);
      ctx.fill();

      // Draw 3D Nodes
      projected.sort((a, b) => b.z - a.z);
      for (const p of projected) {
        ctx.beginPath();
        ctx.arc(p.px, p.py, p.radius * p.scale, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10 * p.scale;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    setTilt({
      rx: -(y / rect.height) * 16,
      ry: (x / rect.width) * 16
    });
  }

  function handleMouseLeave() {
    setTilt({ rx: 0, ry: 0 });
  }

  return (
    <div
      ref={containerRef}
      className="heroVisual3D"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: `perspective(1000px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`
      }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="hero3DCanvas" />

      {/* 3D Floating Glass Orbit Cards */}
      <div className="glassCard3D gc1">
        <div className="gcIcon">📁</div>
        <div className="gcText">
          <strong>Report_2026.pdf</strong>
          <span>48.2 MB · Direct Stream</span>
        </div>
      </div>

      <div className="glassCard3D gc2">
        <div className="gcIcon">⚡</div>
        <div className="gcText">
          <strong>120 MB/s</strong>
          <span>WebRTC P2P Transfer</span>
        </div>
      </div>

      <div className="glassCard3D gc3">
        <div className="gcIcon">📝</div>
        <div className="gcText">
          <strong>Shared Snippet</strong>
          <span>1-Click Copy Ready</span>
        </div>
      </div>

      {/* Pulsing 3D Ring */}
      <div className="ring3D ringOne" />
      <div className="ring3D ringTwo" />
    </div>
  );
}
