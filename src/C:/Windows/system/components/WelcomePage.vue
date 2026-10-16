<template>
  <div :class="[$style.welcomePage, fading && 'fading']">
    <video
      ref="bootVideo"
      :src="bootUrl"
      autoplay
      muted
      playsinline
      preload="auto"
      aria-label="Démarrage de Windows"
      @playing="scheduleFade"
      @waiting="clearPlaybackTimer"
      @pause="clearPlaybackTimer"
      @seeked="scheduleFade"
      @timeupdate="checkPlayback"
      @ended="fadeToDesktop"
      @error="fadeToDesktop"
    />
    <p :class="$style.skipHint">
      Appuyez sur une touche pour passer
    </p>
  </div>
</template>

<script>
import { resolveFileByPath } from '@/services/fs';
import { startWindowManager } from '@/services/wm';

const BOOT_SECONDS = 7;
const FADE_MS = 800;

export default {
  data() {
    return {
      fading: false,
      playbackTimer: null,
      finishTimer: null,
    };
  },
  computed: {
    bootUrl() {
      return resolveFileByPath('C:/Windows/system/window/boot.mp4').data;
    },
  },
  mounted() {
    window.addEventListener('keydown', this.skipBoot);
    // Muted playback allows automatic startup without a browser interaction.
    this.$refs.bootVideo.play().catch(() => this.fadeToDesktop());
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.skipBoot);
    this.clearPlaybackTimer();
    clearTimeout(this.finishTimer);
  },
  methods: {
    skipBoot(event) {
      if (event.repeat || this.fading) return;
      event.preventDefault();
      this.fadeToDesktop();
    },
    clearPlaybackTimer() {
      clearTimeout(this.playbackTimer);
    },
    scheduleFade() {
      this.clearPlaybackTimer();
      const video = this.$refs.bootVideo;
      if (this.fading || video.paused) return;
      const remaining = Math.max(0, BOOT_SECONDS - video.currentTime) / video.playbackRate;
      this.playbackTimer = setTimeout(() => this.checkPlayback(), remaining * 1000);
    },
    checkPlayback() {
      if (this.$refs.bootVideo.currentTime >= BOOT_SECONDS) this.fadeToDesktop();
    },
    fadeToDesktop() {
      if (this.fading) return;
      this.fading = true;
      this.clearPlaybackTimer();
      this.$refs.bootVideo.pause();
      this.$nextTick(() => {
        this.finishTimer = setTimeout(startWindowManager, FADE_MS);
      });
    },
  },
  style({ className }) {
    return [
      className('welcomePage', {
        position: 'fixed',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        left: 0,
        top: 0,
        background: '#000',
        '& > video': {
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: 1,
          transition: `opacity ${FADE_MS}ms ease`,
        },
        '&.fading > video, &.fading > p': {
          opacity: 0,
        },
      }),
      className('skipHint', {
        position: 'absolute',
        bottom: '32px',
        width: '100%',
        textAlign: 'center',
        fontSize: '14px',
        color: '#fff',
        textShadow: '0 1px 3px #000',
        opacity: 0.75,
        transition: `opacity ${FADE_MS}ms ease`,
      }),
    ];
  },
};
</script>
