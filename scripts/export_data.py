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
    installation_services = df.groupby('customerID').first().reset_index()
    installation_services = installation_services[['customerID', 'serviceDate']]
    installation_services.rename(columns={'serviceDate': 'tanggal_pemasangan'}, inplace=True)

    # 4. FORMAT NOTES UNTUK SEMUA SERVIS
    def format_all_notes(group):
        note_entries = []
        for _, row in group.iterrows():
            if pd.notna(row['notes']) and str(row['notes']).strip():
                formatted_date = row['serviceDate'].strftime('%d-%m-%Y')
                note_text = str(row['notes']).strip()
                note_entries.append(f"{formatted_date}\n{note_text}")
        return "\n\n".join(note_entries)
    
    all_notes = df.groupby('customerID').apply(format_all_notes).reset_index(name='all_notes')

    # 5. AMBIL INFO PELANGGAN
    customer_info = df.groupby('customerID').first().reset_index()
    
    available_columns = customer_info.columns.tolist()
    desired_columns = ['customerID', 'name', 'address', 'phone', 'kota', 'customerNotes']
    
    columns_to_keep = [col for col in desired_columns if col in available_columns]
    customer_info = customer_info[columns_to_keep]

    # 6. PIVOT DATA SERVIS RUTIN
    df['service_rank'] = df.groupby('customerID').cumcount() + 1
    routine_services = df[df['service_rank'] > 1].copy()
    routine_services = routine_services.sort_values(by=['customerID', 'serviceDate'])
    routine_services['service_num'] = routine_services.groupby('customerID').cumcount() + 1
    routine_services['service_num_padded'] = routine_services['service_num'].apply(lambda x: f"Servis {x:02d}")
    
    service_history_wide = routine_services.pivot_table(
        index='customerID',
        columns='service_num_padded',
        values='serviceDate',
        aggfunc='first'
    ).reset_index()

    # 7. GABUNGKAN SEMUA DATA
    final_df = pd.merge(customer_info, installation_services, on='customerID', how='left')
    final_df = pd.merge(final_df, all_notes, on='customerID', how='left')
    final_df = pd.merge(final_df, service_history_wide, on='customerID', how='left')

    # 8. FINALISASI TABEL
    final_df.drop('customerID', axis=1, inplace=True)
    final_df.insert(0, 'No', range(1, 1 + len(final_df)))
    
    column_mapping = {
        'name': 'Nama', 'address': 'Alamat', 'phone': 'Nomor Telepon',
        'kota': 'Kota', 'customerNotes': 'Notes Pelanggan',
        'tanggal_pemasangan': 'Tanggal Pemasangan', 'all_notes': 'Catatan Servis'
    }
    
    final_df.rename(columns=column_mapping, inplace=True)
    
    # 9. URUTKAN KOLOM SERVIS
    all_columns = final_df.columns.tolist()
    base_columns = [col for col in column_mapping.values() if col in all_columns]
    base_columns.insert(0, 'No')
    
    service_columns = sorted(
        [col for col in all_columns if col.startswith('Servis ')],
        key=lambda x: int(x.replace('Servis ', ''))
    )
    
    final_columns = base_columns + service_columns
    final_df = final_df[final_columns]

    # 10. RENAME KOLOM SERVIS UNTUK MENGHILANGKAN LEADING ZEROS
    rename_dict = {col: f"Servis {int(col.replace('Servis ', ''))}" for col in service_columns}
    final_df.rename(columns=rename_dict, inplace=True)

    # 11. SIMPAN KE FILE
    path_xlsx = base_output_path + '.xlsx'
    df_for_excel = final_df.copy()
    
    date_columns_excel = ['Tanggal Pemasangan'] + [col for col in df_for_excel.columns if col.startswith('Servis ')]
    for col in date_columns_excel:
        if col in df_for_excel.columns:
            df_for_excel[col] = pd.to_datetime(df_for_excel[col], errors='coerce').dt.strftime('%d-%m-%Y')
    
    df_for_excel.fillna('-', inplace=True)
    
    with pd.ExcelWriter(path_xlsx, engine='xlsxwriter') as writer:
        df_for_excel.to_excel(writer, index=False, sheet_name='Data Pelanggan')
        workbook = writer.book
        worksheet = writer.sheets['Data Pelanggan']
        wrap_format = workbook.add_format({'text_wrap': True})
        
        for col_idx, col_name in enumerate(df_for_excel.columns):
            if col_name in ['Notes Pelanggan', 'Catatan Servis']:
                worksheet.set_column(col_idx, col_idx, 40, wrap_format)
            elif col_name == 'Alamat':
                worksheet.set_column(col_idx, col_idx, 30)
            elif col_name == 'Nama':
                 worksheet.set_column(col_idx, col_idx, 20)
            else:
                worksheet.set_column(col_idx, col_idx, 15)

    path_csv = base_output_path + '.csv'
    final_df.to_csv(path_csv, index=False, encoding='utf-8-sig', date_format='%d-%m-%Y')

    print("SUCCESS: Data berhasil diekspor.")

except Exception as e:
    # Print error ke stderr agar bisa ditangkap oleh Electron
    print(f"ERROR: {str(e)}", file=sys.stderr)
    import traceback
    print(f"TRACEBACK: {traceback.format_exc()}", file=sys.stderr)
    sys.exit(1) # Keluar dengan status error

