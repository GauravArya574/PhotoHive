import { Photo } from '../types';

interface SamplePhotoTheme {
  title: string;
  palette: [string, string, string];
  style: 'landscape' | 'sunset' | 'ocean' | 'architecture' | 'macro' | 'astronomy' | 'abstract' | 'portrait';
  aspectRatio: number;
}

const SAMPLE_THEMES: SamplePhotoTheme[] = [
  { title: 'Alpine Dawn', palette: ['#1e3c72', '#2a5298', '#ff9a9e'], style: 'landscape', aspectRatio: 16 / 9 },
  { title: 'Golden Hour Coast', palette: ['#f12711', '#f5af19', '#e0c3fc'], style: 'sunset', aspectRatio: 3 / 2 },
  { title: 'Emerald Canopy', palette: ['#134e5e', '#71b280', '#004d40'], style: 'macro', aspectRatio: 4 / 3 },
  { title: 'Metropolis Angles', palette: ['#2c3e50', '#3498db', '#bdc3c7'], style: 'architecture', aspectRatio: 9 / 16 },
  { title: 'Pacific Swell', palette: ['#0052d4', '#4364f7', '#6fb1fc'], style: 'ocean', aspectRatio: 16 / 9 },
  { title: 'Cosmic Nebula', palette: ['#0f0c29', '#302b63', '#24243e'], style: 'astronomy', aspectRatio: 1 },
  { title: 'Terracotta Facade', palette: ['#d35400', '#e67e22', '#f39c12'], style: 'architecture', aspectRatio: 2 / 3 },
  { title: 'Neon Reflections', palette: ['#ff007f', '#7928ca', '#00dfd8'], style: 'abstract', aspectRatio: 21 / 9 },
  { title: 'Nordic Mist', palette: ['#3a6073', '#3a7bd5', '#cfd9df'], style: 'landscape', aspectRatio: 3 / 2 },
  { title: 'Crimson Dunes', palette: ['#870000', '#190a05', '#ff512f'], style: 'landscape', aspectRatio: 16 / 9 },
  { title: 'Botanical Dew', palette: ['#00467f', '#a5cc82', '#11998e'], style: 'macro', aspectRatio: 4 / 5 },
  { title: 'Minimalist Monolith', palette: ['#232526', '#414345', '#ece9e6'], style: 'architecture', aspectRatio: 9 / 16 },
  { title: 'Bioluminescent Shore', palette: ['#000428', '#004e92', '#00f2fe'], style: 'ocean', aspectRatio: 16 / 9 },
  { title: 'Amber Horizon', palette: ['#ff8008', '#ffc837', '#e52d27'], style: 'sunset', aspectRatio: 3 / 2 },
  { title: 'Cyber Prism', palette: ['#8a2387', '#e94057', '#f27121'], style: 'abstract', aspectRatio: 1 },
  { title: 'Sublime Fjord', palette: ['#1f4037', '#99f2c8', '#2193b0'], style: 'landscape', aspectRatio: 4 / 3 },
  { title: 'Brutalist Concrete', palette: ['#4b6cb7', '#182848', '#8e9eab'], style: 'architecture', aspectRatio: 2 / 3 },
  { title: 'Cherry Blossom Veil', palette: ['#ff758c', '#ff7eb3', '#fef9d7'], style: 'macro', aspectRatio: 4 / 3 },
  { title: 'Deep Space Core', palette: ['#050505', '#1a0826', '#6a11cb'], style: 'astronomy', aspectRatio: 16 / 9 },
  { title: 'Zenith Sunbeam', palette: ['#f857a6', '#ff5858', '#fbc531'], style: 'sunset', aspectRatio: 9 / 16 },
  { title: 'Glacial Ice Cave', palette: ['#00c6ff', '#0072ff', '#1a2a6c'], style: 'landscape', aspectRatio: 3 / 2 },
  { title: 'Urban Geometry', palette: ['#373b44', '#4286f4', '#f1f2f6'], style: 'architecture', aspectRatio: 1 },
  { title: 'Monsoon Rhythm', palette: ['#200122', '#6f0000', '#4b1248'], style: 'abstract', aspectRatio: 16 / 9 },
  { title: 'Sunkissed Meadow', palette: ['#fce38a', '#f38181', '#a8e6cf'], style: 'landscape', aspectRatio: 4 / 3 },
  { title: 'Canyon Echo', palette: ['#c0392b', '#8e44ad', '#f39c12'], style: 'landscape', aspectRatio: 2 / 3 },
  { title: 'Obsidian Coast', palette: ['#0f2027', '#203a43', '#2c5364'], style: 'ocean', aspectRatio: 21 / 9 },
];

/**
 * Generates an artistic canvas photo for a given theme.
 */
function createThemedCanvasPhoto(
  theme: SamplePhotoTheme,
  index: number,
  aspectRatio: number
): { dataUrl: string; width: number; height: number; img: HTMLImageElement } {
  // Base render size
  const baseSize = 800;
  const width = Math.round(aspectRatio >= 1 ? baseSize : baseSize * aspectRatio);
  const height = Math.round(aspectRatio >= 1 ? baseSize / aspectRatio : baseSize);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // 1. Background gradient
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, theme.palette[0]);
  grad.addColorStop(0.5, theme.palette[1]);
  grad.addColorStop(1, theme.palette[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // 2. Artistic subject rendering based on style
  ctx.save();
  if (theme.style === 'landscape') {
    // Mountain peaks and horizon
    ctx.fillStyle = 'rgba(10, 15, 30, 0.6)';
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, height * 0.7);
    ctx.lineTo(width * 0.3, height * 0.45);
    ctx.lineTo(width * 0.55, height * 0.6);
    ctx.lineTo(width * 0.8, height * 0.4);
    ctx.lineTo(width, height * 0.65);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    // Foreground ridge
    ctx.fillStyle = 'rgba(5, 8, 15, 0.85)';
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, height * 0.8);
    ctx.lineTo(width * 0.45, height * 0.65);
    ctx.lineTo(width, height * 0.85);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    // Sun / Moon disk
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(width * 0.75, height * 0.25, Math.min(width, height) * 0.08, 0, Math.PI * 2);
    ctx.fill();
  } else if (theme.style === 'ocean') {
    // Wave crests
    for (let w = 0; w < 4; w++) {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.1 + w * 0.07})`;
      ctx.beginPath();
      const yBase = height * (0.5 + w * 0.12);
      ctx.moveTo(0, height);
      ctx.lineTo(0, yBase);
      for (let x = 0; x <= width; x += 20) {
        const y = yBase + Math.sin(x * 0.02 + w * 1.5) * (15 + w * 5);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();
    }
  } else if (theme.style === 'architecture') {
    // Perspective lines and angular glass facades
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(width * (i / 7), 0);
      ctx.lineTo(width * ((7 - i) / 7), height);
      ctx.stroke();
    }
    // Geometric monolith
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.moveTo(width * 0.25, height);
    ctx.lineTo(width * 0.35, height * 0.15);
    ctx.lineTo(width * 0.75, height * 0.25);
    ctx.lineTo(width * 0.7, height);
    ctx.closePath();
    ctx.fill();
  } else if (theme.style === 'sunset') {
    // Huge glowing sun
    const sunGrad = ctx.createRadialGradient(
      width * 0.5,
      height * 0.65,
      10,
      width * 0.5,
      height * 0.65,
      Math.min(width, height) * 0.45
    );
    sunGrad.addColorStop(0, 'rgba(255, 255, 220, 0.95)');
    sunGrad.addColorStop(0.3, 'rgba(255, 180, 50, 0.6)');
    sunGrad.addColorStop(1, 'rgba(255, 50, 50, 0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(width * 0.5, height * 0.65, Math.min(width, height) * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Horizon waterline
    ctx.fillStyle = 'rgba(15, 5, 10, 0.7)';
    ctx.fillRect(0, height * 0.68, width, height * 0.32);
  } else {
    // Abstract bokeh & circles
    for (let b = 0; b < 12; b++) {
      const bx = (Math.sin(index * 5 + b * 2.3) * 0.4 + 0.5) * width;
      const by = (Math.cos(index * 3 + b * 1.7) * 0.4 + 0.5) * height;
      const br = (15 + (b % 5) * 20) * (Math.min(width, height) / 400);

      const radG = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      radG.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
      radG.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = radG;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Subtle vignette
  const vig = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.4,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.85
  );
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);

  // Discrete stylish corner tag
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.font = '600 16px sans-serif';
  ctx.fillText(`#${index + 1} ${theme.title}`, 20, height - 20);

  ctx.restore();

  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  const img = new Image();
  img.src = dataUrl;

  return { dataUrl, width, height, img };
}

/**
 * Generates an array of artistic sample photos with authentic varied aspect ratios.
 */
export function generateSamplePhotos(count: number): Photo[] {
  const photos: Photo[] = [];

  for (let i = 0; i < count; i++) {
    const theme = SAMPLE_THEMES[i % SAMPLE_THEMES.length];
    // Slightly vary aspect ratio so we have realistic camera sensors
    let ar = theme.aspectRatio;
    if (i % 7 === 0) ar = 16 / 9; // 1.778
    else if (i % 7 === 1) ar = 4 / 3; // 1.333
    else if (i % 7 === 2) ar = 3 / 2; // 1.500
    else if (i % 7 === 3) ar = 1.0; // 1.000 Square
    else if (i % 7 === 4) ar = 9 / 16; // 0.5625 Portrait
    else if (i % 7 === 5) ar = 2 / 3; // 0.667 Portrait
    else if (i % 7 === 6) ar = 21 / 9; // 2.333 Ultra-wide

    const { dataUrl, width, height, img } = createThemedCanvasPhoto(theme, i, ar);

    photos.push({
      id: `sample-${i + 1}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: `${theme.title.toLowerCase().replace(/\s+/g, '-')}-${i + 1}.jpg`,
      sourceUrl: dataUrl,
      thumbnailUrl: dataUrl,
      image: img,
      width,
      height,
      aspectRatio: width / height,
      fileSize: Math.round(width * height * 0.4),
      averageColor: theme.palette[0],
      isSample: true,
    });
  }

  return photos;
}
