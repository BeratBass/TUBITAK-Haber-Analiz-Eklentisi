document.addEventListener('DOMContentLoaded', () => {
    // Anlık verileri güncelleme fonksiyonu
    function updateData() {
        console.log("Veriler güncelleniyor...");
        const baslikElement = document.getElementById('baslik');
        const sonucElement = document.getElementById('sonuc');
        const metinElement = document.getElementById('metin');

        // Backend'den son analizi al
        fetch("http://127.0.0.1:5000/veriler-data", {
            method: "GET",
            headers: { "Content-Type": "application/json" }
        })
            .then(res => {
                if (!res.ok) throw new Error(`HTTP hatası: ${res.status}`);
                return res.json();
            })
            .then(responseData => {
                console.log("Son analiz alındı:", responseData);
                if (responseData.error) {
                    displayError(responseData.error);
                    return;
                }
                displayData(responseData);
            })
            .catch(error => {
                console.error('Veri güncelleme hatası:', error);
                displayError(error.message);
            });
    }

    // Verileri görüntüleme fonksiyonu
    function displayData(responseData) {
        const baslikElement = document.getElementById('baslik');
        const sonucElement = document.getElementById('sonuc');
        const metinElement = document.getElementById('metin');

        if (responseData.error) {
            displayError(responseData.error);
        } else {
            if (baslikElement) {
                baslikElement.textContent = responseData.baslik || "Başlık Bulunamadı (Otomatik)";
            }
            if (sonucElement) {
                sonucElement.textContent = responseData.durum + (responseData.derece > 0 ? ` (${responseData.derece}/10)` : '');
                sonucElement.className = 'box sonuc-box ' + (responseData.durum === 'Olumlu' ? 'positive' : 'negative');
            }
            if (metinElement) {
                metinElement.innerHTML = `<h3>Metin</h3>${responseData.metin || "Metin Yok"}`;
            }
        }
    }

    // Hata görüntüleme fonksiyonu
    function displayError(message) {
        const baslikElement = document.getElementById('baslik');
        const sonucElement = document.getElementById('sonuc');
        const metinElement = document.getElementById('metin');

        if (baslikElement) baslikElement.textContent = "Başlık Bulunamadı";
        if (sonucElement) {
            sonucElement.textContent = `Hata: ${message || "Bilinmeyen hata"}`;
            sonucElement.className = 'box sonuc-box error';
        }
        if (metinElement) metinElement.innerHTML = "<h3>Metin</h3>Metin Yok";
        alert(`Veri güncelleme hatası: ${message || "Bilinmeyen hata"}`);
    }

    // Tab geçiş olayları
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const tabContent = document.getElementById(tab.getAttribute('data-tab'));
            if (tabContent) tabContent.classList.add('active');
            if (tab.getAttribute('data-tab') === 'admin') {
                loadAllUsers(1, document.getElementById('search-users')?.value || '');
            } else if (tab.getAttribute('data-tab') === 'anlik') {
                updateData();
            }
        });
    });

    // Kullanıcı arama
    const searchUsers = document.getElementById('search-users');
    if (searchUsers) {
        searchUsers.addEventListener('input', (e) => {
            loadAllUsers(1, e.target.value);
        });
    }

    // Güncelle butonu
    const updateBtn = document.getElementById('update-btn');
    if (updateBtn) {
        updateBtn.addEventListener('click', () => {
            updateData();
        });
    }

    // Tüm kullanıcıları yükleme
    function loadAllUsers(page = 1, search = '') {
        fetch(`http://127.0.0.1:5000/all-users?search=${encodeURIComponent(search)}`, {
            method: 'GET'
        })
            .then(response => {
                if (!response.ok) throw new Error(`HTTP hatası: ${response.status}`);
                return response.json();
            })
            .then(userData => {
                const tbody = document.getElementById('users-table-body');
                const pagination = document.getElementById('admin-pagination');
                if (tbody) tbody.innerHTML = '';
                if (pagination) pagination.innerHTML = '';

                if (userData.length === 0) {
                    if (tbody) tbody.innerHTML = '<tr><td colspan="7">Henüz kullanıcı yok.</td></tr>';
                    return;
                }

                const itemsPerPage = 5;
                const start = (page - 1) * itemsPerPage;
                const end = start + itemsPerPage;
                const paginatedData = userData.slice(start, end);

                paginatedData.forEach(user => {
                    const userId = `${user.isim}_${user.soyisim}_${user.email}_${user.yas}_${user.sehir}`;
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${user.isim}</td>
                        <td>${user.soyisim}</td>
                        <td>${user.email}</td>
                        <td>${user.yas}</td>
                        <td>${user.sehir}</td>
                        <td>${user.analiz_sayisi}</td>
                        <td>
                            <button class="edit-user-button" data-user-id="${userId}">Düzenle</button>
                            <button class="delete-user-button" data-user-id="${userId}">Sil</button>
                        </td>
                    `;
                    if (tbody) tbody.appendChild(row);
                });

                const totalPages = Math.ceil(userData.length / itemsPerPage);
                for (let i = 1; i <= totalPages; i++) {
                    const button = document.createElement('button');
                    button.textContent = i;
                    button.addEventListener('click', () => loadAllUsers(i, search));
                    if (i === page) button.disabled = true;
                    if (pagination) pagination.appendChild(button);
                }

                document.querySelectorAll('.delete-user-button').forEach(button => {
                    button.addEventListener('click', () => {
                        const userId = button.getAttribute('data-user-id');
                        deleteUser(userId);
                    });
                });

                document.querySelectorAll('.edit-user-button').forEach(button => {
                    button.addEventListener('click', () => {
                        const userId = button.getAttribute('data-user-id');
                        editUser(userId);
                    });
                });
            })
            .catch(error => {
                console.error('Kullanıcılar yüklenemedi:', error);
                const tbody = document.getElementById('users-table-body');
                if (tbody) {
                    tbody.innerHTML = `<tr><td colspan="7">Hata: Kullanıcılar yüklenemedi (${error.message})</td></tr>`;
                }
                alert(`Kullanıcılar yüklenemedi: ${error.message}`);
            });
    }

    // Kullanıcı silme
    function deleteUser(userId) {
        if (confirm(`Kullanıcı ${userId} silinecek, emin misiniz?`)) {
            fetch('http://127.0.0.1:5000/delete-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            })
                .then(response => {
                    if (!response.ok) throw new Error(`HTTP hatası: ${response.status}`);
                    return response.json();
                })
                .then(deleteData => {
                    alert(deleteData.message);
                    loadAllUsers(1, document.getElementById('search-users')?.value || '');
                })
                .catch(error => alert(`Silme hatası: ${error.message}`));
        }
    }

    // Kullanıcı düzenleme
    function editUser(userId) {
        const [isim, soyisim, email, yas, sehir] = userId.split('_');
        const editModal = document.getElementById('edit-user-modal');
        if (editModal) {
            editModal.style.display = 'block';
            const editIsim = document.getElementById('edit-isim');
            const editSoyisim = document.getElementById('edit-soyisim');
            const editEmail = document.getElementById('edit-email');
            const editYas = document.getElementById('edit-yas');
            const editSehir = document.getElementById('edit-sehir');
            const editUserId = document.getElementById('edit-user-id');
            if (editIsim) editIsim.value = isim;
            if (editSoyisim) editSoyisim.value = soyisim;
            if (editEmail) editEmail.value = email;
            if (editYas) editYas.value = yas;
            if (editSehir) editSehir.value = sehir;
            if (editUserId) editUserId.value = userId;
        }
    }

    // Kullanıcı düzenleme modalı HTML
    const modalHTML = `
        <div id="edit-user-modal" class="modal" style="display: none;">
            <div class="modal-content">
                <h3>Kullanıcı Düzenle</h3>
                <input type="text" id="edit-isim" placeholder="İsim" required />
                <input type="text" id="edit-soyisim" placeholder="Soyisim" required />
                <input type="email" id="edit-email" placeholder="E-posta" required />
                <input type="number" id="edit-yas" placeholder="Yaş" min="1" max="120" required />
                <input type="text" id="edit-sehir" placeholder="Şehir" required />
                <input type="hidden" id="edit-user-id" />
                <button id="save-user-changes-btn">Kaydet</button>
                <button id="cancel-user-edit-btn">İptal</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Modal kaydet butonu
    const saveUserChangesBtn = document.getElementById('save-user-changes-btn');
    if (saveUserChangesBtn) {
        saveUserChangesBtn.addEventListener('click', () => {
            const userId = document.getElementById('edit-user-id')?.value;
            const yeniIsim = document.getElementById('edit-isim')?.value.trim();
            const yeniSoyisim = document.getElementById('edit-soyisim')?.value.trim();
            const yeniEmail = document.getElementById('edit-email')?.value.trim();
            const yeniYas = document.getElementById('edit-yas')?.value.trim();
            const yeniSehir = document.getElementById('edit-sehir')?.value.trim();

            if (!yeniIsim || !yeniSoyisim || !yeniEmail || !yeniYas || !yeniSehir) {
                alert('Tüm alanlar doldurulmalı!');
                return;
            }

            fetch('http://127.0.0.1:5000/update-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    new_isim: yeniIsim,
                    new_soyisim: yeniSoyisim,
                    new_email: yeniEmail,
                    new_yas: yeniYas,
                    new_sehir: yeniSehir
                })
            })
                .then(response => {
                    if (!response.ok) throw new Error(`HTTP hatası: ${response.status}`);
                    return response.json();
                })
                .then(updateData => {
                    alert(updateData.message);
                    const editModal = document.getElementById('edit-user-modal');
                    if (editModal) editModal.style.display = 'none';
                    loadAllUsers(1, document.getElementById('search-users')?.value || '');
                })
                .catch(error => alert(`Düzenleme hatası: ${error.message}`));
        });
    }

    // Modal iptal butonu
    const cancelUserEditBtn = document.getElementById('cancel-user-edit-btn');
    if (cancelUserEditBtn) {
        cancelUserEditBtn.addEventListener('click', () => {
            const editModal = document.getElementById('edit-user-modal');
            if (editModal) editModal.style.display = 'none';
        });
    }

    // İlk yüklemede verileri güncelle
    updateData();
});