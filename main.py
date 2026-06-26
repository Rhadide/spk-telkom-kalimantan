from fastapi import FastAPI, Request, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse, FileResponse, PlainTextResponse
import traceback
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from typing import Optional
import pandas as pd
import openpyxl
from pathlib import Path
from contextlib import asynccontextmanager
import io
import warnings
warnings.filterwarnings('ignore')

BASE_DIR = Path(__file__).resolve().parent
if (BASE_DIR / "data").exists():
    CSV_PATH = BASE_DIR / "data" / "PMS DSS NON POTS 2025_Master.csv"
    ORIGINAL_CSV = BASE_DIR / "data" / "PMS DSS NON POTS 2025.csv"
    TEMPLATE_EXCEL = BASE_DIR / "data" / "template_import_spk.xlsx"
else:
    CSV_PATH = BASE_DIR.parent / "sistem" / "PMS DSS NON POTS 2025_Master.csv"
    ORIGINAL_CSV = BASE_DIR.parent / "sistem" / "PMS DSS NON POTS 2025.csv"
    TEMPLATE_EXCEL = BASE_DIR.parent / "sistem" / "template_import_spk.xlsx"

templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

agg_df = None
raw_df_cache = None
stats_data = {
    "witel_revenue": {},
    "char_revenue": {},
    "top_customers_revenue": [],
    "top_customers_produk": [],
    "top_customers_durasi": [],
    "total_revenue": 0,
    "monthly_all": {},
    "monthly_scaling": {},
    "monthly_sustain": {},
    "witel_details": {},
}

MONTH_ORDER = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"]
MONTH_MAP = {
    "01":"Jan","02":"Feb","03":"Mar","04":"Apr","05":"Mei","06":"Jun",
    "07":"Jul","08":"Agu","09":"Sep","10":"Okt","11":"Nov","12":"Des"
}

def init_data():
    global agg_df, raw_df_cache, stats_data

    if ORIGINAL_CSV.exists():
        try:
            print("Loading raw CSV for stats & raw view...")
            df_raw = pd.read_csv(ORIGINAL_CSV, sep=';', low_memory=False)
            df_raw.columns = [c.upper() for c in df_raw.columns]
            df_raw = df_raw.dropna(subset=['CUST_NAME'])
            df_raw['LOCAL_AMOUNT'] = pd.to_numeric(df_raw['LOCAL_AMOUNT'], errors='coerce').fillna(0)
            raw_df_cache = df_raw

            # Revenue stats
            stats_data["witel_revenue"] = df_raw.groupby('WITEL_SHIP')['LOCAL_AMOUNT'].sum().sort_values(ascending=False).head(10).to_dict()
            stats_data["char_revenue"] = df_raw.groupby('CHARACTERISTICS')['LOCAL_AMOUNT'].sum().to_dict()
            stats_data["total_revenue"] = float(df_raw['LOCAL_AMOUNT'].sum())

            # Detailed statistics for specific Witels on Kalimantan map
            witel_details = {}
            for w in ['KALBAR', 'KALSELTENG', 'KALTIMTARA', 'BALIKPAPAN']:
                w_df = df_raw[df_raw['WITEL_SHIP'] == w]
                rev = float(w_df['LOCAL_AMOUNT'].sum())
                prod = int(w_df['GROUP4'].nunique()) if 'GROUP4' in w_df.columns else 0
                witel_details[w] = {"revenue": rev, "products": prod}
            stats_data["witel_details"] = witel_details

            # Monthly revenue breakdown
            df_raw['MONTH_KEY'] = df_raw['PERIODE'].astype(str).str[-2:]
            df_raw['MONTH_NAME'] = df_raw['MONTH_KEY'].map(MONTH_MAP)
            df_raw['IS_SCALING'] = df_raw['CHARACTERISTICS'].astype(str).str.upper().str.contains('SCALING')

            monthly_all = {m: 0.0 for m in MONTH_ORDER}
            monthly_scaling = {m: 0.0 for m in MONTH_ORDER}
            monthly_sustain = {m: 0.0 for m in MONTH_ORDER}

            for m_name, group in df_raw.groupby('MONTH_NAME'):
                if m_name in monthly_all:
                    monthly_all[m_name] = float(group['LOCAL_AMOUNT'].sum())
                    monthly_scaling[m_name] = float(group[group['IS_SCALING']]['LOCAL_AMOUNT'].sum())
                    monthly_sustain[m_name] = float(group[~group['IS_SCALING']]['LOCAL_AMOUNT'].sum())

            stats_data["monthly_all"] = monthly_all
            stats_data["monthly_scaling"] = monthly_scaling
            stats_data["monthly_sustain"] = monthly_sustain

            print("Stats loaded from original CSV.")
        except Exception as e:
            print(f"Error loading original CSV: {e}")

    # Build / Load Master CSV
    if not CSV_PATH.exists() and ORIGINAL_CSV.exists():
        print("Building Master CSV from original...")
        try:
            df = pd.read_csv(ORIGINAL_CSV, sep=';', low_memory=False)
            df.columns = [c.upper() for c in df.columns]
            df = df.dropna(subset=['CUST_NAME'])
            df['LOCAL_AMOUNT'] = pd.to_numeric(df['LOCAL_AMOUNT'], errors='coerce').fillna(0)
            df['IS_SCALING'] = df['CHARACTERISTICS'].astype(str).str.upper().str.contains('SCALING')
            df['LOCAL_AMOUNT_SCALING'] = df['LOCAL_AMOUNT'].where(df['IS_SCALING'], 0)
            df['LOCAL_AMOUNT_SUSTAIN'] = df['LOCAL_AMOUNT'].where(~df['IS_SCALING'], 0)

            agg = df.groupby('CUST_NAME').agg(
                C1_Produk=('GROUP4', 'nunique'),
                C3_Durasi=('PERIODE', 'nunique'),
                C4_Revenue=('LOCAL_AMOUNT', 'sum'),
                Total_Scaling=('LOCAL_AMOUNT_SCALING', 'sum'),
                Total_Sustain=('LOCAL_AMOUNT_SUSTAIN', 'sum')
            ).reset_index()

            def calc_c2(row):
                total = row['C4_Revenue']
                if total == 0: return 1.0
                return max(1.0, min(2.0, (row['Total_Scaling'] / total * 2) + (row['Total_Sustain'] / total * 1)))

            agg['C2_Karakteristik'] = agg.apply(calc_c2, axis=1)
            agg = agg.drop(columns=['Total_Scaling', 'Total_Sustain'])
            agg = agg[['CUST_NAME', 'C1_Produk', 'C2_Karakteristik', 'C3_Durasi', 'C4_Revenue']]
            agg.to_csv(CSV_PATH, index=False)
        except Exception as e:
            print(f"Error building Master CSV: {e}")

    try:
        agg_df = pd.read_csv(CSV_PATH)
        print(f"Master loaded: {len(agg_df)} customers.")
        # Top 5 per filter
        stats_data["top_customers_revenue"] = agg_df.nlargest(5, 'C4_Revenue')[['CUST_NAME', 'C4_Revenue', 'C1_Produk', 'C2_Karakteristik', 'C3_Durasi']].to_dict(orient='records')
        stats_data["top_customers_produk"] = agg_df.nlargest(5, 'C1_Produk')[['CUST_NAME', 'C4_Revenue', 'C1_Produk', 'C2_Karakteristik', 'C3_Durasi']].to_dict(orient='records')
        stats_data["top_customers_durasi"] = agg_df.nlargest(5, 'C3_Durasi')[['CUST_NAME', 'C4_Revenue', 'C1_Produk', 'C2_Karakteristik', 'C3_Durasi']].to_dict(orient='records')
        stats_data["top_customers_karakteristik"] = agg_df.nlargest(5, 'C2_Karakteristik')[['CUST_NAME', 'C4_Revenue', 'C1_Produk', 'C2_Karakteristik', 'C3_Durasi']].to_dict(orient='records')
    except Exception as e:
        print(f"Error loading Master CSV: {e}")
        agg_df = pd.DataFrame(columns=['CUST_NAME', 'C1_Produk', 'C2_Karakteristik', 'C3_Durasi', 'C4_Revenue'])


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_data()
    yield

app = FastAPI(lifespan=lifespan)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    return PlainTextResponse(f"Internal Server Error:\n{tb}", status_code=500)

app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

# ---- MODELS ----
class MatrixRequest(BaseModel):
    matrix: list[list[float]]

class CustomerAdd(BaseModel):
    CUST_NAME: str
    C1_Produk: int
    Rev_Scaling: float
    Rev_Sustain: float
    C3_Durasi: int

class CustomerUpdate(BaseModel):
    C1_Produk: int
    Rev_Scaling: float
    Rev_Sustain: float
    C3_Durasi: int

# ---- ROUTES ----
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")

@app.get("/api/stats")
def get_stats():
    return stats_data

@app.get("/api/customers")
def get_customers(limit: int = 100, offset: int = 0, search: Optional[str] = None):
    global agg_df
    if agg_df is None: return {"total": 0, "data": []}
    df_tmp = agg_df.copy()
    if search:
        df_tmp = df_tmp[df_tmp['CUST_NAME'].astype(str).str.upper().str.contains(search.upper(), na=False)]
    total = len(df_tmp)
    data = df_tmp.sort_values('C4_Revenue', ascending=False).iloc[offset:offset+limit].to_dict(orient='records')
    return {"total": total, "data": data}

@app.get("/api/raw_transactions")
def get_raw_transactions(limit: int = 50, offset: int = 0, search: Optional[str] = None):
    global raw_df_cache
    if raw_df_cache is None or raw_df_cache.empty:
        return {"total": 0, "data": [], "columns": []}
    df_tmp = raw_df_cache.copy()
    if search:
        df_tmp = df_tmp[df_tmp['CUST_NAME'].astype(str).str.upper().str.contains(search.upper(), na=False)]
    total = len(df_tmp)
    # Return key columns only for display
    display_cols = ['PERIODE', 'CUST_NAME', 'ACCOUNT_NUM', 'PRODUCT_GROUP', 'PRODUCT_NAME',
                    'LOCAL_AMOUNT', 'WITEL_SHIP', 'CHARACTERISTICS', 'GROUP4', 'SEGMENT_6_LNAME',
                    'DIVISI', 'PAYMENT_TYPE']
    available = [c for c in display_cols if c in df_tmp.columns]
    page_data = df_tmp[available].iloc[offset:offset+limit]
    # Replace NaN with empty string for JSON serialization
    page_data = page_data.fillna('')
    return {"total": total, "data": page_data.to_dict(orient='records'), "columns": available}

@app.post("/api/customers")
def add_customer(cust: CustomerAdd):
    global agg_df
    if cust.CUST_NAME.strip() in agg_df['CUST_NAME'].values:
        raise HTTPException(status_code=400, detail="Nama pelanggan sudah ada.")
    total_rev = cust.Rev_Scaling + cust.Rev_Sustain
    c2 = 1.0 if total_rev == 0 else max(1.0, min(2.0, (cust.Rev_Scaling / total_rev * 2) + (cust.Rev_Sustain / total_rev * 1)))
    new_row = pd.DataFrame([{
        "CUST_NAME": cust.CUST_NAME.strip(),
        "C1_Produk": cust.C1_Produk,
        "C2_Karakteristik": round(c2, 4),
        "C3_Durasi": cust.C3_Durasi,
        "C4_Revenue": total_rev
    }])
    agg_df = pd.concat([agg_df, new_row], ignore_index=True)
    agg_df.to_csv(CSV_PATH, index=False)
    return {"status": "success", "message": f"Pelanggan '{cust.CUST_NAME}' berhasil ditambahkan."}

@app.put("/api/customers/{name}")
def update_customer(name: str, cust: CustomerUpdate):
    global agg_df
    from urllib.parse import unquote
    name = unquote(name)
    if name not in agg_df['CUST_NAME'].values:
        raise HTTPException(status_code=404, detail="Pelanggan tidak ditemukan.")
    total_rev = cust.Rev_Scaling + cust.Rev_Sustain
    c2 = 1.0 if total_rev == 0 else max(1.0, min(2.0, (cust.Rev_Scaling / total_rev * 2) + (cust.Rev_Sustain / total_rev * 1)))
    agg_df.loc[agg_df['CUST_NAME'] == name, 'C1_Produk'] = cust.C1_Produk
    agg_df.loc[agg_df['CUST_NAME'] == name, 'C2_Karakteristik'] = round(c2, 4)
    agg_df.loc[agg_df['CUST_NAME'] == name, 'C3_Durasi'] = cust.C3_Durasi
    agg_df.loc[agg_df['CUST_NAME'] == name, 'C4_Revenue'] = total_rev
    agg_df.to_csv(CSV_PATH, index=False)
    return {"status": "success"}

@app.delete("/api/customers/{name}")
def delete_customer(name: str):
    global agg_df
    from urllib.parse import unquote
    name = unquote(name)
    agg_df = agg_df[agg_df['CUST_NAME'] != name]
    agg_df.to_csv(CSV_PATH, index=False)
    return {"status": "success"}

@app.post("/api/calculate")
def calculate_ahp_saw(req: MatrixRequest):
    global agg_df
    if agg_df is None or agg_df.empty:
        return {"error": "Data Master kosong."}
    matrix = req.matrix
    n = len(matrix)
    if n == 0 or len(matrix[0]) != n:
        return {"error": "Matriks harus persegi (N x N)."}

    col_sums = [sum(matrix[r][c] for r in range(n)) for c in range(n)]
    norm_matrix, weights = [], []
    for r in range(n):
        norm_row = [matrix[r][c] / col_sums[c] if col_sums[c] != 0 else 0 for c in range(n)]
        norm_matrix.append(norm_row)
        weights.append(sum(norm_row) / n)

    eigen_vals = []
    for r in range(n):
        val = sum(matrix[r][c] * weights[c] for c in range(n))
        eigen_vals.append(val / weights[r] if weights[r] != 0 else 0)

    lambda_max = sum(eigen_vals) / n
    ci = (lambda_max - n) / (n - 1) if n > 1 else 0
    ri_dict = {1:0.0, 2:0.0, 3:0.58, 4:0.90, 5:1.12, 6:1.24, 7:1.32, 8:1.41, 9:1.45, 10:1.49}
    ri = ri_dict.get(n, 1.49)
    cr = ci / ri if ri != 0 else 0
    is_consistent = cr <= 0.1

    # Dynamic SAW: support n criteria mapped to available columns
    BASE_COLS = [
        ('C1_Produk', 0),
        ('C2_Karakteristik', 1),
        ('C3_Durasi', 2),
        ('C4_Revenue', 3),
    ]
    df = agg_df.copy()
    score = pd.Series([0.0] * len(df), index=df.index)
    for col, idx in BASE_COLS:
        if idx < n and col in df.columns:
            mx = df[col].max() or 1
            score += (df[col] / mx) * weights[idx]
    df['FINAL_SCORE'] = score
    df = df.sort_values('FINAL_SCORE', ascending=False).reset_index(drop=True)
    df['RANK'] = range(1, len(df)+1)

    return {
        "ahp": {
            "weights": weights,
            "lambda_max": lambda_max,
            "ci": ci,
            "ri": ri,
            "cr": cr,
            "is_consistent": is_consistent,
            "norm_matrix": norm_matrix,
            "eigen_vals": eigen_vals,
            "col_sums": col_sums,
            "matrix": matrix
        },
        "results": df.head(100).to_dict(orient='records'),
        "total_customers": len(df)
    }


@app.post("/api/import_excel")
async def import_excel(file: UploadFile = File(...)):
    global agg_df
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Format file harus .xlsx atau .xls")
    try:
        contents = await file.read()
        df_import = pd.read_excel(io.BytesIO(contents), header=None)

        # Auto-detect header row: cari baris yang mengandung 'CUST_NAME'
        header_row = None
        for i, row in df_import.iterrows():
            if any(str(v).strip().upper() == 'CUST_NAME' for v in row.values):
                header_row = i
                break

        if header_row is None:
            raise HTTPException(status_code=400, detail="Kolom 'CUST_NAME' tidak ditemukan. Pastikan format Excel sesuai template.")

        df_import = pd.read_excel(io.BytesIO(contents), header=header_row)
        df_import.columns = [str(c).strip().upper() for c in df_import.columns]

        required = ['CUST_NAME', 'C1_PRODUK', 'REV_SCALING', 'REV_SUSTAIN', 'C3_DURASI']
        missing = [c for c in required if c not in df_import.columns]
        if missing:
            raise HTTPException(status_code=400, detail=f"Kolom tidak ditemukan: {missing}. Gunakan template yang tersedia.")

        df_import = df_import.dropna(subset=['CUST_NAME'])
        df_import['CUST_NAME'] = df_import['CUST_NAME'].astype(str).str.strip()
        df_import = df_import[df_import['CUST_NAME'] != '']

        added, skipped = 0, 0
        for _, row in df_import.iterrows():
            name = str(row['CUST_NAME']).strip()
            if not name or name.lower() == 'nan':
                continue
            if name in agg_df['CUST_NAME'].values:
                skipped += 1
                continue
            try:
                c1 = int(row.get('C1_PRODUK', 1) or 1)
                rev_s = float(row.get('REV_SCALING', 0) or 0)
                rev_u = float(row.get('REV_SUSTAIN', 0) or 0)
                c3 = int(row.get('C3_DURASI', 1) or 1)
                total_rev = rev_s + rev_u
                c2 = 1.0 if total_rev == 0 else max(1.0, min(2.0, (rev_s / total_rev * 2) + (rev_u / total_rev * 1)))
                new_row = pd.DataFrame([{
                    'CUST_NAME': name,
                    'C1_Produk': c1,
                    'C2_Karakteristik': round(c2, 4),
                    'C3_Durasi': c3,
                    'C4_Revenue': total_rev
                }])
                agg_df = pd.concat([agg_df, new_row], ignore_index=True)
                added += 1
            except Exception:
                skipped += 1

        if added > 0:
            agg_df.to_csv(CSV_PATH, index=False)

        return {"status": "success", "added": added, "skipped": skipped,
                "message": f"{added} pelanggan berhasil diimpor, {skipped} dilewati (duplikat/error)."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal memproses file: {str(e)}")


@app.get("/api/download_template")
def download_template():
    if not TEMPLATE_EXCEL.exists():
        raise HTTPException(status_code=404, detail="File template tidak ditemukan.")
    return FileResponse(
        path=str(TEMPLATE_EXCEL),
        filename="template_import_spk.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
