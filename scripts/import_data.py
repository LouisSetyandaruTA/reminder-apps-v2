import sys
import pandas as pd
import os
from datetime import datetime

def parse_date(date_str):
    if pd.isna(date_str) or date_str == '-' or str(date_str).strip() == '':
        return None
    date_str = str(date_str).strip()
    
    # --- PERUBAHAN DI SINI ---
    date_formats = [
        '%Y-%m-%d %H:%M:%S',  # Ditambahkan untuk format '2020-08-11 00:00:00'
        '%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d', '%Y/%m/%d',
        '%d-%m-%y', '%d/%m/%y', '%m/%d/%Y', '%m-%d-%Y'
    ]
    # -------------------------

    for fmt in date_formats:
        try:
            return datetime.strptime(date_str, fmt).strftime('%Y-%m-%d')
        except ValueError:
            continue
    print(f"WARNING: Tidak dapat memparse tanggal '{date_str}', akan diabaikan.")
    return None

try:
    input_file_path = sys.argv[1]
    output_dir = sys.argv[2]

    # 1. BACA FILE INPUT
    if input_file_path.endswith('.xlsx'):
        df = pd.read_excel(input_file_path, engine='openpyxl')
    else:
        try:
            df = pd.read_csv(input_file_path, encoding='utf-8', dtype=str)
        except UnicodeDecodeError:
            df = pd.read_csv(input_file_path, encoding='latin1', dtype=str)

    # 2. RENAME KOLOM FLEKSIBEL
    rename_mapping = {}
    if 'Nama' in df.columns: rename_mapping['Nama'] = 'name'
    if 'Alamat' in df.columns: rename_mapping['Alamat'] = 'address'
    if 'No. Telp' in df.columns: rename_mapping['No. Telp'] = 'phone'
    if 'Nomor Telpon' in df.columns: rename_mapping['Nomor Telpon'] = 'phone'
    if 'Notes' in df.columns: rename_mapping['Notes'] = 'notes'
    df.rename(columns=rename_mapping, inplace=True)

    # 3. CARI & TENTUKAN TANGGAL PEMBELIAN
    service_cols = [col for col in df.columns if str(col).lower().startswith('servis ')]
    temp_service_df = pd.DataFrame()
    for col in service_cols:
        temp_service_df[col] = df[col].apply(parse_date)
        temp_service_df[col] = pd.to_datetime(temp_service_df[col], errors='coerce')
    df['earliest_service'] = temp_service_df.min(axis=1)
    if 'Pemasangan' in df.columns:
        pemasangan_dates = df['Pemasangan'].apply(parse_date)
        pemasangan_dates = pd.to_datetime(pemasangan_dates, errors='coerce')
        df['purchaseDate'] = pemasangan_dates.fillna(df['earliest_service'])
    else:
        df['purchaseDate'] = df['earliest_service']
    df.dropna(subset=['purchaseDate'], inplace=True)
    df['purchaseDate'] = df['purchaseDate'].dt.strftime('%Y-%m-%d')

    # 4. PROSES UNPIVOT DAN SIAPKAN DATA AKHIR
    id_vars = ['name', 'purchaseDate']
    if 'address' in df.columns: id_vars.append('address')
    if 'phone' in df.columns: id_vars.append('phone')
    if 'notes' in df.columns: id_vars.append('notes')

    df_long = pd.melt(df,
                      id_vars=id_vars,
                      value_vars=service_cols,
                      var_name='service_title',
                      value_name='serviceDate')
    
    df_long.dropna(subset=['serviceDate'], inplace=True)

    customers_to_save = df[id_vars].drop_duplicates(subset=['name']).reset_index(drop=True)
    services_to_save = df_long[['name', 'serviceDate']]
    
    customers_to_save = customers_to_save.fillna('')

    # 5. VALIDASI DAN SIMPAN
    if len(customers_to_save) == 0:
        raise Exception("Tidak ada data pelanggan yang valid ditemukan.")
    
    customers_path = os.path.join(output_dir, 'customers_to_import.csv')
    services_path = os.path.join(output_dir, 'services_to_import.csv')
    
    customers_to_save.to_csv(customers_path, index=False, encoding='utf-8')
    services_to_save.to_csv(services_path, index=False, encoding='utf-8')

except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()