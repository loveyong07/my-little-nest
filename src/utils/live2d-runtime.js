let corePromise;
function loadCore() {
  if (window.Live2D) return Promise.resolve();
  if (corePromise) return corePromise;
  corePromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = setTimeout(() => { script.remove(); reject(new Error("Live2D core timeout")); }, 12000);
    script.src = "/assets/live2d/live2d-core-1.0.1.min.js";
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error("Live2D core unavailable")); };
    document.head.appendChild(script);
  }).catch((error) => { corePromise = null; throw error; });
  return corePromise;
}

export async function createCompanion(canvasId, { fps = 30, signal } = {}) {
  const isCancelled = () => Boolean(signal?.aborted);
  await loadCore();
  if (isCancelled()) return null;
  // Import the actual widget's Cubism renderer only after its Core is ready.
  const { default: Cubism2Model } = await import("live2d-widgets/build/cubism2/index.js");
  const { default: PlatformManager } = await import("live2d-widgets/build/cubism2/PlatformManager.js");
  const { Live2DFramework, L2DBaseModel } = await import("live2d-widgets/build/cubism2/Live2DFramework.js");
  if (isCancelled()) return null;
  // Upstream counts textures globally. Count per model so closing a loading
  // character cannot leave the next character waiting on abandoned textures.
  L2DBaseModel.prototype.loadTexture = function (index, path, callback) {
    this.nestTexturesPending = (this.nestTexturesPending || 0) + 1;
    Live2DFramework.getPlatformManager().loadTexture(this.live2DModel, index, path, () => {
      this.nestTexturesPending--;
      this.isTexLoaded = this.nestTexturesPending === 0;
      callback?.();
    });
  };
  const requests = new AbortController();
  const images = new Set();
  let fail;
  const failed = new Promise((_, reject) => { fail = reject; });
  class NestPlatform extends PlatformManager {
    loadBytes(path, callback) {
      if (isCancelled()) return;
      if (this.cache[path]) { callback(this.cache[path]); return; }
      fetch(path, { signal: requests.signal }).then((response) => {
        if (!response.ok) throw new Error("Model asset unavailable");
        return response.arrayBuffer();
      }).then((bytes) => { if (!isCancelled()) { this.cache[path] = bytes; callback(bytes); } }).catch(fail);
    }
    loadTexture(liveModel, index, path, callback) {
      const image = new Image(); images.add(image);
      image.onload = () => {
        images.delete(image);
        if (isCancelled() || model.disposed || !model.gl) return;
        try {
          const gl = model.gl;
          const texture = gl.createTexture();
          if (!texture) throw new Error("Texture unavailable");
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
          gl.generateMipmap(gl.TEXTURE_2D); liveModel.setTexture(index, texture); callback();
        } catch (error) { fail(error); }
      };
      image.onerror = () => fail(new Error("Texture unavailable"));
      image.src = path;
    }
  }
  class NestModel extends Cubism2Model {
    mouseEvent(event) { if (!this.disposed && this.live2DMgr?.model && this.dragMgr) super.mouseEvent(event); }
    touchEvent(event) { if (!this.disposed && this.live2DMgr?.model && this.dragMgr) super.touchEvent(event); }
    startDraw() {
      if (this.isDrawStart || this.disposed) return;
      this.isDrawStart = true;
      let last = 0;
      const tick = (now) => {
        if (!this.isDrawStart) return;
        if (!document.hidden && now - last >= 1000 / fps && this.gl) { this.draw(); last = now; }
        this._drawFrameId = requestAnimationFrame(tick);
      };
      this._drawFrameId = requestAnimationFrame(tick);
    }
    pause() { this.isDrawStart = false; cancelAnimationFrame(this._drawFrameId); }
    destroy() {
      if (this.disposed) return;
      this.disposed = true;
      requests.abort();
      for (const image of images) { image.onload = null; image.onerror = null; image.removeAttribute("src"); }
      images.clear();
      signal?.removeEventListener("abort", abort);
      this.pause();
      const gl = this.gl;
      super.destroy();
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    }
  }
  const response = await fetch("/assets/live2d/shizuku/shizuku.model.json", { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("Model unavailable");
  const settings = await response.json();
  if (isCancelled()) return null;
  const model = new NestModel();
  Live2DFramework.setPlatformManager(new NestPlatform());
  const abort = () => { model.destroy(); fail(new DOMException("Cancelled", "AbortError")); };
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => fail(new Error("Model load timed out")), 15000);
  try {
    await Promise.race([model.init(canvasId, "/assets/live2d/shizuku/shizuku.model.json", settings), failed]);
    if (!model.gl) throw new Error("WebGL unavailable");
    if (isCancelled()) { model.destroy(); return null; }
    return model;
  } catch (error) { model.destroy(); throw error; }
  finally { clearTimeout(timeout); }
}
