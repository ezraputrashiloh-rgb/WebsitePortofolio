// ==========================================
// 1. KONFIGURASI (DIMUAT DARI config.json)
// ==========================================
let GITHUB_CONFIG = { owner: '', repo: '', branch: 'main', dataPath: 'data/db.json' };
let creatorEmails = {};
let authData = {};
let githubToken = null;

const defaultData = {
    cover: {
        url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1000&q=80",
        title: "Studio Utama"
    },
    profiles: {
        creator1: {
            name: "Ridho Aulia",
            role: "Lead UI/UX Designer",
            img: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
            bio: "Berpengalaman merancang antarmuka produk digital berpusat pada pengguna."
        },
        creator2: {
            name: "Shiloh Ezra",
            role: "Senior Fullstack Developer",
            img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80",
            bio: "Spesialis pengembangan arsitektur web modern dan optimasi backend."
        }
    },
    projects: { creator1: [], creator2: [] }
};

// State di memori (bukan localStorage)
let appData = structuredClone(defaultData);
let dbFileSha = null;
let currentUser = sessionStorage.getItem('nexusduo_auth') || null;
let activeCreator = 'creator1';
let activeView = 'gallery';

async function loadAppConfig() {
    try {
        const res = await fetch(`./config.json?t=${Date.now()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const cfg = await res.json();
        GITHUB_CONFIG = cfg.githubConfig || GITHUB_CONFIG;
        creatorEmails = cfg.creatorEmails || {};
        authData = cfg.authData || {};
        githubToken = cfg.githubToken || null;
    } catch (err) {
        console.error('Gagal memuat config.json:', err);
        showNotification('Error Konfigurasi', 'File config.json gagal dimuat. Jalankan lewat Live Server/Hosting.', false);
    }
}

// ==========================================
// 2. GITHUB REST API HELPERS
// ==========================================
function getApiUrl(path) {
    return `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${path}`;
}

function getRawUrl(path) {
    return `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${path}`;
}

function utf8ToBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

function base64ToUtf8(str) {
    return decodeURIComponent(escape(atob(str)));
}

function fileToPureBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = err => reject(err);
    });
}

async function loadDatabaseFromGitHub() {
    if (!GITHUB_CONFIG.owner || !GITHUB_CONFIG.repo) return;

    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (githubToken) headers['Authorization'] = `Bearer ${githubToken}`;

    try {
        const res = await fetch(`${getApiUrl(GITHUB_CONFIG.dataPath)}?ref=${GITHUB_CONFIG.branch}&t=${Date.now()}`, { headers });
        if (res.status === 404) {
            appData = structuredClone(defaultData);
            dbFileSha = null;
            return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const fileData = await res.json();
        dbFileSha = fileData.sha;
        const parsed = JSON.parse(base64ToUtf8(fileData.content));
        appData = {
            cover: parsed.cover || defaultData.cover,
            profiles: parsed.profiles || defaultData.profiles,
            projects: {
                creator1: Array.isArray(parsed.projects?.creator1) ? parsed.projects.creator1 : [],
                creator2: Array.isArray(parsed.projects?.creator2) ? parsed.projects.creator2 : []
            }
        };
    } catch (err) {
        console.error('Gagal memuat dari GitHub:', err);
        showNotification('Info', 'Menggunakan data default (pastikan konfigurasi repo di config.json benar).', false);
    }
}

async function saveDatabaseToGitHub(commitMessage) {
    if (!githubToken) {
        showNotification('Token Kosong', 'Periksa githubToken di dalam file config.json.', false);
        return false;
    }

    const body = {
        message: commitMessage,
        content: utf8ToBase64(JSON.stringify(appData, null, 2)),
        branch: GITHUB_CONFIG.branch
    };
    if (dbFileSha) body.sha = dbFileSha;

    const res = await fetch(getApiUrl(GITHUB_CONFIG.dataPath), {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const err = await res.json();
        console.error('GitHub Save Error:', err);
        showNotification('Gagal Simpan ke GitHub', err.message || 'Periksa izin Token Anda.', false);
        return false;
    }

    const result = await res.json();
    dbFileSha = result.content.sha;
    return true;
}

async function uploadMediaToGitHub(file, prefix = 'media') {
    if (!githubToken) throw new Error('Token GitHub tidak ditemukan di config.json.');

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `uploads/${prefix}_${Date.now()}_${safeName}`;
    const base64Content = await fileToPureBase64(file);

    const res = await fetch(getApiUrl(filePath), {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: `Upload media: ${filePath}`,
            content: base64Content,
            branch: GITHUB_CONFIG.branch
        })
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Gagal upload media ke GitHub');
    }

    return getRawUrl(filePath);
}

// ==========================================
// 3. AUTHENTICATION & RESET
// ==========================================
async function resetAllData() {
    if (!currentUser) {
        showNotification('Akses Ditolak', 'Silakan login sebagai kreator untuk mereset data repo.', false);
        return;
    }
    if (confirm("Reset seluruh data di GitHub Repository ke setelan awal?")) {
        appData = structuredClone(defaultData);
        const ok = await saveDatabaseToGitHub('Reset data NexusDuo ke default');
        if (ok) location.reload();
    }
}

function openLoginModal() {
    document.getElementById('loginModal').classList.remove('hidden');
    document.getElementById('loginModal').classList.add('flex');
    document.getElementById('loginError').classList.add('hidden');
    document.getElementById('loginUser').value = "";
    document.getElementById('loginPass').value = "";
}

function closeLoginModal() {
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('loginModal').classList.remove('flex');
}

async function handleLoginSubmit(e) {
    e.preventDefault();
    const user = document.getElementById('loginUser').value.trim().toLowerCase();
    const pass = document.getElementById('loginPass').value.trim();

    if (authData[user] && authData[user].pass === pass) {
        currentUser = authData[user].id;
        sessionStorage.setItem('nexusduo_auth', currentUser);
        closeLoginModal();
        showNotification('Login Berhasil', `Selamat datang, ${authData[user].displayName}!`);
        switchCreatorTab(currentUser);
    } else {
        document.getElementById('loginError').classList.remove('hidden');
    }
}

function handleLogout() {
    currentUser = null;
    sessionStorage.removeItem('nexusduo_auth');
    switchDashboardView('gallery');
    updateAuthUI();
    showNotification('Logout Berhasil', 'Sesi edit Anda telah ditutup.', false);
}

function updateAuthUI() {
    const btnDesk = document.getElementById('navAuthBtn');
    const btnMob = document.getElementById('navAuthBtnMobile');

    if (currentUser) {
        btnDesk.innerHTML = `<i class="fa-solid fa-arrow-right-from-bracket mr-2"></i> Logout`;
        btnDesk.onclick = handleLogout;
        btnDesk.classList.replace('bg-indigo-600', 'bg-red-600');
        btnDesk.classList.replace('hover:bg-indigo-700', 'hover:bg-red-700');
        btnMob.innerHTML = `<i class="fa-solid fa-arrow-right-from-bracket mr-2"></i> Logout`;
        btnMob.onclick = () => { handleLogout(); toggleMobileMenu(); };
    } else {
        btnDesk.innerHTML = `<i class="fa-solid fa-right-to-bracket mr-2"></i> Login`;
        btnDesk.onclick = openLoginModal;
        btnDesk.classList.replace('bg-red-600', 'bg-indigo-600');
        btnDesk.classList.replace('hover:bg-red-700', 'hover:bg-indigo-700');
        btnMob.innerHTML = `<i class="fa-solid fa-right-to-bracket mr-2"></i> Login Kreator`;
        btnMob.onclick = () => { openLoginModal(); toggleMobileMenu(); };
    }

    document.getElementById('editCoverWrapper').style.display = currentUser ? 'flex' : 'none';
    document.getElementById('editProfileBtn1').style.display = (currentUser === 'creator1') ? 'block' : 'none';
    document.getElementById('editProfileBtn2').style.display = (currentUser === 'creator2') ? 'block' : 'none';

    if (currentUser === activeCreator) {
        document.getElementById('dashboardFormWrapper').classList.remove('hidden');
        document.getElementById('dashboardAuthNotice').classList.add('hidden');
    } else {
        document.getElementById('dashboardFormWrapper').classList.add('hidden');
        document.getElementById('dashboardAuthNotice').classList.remove('hidden');
    }
    renderProjects();
}

// ==========================================
// 4. UI HELPERS & NAVIGATION
// ==========================================
function toggleTheme() {
    document.documentElement.classList.toggle('dark');
}

function toggleMobileMenu() {
    document.getElementById('mobileMenu').classList.toggle('hidden');
}

function showNotification(title, desc, isSuccess = true) {
    const box = document.getElementById('notificationBox');
    document.getElementById('notifTitle').innerText = title;
    document.getElementById('notifDesc').innerText = desc;
    document.getElementById('notifIcon').className = isSuccess
        ? "w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shrink-0"
        : "w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center text-white shrink-0";
    box.classList.remove('translate-y-32', 'opacity-0');
    setTimeout(() => box.classList.add('translate-y-32', 'opacity-0'), 3500);
}

function switchDashboardView(view) {
    activeView = view;
    const galleryView = document.getElementById('galleryView');
    const uploadView = document.getElementById('uploadView');
    const btnGallery = document.getElementById('viewGalleryBtn');
    const btnUpload = document.getElementById('viewUploadBtn');
    const activeColor = activeCreator === 'creator1' ? 'bg-indigo-600' : 'bg-violet-600';

    if (view === 'gallery') {
        galleryView.classList.remove('hidden');
        uploadView.classList.add('hidden');
        btnGallery.className = `px-4 py-2 rounded-xl text-sm font-semibold ${activeColor} text-white shadow transition-all`;
        btnUpload.className = "px-4 py-2 rounded-xl text-sm font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 transition-all";
    } else {
        galleryView.classList.add('hidden');
        uploadView.classList.remove('hidden');
        btnUpload.className = `px-4 py-2 rounded-xl text-sm font-semibold ${activeColor} text-white shadow transition-all`;
        btnGallery.className = "px-4 py-2 rounded-xl text-sm font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 transition-all";
    }
}

function cancelEdit() {
    resetPortfolioForm();
    switchDashboardView('gallery');
}

// ==========================================
// 5. RENDER & CRUD (PROFILES, COVER, PROJECTS)
// ==========================================
function renderAll() {
    renderProfiles();
    document.getElementById('coverPreviewImg').src = appData.cover.url;
    document.getElementById('coverTitleText').innerText = appData.cover.title;
    renderProjects();
}

function renderProfiles() {
    const p1 = appData.profiles.creator1;
    const p2 = appData.profiles.creator2;
    if (p1) {
        document.getElementById('creator1Name').innerText = p1.name;
        document.getElementById('creator1Role').innerText = p1.role;
        document.getElementById('creator1Img').src = p1.img;
        document.getElementById('creator1Bio').innerText = p1.bio;
    }
    if (p2) {
        document.getElementById('creator2Name').innerText = p2.name;
        document.getElementById('creator2Role').innerText = p2.role;
        document.getElementById('creator2Img').src = p2.img;
        document.getElementById('creator2Bio').innerText = p2.bio;
    }
}

function openProfileModal(key) {
    const p = appData.profiles[key];
    document.getElementById('editProfileKey').value = key;
    document.getElementById('profileModalTitle').innerText = `Edit Profil ${p.name}`;
    document.getElementById('modalProfileName').value = p.name;
    document.getElementById('modalProfileRole').value = p.role;
    document.getElementById('modalProfileFile').value = "";
    document.getElementById('modalProfileBio').value = p.bio;
    document.getElementById('profileModal').classList.remove('hidden');
    document.getElementById('profileModal').classList.add('flex');
}

function closeProfileModal() {
    document.getElementById('profileModal').classList.add('hidden');
    document.getElementById('profileModal').classList.remove('flex');
}

async function handleProfileSubmit(e) {
    e.preventDefault();
    const key = document.getElementById('editProfileKey').value;
    const fileInput = document.getElementById('modalProfileFile');
    showNotification('Menyimpan...', 'Mengunggah perubahan profil ke GitHub.');

    try {
        let imgUrl = appData.profiles[key].img;
        if (fileInput.files && fileInput.files[0]) {
            imgUrl = await uploadMediaToGitHub(fileInput.files[0], `profile_${key}`);
        }

        appData.profiles[key] = {
            name: document.getElementById('modalProfileName').value,
            role: document.getElementById('modalProfileRole').value,
            bio: document.getElementById('modalProfileBio').value,
            img: imgUrl
        };

        if (await saveDatabaseToGitHub(`Update profil ${key}`)) {
            renderProfiles();
            closeProfileModal();
            showNotification('Berhasil', 'Profil tersimpan di GitHub.');
        }
    } catch (err) {
        showNotification('Gagal', err.message, false);
    }
}

function openCoverModal() {
    document.getElementById('modalCoverTitle').value = appData.cover.title;
    document.getElementById('modalCoverFile').value = "";
    document.getElementById('coverModal').classList.remove('hidden');
    document.getElementById('coverModal').classList.add('flex');
}

function closeCoverModal() {
    document.getElementById('coverModal').classList.add('hidden');
    document.getElementById('coverModal').classList.remove('flex');
}

async function applyCoverCustomization() {
    const fileInput = document.getElementById('modalCoverFile');
    const titleInput = document.getElementById('modalCoverTitle').value;
    showNotification('Menyimpan...', 'Mengunggah cover ke GitHub.');

    try {
        let imageUrl = appData.cover.url;
        if (fileInput.files && fileInput.files[0]) {
            imageUrl = await uploadMediaToGitHub(fileInput.files[0], 'cover');
        }

        appData.cover = { url: imageUrl, title: titleInput || "Studio Utama" };
        if (await saveDatabaseToGitHub('Update cover Studio Utama')) {
            document.getElementById('coverPreviewImg').src = appData.cover.url;
            document.getElementById('coverTitleText').innerText = appData.cover.title;
            closeCoverModal();
            showNotification('Berhasil', 'Cover tersimpan di GitHub.');
        }
    } catch (err) {
        showNotification('Gagal', err.message, false);
    }
}

function switchCreatorTab(creator) {
    activeCreator = creator;
    const btn1 = document.getElementById('tabCreator1');
    const btn2 = document.getElementById('tabCreator2');
    const titleElem = document.getElementById('currentDashboardTitle');
    const formTitle = document.getElementById('formPanelTitle');
    const banner = document.getElementById('creatorBanner');

    banner.style.opacity = '0.3';
    setTimeout(() => {
        if (creator === 'creator1') {
            btn1.className = "px-6 py-3 rounded-xl font-semibold text-sm bg-indigo-600 text-white shadow-md";
            btn2.className = "px-6 py-3 rounded-xl font-semibold text-sm text-slate-600 hover:text-slate-900";
            titleElem.innerHTML = `<i class="fa-solid fa-folder-open text-indigo-600"></i> Karya Ridho Aulia`;
            formTitle.innerText = "Tambah Karya Ridho";
            banner.src = "https://files.catbox.moe/okdy73.jpg";
        } else {
            btn2.className = "px-6 py-3 rounded-xl font-semibold text-sm bg-violet-600 text-white shadow-md";
            btn1.className = "px-6 py-3 rounded-xl font-semibold text-sm text-slate-600 hover:text-slate-900";
            titleElem.innerHTML = `<i class="fa-solid fa-folder-open text-violet-600"></i> Karya Shiloh Ezra`;
            formTitle.innerText = "Tambah Karya Ezra";
            banner.src = "https://files.catbox.moe/djvrj4.jpg";
        }
        banner.style.opacity = '1';
    }, 300);

    resetPortfolioForm();
    switchDashboardView('gallery');
    updateAuthUI();
}

function renderProjects() {
    const list = appData.projects[activeCreator] || [];
    const grid = document.getElementById('projectsGrid');
    document.getElementById('projectCountBadge').innerText = `${list.length} Karya`;
    grid.innerHTML = "";

    if (list.length === 0) {
        grid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-500 glass-card rounded-2xl">Belum ada karya yang diunggah.</div>`;
        return;
    }

    list.forEach(proj => {
        const card = document.createElement('div');
        card.className = "glass-card rounded-2xl overflow-hidden shadow-lg flex flex-col justify-between";

        const mediaElement = proj.mediaType === 'video'
            ? `<div class="relative h-48 bg-slate-950 flex items-center justify-center"><video src="${proj.media}" controls class="w-full h-full object-cover"></video></div>`
            : `<div class="relative h-48 bg-slate-900"><img src="${proj.media}" class="w-full h-full object-cover transition-transform duration-500 hover:scale-105" alt="${proj.title}"></div>`;

        let actionButtons = "";
        if (currentUser === activeCreator) {
            actionButtons = `
                <div class="grid grid-cols-2 gap-2 mt-4 border-t border-slate-200 dark:border-slate-800 pt-4">
                    <button onclick="editProject('${activeCreator}', ${proj.id})" class="py-2 rounded-xl bg-indigo-50 text-indigo-600 font-semibold text-xs hover:bg-indigo-600 hover:text-white transition-all"><i class="fa-solid fa-pen mr-1"></i> Edit</button>
                    <button onclick="deleteProject('${activeCreator}', ${proj.id})" class="py-2 rounded-xl bg-red-50 text-red-600 font-semibold text-xs hover:bg-red-600 hover:text-white transition-all"><i class="fa-solid fa-trash-can mr-1"></i> Hapus</button>
                </div>
            `;
        }

        const noteElement = proj.note
            ? `<div class="mt-3 p-3 rounded-xl bg-slate-100 dark:bg-slate-900/60 text-xs border border-slate-200 dark:border-slate-800"><span class="font-semibold block text-slate-700 dark:text-slate-300">Catatan:</span><span class="text-slate-500">${proj.note}</span></div>`
            : '';

        card.innerHTML = `
            <div>
                ${mediaElement}
                <div class="p-5 space-y-2"><h4 class="font-bold text-lg">${proj.title}</h4><p class="text-xs text-slate-600 dark:text-slate-300">${proj.desc}</p>${noteElement}</div>
            </div>
            <div class="p-5 pt-0">${actionButtons}</div>
        `;
        grid.appendChild(card);
    });
}

async function handlePortfolioSubmit(e) {
    e.preventDefault();
    if (currentUser !== activeCreator) return;

    const submitBtn = document.getElementById('formSubmitBtn');
    const editId = document.getElementById('editProjectId').value;
    const title = document.getElementById('projectTitle').value;
    const desc = document.getElementById('projectDesc').value;
    const note = document.getElementById('projectNote').value;
    const fileInput = document.getElementById('projectFile');
    const list = appData.projects[activeCreator] || [];

    submitBtn.disabled = true;
    submitBtn.innerText = "Mengunggah ke GitHub...";

    try {
        let mediaUrl = "";
        let mediaType = "image";

        if (editId) {
            const existing = list.find(p => p.id == editId);
            if (existing) {
                mediaUrl = existing.media;
                mediaType = existing.mediaType || "image";
            }
        }

        if (fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            mediaType = file.type.startsWith('video') ? 'video' : 'image';
            mediaUrl = await uploadMediaToGitHub(file, `project_${activeCreator}`);
        }

        if (!mediaUrl && !editId) {
            showNotification('Gagal', 'Silakan pilih foto/video', false);
            return;
        }

        if (editId) {
            const index = list.findIndex(p => p.id == editId);
            list[index] = { id: Number(editId), title, media: mediaUrl, mediaType, desc, note };
        } else {
            list.unshift({ id: Date.now(), title, media: mediaUrl, mediaType, desc, note });
        }

        appData.projects[activeCreator] = list;
        if (await saveDatabaseToGitHub(`${editId ? 'Edit' : 'Tambah'} karya: ${title}`)) {
            resetPortfolioForm();
            renderProjects();
            switchDashboardView('gallery');
            showNotification('Berhasil', 'Karya tersimpan di GitHub Repository.');
        }
    } catch (err) {
        showNotification('Gagal Upload', err.message, false);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = editId ? "Simpan Perubahan" : "Publikasikan Karya";
    }
}

function editProject(creatorKey, id) {
    const proj = (appData.projects[creatorKey] || []).find(p => p.id == id);
    if (proj) {
        document.getElementById('editProjectId').value = proj.id;
        document.getElementById('projectTitle').value = proj.title;
        document.getElementById('projectDesc').value = proj.desc;
        document.getElementById('projectNote').value = proj.note || '';
        document.getElementById('formSubmitBtn').innerText = "Simpan Perubahan";
        document.getElementById('formCancelBtn').classList.remove('hidden');
        switchDashboardView('upload');
    }
}

function resetPortfolioForm() {
    document.getElementById('portfolioForm').reset();
    document.getElementById('editProjectId').value = "";
    document.getElementById('formSubmitBtn').innerText = "Publikasikan Karya";
    document.getElementById('formCancelBtn').classList.add('hidden');
}

async function deleteProject(creatorKey, id) {
    if (!confirm("Yakin ingin menghapus karya ini dari GitHub?")) return;
    appData.projects[creatorKey] = (appData.projects[creatorKey] || []).filter(p => p.id != id);
    if (await saveDatabaseToGitHub(`Hapus karya ID ${id}`)) {
        renderProjects();
        showNotification('Dihapus', 'Karya berhasil dihapus dari GitHub.');
    }
}

// ==========================================
// 6. CONTACT FORM (FORMSUBMIT -> GMAIL)
// ==========================================
async function handleContactSubmit(e) {
    e.preventDefault();
    const selectedKey = document.querySelector('input[name="targetCreator"]:checked').value;
    const target = creatorEmails[selectedKey];
    if (!target || !target.email) {
        showNotification('Error', 'Konfigurasi email kreator tidak ditemukan di config.json.', false);
        return;
    }

    const name = document.getElementById('contactName').value.trim();
    const email = document.getElementById('contactEmail').value.trim();
    const message = document.getElementById('contactMessage').value.trim();
    const submitBtn = document.getElementById('contactSubmitBtn');

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Mengirim ke ${target.name}...`;

    try {
        const response = await fetch(`https://formsubmit.co/ajax/${target.email}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({
                _subject: `[NexusDuo] Pesan Baru untuk ${target.name} dari ${name}`,
                _replyto: email,
                _template: "table",
                Nama_Pengirim: name,
                Email_Pengirim: email,
                Tujuan: target.name,
                Pesan: message
            })
        });

        const result = await response.json();
        if (response.ok && result.success !== "false") {
            e.target.reset();
            showNotification('Pesan Terkirim!', `Pesan Anda telah dikirim ke email ${target.name}.`);
        } else {
            throw new Error(result.message || "Gagal mengirim pesan.");
        }
    } catch (error) {
        console.error("Contact Form Error:", error);
        showNotification('Gagal Mengirim', 'Pastikan koneksi internet aktif dan coba lagi.', false);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Kirim Pesan ke NexusDuo";
    }
}

// ==========================================
// 7. INITIALIZATION
// ==========================================
window.onload = async function() {
    await loadAppConfig();
    await loadDatabaseFromGitHub();
    renderAll();
    switchCreatorTab('creator1');
};  