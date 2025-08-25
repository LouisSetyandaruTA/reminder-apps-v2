# scripts/import_data.py
import sys
import pandas as pd
import os
from datetime import datetime

def parse_date(date_str):
    if pd.isna(date_str) or date_str == '-' or str(date_str).strip() == '':
        return None
    date_str = str(date_str).strip()
    date_formats = [
        '%Y-%m-%d %H:%M:%S',
        '%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d', '%Y/%m/%d',
        '%d-%m-%y', '%d/%m/%y', '%m/%d/%Y', '%m-%d-%Y'
    ]
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

    # 1. BACA FILE
    if input_file_path.endswith('.xlsx'):
        df = pd.read_excel(input_file_path, engine='openpyxl')
    else:
        df = pd.read_csv(input_file_path, dtype=str, encoding='utf-8')

    # 2. RENAME KOLOM SECARA KONSISTEN
    rename_mapping = {
        'Nama': 'name', 'Alamat': 'address', 'Notes': 'notes',
        'No. Telp': 'phone', 'Nomor Telpon': 'phone', 'Kota': 'kota',
        'Pemasangan': 'purchaseDate'  # Langsung ubah 'Pemasangan' menjadi 'purchaseDate'
    }
    df.rename(columns=rename_mapping, inplace=True)

    # 3. PROSES TANGGAL DAN UNPIVOT
    service_cols = [col for col in df.columns if str(col).lower().startswith('servis ')]
    
    # Simpan kolom id sebelum di-melt
    id_vars = [col for col in df.columns if col not in service_cols]
    
    df_long = pd.melt(df,
                      id_vars=id_vars,
                      value_vars=service_cols,
                      var_name='service_title',
                      value_name='serviceDate')
    
    df_long['serviceDate'] = df_long['serviceDate'].apply(parse_date)
    df_long.dropna(subset=['serviceDate'], inplace=True)
    df_long['serviceDate'] = pd.to_datetime(df_long['serviceDate'], errors='coerce')
    df_long.dropna(subset=['serviceDate'], inplace=True)

    # 4. FILTER TANGGAL MASA DEPAN
    today = datetime.now()
    df_past_services = df_long[df_long['serviceDate'] <= today].copy()

    if df_past_services.empty:
        raise Exception("Tidak ada data servis historis (sebelum hari ini) yang valid ditemukan.")

    # 5. TENTUKAN TANGGAL PEMBELIAN & SERVIS TERAKHIR
    date_summary = df_past_services.groupby('name')['serviceDate'].agg(['min', 'max']).reset_index()
    date_summary.rename(columns={'min': 'earliest_service', 'max': 'latest_service'}, inplace=True)

    customers_df = df.drop(columns=service_cols, errors='ignore').drop_duplicates(subset=['name'])
    customers_df = pd.merge(customers_df, date_summary, on='name', how='left')

    # Logika baru: Gunakan 'purchaseDate' jika ada, jika tidak, gunakan 'earliest_service'
    if 'purchaseDate' in customers_df.columns:
        customers_df['purchaseDate'] = pd.to_datetime(customers_df['purchaseDate'].apply(parse_date), errors='coerce')
        customers_df['purchaseDate'] = customers_df['purchaseDate'].fillna(customers_df['earliest_service'])
    else:
        customers_df['purchaseDate'] = customers_df['earliest_service']
    
    customers_df.dropna(subset=['purchaseDate'], inplace=True)
    
    customers_df['purchaseDate'] = customers_df['purchaseDate'].dt.strftime('%Y-%m-%d')
    customers_df['latest_service'] = customers_df['latest_service'].dt.strftime('%Y-%m-%d')

    # 6. SIAPKAN DATA AKHIR UNTUK DISIMPAN
    customer_cols = ['name', 'purchaseDate', 'latest_service']
    if 'address' in customers_df.columns: customer_cols.append('address')
    if 'phone' in customers_df.columns: customer_cols.append('phone')
    if 'kota' in customers_df.columns: customer_cols.append('kota')
    if 'notes' in customers_df.columns: customer_cols.append('notes')
    
    customers_to_save = customers_df[customer_cols]
    services_to_save = df_past_services[['name', 'serviceDate']]
    services_to_save['serviceDate'] = services_to_save['serviceDate'].dt.strftime('%Y-%m-%d')

    customers_to_save = customers_to_save.fillna('')

    # 7. SIMPAN FILE SEMENTARA
    customers_path = os.path.join(output_dir, 'customers_to_import.csv')
    services_path = os.path.join(output_dir, 'services_to_import.csv')
    
    customers_to_save.to_csv(customers_path, index=False, encoding='utf-8')
    services_to_save.to_csv(services_path, index=False, encoding='utf-8')

    print("SUCCESS: File berhasil diproses.")

except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
