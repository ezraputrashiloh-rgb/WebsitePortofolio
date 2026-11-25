
    // ==========================================
    // 1. INDEXEDDB HELPER (PENYIMPANAN MEDIA BESAR)
    // ==========================================
    const DB_NAME = 'NexusDuoMediaDB';
    const STORE_NAME = 'media';

    function openMediaDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function saveMediaToDB(key, fileOrBlob) {
        const db = await openMediaDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(fileOrBlob, key);
            tx.oncomplete = () => resolve(key);
            tx.onerror = () => reject(tx.error);
        });
    }

    async function getMediaUrlFromDB(key) {
        if (!key || !key.startsWith('idb:')) return key; // Jika URL biasa (Unsplash/Catbox), langsung kembalikan
        try {
            const db = await openMediaDB();
            return new Promise((resolve) => {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const req = tx.objectStore(STORE_NAME).get(key);
                req.onsuccess = () => {
                    if (req.result) {
                        resolve(URL.createObjectURL(req.result));
                    } else {
                        resolve('');
                    }
                };
                req.onerror = () => resolve('');
            });
        } catch (e) {
            return '';
        }
    }

    async function deleteMediaFromDB(key) {
        if (!key || !key.startsWith('idb:')) return;
        try {
            const db = await openMediaDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete(key);
        } catch (e) {
            console.error('Gagal menghapus media:', e);
        }
    }

    async function clearMediaDB() {
        try {
            const db = await openMediaDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).clear();
        } catch (e) {}
    }

    // Safe localStorage wrapper (anti QuotaExceededError)
    function safeSetItem(key, value) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (e) {
            console.error('LocalStorage penuh:', e);
            showNotification('Penyimpanan Penuh', 'Gagal menyimpan data teks. Coba hapus beberapa data lama.', false);
            return false;
        }
    }

    // ==========================================
    // 2. INITIAL STATE & AUTH
    // ==========================================
    let currentUser = localStorage.getItem('nexusduo_auth') || null;
    let activeCreator = 'creator1';
    let activeView = 'gallery';

    const authData = {
        'ridho': { id: 'creator1', pass: 'ryoyamada', displayName: 'Ridho' },
        'ezra': { id: 'creator2', pass: '240311', displayName: 'Ezra' }
    };

    const defaultProfiles = {
        creator1: { name: "Ridho Aulia", role: "Lead UI/UX Designer", img: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80", bio: "Berpengalaman merancang antarmuka produk digital berpusat pada pengguna." },
        creator2: { name: "Shiloh Ezra", role: "Senior Fullstack Developer", img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80", bio: "Spesialis pengembangan arsitektur web modern dan optimasi backend." }
    };

    async function resetAllData() {
        if (confirm("Apakah Anda yakin ingin mereset seluruh data (Profil, Karya, & Cover)?")) {
            localStorage.clear();
            await clearMediaDB();
            location.reload();
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

    function handleLoginSubmit(e) {
        e.preventDefault();
        const user = document.getElementById('loginUser').value.trim().toLowerCase();
        const pass = document.getElementById('loginPass').value.trim();

        if (authData[user] && authData[user].pass === pass) {
            currentUser = authData[user].id;
            safeSetItem('nexusduo_auth', currentUser);
            closeLoginModal();
            showNotification('Login Berhasil', `Selamat datang, ${authData[user].displayName}!`);
            switchCreatorTab(currentUser);
        } else {
            document.getElementById('loginError').classList.remove('hidden');
        }
    }

    function handleLogout() {
        currentUser = null;
        localStorage.removeItem('nexusduo_auth');
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
    // 3. UI HELPERS
    // ==========================================
    function toggleTheme() { document.documentElement.classList.toggle('dark'); }
    function toggleMobileMenu() { document.getElementById('mobileMenu').classList.toggle('hidden'); }

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

    // ==========================================
    // 4. PROFILES (INDEXEDDB READY)
    // ==========================================
    function getStoredProfiles() {
        try {
            const data = localStorage.getItem('nexusduo_profiles');
            return data ? JSON.parse(data) : defaultProfiles;
        } catch (e) { return defaultProfiles; }
    }

    async function renderProfiles() {
        const profiles = getStoredProfiles();
        if (profiles.creator1) {
            document.getElementById('creator1Name').innerText = profiles.creator1.name || "Nama Kosong";
            document.getElementById('creator1Role').innerText = profiles.creator1.role || "-";
            document.getElementById('creator1Img').src = await getMediaUrlFromDB(profiles.creator1.img) || defaultProfiles.creator1.img;
            document.getElementById('creator1Bio').innerText = profiles.creator1.bio || "-";
        }
        if (profiles.creator2) {
            document.getElementById('creator2Name').innerText = profiles.creator2.name || "Nama Kosong";
            document.getElementById('creator2Role').innerText = profiles.creator2.role || "-";
            document.getElementById('creator2Img').src = await getMediaUrlFromDB(profiles.creator2.img) || defaultProfiles.creator2.img;
            document.getElementById('creator2Bio').innerText = profiles.creator2.bio || "-";
        }
    }

    function openProfileModal(key) {
        const profiles = getStoredProfiles();
        const p = profiles[key];
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
        const profiles = getStoredProfiles();
        const fileInput = document.getElementById('modalProfileFile');

        let imgKey = profiles[key].img;
        if (fileInput.files && fileInput.files[0]) {
            imgKey = `idb:profile_${key}`;
            await saveMediaToDB(imgKey, fileInput.files[0]);
        }

        profiles[key] = {
            name: document.getElementById('modalProfileName').value,
            role: document.getElementById('modalProfileRole').value,
            bio: document.getElementById('modalProfileBio').value,
            img: imgKey
        };

        if (safeSetItem('nexusduo_profiles', JSON.stringify(profiles))) {
            await renderProfiles();
            closeProfileModal();
            showNotification('Berhasil', 'Profil telah diupdate.');
        }
    }

    // ==========================================
    // 5. COVER (INDEXEDDB READY)
    // ==========================================
    function openCoverModal() {
        document.getElementById('modalCoverTitle').value = document.getElementById('coverTitleText').innerText;
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

        const existingCover = JSON.parse(localStorage.getItem('nexusduo_cover') || '{}');
        let imageKey = existingCover.url || document.getElementById('coverPreviewImg').src;

        if (fileInput.files && fileInput.files[0]) {
            imageKey = 'idb:hero_cover';
            await saveMediaToDB(imageKey, fileInput.files[0]);
        }

        const coverData = { url: imageKey, title: titleInput || "Studio Utama" };
        if (safeSetItem('nexusduo_cover', JSON.stringify(coverData))) {
            document.getElementById('coverPreviewImg').src = await getMediaUrlFromDB(coverData.url);
            document.getElementById('coverTitleText').innerText = coverData.title;
            closeCoverModal();
            showNotification('Berhasil', 'Cover berhasil diperbarui.');
        }
    }

    // ==========================================
    // 6. PORTFOLIO (INDEXEDDB READY)
    // ==========================================
    function getStoredProjects() {
        try {
            const data = localStorage.getItem('nexusduo_projects');
            if (data) {
                const parsed = JSON.parse(data);
                return {
                    creator1: Array.isArray(parsed.creator1) ? parsed.creator1 : [],
                    creator2: Array.isArray(parsed.creator2) ? parsed.creator2 : []
                };
            }
        } catch (e) {}
        return { creator1: [], creator2: [] };
    }

    function saveStoredProjects(projects) {
        return safeSetItem('nexusduo_projects', JSON.stringify(projects));
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

    async function renderProjects() {
        const allProjects = getStoredProjects();
        const list = allProjects[activeCreator] || [];
        const grid = document.getElementById('projectsGrid');
        document.getElementById('projectCountBadge').innerText = `${list.length} Karya`;
        grid.innerHTML = "";

        if (list.length === 0) {
            grid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-500 glass-card rounded-2xl">Belum ada karya yang diunggah.</div>`;
            return;
        }

        for (const proj of list) {
            const mediaSrc = await getMediaUrlFromDB(proj.media);
            const card = document.createElement('div');
            card.className = "glass-card rounded-2xl overflow-hidden shadow-lg flex flex-col justify-between";

            const mediaElement = proj.mediaType === 'video'
                ? `<div class="relative h-48 bg-slate-950 flex items-center justify-center"><video src="${mediaSrc}" controls class="w-full h-full object-cover"></video></div>`
                : `<div class="relative h-48 bg-slate-900"><img src="${mediaSrc}" class="w-full h-full object-cover transition-transform duration-500 hover:scale-105"></div>`;

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
        }
    }

    async function handlePortfolioSubmit(e) {
        e.preventDefault();
        if (currentUser !== activeCreator) return;

        const editId = document.getElementById('editProjectId').value;
        const title = document.getElementById('projectTitle').value;
        const desc = document.getElementById('projectDesc').value;
        const note = document.getElementById('projectNote').value;
        const fileInput = document.getElementById('projectFile');
        const allProjects = getStoredProjects();
        let list = allProjects[activeCreator] || [];

        const projectId = editId ? Number(editId) : Date.now();
        let mediaKey = "";
        let mediaType = "image";

        if (editId) {
            const existing = list.find(p => p.id == editId);
            if (existing) {
                mediaKey = existing.media;
                mediaType = existing.mediaType || "image";
            }
        }

        if (fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            mediaType = file.type.startsWith('video') ? 'video' : 'image';
            mediaKey = `idb:project_${projectId}`;
            try {
                await saveMediaToDB(mediaKey, file);
            } catch (err) {
                showNotification('Gagal Upload', 'Penyimpanan browser penuh atau file terlalu besar.', false);
                return;
            }
        }

        if (!mediaKey && !editId) {
            showNotification('Gagal', 'Silakan pilih foto/video', false);
            return;
        }

        if (editId) {
            const index = list.findIndex(p => p.id == editId);
            list[index] = { id: projectId, title, media: mediaKey, mediaType, desc, note };
            showNotification('Berhasil', 'Karya diperbarui.');
        } else {
            list.unshift({ id: projectId, title, media: mediaKey, mediaType, desc, note });
            showNotification('Berhasil', 'Karya ditambahkan.');
        }

        allProjects[activeCreator] = list;
        if (saveStoredProjects(allProjects)) {
            resetPortfolioForm();
            await renderProjects();
            switchDashboardView('gallery');
        }
    }

    function editProject(creatorKey, id) {
        const list = getStoredProjects()[creatorKey] || [];
        const proj = list.find(p => p.id == id);
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
        if (!confirm("Yakin ingin menghapus karya ini?")) return;
        const all = getStoredProjects();
        const target = (all[creatorKey] || []).find(p => p.id == id);
        if (target && target.media) {
            await deleteMediaFromDB(target.media); // Hapus file dari IndexedDB
        }
        all[creatorKey] = (all[creatorKey] || []).filter(p => p.id != id);
        saveStoredProjects(all);
        await renderProjects();
        showNotification('Dihapus', 'Karya berhasil dihapus.', true);
    }

    // Bonus: Handler Form Kontak agar tidak error
    function handleContactSubmit(e) {
        e.preventDefault();
        e.target.reset();
        showNotification('Pesan Terkirim', 'Terima kasih! Tim NexusDuo akan segera menghubungi Anda.');
    }

    // ==========================================
    // 7. INITIALIZATION
    // ==========================================
    window.onload = async function() {
        try {
            await renderProfiles();
            switchCreatorTab('creator1'); // Sekaligus memperbaiki judul awal "Karya Alana"

            const storedCover = localStorage.getItem('nexusduo_cover');
            if (storedCover) {
                const c = JSON.parse(storedCover);
                if (c.url) document.getElementById('coverPreviewImg').src = await getMediaUrlFromDB(c.url);
                if (c.title) document.getElementById('coverTitleText').innerText = c.title;
            }
        } catch (e) {
            console.error("Initialization Error:", e);
            showNotification('Peringatan', 'Terjadi masalah memuat data. Gunakan tombol Reset di Navbar.', false);
        }
    };