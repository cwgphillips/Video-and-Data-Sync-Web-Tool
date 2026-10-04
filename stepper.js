// stepper.js
import { BoundedLRUCache } from './lruCache.js';

export class WebCodecsFrameStepper {
  constructor(canvas, maxCacheSize = 100) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    
    this.samples = [];
    this.trackConfig = null;
    this.fileBuffer = null;
    this.fps = 30;
    this.currentIndex = 0;
    
    this.frameCache = new BoundedLRUCache(maxCacheSize);
    this.pendingDecodes = new Map();
    this.decoder = null;
    
    this._initDecoder();
  }

  _initDecoder() {
    if (this.decoder && this.decoder.state !== 'closed') {
      this.decoder.close();
    }
    this.pendingDecodes.clear();

    this.decoder = new VideoDecoder({
      output: (videoFrame) => {
        const resolver = this.pendingDecodes.get(videoFrame.timestamp);
        if (resolver) {
          this.pendingDecodes.delete(videoFrame.timestamp);
          resolver(videoFrame);
        } else {
          videoFrame.close();
        }
      },
      error: (err) => console.error("WebCodecs Decoder Error:", err)
    });
  }

  async loadFile(file) {
    this.fileBuffer = await file.arrayBuffer();
    await this._demux();
    
    this.decoder.configure(this.trackConfig);
    this.canvas.width = this.trackConfig.codedWidth;
    this.canvas.height = this.trackConfig.codedHeight;
    this.frameCache.clear();

    return this.seekToFrame(0);
  }

  _demux() {
    return new Promise((resolve, reject) => {
      // Assumes mp4box.all.min.js is loaded in the global window
      const mp4boxfile = window.MP4Box.createFile();
      mp4boxfile.onError = (e) => reject(new Error("MP4Box parsing error: " + e));

      mp4boxfile.onReady = (info) => {
        const videoTrack = info.videoTracks[0];
        if (!videoTrack) {
          reject(new Error("No video track found in MP4."));
          return;
        }

        const timescale = videoTrack.timescale;
        const durationSec = videoTrack.duration / timescale;
        this.fps = videoTrack.nb_samples / durationSec || 30;

        const trak = mp4boxfile.getTrackById(videoTrack.id);
        const avcC = trak.mdia.minf.stbl.stsd.entries[0].avcC;
        let description = null;

        if (avcC) {
          const stream = new window.MP4Box.DataStream(undefined, 0, window.MP4Box.DataStream.BIG_ENDIAN);
          avcC.write(stream);
          description = new Uint8Array(stream.buffer, 8);
        }

        this.trackConfig = {
          codec: videoTrack.codec,
          codedWidth: videoTrack.video.width,
          codedHeight: videoTrack.video.height,
          description: description
        };

        mp4boxfile.setExtractionOptions(videoTrack.id, null, { nbSamples: Infinity });
        mp4boxfile.start();
      };

      mp4boxfile.onSamples = (trackId, ref, samples) => {
        this.samples = samples.sort((a, b) => a.cts - b.cts);
        resolve();
      };

      this.fileBuffer.fileStart = 0;
      mp4boxfile.appendBuffer(this.fileBuffer);
      mp4boxfile.flush();
    });
  }

  async seekToFrame(targetIndex) {
    targetIndex = Math.max(0, Math.min(targetIndex, this.samples.length - 1));

    // Cache hit
    if (this.frameCache.has(targetIndex)) {
      const bitmap = this.frameCache.get(targetIndex);
      this.ctx.drawImage(bitmap, 0, 0);
      this.currentIndex = targetIndex;
      return targetIndex;
    }

    // Identify nearest preceding keyframe
    let syncIndex = targetIndex;
    while (syncIndex > 0 && !this.samples[syncIndex].is_sync) {
      syncIndex--;
    }

    if (this.decoder.state === 'configured') {
      await this.decoder.reset();
      this.decoder.configure(this.trackConfig);
    }

    // Decode forward from keyframe
    for (let i = syncIndex; i <= targetIndex; i++) {
      const sample = this.samples[i];
      const chunkData = new Uint8Array(this.fileBuffer, sample.offset, sample.size);
      
      const chunk = new EncodedVideoChunk({
        type: sample.is_sync ? 'key' : 'delta',
        timestamp: sample.cts,
        duration: sample.duration,
        data: chunkData
      });

      const framePromise = new Promise((resolve) => {
        this.pendingDecodes.set(sample.cts, resolve);
      });

      this.decoder.decode(chunk);
      const videoFrame = await framePromise;

      if (i === targetIndex) {
        this.ctx.drawImage(videoFrame, 0, 0);
        const bitmap = await createImageBitmap(videoFrame);
        this.frameCache.put(i, bitmap);
        videoFrame.close();
      } else {
        videoFrame.close();
      }
    }

    this.currentIndex = targetIndex;
    return targetIndex;
  }

  step(delta) {
    return this.seekToFrame(this.currentIndex + delta);
  }
}