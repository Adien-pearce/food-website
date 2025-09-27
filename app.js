// Frontend logic: camera / ML detection / backend calls / UI interactivity

// Elements
const startCameraBtn = document.getElementById('startCamera');
const detectFoodsBtn = document.getElementById('detectFoods');
const imageUpload = document.getElementById('imageUpload');
const videoEl = document.getElementById('video');
const canvasEl = document.getElementById('canvas');
const detectedListEl = document.getElementById('detectedList');
const ingredientsEl = document.getElementById('ingredients');
const getRecipesBtn = document.getElementById('getRecipes');
const getChatGPTBtn = document.getElementById('getChatGPT');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const recipesEl = document.getElementById('recipes');
const copyBtn = document.getElementById('copyRecipe');
const contactForm = document.getElementById('contactForm');
const contactResult = document.getElementById('contactResult');

let detector = null;
let stream = null;
let lastDetected = [];

// Food classes to consider (coarse)
const foodClasses = ['apple','banana','orange','broccoli','carrot','pizza','donut','cake','sandwich','hot dog','bottle','bowl','cup','pizza'];

// Helper: show/hide loading
function showLoading(show=true, text='Loading…') {
  loadingEl.style.display = show ? 'block' : 'none';
  loadingEl.textContent = text;
}

// Start camera & load COCO-SSD via ml5
startCameraBtn.addEventListener('click', async () => {
  errorEl.textContent = '';
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    videoEl.srcObject = stream;
    videoEl.play();
    showLoading(true, 'Loading detector…');
    detector = await ml5.objectDetector('cocossd', () => {
      showLoading(false);
      detectFoodsBtn.disabled = false;
      detectFoodsBtn.classList.remove('disabled');
    });
  } catch (err) {
    errorEl.textContent = 'Camera access denied or not available.';
    console.error(err);
    showLoading(false);
  }
});

// Detect from camera frame
detectFoodsBtn.addEventListener('click', () => {
  errorEl.textContent = '';
  if (!detector || !videoEl) { errorEl.textContent = 'Start camera first.'; return; }

  detector.detect(videoEl, (err, results) => {
    if (err) { errorEl.textContent = 'Detection error'; console.error(err); return; }
    const names = results
      .map(r => r.label.toLowerCase())
      .filter(l => foodClasses.includes(l));
    updateDetected(names);
    drawBoxes(results);
  });
});

// Upload image detection
imageUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.src = URL.createObjectURL(file);
  img.onload = () => {
    // draw the image to canvas for user feedback
    canvasEl.width = img.width;
    canvasEl.height = img.height;
    const ctx = canvasEl.getContext('2d');
    ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height);
    if (!detector) {
      // lazy init detector
      ml5.objectDetector('cocossd', (d) => {
        detector = d;
        runDetectOnImage(img);
      });
    } else {
      runDetectOnImage(img);
    }
  };
});

function runDetectOnImage(img) {
  detector.detect(img, (err, results) => {
    if (err) { errorEl.textContent = 'Detection error'; console.error(err); return; }
    const names = results.map(r => r.label.toLowerCase()).filter(l => foodClasses.includes(l));
    updateDetected(names);
    // draw boxes on canvas
    drawBoxes(results, true);
  });
}

function updateDetected(names) {
  lastDetected = [...new Set([...(lastDetected||[]), ...names])];
  detectedListEl.textContent = lastDetected.length ? lastDetected.join(', ') : '—';
  // merge into ingredients textarea
  const existing = ingredientsEl.value.split(',').map(s=>s.trim()).filter(Boolean);
  const merged = [...new Set([...existing, ...lastDetected])];
  ingredientsEl.value = merged.join(', ');
}

// Draw detection boxes (camera or image)
function drawBoxes(results, canvasImage=false) {
  const ctx = canvasEl.getContext('2d');
  // ensure canvas matches video
  if (!canvasImage) {
    canvasEl.width = videoEl.videoWidth;
    canvasEl.height = videoEl.videoHeight;
    ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(34,139,34,0.9)';
  ctx.fillStyle = 'rgba(34,139,34,0.95)';
  ctx.font = '14px sans-serif';
  results.forEach(r => {
    if (!foodClasses.includes(r.label.toLowerCase())) return;
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.width, r.height);
    ctx.stroke();
    ctx.fillText(r.label, r.x + 6, r.y + 16);
  });
  // hide video if drawing on canvas
  if (!canvasImage) {
    videoEl.style.display = 'none';
    canvasEl.style.display = 'block';
  }
}

// GET RECIPES from backend (Spoonacular)
getRecipesBtn.addEventListener('click', async () => {
  errorEl.textContent = '';
  recipesEl.innerHTML = '';
  copyBtn.style.display = 'none';

  const ingredients = ingredientsEl.value.split(',').map(i=>i.trim()).filter(Boolean);
  if (!ingredients.length) { errorEl.textContent = 'Add some ingredients first.'; return; }

  showLoading(true, 'Fetching recipes from Spoonacular…');
  try {
    const res = await fetch('/api/recipes', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ ingredients })
    });
    if (!res.ok) throw new Error(`Server ${res.status}`);
    const data = await res.json();
    showLoading(false);
    renderSpoonRecipes(data);
  } catch (err) {
    showLoading(false);
    errorEl.textContent = 'Error fetching recipes. See console.';
    console.error(err);
  }
});

// GET ChatGPT suggestions (proxy to OpenAI)
getChatGPTBtn.addEventListener('click', async () => {
  errorEl.textContent = '';
  recipesEl.innerHTML = '';
  copyBtn.style.display = 'none';

  const ingredients = ingredientsEl.value.split(',').map(i=>i.trim()).filter(Boolean);
  if (!ingredients.length) { errorEl.textContent = 'Add some ingredients first.'; return; }

  showLoading(true, 'Asking ChatGPT for creative recipe ideas…');
  try {
    const prompt = `Suggest 3 simple recipes using these leftover ingredients: ${ingredients.join(', ')}. Provide short ingredients list, steps, and approx prep time. Keep concise.`;
    const res = await fetch('/api/chat', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ prompt })
    });
    if (!res.ok) throw new Error(`Server ${res.status}`);
    const data = await res.json();
    showLoading(false);
    const text = data.text || 'No response';
    recipesEl.innerHTML = `<div class="recipe-card"><div class="recipe-content"><div class="recipe-title">ChatGPT Suggestions</div><div class="recipe-meta" id="chatText">${escapeHtml(text).replace(/\n/g,'<br>')}</div></div></div>`;
    copyBtn.style.display = 'inline-block';
    copyBtn.onclick = () => { navigator.clipboard.writeText(text); copyBtn.textContent = 'Copied ✓'; setTimeout(()=>copyBtn.textContent='Copy Recipe',1600); };
  } catch (err) {
    showLoading(false);
    errorEl.textContent = 'Error contacting ChatGPT.';
    console.error(err);
  }
});

function renderSpoonRecipes(data){
  if (!Array.isArray(data) || data.length===0) {
    recipesEl.innerHTML = `<div class="muted">No recipes found.</div>`;
    return;
  }
  recipesEl.innerHTML = '';
  let combinedText = '';
  data.forEach(item => {
    const card = document.createElement('div');
    card.className = 'recipe-card';
    card.innerHTML = `
      <img class="recipe-thumb" src="${item.image}" alt="${escapeHtml(item.title)}">
      <div class="recipe-content">
        <div class="recipe-title">${escapeHtml(item.title)}</div>
        <div class="recipe-meta">Used: ${item.usedIngredients?.map(u=>u.name).join(', ') || '—'} · Missed: ${item.missedIngredients?.map(m=>m.name).join(', ') || '—'}</div>
      </div>
    `;
    recipesEl.appendChild(card);
    combinedText += `${item.title}\nUsed: ${item.usedIngredients?.map(u=>u.name).join(', ')}\nMissed: ${item.missedIngredients?.map(m=>m.name).join(', ')}\n\n`;
  });
  copyBtn.style.display = 'inline-block';
  copyBtn.onclick = () => { navigator.clipboard.writeText(combinedText); copyBtn.textContent = 'Copied ✓'; setTimeout(()=>copyBtn.textContent='Copy Recipe',1600); };
}

// Contact form handler (local demo only)
if (contactForm){
  contactForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    const form = new FormData(contactForm);
    contactResult.textContent = 'Thanks! Message received (demo).';
    contactForm.reset();
    setTimeout(()=>contactResult.textContent='',3500);
  });
}

// escape HTML helper
function escapeHtml(s){ if(!s) return ''; return s.replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[m]);}
