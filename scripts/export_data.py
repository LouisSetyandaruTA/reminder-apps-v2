import sys
import json
import pandas as pd

try:
    input_data_json = sys.argv[1]
    base_output_path = sys.argv[2]
    
    # 1. BACA DATA - Filter hanya data dengan status COMPLETED
    raw_data = json.loads(input_data_json)
    if not raw_data:
        raise ValueError("Tidak ada data untuk diekspor.")
    
    # Filter hanya data dengan status COMPLETED
    completed_data = [item for item in raw_data if item.get('status') == 'COMPLETED']
    
    if not completed_data:
        raise ValueError("Tidak ada data servis yang selesai (COMPLETED) untuk diekspor.")
    
    df = pd.DataFrame(completed_data)

    # 2. PERSIAPAN DATA
    df['serviceDate'] = pd.to_datetime(df['serviceDate'], errors='coerce')
    df.dropna(subset=['serviceDate'], inplace=True)
    df.sort_values(by=['customerID', 'serviceDate'], inplace=True)

    # 3. PISAHKAN DATA PEMASANGAN DAN SERVIS RUTIN
    # Identifikasi servis pemasangan (biasanya yang pertama untuk setiap customer)
    installation_services = df.groupby('customerID').first().reset_index()
    installation_services = installation_services[['customerID', 'serviceDate']]
    installation_services.rename(columns={
        'serviceDate': 'tanggal_pemasangan'
    }, inplace=True)

    # 4. FORMAT NOTES UNTUK SEMUA SERVIS (PEMASANGAN + RUTIN)
    def format_all_notes(group):
        note_entries = []
        for _, row in group.iterrows():
            if pd.notna(row['notes']) and str(row['notes']).strip():
                # Format tanggal menjadi DD-MM-YYYY
                formatted_date = row['serviceDate'].strftime('%d-%m-%Y')
                note_text = str(row['notes']).strip()
                note_entries.append(f"{formatted_date}\n{note_text}")
        return "\n\n".join(note_entries)  # Dua newline untuk jeda antar notes
    
    all_notes = df.groupby('customerID').apply(format_all_notes).reset_index(name='all_notes')

    # 5. AMBIL INFO PELANGGAN
    customer_info = df.groupby('customerID').first().reset_index()
    
    # Daftar kolom yang mungkin ada
    available_columns = customer_info.columns.tolist()
    desired_columns = ['customerID', 'name', 'address', 'phone', 'kota']
    
    # Hanya ambil kolom yang benar-benar ada
    columns_to_keep = [col for col in desired_columns if col in available_columns]
    customer_info = customer_info[columns_to_keep]

    # 6. PIVOT DATA SERVIS RUTIN (HANYA TANGGAL, TANPA NOTES/HANDLER)
    # Buat ranking untuk setiap servis per customer
    df['service_rank'] = df.groupby('customerID').cumcount() + 1
    
    # Servis rutin adalah servis selain yang pertama (pemasangan)
    routine_services = df[df['service_rank'] > 1].copy()
    
    # Pivot hanya tanggal servis rutin
    routine_services['service_num'] = 'Servis ' + (routine_services.groupby('customerID').cumcount() + 1).astype(str)
    service_history_wide = routine_services.pivot_table(
        index='customerID',
        columns='service_num',
        values='serviceDate',
        aggfunc='first'
    ).reset_index()

    # 7. GABUNGKAN SEMUA DATA
    # Gabungkan info pelanggan dengan data pemasangan
    final_df = pd.merge(customer_info, installation_services, on='customerID', how='left')
    
    # Gabungkan dengan notes yang sudah diformat
    final_df = pd.merge(final_df, all_notes, on='customerID', how='left')
    
    # Gabungkan dengan data servis rutin
    final_df = pd.merge(final_df, service_history_wide, on='customerID', how='left')

    # 8. FINALISASI TABEL
    final_df.drop('customerID', axis=1, inplace=True)
    final_df.insert(0, 'No', range(1, 1 + len(final_df)))
    
    # Mapping nama kolom
    column_mapping = {
        'name': 'Nama',
        'address': 'Alamat', 
        'phone': 'Nomor Telepon',
        'kota': 'Kota',
        'tanggal_pemasangan': 'Tanggal Pemasangan',
        'all_notes': 'Catatan Servis'
    }
    
    # Rename kolom
    for old_name, new_name in column_mapping.items():
        if old_name in final_df.columns:
            final_df.rename(columns={old_name: new_name}, inplace=True)
    
    # 9. URUTKAN KOLOM
    base_columns = ['No', 'Nama', 'Alamat', 'Kota', 'Nomor Telepon', 
                   'Tanggal Pemasangan', 'Catatan Servis']
    
    # Tambahkan kolom servis rutin
    service_cols = [col for col in final_df.columns if col.startswith('Servis ')]
    base_columns.extend(service_cols)
    
    # Pastikan hanya kolom yang ada yang disertakan
    final_columns = [col for col in base_columns if col in final_df.columns]
    
    # Reindex DataFrame
    final_df = final_df[final_columns]

    # 10. SIMPAN KE FILE
    # --- PROSES UNTUK FILE EXCEL (.xlsx) ---
    path_xlsx = base_output_path + '.xlsx'
    
    df_for_excel = final_df.copy()
    
    # KONVERSI TANGGAL KE STRING DENGAN FORMAT DD-MM-YYYY SEBELUM DISIMPAN
    date_columns = ['Tanggal Pemasangan'] + [col for col in df_for_excel.columns if col.startswith('Servis ')]
    
    for col in date_columns:
        if col in df_for_excel.columns:
            # Konversi ke datetime lalu format ke string DD-MM-YYYY
            df_for_excel[col] = pd.to_datetime(df_for_excel[col], errors='coerce')
            df_for_excel[col] = df_for_excel[col].dt.strftime('%d-%m-%Y')
    
    # Ganti nilai NaN dengan '-'
    df_for_excel.fillna('-', inplace=True)
    
    with pd.ExcelWriter(path_xlsx, engine='xlsxwriter') as writer:
        df_for_excel.to_excel(writer, index=False, sheet_name='Data Pelanggan')
        
        workbook = writer.book
        worksheet = writer.sheets['Data Pelanggan']
        
        # Format untuk wrap text (agar notes bisa multiline)
        wrap_format = workbook.add_format({'text_wrap': True})
        
        # Format untuk teks biasa
        text_format = workbook.add_format()
        
        # Terapkan format ke kolom
        for col_idx, col_name in enumerate(df_for_excel.columns):
            if col_name == 'Catatan Servis':
                worksheet.set_column(col_idx, col_idx, 40, wrap_format)  # Lebar 40 untuk notes dengan wrap text
            elif col_name == 'Nama':
                worksheet.set_column(col_idx, col_idx, 20, text_format)  # Lebar 20 untuk nama
            elif col_name == 'Alamat':
                worksheet.set_column(col_idx, col_idx, 30, text_format)  # Lebar 30 untuk alamat
            elif col_name == 'Kota':
                worksheet.set_column(col_idx, col_idx, 15, text_format)  # Lebar 15 untuk kota
            elif col_name == 'Nomor Telepon':
                worksheet.set_column(col_idx, col_idx, 15, text_format)  # Lebar 15 untuk telepon
            elif col_name == 'Tanggal Pemasangan':
                worksheet.set_column(col_idx, col_idx, 15, text_format)  # Lebar 15 untuk tanggal
            elif col_name.startswith('Servis '):
                worksheet.set_column(col_idx, col_idx, 15, text_format)  # Lebar 15 untuk servis

    # --- PROSES UNTUK FILE CSV (.csv) ---
    path_csv = base_output_path + '.csv'
    
    df_for_csv = final_df.copy()

    # Format tanggal untuk CSV - konversi ke string DD-MM-YYYY
    date_columns = ['Tanggal Pemasangan'] + [col for col in df_for_csv.columns if col.startswith('Servis ')]
    
    for col in date_columns:
        if col in df_for_csv.columns:
            df_for_csv[col] = pd.to_datetime(df_for_csv[col], errors='coerce').dt.strftime('%d-%m-%Y')
        
    # Ganti semua nilai kosong dengan '-'
    df_for_csv.fillna('-', inplace=True)
    
    df_for_csv.to_csv(path_csv, index=False, encoding='utf-8-sig')

    print(f"SUCCESS: Data servis yang selesai (COMPLETED) berhasil diekspor.")

except Exception as e:
    print(f"ERROR: {str(e)}")
    import traceback
    print(f"TRACEBACK: {traceback.format_exc()}")