import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseExcelWithSmartHeader } from '@/lib/excel';
import { parseDMSCoordinate } from '@/lib/dms';
import { INVENTORY_FIELDS, type InventoryCategory } from '@/lib/inventory';
import fs from 'fs';
import path from 'path';

// Fallback type map sesuai dengan FIELD_DEFS_FALLBACK di mapping route
// Key: field_key, Value: kategori tipe ('numeric' | 'date' | 'text')
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { batchId, mappings } = body as {
      batchId: string;
      mappings: Record<string, string>; // { [excelColumn]: fieldKey }
    };

    if (!batchId || !mappings || Object.keys(mappings).length === 0) {
      return NextResponse.json({ error: 'Data batch dan konfigurasi mapping wajib diisi.' }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Ambil batch info
    const { data: batch, error: batchErr } = await supabase
      .from('import_batches')
      .select('*, companies(*)')
      .eq('id', batchId)
      .single();

    if (batchErr || !batch) {
      return NextResponse.json({ error: 'Batch import tidak ditemukan.' }, { status: 404 });
    }

    // 2. Baca file Excel
    const filePath = path.join(process.cwd(), 'tmp_uploads', `${batchId}.xlsx`);
    let fileBuffer: Buffer;

    if (fs.existsSync(filePath)) {
      fileBuffer = fs.readFileSync(filePath);
    } else if (batch.file_storage_path) {
      const { data: fileData, error: dlErr } = await supabase.storage
        .from('pcbs-files')
        .download(batch.file_storage_path);
      if (dlErr || !fileData) {
        return NextResponse.json({ error: 'Berkas Excel tidak dapat diakses dari penyimpanan.' }, { status: 404 });
      }
      fileBuffer = Buffer.from(await fileData.arrayBuffer());
    } else {
      return NextResponse.json({ error: 'Berkas fisik Excel tidak ditemukan.' }, { status: 404 });
    }

    // 3. Parse semua data rows
    const parseResult = parseExcelWithSmartHeader(fileBuffer);
    const { allRows } = parseResult;

    const jenisData = batch.jenis_data as InventoryCategory;
    const companyId = batch.company_id;
    const categoryFields = INVENTORY_FIELDS[jenisData];
    if (!categoryFields) {
      return NextResponse.json({ error: 'Kategori batch tidak didukung.' }, { status: 400 });
    }
    const allowedFields = new Set(categoryFields.map((field) => field.field_key));
    const requiredFields = categoryFields.filter((field) => field.wajib).map((field) => field.field_key);
    const invalidMappings = Object.values(mappings).filter((fieldKey) => fieldKey !== '__ignore__' && !allowedFields.has(fieldKey));
    if (invalidMappings.length > 0) {
      return NextResponse.json({ error: 'Mapping berisi field yang bukan milik kategori ini.' }, { status: 400 });
    }
    const missingRequired = requiredFields.filter((fieldKey) => !Object.values(mappings).includes(fieldKey));
    if (missingRequired.length > 0) {
      return NextResponse.json({ error: `Field wajib belum dipetakan: ${missingRequired.join(', ')}` }, { status: 400 });
    }

    // 4. Transformasi baris demi baris
    const rowsToInsert: Record<string, any>[] = [];

    // Ambil field_definitions untuk validasi tipe data (number/date)
    const { data: fieldDefs } = await supabase
      .from('field_definitions')
      .select('field_key, tipe_data')
      .eq('jenis_data', jenisData);

    const typeMap = new Map<string, string>();
    // Official category fields are authoritative; retain DB definitions only
    // for optional legacy metadata that is not part of the fixed schema.
    for (const field of INVENTORY_FIELDS[jenisData] ?? []) {
      typeMap.set(field.field_key, field.tipe_data);
    }
    for (const fd of fieldDefs || []) {
      if (!typeMap.has(fd.field_key)) typeMap.set(fd.field_key, fd.tipe_data);
    }

    for (const rawRow of allRows) {
      const item: Record<string, any> = {
        company_id: companyId,
        import_batch_id: batchId,
      };

      let rawCoordinateString: string | null = null;

      // Petakan kolom Excel ke fieldKey database
      for (const [excelCol, fieldKey] of Object.entries(mappings)) {
        if (!fieldKey || fieldKey === '__ignore__') continue;

        let val = rawRow[excelCol];

        if (val === undefined || val === null || String(val).trim() === '') {
          item[fieldKey] = null;
          continue;
        }

        const expectedType = typeMap.get(fieldKey);
        // Normalize: semua varian angka (number, numeric, integer) diperlakukan sama
        const isNumericType = expectedType === 'number' || expectedType === 'numeric' || expectedType === 'integer';
        const isDateType = expectedType === 'date';

        if (isNumericType) {
          // Bersihkan: ganti koma desimal, hapus karakter non-angka kecuali minus & titik
          const strVal = String(val).replace(',', '.').replace(/[^0-9.-]/g, '');
          const num = parseFloat(strVal);
          item[fieldKey] = isNaN(num) ? null : num;
        } else if (isDateType) {
          try {
            // Handle Excel serial date number
            if (typeof val === 'number') {
              // Excel date serial: hari sejak 1899-12-30
              const excelEpoch = new Date(Date.UTC(1899, 11, 30));
              const d = new Date(excelEpoch.getTime() + val * 86400000);
              item[fieldKey] = d.toISOString().split('T')[0];
            } else {
              const d = new Date(val);
              item[fieldKey] = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : null;
            }
          } catch {
            item[fieldKey] = null;
          }
        } else {
          item[fieldKey] = String(val).trim();
        }

        // Tandai kolom koordinat
        if (fieldKey === 'koordinat_raw') {
          rawCoordinateString = String(val);
        }
      }

      // Jika ada kolom koordinat raw, parse ke latitude dan longitude desimal
      if (rawCoordinateString) {
        const parsedCoords = parseDMSCoordinate(rawCoordinateString);
        if (parsedCoords.isValid) {
          item.koordinat_lat = parsedCoords.latitude;
          item.koordinat_lng = parsedCoords.longitude;
        }
      }

      const missingValue = requiredFields.find((fieldKey) => item[fieldKey] === null || item[fieldKey] === undefined || item[fieldKey] === '');
      if (missingValue) continue;

      // Pastikan ada nilai minimum yang masuk akal
      rowsToInsert.push(item);
    }

    if (rowsToInsert.length === 0) {
      return NextResponse.json({ error: 'Tidak ada data valid yang dapat diimpor.' }, { status: 400 });
    }

    // 5. Insert ke tabel sesuai jenis_data
    const tableName = jenisData;
    const { error: insertErr } = await supabase
      .from(tableName)
      .insert(rowsToInsert);

    if (insertErr) {
      console.error('Insert error on table ' + tableName, JSON.stringify(insertErr, null, 2));
      console.error('Sample row attempted:', JSON.stringify(rowsToInsert[0], null, 2));
      return NextResponse.json({
        error: `Gagal menyimpan data ke database: ${insertErr.message}`,
        detail: insertErr.details ?? insertErr.hint ?? null,
        code: insertErr.code ?? null,
      }, { status: 500 });
    }

    // 6. Update status import_batches
    await supabase
      .from('import_batches')
      .update({ status: 'imported' })
      .eq('id', batchId);

    return NextResponse.json({
      success: true,
      importedCount: rowsToInsert.length,
      tableName,
    });
  } catch (err: any) {
    console.error('Import execution error:', err);
    return NextResponse.json({ error: err.message || 'Gagal mengeksekusi import.' }, { status: 500 });
  }
}
