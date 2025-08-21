# scripts/import_data.py
import sys
import pandas as pd
import os
from datetime import datetime

def parse_date(date_str):
    """
    Fungsi untuk mengonversi berbagai format tanggal ke format ISO (YYYY-MM-DD)
    yang lebih kompatibel dengan Google Sheets
    """
    if pd.isna(date_str) or date_str == '-' or date_str == '':
        return None
    
    # Konversi ke string jika bukan string
    date_str = str(date_str).strip()
    
    # Coba berbagai format tanggal yang mungkin
    date_formats = [
        '%d-%m-%Y',    # 14-08-2025
        '%d/%m/%Y',    # 14/08/2025
        '%Y-%m-%d',    # 2025-08-14
        '%Y/%m/%d',    # 2025/08/14
        '%d-%m-%y',    # 14-08-25
        '%d/%m/%y',    # 14/08/25
        '%m/%d/%Y',    # 08/14/2025 (format US)
        '%m-%d-%Y',    # 08-14-2025 (format US)
    ]
    
    for fmt in date_formats:
        try:
            parsed_date = datetime.strptime(date_str, fmt)
            # Kembalikan dalam format ISO (YYYY-MM-DD) yang standar
            return parsed_date.strftime('%Y-%m-%d')
        except ValueError:
            continue
    
    # Jika semua format gagal, kembalikan None
    print(f"WARNING: Tidak dapat memparse tanggal '{date_str}', akan diabaikan.")
    return None

try:
    # Path file input dan direktori output dari argumen
    input_file_path = sys.argv[1]
    output_dir = sys.argv[2]

    # 1. BACA FILE INPUT
    if input_file_path.endswith('.xlsx'):
        df = pd.read_excel(input_file_path)
    else:
        # Baca CSV dengan encoding yang lebih fleksibel
        try:
            df = pd.read_csv(input_file_path, encoding='utf-8')
        except UnicodeDecodeError:
            df = pd.read_csv(input_file_path, encoding='latin1')

    # Ganti nama kolom kembali ke format internal agar mudah diproses
    df.rename(columns={
        'Nama': 'name',
        'Alamat': 'address',
        'Nomor Telpon': 'phone',
        'Notes': 'notes_combined'
    }, inplace=True)

    # 2. PROSES "UNPIVOT" PADA DATA SERVIS
    # Identifikasi semua kolom servis
    service_cols = [col for col in df.columns if col.startswith('Servis ')]
    
    # Gunakan pd.melt untuk mengubah kolom servis menjadi baris
    df_long = pd.melt(
        df,
        id_vars=['name', 'address', 'phone'],
        value_vars=service_cols,
        var_name='service_title',
        value_name='serviceDate'
    )
    
    # 3. PARSE DAN STANDARDISASI TANGGAL
    # Konversi semua tanggal ke format standar
    df_long['serviceDate'] = df_long['serviceDate'].apply(parse_date)
    
    # Hapus baris yang tidak memiliki tanggal servis (nilai kosong atau parsing gagal)
    df_long.dropna(subset=['serviceDate'], inplace=True)

    # 4. SIAPKAN DATA UNTUK CUSTOMERS & SERVICES SHEET
    # Buat DataFrame unik untuk pelanggan
    customers_df = df[['name', 'address', 'phone']].drop_duplicates().reset_index(drop=True)
    
    # Bersihkan data pelanggan dari nilai kosong
    customers_df = customers_df.fillna('')
    
    # Gabungkan kembali untuk mendapatkan data servis yang sudah bersih
    services_df = pd.merge(df_long[['name', 'serviceDate']], customers_df, on='name', how='left')

    # 5. VALIDASI DATA SEBELUM EXPORT
    if len(customers_df) == 0:
        raise Exception("Tidak ada data pelanggan yang valid ditemukan.")
    
    if len(services_df) == 0:
        raise Exception("Tidak ada data servis dengan tanggal valid ditemukan.")

    # 6. SIMPAN KE FILE CSV SEMENTARA
    customers_path = os.path.join(output_dir, 'customers_to_import.csv')
    services_path = os.path.join(output_dir, 'services_to_import.csv')
    
    # Simpan dengan format yang konsisten
    customers_df.to_csv(customers_path, index=False, encoding='utf-8')
    services_df.to_csv(services_path, index=False, encoding='utf-8')

    print(f"SUCCESS: File berhasil diproses. {len(customers_df)} pelanggan, {len(services_df)} servis.")
    print(f"Contoh tanggal yang diproses: {services_df['serviceDate'].iloc[0] if len(services_df) > 0 else 'Tidak ada'}")

except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()