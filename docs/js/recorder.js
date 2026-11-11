// Records a short clip from the microphone and plays it back. Nothing is saved or uploaded:
// a clip lives in memory while its page is open.
export const canRecord = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

let active = null;   // the MediaRecorder while recording

// resolves with the recording when stopRecording() is called or maxMs has passed; onTick gets the seconds so far
export async function record(maxMs, onTick) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  return new Promise((resolve, reject) => {
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
    let rec;
    try {
      rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    } catch (e) {
      stream.getTracks().forEach(t => t.stop());
      reject(e);
      return;
    }
    const chunks = [], t0 = Date.now();
    const tick = setInterval(() => { if (onTick) onTick(Math.floor((Date.now() - t0) / 1000)); }, 250);
    const limit = setTimeout(() => { if (rec.state !== "inactive") rec.stop(); }, maxMs);
    // let go of the microphone as soon as recording ends, so the phone stops showing it in use
    const end = () => {
      clearInterval(tick);
      clearTimeout(limit);
      stream.getTracks().forEach(t => t.stop());
      if (active === rec) active = null;
    };
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => { end(); resolve(new Blob(chunks, { type: rec.mimeType || type || "audio/webm" })); };
    rec.onerror = e => { end(); reject(e.error || e); };
    active = rec;
    rec.start();
  });
}
export const isRecording = () => !!active;
export function stopRecording() {
  if (active && active.state !== "inactive") active.stop();
}

let playing = null;   // { audio, url, resolve }
export function playClip(blob) {
  stopClip();
  return new Promise(resolve => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    const job = { audio, url, resolve };
    const done = () => {
      if (playing === job) playing = null;
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;
    playing = job;
    audio.play().catch(done);
  });
}
export function stopClip() {
  if (!playing) return;
  const { audio, url, resolve } = playing;
  playing = null;
  audio.pause();
  URL.revokeObjectURL(url);
  resolve();
}
