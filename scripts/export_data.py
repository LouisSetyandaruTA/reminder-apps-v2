import sys
import json
import pandas as pd

try:
    input_data_json = sys.argv[1]
    base_output_path = sys.argv[2]
    
    # 1. BACA DATA (Tidak berubah)
    raw_data = json.loads(input_data_json)
    if not raw_data:
        raise ValueError("Tidak ada data untuk diekspor.")
    df = pd.DataFrame(raw_data)

    # 2. PERSIAPAN DATA (Tidak berubah)
    df['serviceDate'] = pd.to_datetime(df['serviceDate'], errors='coerce')
    df.dropna(subset=['serviceDate'], inplace=True)
    df.sort_values(by=['customerID', 'serviceDate'], inplace=True)

    # 3. PIVOT DATA SERVIS (Tidak berubah)
    df['service_num'] = 'Servis ' + (df.groupby('customerID').cumcount() + 1).astype(str)
    service_history_wide = df.pivot_table(
        index='customerID',
        columns='service_num',
        values='serviceDate'
    ).reset_index()

    # 4. AMBIL INFO PELANGGAN & GABUNGKAN CATATAN (Tidak berubah)
    customer_info = df.groupby('customerID').first().reset_index()
    customer_info = customer_info[['customerID', 'name', 'address', 'phone']]
    def format_and_combine_notes(group):
        note_entries = []
        for _, row in group.iterrows():
            if pd.notna(row['notes']) and str(row['notes']).strip():
                formatted_date = row['serviceDate'].strftime('%d-%m-%Y')
                note_text = str(row['notes']).strip()
                note_entries.append(f"{formatted_date}\n{note_text}")
        return "\n\n".join(note_entries)
    formatted_notes = df.groupby('customerID').apply(format_and_combine_notes).reset_index(name='notes')
    customer_info = pd.merge(customer_info, formatted_notes, on='customerID', how='left')

    # 5. GABUNGKAN DATA (Tidak berubah)
    final_df = pd.merge(customer_info, service_history_wide, on='customerID', how='left')

    # 6. FINALISASI TABEL (Tidak berubah)
    final_df.drop('customerID', axis=1, inplace=True)
    final_df.insert(0, 'No', range(1, 1 + len(final_df)))
    final_df.rename(columns={
        'name': 'Nama',
        'address': 'Alamat',
        'phone': 'Nomor Telpon',
        'notes': 'Notes'
    }, inplace=True)
    
    # ====================== PERUBAHAN UTAMA DIMULAI DI SINI ======================
    # 7. SIMPAN KE FILE DENGAN LOGIKA TERPISAH
    
    # --- PROSES UNTUK FILE EXCEL (.xlsx) ---
    path_xlsx = base_output_path + '.xlsx'
    
    # Buat salinan DataFrame agar data asli tidak berubah
    df_for_excel = final_df.copy()
    
    # Ganti nilai kosong (non-tanggal) dengan '-'
    # Kita tidak menyentuh kolom tanggal, biarkan NaT (Not a Time) agar Excel mengenalinya
    non_date_cols = df_for_excel.select_dtypes(exclude=['datetime64[ns]']).columns
    df_for_excel[non_date_cols] = df_for_excel[non_date_cols].fillna('-')
    
    # Gunakan XlsxWriter untuk menyimpan dengan format tanggal
    with pd.ExcelWriter(path_xlsx, engine='xlsxwriter', datetime_format='dd-mm-yyyy') as writer:
        df_for_excel.to_excel(writer, index=False, sheet_name='Data Pelanggan')

    # --- PROSES UNTUK FILE CSV (.csv) ---
    path_csv = base_output_path + '.csv'
    
    # Buat salinan lagi untuk diproses sebagai teks
    df_for_csv = final_df.copy()

    # Untuk CSV, kita HARUS mengubah tanggal menjadi string
    service_cols = [col for col in df_for_csv.columns if col.startswith('Servis ')]
    for col in service_cols:
        df_for_csv[col] = pd.to_datetime(df_for_csv[col]).dt.strftime('%d-%m-%Y')
        
    # Ganti semua nilai kosong (termasuk NaT yang sudah jadi string) dengan '-'
    df_for_csv.fillna('-', inplace=True)
    
    df_for_csv.to_csv(path_csv, index=False, encoding='utf-8-sig')
    # ====================== AKHIR PERUBAHAN ======================

    print(f"SUCCESS: Data berhasil diekspor. Tipe data tanggal dipertahankan di file Excel.")

except Exception as e:
    print(f"ERROR: {e}")