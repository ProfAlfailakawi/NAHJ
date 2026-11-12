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

const started = performance.now();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
requestAnimationFrame(()=>requestAnimationFrame(()=>{
  const splash=document.getElementById('nahj-splash');
  if(!splash)return;
  const delay=Math.max(0,900-(performance.now()-started));
  window.setTimeout(()=>{splash.classList.add('out');window.setTimeout(()=>splash.remove(),420)},delay);
}));
