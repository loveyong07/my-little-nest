import { useEffect, useRef } from "react";
import { MOBILE_QUERY, FINE_HOVER_QUERY } from "../../constants/media-queries.js";
import { FaHeart, FaStar } from "react-icons/fa6";

export function SakuraCanvas({ snow = false }) {
  const canvasRef = useRef(null);
  const trailRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    const mobile = matchMedia(MOBILE_QUERY);
    const finePointer = matchMedia(FINE_HOVER_QUERY);
    const petal = new Image();
    // Rasterize decorative artwork once instead of resampling the source and
    // stroking blurred snowflake paths for every particle on every frame.
    const petalSprite = document.createElement("canvas");
    petalSprite.width = petalSprite.height = 64;
    let petalReady = false;
    petal.onload = () => {
      petalSprite.getContext("2d").drawImage(petal, 0, 0, 64, 64);
      petalReady = true;
    };
    petal.src = "/assets/home-floating-petal.webp";
    const snowSprite = document.createElement("canvas");
    snowSprite.width = snowSprite.height = 80;
    if (snow) {
      const brush = snowSprite.getContext("2d");
      brush.translate(40, 40);
      brush.strokeStyle = "#ffffff";
      brush.lineWidth = 3.6;
      brush.lineCap = "round";
      brush.shadowColor = "#5283b3";
      brush.shadowBlur = 6;
      brush.beginPath();
      for (let arm = 0; arm < 6; arm++) {
        const angle = (arm * Math.PI) / 3;
        const x = Math.cos(angle) * 28,
          y = Math.sin(angle) * 28;
        brush.moveTo(0, 0);
        brush.lineTo(x, y);
        for (const side of [-1, 1]) {
          const branch = angle + (side * Math.PI) / 3;
          brush.moveTo(x * 0.58, y * 0.58);
          brush.lineTo(x * 0.58 + Math.cos(branch) * 28 * 0.34, y * 0.58 + Math.sin(branch) * 28 * 0.34);
        }
      }
      brush.stroke();
    }
    const trail = [...trailRef.current.children];
    let width = 0,
      height = 0,
      petals = [],
      flakes = [],
      sparks = [],
      frame = 0,
      last = 0,
      pointerAt = 0,
      slot = 0;
    let active = true;
    const connection = navigator.connection;
    const compact = () => mobile.matches || connection?.saveData;
    function resize() {
      const nextWidth = innerWidth;
      const nextHeight = innerHeight;
      const widthChanged = nextWidth !== width;
      width = nextWidth;
      height = nextHeight;
      // Bound the full-screen decorative surface on large/high-DPI monitors.
      // This does not change the resolution of scene images or post media.
      const ratio = Math.min(
        devicePixelRatio || 1,
        compact() ? 1 : 1.5,
        Math.sqrt((1920 * 1080) / Math.max(1, width * height)),
      );
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const petalTarget = compact() ? 9 : 26;
      const flakeTarget = snow ? (compact() ? 16 : 38) : 0;
      // Mobile URL-bar toggles only change height; keep particle positions continuous.
      if (!widthChanged && petals.length === petalTarget && flakes.length === flakeTarget) return;
      petals = Array.from({ length: petalTarget }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        size: 12 + Math.random() * 16,
        speed: 17 + Math.random() * 25,
        rotation: Math.random() * 6.28,
        phase: Math.random() * 6.28,
      }));
      flakes = Array.from({ length: flakeTarget }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        size: 7 + Math.random() * 7,
        speed: 18 + Math.random() * 25,
        phase: Math.random() * Math.PI * 2,
      }));
    }
    function addSpark(x, y, burst) {
      const index = slot++ % trail.length;
      sparks = sparks.filter((spark) => spark.index !== index);
      sparks.push({
        index,
        x,
        y,
        start: performance.now(),
        vx: burst ? (Math.random() - 0.5) * 95 : 0,
        vy: burst ? -25 - Math.random() * 60 : -25,
        rotation: Math.random() * 45,
      });
    }
    function move(event) {
      const now = performance.now();
      if (!finePointer.matches || compact() || now - pointerAt < 85 || document.querySelector(".media-lightbox"))
        return;
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
      const elapsed = Math.min((now - (last || now)) / 1000, 0.1);
      last = now;
      context.clearRect(0, 0, width, height);
      if (petalReady) {
        for (const p of petals) {
          p.y += p.speed * elapsed;
          p.x += (9 + Math.sin(now / 1800 + p.phase) * 13) * elapsed;
          p.rotation += elapsed * 0.4;
          if (p.y > height + 30) {
            p.y = -30;
            p.x = Math.random() * width;
          }
          if (p.x > width + 30) p.x = -30;
          context.save();
          context.globalAlpha = 0.65;
          context.translate(p.x, p.y);
          context.rotate(p.rotation);
          context.scale(Math.cos(now / 1700 + p.phase) * 0.35 + 0.65, 1);
          context.drawImage(petalSprite, -p.size / 2, -p.size / 2, p.size, p.size);
          context.restore();
        }
      }
      // Share the petal animation loop; snow needs no extra images or requests.
      for (const flake of flakes) {
        flake.y += flake.speed * elapsed;
        flake.x += Math.sin(now / 2200 + flake.phase) * 12 * elapsed;
        if (flake.y > height + 10) {
          flake.y = -10;
          flake.x = Math.random() * width;
        }
        context.save();
        context.translate(flake.x, flake.y);
        context.rotate(now / 9000 + flake.phase);
        context.globalAlpha = 0.95;
        const extent = (flake.size * 80) / 28;
        context.drawImage(snowSprite, -extent / 2, -extent / 2, extent, extent);
        context.restore();
      }
      sparks = sparks.filter((spark) => {
        const age = (now - spark.start) / 850;
        const element = trail[spark.index];
        if (age >= 1) {
          element.style.opacity = "0";
          return false;
        }
        element.style.opacity = String((1 - age) * 0.85);
        element.style.transform = `translate3d(${spark.x + spark.vx * age}px, ${spark.y + spark.vy * age}px, 0) rotate(${spark.rotation + age * 40}deg) scale(${1 - age * 0.6})`;
        return true;
      });
    }
    function visibility() {
      cancelAnimationFrame(frame);
      active = !document.hidden;
      last = 0;
      sparks = [];
      trail.forEach((element) => {
        element.style.opacity = "0";
      });
      if (active) frame = requestAnimationFrame(draw);
    }
    resize();
    visibility();
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("click", click, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      petal.onload = null;
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("click", click);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [snow]);
  return (
    <div className="nest-atmosphere" data-snow={snow || undefined} aria-hidden="true">
      <canvas className="sakura-canvas" ref={canvasRef} />
      <div className="cursor-trail" ref={trailRef}>
        {Array.from({ length: 24 }, (_, i) => (
          <span key={i}>{i % 2 ? <FaHeart /> : <FaStar />}</span>
        ))}
      </div>
    </div>
  );
}
