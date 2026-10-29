(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const audio = $('#audio');
  const fileInput = $('#fileInput');
  const trackList = $('#trackList');
  const playlistEmpty = $('#playlistEmpty');
  const toast = $('#toast');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function storageGet(key, fallback = null) {
    try { return window.localStorage.getItem(key) ?? fallback; }
    catch (_) { return fallback; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (_) { /* Storage can be unavailable in private/file contexts. */ }
  }

  const state = {
    tracks: [],
    currentIndex: -1,
    shuffle: false,
    repeat: 0, // 0: off, 1: repeat playlist, 2: repeat current track
    effects: storageGet('vutungios-effects', 'on') !== 'off',
    visualizer: storageGet('vutungios-visualizer', 'on') !== 'off',
    audioContext: null,
    analyser: null,
    source: null,
    frequencyData: null,
    rafId: 0,
    toastTimer: 0,
    quoteIndex: 0,
    lastRandomIndex: -1,
  };

  const quotes = [
    'Có những nỗi buồn<br>chẳng biết kể cùng ai.',
    'Đôi khi im lặng là cách<br>duy nhất để giấu tổn thương.',
    'Đêm nay lại nhớ<br>một người không nên nhớ.',
    'Không phải hết yêu,<br>chỉ là chẳng thể đi cùng nhau.',
    'Có những người chỉ còn lại<br>trong một bài hát cũ.',
    'Mong bạn dịu dàng với mình<br>như cách từng dịu dàng với họ.',
  ];

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${secs}`;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3000);
  }

  function parseTitle(filename) {
    return filename.replace(/\.[^/.]+$/, '').replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Bài hát không tên';
  }

  function prettyBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function createRain() {
    if (reducedMotion) return;
    const layer = $('#rainLayer');
    const artRain = $('#artRain');
    for (let i = 0; i < 42; i += 1) {
      const drop = document.createElement('i');
      drop.className = 'rain-drop';
      drop.style.left = `${Math.random() * 100}%`;
      drop.style.animationDuration = `${2.7 + Math.random() * 4.5}s`;
      drop.style.animationDelay = `${Math.random() * -8}s`;
      drop.style.opacity = `${0.2 + Math.random() * 0.5}`;
      drop.style.height = `${24 + Math.random() * 55}px`;
      layer.appendChild(drop);
    }
    if (artRain) {
      for (let i = 0; i < 27; i += 1) {
        const drop = document.createElement('i');
        drop.style.left = `${Math.random() * 100}%`;
        drop.style.top = `${Math.random() * 100}%`;
        drop.style.animationDuration = `${2 + Math.random() * 3.5}s`;
        drop.style.animationDelay = `${Math.random() * -7}s`;
        drop.style.height = `${20 + Math.random() * 40}px`;
        drop.style.opacity = `${0.15 + Math.random() * 0.35}`;
        artRain.appendChild(drop);
      }
    }
  }

  function updateProgressFill(input) {
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 100;
    const value = Number(input.value) || 0;
    const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
    input.style.setProperty('--progress', `${percent}%`);
  }

  function setPlayingUI(playing) {
    document.body.classList.toggle('is-playing', playing);
    $('.playing-indicator').classList.toggle('is-playing', playing);
    $('#playBtn').setAttribute('aria-label', playing ? 'Tạm dừng' : 'Phát nhạc');
    $('#playBtn').title = playing ? 'Tạm dừng' : 'Phát nhạc';
    $('#focusPlay').setAttribute('aria-label', playing ? 'Tạm dừng' : 'Phát nhạc');
    $('#featuredPlay').setAttribute('aria-label', playing ? 'Tạm dừng bài hát đang chọn' : 'Phát bài hát đang chọn');
    $('#siteStatus').textContent = playing ? 'NOW PLAYING' : 'A QUIET PLACE';
    if (!playing && !audio.paused) audio.pause();
    drawVisualizer();
  }

  function currentTrack() {
    return state.tracks[state.currentIndex] || null;
  }

  function updateTrackMetadata() {
    const track = currentTrack();
    const title = track ? track.title : 'Chưa có bài hát';
    const artist = track ? track.artist : 'Nạp một file để bắt đầu';
    $('#nowPlayingTitle').textContent = title;
    $('#nowPlayingArtist').textContent = artist;
    $('#focusTitle').textContent = title;
    $('#focusArtist').textContent = artist;
    $('#featuredTitle').textContent = track ? track.title : 'Khuôn Mặt Đáng Thương';
    $('#featuredArtist').textContent = track ? `${track.artist} · File trên thiết bị` : 'Sơn Tùng M-TP · Chưa nạp file nhạc';
    $('#mainCover').setAttribute('aria-label', track ? `Ảnh bìa mặc định cho ${track.title}` : 'Ảnh bìa nghệ thuật tông màu tối');
    $('#durationTime').textContent = track && Number.isFinite(audio.duration) ? formatTime(audio.duration) : '0:00';
  }

  function updateTrackList() {
    trackList.replaceChildren();
    playlistEmpty.hidden = state.tracks.length > 0;
    trackList.hidden = state.tracks.length === 0;
    $('#trackCount').textContent = state.tracks.length ? `${String(state.tracks.length).padStart(2, '0')} BÀI HÁT` : 'CHƯA CÓ BÀI HÁT';

    state.tracks.forEach((track, index) => {
      const row = document.createElement('div');
      row.className = `track-row${index === state.currentIndex ? ' active' : ''}`;
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', `Phát ${track.title}`);

      const number = document.createElement('span');
      number.className = 'track-row-index';
      number.textContent = index === state.currentIndex && !audio.paused ? '♫' : String(index + 1).padStart(2, '0');

      const info = document.createElement('span');
      info.className = 'track-row-info';
      const title = document.createElement('span');
      title.className = 'track-row-title';
      title.textContent = track.title;
      const artist = document.createElement('span');
      artist.className = 'track-row-sub';
      artist.textContent = `${track.artist}${track.size ? ` · ${track.size}` : ''}`;
      info.append(title, artist);

      const remove = document.createElement('button');
      remove.className = 'track-row-remove';
      remove.type = 'button';
      remove.textContent = '×';
      remove.title = `Xóa ${track.title} khỏi danh sách`;
      remove.setAttribute('aria-label', remove.title);
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        removeTrack(index);
      });

      row.append(number, info, remove);
      row.addEventListener('click', () => selectTrack(index, true));
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectTrack(index, true);
        }
      });
      trackList.appendChild(row);
    });
  }

  function selectTrack(index, autoplay = false) {
    if (index < 0 || index >= state.tracks.length) return;
    const track = state.tracks[index];
    state.currentIndex = index;
    audio.src = track.url;
    audio.loop = state.repeat === 2;
    audio.load();
    $('#currentTime').textContent = '0:00';
    $('#seekBar').value = '0';
    $('#seekBar').disabled = false;
    updateProgressFill($('#seekBar'));
    updateTrackMetadata();
    updateTrackList();
    if (autoplay) playCurrent();
    else setPlayingUI(false);
  }

  async function playCurrent() {
    if (!currentTrack()) {
      fileInput.click();
      showToast('Chọn một file nhạc trên thiết bị để bắt đầu nghe.');
      return;
    }
    try {
      await initialiseAudioGraph();
      await audio.play();
      setPlayingUI(true);
      updateTrackList();
    } catch (error) {
      setPlayingUI(false);
      if (error && error.name === 'NotAllowedError') {
        showToast('Trình duyệt chưa cho phép phát nhạc. Hãy nhấn Play thêm một lần nữa.');
      } else {
        showToast('Không phát được file này. Hãy thử một file MP3, M4A, WAV hoặc OGG khác.');
      }
    }
  }

  function pauseCurrent() {
    audio.pause();
    setPlayingUI(false);
    updateTrackList();
  }

  function togglePlay() {
    if (audio.paused) playCurrent();
    else pauseCurrent();
  }

  function nextTrack() {
    if (!state.tracks.length) {
      showToast('Playlist đang trống. Hãy thêm file nhạc của bạn.');
      fileInput.click();
      return;
    }
    let nextIndex;
    if (state.shuffle && state.tracks.length > 1) {
      do {
        nextIndex = Math.floor(Math.random() * state.tracks.length);
      } while (nextIndex === state.currentIndex && nextIndex !== state.lastRandomIndex);
      state.lastRandomIndex = state.currentIndex;
    } else {
      nextIndex = state.currentIndex + 1;
      if (nextIndex >= state.tracks.length) {
        if (state.repeat === 1) nextIndex = 0;
        else {
          pauseCurrent();
          audio.currentTime = 0;
          $('#currentTime').textContent = '0:00';
          $('#seekBar').value = '0';
          updateProgressFill($('#seekBar'));
          return;
        }
      }
    }
    selectTrack(nextIndex, true);
  }

  function previousTrack() {
    if (!state.tracks.length) {
      showToast('Hãy thêm nhạc để sử dụng chức năng này.');
      return;
    }
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    let index = state.currentIndex - 1;
    if (index < 0) index = state.repeat === 1 ? state.tracks.length - 1 : 0;
    selectTrack(index, true);
  }

  function removeTrack(index) {
    const removed = state.tracks[index];
    if (!removed) return;
    const wasCurrent = index === state.currentIndex;
    const wasPlaying = !audio.paused;
    if (wasCurrent) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    URL.revokeObjectURL(removed.url);
    state.tracks.splice(index, 1);

    if (!state.tracks.length) {
      state.currentIndex = -1;
      $('#seekBar').disabled = true;
      $('#seekBar').value = '0';
      $('#currentTime').textContent = '0:00';
      $('#durationTime').textContent = '0:00';
      updateTrackMetadata();
      setPlayingUI(false);
    } else if (wasCurrent) {
      state.currentIndex = Math.min(index, state.tracks.length - 1);
      selectTrack(state.currentIndex, wasPlaying);
    } else {
      if (index < state.currentIndex) state.currentIndex -= 1;
      updateTrackMetadata();
    }
    updateTrackList();
    showToast('Đã xóa bài hát khỏi playlist.');
  }

  function addFiles(fileList) {
    const files = Array.from(fileList || []).filter((file) => file.type.startsWith('audio/') || /\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(file.name));
    if (!files.length) {
      if (fileList && fileList.length) showToast('Không tìm thấy file âm thanh tương thích trong lựa chọn.');
      return;
    }
    const startIndex = state.tracks.length;
    files.forEach((file) => {
      state.tracks.push({
        title: parseTitle(file.name),
        artist: 'Thư viện của bạn',
        fileName: file.name,
        size: prettyBytes(file.size),
        url: URL.createObjectURL(file),
      });
    });
    if (state.currentIndex < 0) selectTrack(startIndex, false);
    else updateTrackList();
    updateTrackMetadata();
    showToast(`Đã thêm ${files.length} ${files.length === 1 ? 'bài hát' : 'bài hát'} vào playlist.`);
    fileInput.value = '';
  }

  async function initialiseAudioGraph() {
    if (state.audioContext || !window.AudioContext && !window.webkitAudioContext) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    try {
      state.audioContext = new AudioContextClass();
      state.analyser = state.audioContext.createAnalyser();
      state.analyser.fftSize = 128;
      state.analyser.smoothingTimeConstant = 0.83;
      state.source = state.audioContext.createMediaElementSource(audio);
      state.source.connect(state.analyser);
      state.analyser.connect(state.audioContext.destination);
      state.frequencyData = new Uint8Array(state.analyser.frequencyBinCount);
      if (state.audioContext.state === 'suspended') await state.audioContext.resume();
      drawVisualizer();
    } catch (error) {
      // Audio playback still works without the optional visualizer.
      state.audioContext = null;
      state.analyser = null;
      state.source = null;
    }
  }

  function setupVisualizer() {
    const consoleCenter = $('.console-center');
    const canvas = document.createElement('canvas');
    canvas.id = 'visualizerCanvas';
    canvas.className = 'visualizer-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    consoleCenter.prepend(canvas);
    state.canvas = canvas;
    state.canvasContext = canvas.getContext('2d');
    canvas.hidden = !state.visualizer;
    drawVisualizer();
  }

  function drawVisualizer() {
    if (!state.canvas || !state.canvasContext) return;
    const canvas = state.canvas;
    const context = state.canvasContext;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width * (window.devicePixelRatio || 1)));
    const height = Math.max(1, Math.floor(rect.height * (window.devicePixelRatio || 1)));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.clearRect(0, 0, width, height);
    if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = 0; }
    if (!state.visualizer || audio.paused || !state.analyser || !state.frequencyData) {
      context.fillStyle = 'rgba(185, 153, 151, .32)';
      const bars = 37;
      const barWidth = Math.max(1, width / (bars * 2.4));
      for (let i = 0; i < bars; i += 1) {
        const x = (width / bars) * i;
        context.fillRect(x, height / 2, barWidth, 1);
      }
      return;
    }
    state.analyser.getByteFrequencyData(state.frequencyData);
    const bars = Math.min(52, state.frequencyData.length);
    const gap = Math.max(1, width * 0.006);
    const barWidth = Math.max(1, (width - gap * (bars - 1)) / bars);
    for (let i = 0; i < bars; i += 1) {
      const value = state.frequencyData[i] / 255;
      const barHeight = Math.max(1, value * height * 0.95);
      const x = i * (barWidth + gap);
      const y = (height - barHeight) / 2;
      context.fillStyle = `rgba(191, 157, 154, ${0.3 + value * 0.62})`;
      context.fillRect(x, y, barWidth, barHeight);
    }
    if (!audio.paused && state.visualizer) state.rafId = requestAnimationFrame(drawVisualizer);
  }

  function toggleRepeat() {
    state.repeat = (state.repeat + 1) % 3;
    audio.loop = state.repeat === 2;
    const button = $('#repeatBtn');
    button.setAttribute('aria-pressed', state.repeat === 0 ? 'false' : 'true');
    $('#repeatOne').classList.toggle('show', state.repeat === 2);
    button.title = ['Không lặp', 'Lặp playlist', 'Lặp bài hiện tại'][state.repeat];
    showToast(['Đã tắt lặp lại.', 'Sẽ lặp lại playlist.', 'Sẽ lặp lại bài hiện tại.'][state.repeat]);
  }

  function toggleShuffle() {
    state.shuffle = !state.shuffle;
    $('#shuffleBtn').setAttribute('aria-pressed', String(state.shuffle));
    $('#shuffleBtn').title = state.shuffle ? 'Đã bật phát ngẫu nhiên' : 'Phát ngẫu nhiên';
    showToast(state.shuffle ? 'Đã bật phát ngẫu nhiên.' : 'Đã tắt phát ngẫu nhiên.');
  }

  function toggleEffects() {
    state.effects = !state.effects;
    document.body.classList.toggle('effects-off', !state.effects);
    $('#effectsToggle').setAttribute('aria-pressed', String(state.effects));
    storageSet('vutungios-effects', state.effects ? 'on' : 'off');
    showToast(state.effects ? 'Đã bật hiệu ứng nền.' : 'Đã tắt hiệu ứng nền.');
  }

  function toggleVisualizer() {
    state.visualizer = !state.visualizer;
    $('#visualizerToggle').setAttribute('aria-pressed', String(state.visualizer));
    $('#visualizerCanvas').hidden = !state.visualizer;
    storageSet('vutungios-visualizer', state.visualizer ? 'on' : 'off');
    drawVisualizer();
  }

  function toggleFocusMode() {
    const overlay = $('#focusOverlay');
    const opening = overlay.hidden;
    overlay.hidden = !opening;
    document.body.classList.toggle('focus-mode', opening);
    if (opening) {
      $('#focusClose')?.focus();
      $('#closeFocus').focus();
      updateTrackMetadata();
    } else {
      $('#focusBtn').focus();
    }
  }

  function changeQuote() {
    state.quoteIndex = (state.quoteIndex + 1) % quotes.length;
    const quote = $('#rotatingQuote');
    quote.style.animation = 'none';
    // Force a reflow so the fade-in restarts with each new thought.
    void quote.offsetWidth;
    quote.innerHTML = quotes[state.quoteIndex];
    quote.style.animation = '';
    $('#quoteCounter').textContent = String(state.quoteIndex + 1).padStart(2, '0');
  }

  // Events
  $('#startListening').addEventListener('click', () => {
    $('#player').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    if (!currentTrack()) {
      window.setTimeout(() => showToast('Thêm file nhạc của bạn để trình phát có thể bắt đầu.'), reducedMotion ? 0 : 350);
    }
  });
  $('#backToMusic').addEventListener('click', () => $('#player').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' }));
  $('#uploadHero').addEventListener('click', () => fileInput.click());
  $('#addTracks').addEventListener('click', () => fileInput.click());
  $('#emptyAdd').addEventListener('click', () => fileInput.click());
  $('#featuredPlay').addEventListener('click', togglePlay);
  $('#playBtn').addEventListener('click', togglePlay);
  $('#focusPlay').addEventListener('click', togglePlay);
  $('#prevBtn').addEventListener('click', previousTrack);
  $('#nextBtn').addEventListener('click', nextTrack);
  $('#shuffleBtn').addEventListener('click', toggleShuffle);
  $('#repeatBtn').addEventListener('click', toggleRepeat);
  $('#effectsToggle').addEventListener('click', toggleEffects);
  $('#visualizerToggle').addEventListener('click', toggleVisualizer);
  $('#focusBtn').addEventListener('click', toggleFocusMode);
  $('#closeFocus').addEventListener('click', toggleFocusMode);
  fileInput.addEventListener('change', (event) => addFiles(event.target.files));

  $('#volumeBar').value = storageGet('vutungios-volume', '0.75');
  audio.volume = Number($('#volumeBar').value);
  updateProgressFill($('#volumeBar'));
  $('#volumeBar').addEventListener('input', (event) => {
    audio.volume = Number(event.target.value);
    storageSet('vutungios-volume', event.target.value);
    updateProgressFill(event.target);
  });
  $('#seekBar').addEventListener('input', (event) => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const fraction = Number(event.target.value) / 1000;
    $('#currentTime').textContent = formatTime(audio.duration * fraction);
    updateProgressFill(event.target);
  });
  $('#seekBar').addEventListener('change', (event) => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = (Number(event.target.value) / 1000) * audio.duration;
  });

  audio.addEventListener('loadedmetadata', () => {
    $('#durationTime').textContent = formatTime(audio.duration);
    updateTrackMetadata();
  });
  audio.addEventListener('timeupdate', () => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    $('#currentTime').textContent = formatTime(audio.currentTime);
    $('#seekBar').value = String(Math.round((audio.currentTime / audio.duration) * 1000));
    updateProgressFill($('#seekBar'));
  });
  audio.addEventListener('play', () => {
    setPlayingUI(true);
    updateTrackList();
  });
  audio.addEventListener('pause', () => {
    setPlayingUI(false);
    updateTrackList();
  });
  audio.addEventListener('ended', () => {
    if (state.repeat === 2) {
      audio.currentTime = 0;
      playCurrent();
    } else if (state.repeat === 1 || state.shuffle || state.currentIndex < state.tracks.length - 1) {
      nextTrack();
    } else {
      setPlayingUI(false);
    }
  });
  audio.addEventListener('error', () => {
    if (currentTrack()) showToast('Không thể đọc file âm thanh này. Hãy thử định dạng khác.');
  });

  document.addEventListener('keydown', (event) => {
    const tag = document.activeElement?.tagName?.toLowerCase();
    const isTyping = ['input', 'textarea', 'select'].includes(tag) || document.activeElement?.isContentEditable;
    if (event.code === 'Space' && !isTyping && !event.repeat && $('#focusOverlay').hidden) {
      event.preventDefault();
      togglePlay();
    }
    if (event.key === 'Escape' && !$('#focusOverlay').hidden) toggleFocusMode();
  });

  window.addEventListener('beforeunload', () => {
    state.tracks.forEach((track) => URL.revokeObjectURL(track.url));
    if (state.rafId) cancelAnimationFrame(state.rafId);
  });
  window.addEventListener('resize', () => drawVisualizer());

  document.body.classList.toggle('effects-off', !state.effects);
  $('#effectsToggle').setAttribute('aria-pressed', String(state.effects));
  $('#visualizerToggle').setAttribute('aria-pressed', String(state.visualizer));
  $('#visualizerToggle').title = state.visualizer ? 'Tắt sóng nhạc' : 'Bật sóng nhạc';
  createRain();
  setupVisualizer();
  updateTrackMetadata();
  updateTrackList();
  updateProgressFill($('#volumeBar'));
  window.setInterval(changeQuote, reducedMotion ? 10000 : 6500);
})();
