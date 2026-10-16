/* eslint-disable import/prefer-default-export */
const activeSounds = new Set();

export const playBackgroundSound = (
  soundFile,
  { retryOnInteraction = false } = {},
) => new Promise((resolve) => {
  const audio = new Audio(soundFile.data);
  activeSounds.add(audio);

  let removeRetryListeners = () => {};
  const finish = () => {
    removeRetryListeners();
    activeSounds.delete(audio);
    resolve();
  };
  const attemptPlay = () => {
    audio.play().catch((error) => {
      if (retryOnInteraction && error.name === 'NotAllowedError') {
        const retry = (event) => {
          if (!event.isTrusted || event.repeat) return;
          removeRetryListeners();
          attemptPlay();
        };
        removeRetryListeners = () => {
          window.removeEventListener('click', retry, true);
          window.removeEventListener('keydown', retry, true);
        };
        window.addEventListener('click', retry, true);
        window.addEventListener('keydown', retry, true);
      } else {
        finish();
      }
    });
  };
  audio.onended = finish;
  audio.onerror = finish;
  attemptPlay();
});
