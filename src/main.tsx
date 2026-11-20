import {StrictMode} from 'react';
import "./nahj-atlas.css";

import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './beauty-pass.css';
import './elevation.css';
import './polish.css';
import './motion.css';
import './finish.css';
import './duo.css';
import './duo-beauty.css';
import './duo-beauty-3.css';
import './duo-beauty-4.css';
import './duo-beauty-5.css';
import './responsive-2026-11.css';
import './duo-adaptive.css';
import './duo-device.css';
import {installDuoMarkers} from './lib/duo-markers';

/* علامات iPhone Duo على الجذر (data-device، data-shell، data-widget-side) — تُقرأ في duo-device.css وحده. */
installDuoMarkers();

/* تشخيص ركن الودجت (iPhone Duo): لا يُحمَّل إلا مع ?duo-debug=1 (public/duo-debug.js). */
if (new URLSearchParams(window.location.search).get('duo-debug') === '1') {
  const dbg = document.createElement('script'); dbg.src = '/duo-debug.js'; document.head.appendChild(dbg);
}

const started = performance.now();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
requestAnimationFrame(()=>requestAnimationFrame(()=>{
  const splash=document.getElementById('nahj-splash');
  if(!splash)return;
  const delay=Math.max(0,900-(performance.now()-started));
  window.setTimeout(()=>{splash.classList.add('out');window.setTimeout(()=>splash.remove(),420)},delay);
}));
