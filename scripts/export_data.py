import sys
import json
import pandas as pd

try:
    # Argumen 1: Path ke file JSON sementara
    input_json_path = sys.argv[1]
    # Argumen 2: Path dasar untuk file output (tanpa ekstensi)
    base_output_path = sys.argv[2]
    
    # 1. BACA DATA DARI FILE SEMENTARA
    with open(input_json_path, 'r', encoding='utf-8') as f:
        raw_data = json.load(f)
        
    if not raw_data:
        raise ValueError("Tidak ada data untuk diekspor.")
    
    df = pd.DataFrame(raw_data)

    # 2. PERSIAPAN DATA
    df['serviceDate'] = pd.to_datetime(df['serviceDate'], errors='coerce')
    df.dropna(subset=['serviceDate'], inplace=True)
    df.sort_values(by=['customerID', 'serviceDate'], inplace=True)
    
    completed_df = df[df['status'] == 'COMPLETED'].copy()
    if completed_df.empty:
        raise ValueError("Tidak ada data servis yang selesai (COMPLETED) untuk diekspor.")

    # 3. PISAHKAN DATA PEMASANGAN
    installation_services = completed_df.groupby('customerID').first().reset_index()
    installation_services = installation_services[['customerID', 'serviceDate']]
    installation_services.rename(columns={'serviceDate': 'tanggal_pemasangan'}, inplace=True)

    # 4. FORMAT NOTES
    def format_all_notes(group):
        note_entries = []
        sorted_group = group.sort_values(by='serviceDate')
        for _, row in sorted_group.iterrows():
            if pd.notna(row['notes']) and str(row['notes']).strip():
                formatted_date = row['serviceDate'].strftime('%d-%m-%Y')
                note_text = str(row['notes']).strip()
                note_entries.append(f"{formatted_date}\n{note_text}")
        return "\n\n".join(note_entries)
    
    all_notes = completed_df.groupby('customerID').apply(format_all_notes).reset_index(name='all_notes')

    # 5. AMBIL INFO PELANGGAN & TANGGAL SERVIS TERAKHIR
    customer_info = completed_df.groupby('customerID').first().reset_index()
    last_service_info = completed_df.groupby('customerID').last().reset_index()
    
    last_service_date = last_service_info[['customerID', 'serviceDate']]
    last_service_date.rename(columns={'serviceDate': 'Tanggal Servis Terakhir'}, inplace=True)
    
    customer_info = pd.merge(customer_info, last_service_date, on='customerID', how='left')

    desired_columns = ['customerID', 'name', 'address', 'phone', 'kota', 'customerNotes', 'Tanggal Servis Terakhir']
    columns_to_keep = [col for col in desired_columns if col in customer_info.columns]
    customer_info = customer_info[columns_to_keep]

    # 6. PIVOT DATA SERVIS RUTIN
    completed_df['service_rank'] = completed_df.groupby('customerID').cumcount() + 1
    routine_services = completed_df[completed_df['service_rank'] > 1].copy()
    
    if not routine_services.empty:
        routine_services['service_num'] = routine_services.groupby('customerID').cumcount() + 1
        routine_services['service_num_padded'] = routine_services['service_num'].apply(lambda x: f"Servis {x:02d}")
        
        service_history_wide = routine_services.pivot_table(
            index='customerID', columns='service_num_padded', values='serviceDate', aggfunc='first'
        ).reset_index()
    else:
        service_history_wide = pd.DataFrame(columns=['customerID'])

    # 7. GABUNGKAN SEMUA DATA
    final_df = pd.merge(customer_info, installation_services, on='customerID', how='left')
    final_df = pd.merge(final_df, all_notes, on='customerID', how='left')
    final_df = pd.merge(final_df, service_history_wide, on='customerID', how='left')

    # 8. FINALISASI TABEL
    final_df.drop('customerID', axis=1, inplace=True, errors='ignore')
    final_df.insert(0, 'No', range(1, 1 + len(final_df)))
    
    column_mapping = {
        'name': 'Nama', 'address': 'Alamat', 'phone': 'Nomor Telepon',
        'kota': 'Kota', 'customerNotes': 'Notes Pelanggan',
        'tanggal_pemasangan': 'Tanggal Pemasangan',
        'Tanggal Servis Terakhir': 'Tanggal Servis Terakhir',
        'all_notes': 'Catatan Servis'
    }
    final_df.rename(columns=column_mapping, inplace=True)
    
    # 9. URUTKAN KOLOM
    base_order = ['No', 'Nama', 'Alamat', 'Nomor Telepon', 'Kota', 'Tanggal Pemasangan', 'Tanggal Servis Terakhir', 'Notes Pelanggan', 'Catatan Servis']
    base_columns = [col for col in base_order if col in final_df.columns]
    service_columns = sorted([col for col in final_df.columns if col.startswith('Servis ')], key=lambda x: int(x.replace('Servis ', '')))
    
    final_columns = base_columns + service_columns
    final_df = final_df[final_columns]

    rename_dict = {col: f"Servis {int(col.replace('Servis ', ''))}" for col in service_columns}
    final_df.rename(columns=rename_dict, inplace=True)

    # --- PEMBUATAN FILE ---
    
    # 10. SIMPAN KE XLSX
    path_xlsx = base_output_path + '.xlsx'
    df_for_excel = final_df.copy()
    
    date_columns_excel = ['Tanggal Pemasangan', 'Tanggal Servis Terakhir'] + [col for col in df_for_excel.columns if col.startswith('Servis ')]
    for col in date_columns_excel:
        if col in df_for_excel.columns:
            df_for_excel[col] = pd.to_datetime(df_for_excel[col], errors='coerce').dt.strftime('%d-%m-%Y')
    
    df_for_excel.fillna('-', inplace=True)
    
    with pd.ExcelWriter(path_xlsx, engine='xlsxwriter') as writer:
        df_for_excel.to_excel(writer, index=False, sheet_name='Data Pelanggan')
        workbook = writer.book
        worksheet = writer.sheets['Data Pelanggan']
        wrap_format = workbook.add_format({'text_wrap': True, 'valign': 'top'})
        for idx, col_name in enumerate(df_for_excel.columns):
            width = 18
            if col_name in ['Notes Pelanggan', 'Catatan Servis', 'Alamat']: width = 35
            elif col_name == 'Nama': width = 25
            worksheet.set_column(idx, idx, width, wrap_format if col_name in ['Notes Pelanggan', 'Catatan Servis', 'Alamat'] else None)

    # 11. SIMPAN KE CSV (dengan dataframe yang bersih)
    path_csv = base_output_path + '.csv'
    df_for_csv = final_df.copy()
    # Untuk CSV, format tanggal YYYY-MM-DD lebih umum dan aman
    date_columns_csv = ['Tanggal Pemasangan', 'Tanggal Servis Terakhir'] + [col for col in df_for_csv.columns if col.startswith('Servis ')]
    for col in date_columns_csv:
        if col in df_for_csv.columns:
            df_for_csv[col] = pd.to_datetime(df_for_csv[col], errors='coerce').dt.strftime('%Y-%m-%d')
            
    # Ganti nilai kosong dengan string kosong untuk CSV
    df_for_csv.fillna('', inplace=True)
    df_for_csv.to_csv(path_csv, index=False, encoding='utf-8-sig')

    print("SUCCESS: Data berhasil diekspor ke XLSX dan CSV.")

except Exception as e:
    print(f"ERROR: {str(e)}", file=sys.stderr)
    import traceback
    print(f"TRACEBACK: {traceback.format_exc()}", file=sys.stderr)
    sys.exit(1)

