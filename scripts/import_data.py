# scripts/import_data.py
import sys
import pandas as pd
import os

try:
    # Path file input dan direktori output dari argumen
    input_file_path = sys.argv[1]
    output_dir = sys.argv[2]

    # 1. BACA FILE INPUT
    if input_file_path.endswith('.xlsx'):
        df = pd.read_excel(input_file_path)
    else:
        df = pd.read_csv(input_file_path)

    # Ganti nama kolom kembali ke format internal agar mudah diproses
    df.rename(columns={
        'Nama': 'name',
        'Alamat': 'address',
        'Nomor Telpon': 'phone',
        'Notes': 'notes_combined' # Nama sementara untuk kolom notes gabungan
    }, inplace=True)

    # 2. PROSES "UNPIVOT" PADA DATA SERVIS
    # Identifikasi semua kolom servis
    service_cols = [col for col in df.columns if col.startswith('Servis ')]
    
    # Gunakan pd.melt untuk mengubah kolom servis menjadi baris
    df_long = pd.melt(
        df,
        id_vars=['name', 'address', 'phone'], # Kolom yang dipertahankan
        value_vars=service_cols,              # Kolom yang akan di-"unpivot"
        var_name='service_title',             # Nama kolom baru untuk 'Servis 1', 'Servis 2'
        value_name='serviceDate'              # Nama kolom baru untuk tanggal
    )
    
    # Hapus baris yang tidak memiliki tanggal servis (nilai kosong)
    df_long.dropna(subset=['serviceDate'], inplace=True)
    # Hapus baris dimana tanggalnya adalah '-'
    df_long = df_long[df_long['serviceDate'] != '-']

    # 3. SIAPKAN DATA UNTUK CUSTOMERS & SERVICES SHEET
    # Buat DataFrame unik untuk pelanggan
    customers_df = df[['name', 'address', 'phone']].drop_duplicates().reset_index(drop=True)
    
    # Gabungkan kembali untuk mendapatkan data servis yang sudah bersih
    services_df = pd.merge(df_long[['name', 'serviceDate']], customers_df, on='name', how='left')

    # 4. SIMPAN KE FILE CSV SEMENTARA
    customers_path = os.path.join(output_dir, 'customers_to_import.csv')
    services_path = os.path.join(output_dir, 'services_to_import.csv')
    
    customers_df.to_csv(customers_path, index=False)
    services_df.to_csv(services_path, index=False)

    print("SUCCESS: File berhasil diproses dan dipecah.")

except Exception as e:
    print(f"ERROR: {e}")