import { useEffect, useRef } from "react";
import { FaHeart, FaStar } from "react-icons/fa6";

export function SakuraCanvas({ snow = false }) {
  const canvasRef = useRef(null);
  const trailRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    const mobile = matchMedia("(max-width: 700px)");
    const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
    const petal = new Image();
    petal.src = "/assets/home-floating-petal.png";
    const trail = [...trailRef.current.children];
    let width, height, petals = [], flakes = [], sparks = [], frame = 0, last = 0, pointerAt = 0, slot = 0;
    let active = true;
    const connection = navigator.connection;
    const compact = () => mobile.matches || connection?.saveData;
    function resize() {
      width = innerWidth; height = innerHeight;
      const ratio = Math.min(devicePixelRatio || 1, compact() ? 1 : 1.5);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      petals = Array.from({ length: compact() ? 9 : 26 }, () => ({
        x: Math.random() * width, y: Math.random() * height, size: 12 + Math.random() * 16,
        speed: 17 + Math.random() * 25, rotation: Math.random() * 6.28, phase: Math.random() * 6.28,
      }));
      flakes = Array.from({ length: snow ? (compact() ? 16 : 38) : 0 }, () => ({
        x: Math.random() * width, y: Math.random() * height,
        size: 7 + Math.random() * 7, speed: 18 + Math.random() * 25,
        phase: Math.random() * Math.PI * 2,
      }));
    }
    function addSpark(x, y, burst) {
      const index = slot++ % trail.length;
      sparks = sparks.filter((spark) => spark.index !== index);
      sparks.push({ index, x, y, start: performance.now(), vx: burst ? (Math.random() - .5) * 95 : 0, vy: burst ? -25 - Math.random() * 60 : -25, rotation: Math.random() * 45 });
    }
    function move(event) {
      const now = performance.now();
      if (!finePointer.matches || compact() || now - pointerAt < 85 || document.querySelector(".media-lightbox")) return;
      pointerAt = now;
      addSpark(event.clientX, event.clientY, false);
    }
    function click(event) {
      if (event.button !== 0 || event.detail === 0 || document.querySelector(".media-lightbox")) return;
      for (let i = 0; i < (compact() ? 4 : 8); i++) addSpark(event.clientX, event.clientY, true);
    }
    function draw(now) {
      if (!active) return;
      frame = requestAnimationFrame(draw);
      const interval = compact() ? 50 : 1000 / 30;
      if (now - last < interval) return;
      const elapsed = Math.min((now - (last || now)) / 1000, .1);
      last = now;
      context.clearRect(0, 0, width, height);
      if (petal.complete && petal.naturalWidth) {
        for (const p of petals) {
          p.y += p.speed * elapsed; p.x += (9 + Math.sin(now / 1800 + p.phase) * 13) * elapsed;
          p.rotation += elapsed * .4;
          if (p.y > height + 30) { p.y = -30; p.x = Math.random() * width; }
          if (p.x > width + 30) p.x = -30;
          context.save(); context.globalAlpha = .65;
          context.translate(p.x, p.y); context.rotate(p.rotation);
          context.scale(Math.cos(now / 1700 + p.phase) * .35 + .65, 1);
          context.drawImage(petal, -p.size / 2, -p.size / 2, p.size, p.size);
          context.restore();
        }
      }
      // Share the petal animation loop; snow needs no extra images or requests.
      for (const flake of flakes) {
        flake.y += flake.speed * elapsed;
        flake.x += Math.sin(now / 2200 + flake.phase) * 12 * elapsed;
        if (flake.y > height + 10) { flake.y = -10; flake.x = Math.random() * width; }
        context.save();
        context.translate(flake.x, flake.y);
        context.rotate(now / 9000 + flake.phase);
        context.globalAlpha = .95;
        context.strokeStyle = "#ffffff";
        context.lineWidth = 1.8;
        context.lineCap = "round";
        context.shadowColor = "#5283b3";
        context.shadowBlur = 3;
        context.beginPath();
        for (let arm = 0; arm < 6; arm++) {
          const angle = arm * Math.PI / 3;
          const x = Math.cos(angle) * flake.size, y = Math.sin(angle) * flake.size;
          context.moveTo(0, 0); context.lineTo(x, y);
          const branchX = x * .58, branchY = y * .58;
          for (const side of [-1, 1]) {
            const branchAngle = angle + side * Math.PI / 3;
            context.moveTo(branchX, branchY);
            context.lineTo(branchX + Math.cos(branchAngle) * flake.size * .34,
              branchY + Math.sin(branchAngle) * flake.size * .34);
          }
        }
        context.stroke();
        context.restore();
      }
      sparks = sparks.filter((spark) => {
        const age = (now - spark.start) / 850;
        const element = trail[spark.index];
        if (age >= 1) { element.style.opacity = "0"; return false; }
        element.style.opacity = String((1 - age) * .85);
        element.style.transform = `translate3d(${spark.x + spark.vx * age}px, ${spark.y + spark.vy * age}px, 0) rotate(${spark.rotation + age * 40}deg) scale(${1 - age * .6})`;
        return true;
      });
    }
    function visibility() {
      cancelAnimationFrame(frame); active = !document.hidden; last = 0;
      sparks = []; trail.forEach((element) => { element.style.opacity = "0"; });
      if (active) frame = requestAnimationFrame(draw);
    }
    resize(); visibility();
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("click", click, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false; cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize); window.removeEventListener("pointermove", move);
      window.removeEventListener("click", click); document.removeEventListener("visibilitychange", visibility);
    };
  }, [snow]);
  return <div className="nest-atmosphere" data-snow={snow || undefined} aria-hidden="true">
    <canvas className="sakura-canvas" ref={canvasRef} />
    <div className="cursor-trail" ref={trailRef}>{Array.from({ length: 24 }, (_, i) => <span key={i}>{i % 2 ? <FaHeart /> : <FaStar />}</span>)}</div>
  </div>;
}
