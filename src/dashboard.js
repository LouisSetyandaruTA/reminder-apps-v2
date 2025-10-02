document.addEventListener('DOMContentLoaded', () => {
    const dbListContainer = document.getElementById('db-list');
    const emptyState = document.getElementById('empty-state');
    const addDbBtn = document.getElementById('add-db-btn');
    const addDbModal = document.getElementById('add-db-modal');
    const addDbForm = document.getElementById('add-db-form');
    const dbNameInput = document.getElementById('db-name');
    const dbIdInput = document.getElementById('db-id');
    const shareEmailInstruction = document.getElementById('share-email-instruction');

    async function loadClientEmail() {
        try {
            const email = await window.electronAPI.getClientEmail();
            if (email && shareEmailInstruction) {
                shareEmailInstruction.innerHTML = `Akses Google Sheet berikut: <a href=\"#\" id=\"open-gsheet-link\" class=\"text-blue-700 underline\">Klik di sini untuk membuka Google Sheet</a> , lalu <strong>buat salinan</strong> Google Sheet tersebut di <strong>Google Drive</strong> anda. <br><br>Bagikan Google Sheet Anda ke alamat email berikut dengan akses <strong>Editor</strong>: <br><strong class=\"text-blue-600 break-all\">${email}</strong> <br><br><a href=\"#\" id=\"open-gdrive-link\" class=\"text-blue-600 underline\">Klik di sini untuk tutorial lebih lanjut</a> `;

                setTimeout(() => {
                    const gsheetLink = document.getElementById('open-gsheet-link');
                    if (gsheetLink) {
                        gsheetLink.addEventListener('click', (e) => {
                            e.preventDefault();
                            if (window.electronAPI && window.electronAPI.openExternalLink) {
                                window.electronAPI.openExternalLink('https://docs.google.com/spreadsheets/d/1sUtn897LSfSagB82uOxd5dTS5vHHapuqeJ1gzn7yLoM/edit?usp=sharing');
                            } else {
                                alert('Fitur buka di browser tidak tersedia.');
                            }
                        });
                    }
                    const gdriveLink = document.getElementById('open-gdrive-link');
                    if (gdriveLink) {
                        gdriveLink.addEventListener('click', (e) => {
                            e.preventDefault();
                            if (window.electronAPI && window.electronAPI.openExternalLink) {
                                window.electronAPI.openExternalLink('https://drive.google.com/drive/folders/18hZ_Kh5fMtb7gVEoxJUzOkVJvFPM7uMp?usp=sharing');
                            } else {
                                alert('Fitur buka di browser tidak tersedia.');
                            }
                        });
                    }
                }, 0);
            }
        } catch (error) {
            console.error('Gagal memuat client email:', error);
            if (shareEmailInstruction) {
                shareEmailInstruction.textContent = 'Gagal memuat email. Pastikan file credentials.json sudah benar.';
            }
        }
    }

    const openModal = () => addDbModal.classList.remove('hidden');
    const closeModal = () => addDbModal.classList.add('hidden');

    async function loadDatabases() {
        const databases = await window.electronAPI.getDatabases();
        dbListContainer.innerHTML = '';
        emptyState.classList.toggle('hidden', databases.length > 0);
        dbListContainer.classList.toggle('hidden', databases.length === 0);

        databases.forEach(db => {
            const card = document.createElement('div');
            card.className = 'db-card bg-white p-6 rounded-lg shadow-md relative';
            card.innerHTML = `
                <div class="flex items-center gap-4 cursor-pointer">
                    <div class="bg-blue-100 p-3 rounded-full"><i data-lucide="database" class="h-6 w-6 text-blue-600"></i></div>
                    <div>
                        <h3 class="text-lg font-bold text-gray-800">${db.name}</h3>
                        <p class="text-xs text-gray-500 break-all">${db.id}</p>
                    </div>
                </div>
                <button data-id="${db.id}" class="delete-btn absolute top-3 right-3 p-1 bg-red-100 text-red-600 rounded-full hover:bg-red-200"><i data-lucide="trash-2" class="h-4 w-4 pointer-events-none"></i></button>
            `;

            card.querySelector('.flex').addEventListener('click', () => {
                window.electronAPI.openReminderForSheet({ id: db.id, name: db.name });
            });
            dbListContainer.appendChild(card);
        });
        lucide.createIcons();
    }

    dbListContainer.addEventListener('click', async (e) => {
        const deleteButton = e.target.closest('.delete-btn');
        if (deleteButton) {
            const dbId = deleteButton.dataset.id;
            const confirmed = confirm('Apakah Anda yakin ingin menghapus database ini?');
            if (confirmed) {
                await window.electronAPI.deleteDatabase(dbId);
                loadDatabases();
            }
        }
    });

    addDbBtn.addEventListener('click', openModal);
    addDbModal.addEventListener('click', (e) => {
        if (e.target.dataset.action === 'close' || e.target === addDbModal) closeModal();
    });

    addDbForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = dbNameInput.value;
        const rawInput = dbIdInput.value.trim();

        const extractSheetId = (input) => {
            const match = input.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
            return match ? match[1] : input;
        };

        const id = extractSheetId(rawInput);

        if (name && id) {
            await window.electronAPI.addDatabase({ name, id });
            addDbForm.reset();
            closeModal();
            loadDatabases();
        }
    });

    loadClientEmail();
    loadDatabases();
});
