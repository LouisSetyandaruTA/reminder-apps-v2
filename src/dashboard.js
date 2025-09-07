document.addEventListener('DOMContentLoaded', () => {
    const dbListContainer = document.getElementById('db-list');
    const emptyState = document.getElementById('empty-state');
    const addDbBtn = document.getElementById('add-db-btn');
    const addDbModal = document.getElementById('add-db-modal');
    const addDbForm = document.getElementById('add-db-form');
    const dbNameInput = document.getElementById('db-name');
    const dbIdInput = document.getElementById('db-id');

    const openModal = () => addDbModal.classList.remove('hidden');
    const closeModal = () => addDbModal.classList.add('hidden');

    async function loadDatabases() {
        const databases = await window.electronAPI.getDatabases();
        dbListContainer.innerHTML = '';
        emptyState.classList.toggle('hidden', databases.length > 0);
        dbListContainer.classList.toggle('hidden', databases.length === 0);

        databases.forEach(db => {
            const card = document.createElement('div');
            card.className = 'db-card bg-white p-6 rounded-lg shadow-md cursor-pointer relative';
            card.innerHTML = `
                <div class="flex items-center gap-4">
                    <div class="bg-blue-100 p-3 rounded-full"><i data-lucide="database" class="h-6 w-6 text-blue-600"></i></div>
                    <div>
                        <h3 class="text-lg font-bold text-gray-800">${db.name}</h3>
                        <p class="text-xs text-gray-500 truncate">${db.id}</p>
                    </div>
                </div>
                <button data-id="${db.id}" class="delete-btn absolute top-3 right-3 p-1 bg-red-100 text-red-600 rounded-full hover:bg-red-200"><i data-lucide="trash-2" class="h-4 w-4"></i></button>
            `;
            dbListContainer.appendChild(card);
            // Event listener untuk membuka jendela reminder
            card.querySelector('.flex').addEventListener('click', () => {
                window.electronAPI.openReminderForSheet({ id: db.id, name: db.name });
            });
        });
        lucide.createIcons();
    }

    // Event listener untuk tombol hapus
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
        const id = dbIdInput.value;
        if (name && id) {
            await window.electronAPI.addDatabase({ name, id });
            addDbForm.reset();
            closeModal();
            loadDatabases();
        }
    });

    loadDatabases();
});
