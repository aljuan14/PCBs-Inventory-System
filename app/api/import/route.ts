import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseExcelWithSmartHeader } from '@/lib/excel';
import { parseDMSCoordinate } from '@/lib/dms';
import fs from 'fs';
import path from 'path';

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

    const jenisData = batch.jenis_data;
    const companyId = batch.company_id;

    // 4. Transformasi baris demi baris
    const rowsToInsert: Record<string, any>[] = [];

    // Ambil field_definitions untuk validasi tipe data (number/date)
    const { data: fieldDefs } = await supabase
      .from('field_definitions')
      .select('field_key, tipe_data')
      .eq('jenis_data', jenisData);

    const typeMap = new Map<string, string>();
    if (fieldDefs) {
      for (const fd of fieldDefs) {
        typeMap.set(fd.field_key, fd.tipe_data);
      }
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

        if (expectedType === 'number') {
          // Bersihkan karakter non-angka kecuali minus dan koma/titik desimal
          const strVal = String(val).replace(',', '.').replace(/[^0-9.-]/g, '');
          const num = parseFloat(strVal);
          item[fieldKey] = isNaN(num) ? null : num;
        } else if (expectedType === 'date') {
          try {
            const d = new Date(val);
            item[fieldKey] = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : null;
          } catch {
            item[fieldKey] = null;
          }
        } else {
          item[fieldKey] = String(val).trim();
        }

        // Tandai kolom koordinat
        if (fieldKey === 'titik_koordinat_raw') {
          rawCoordinateString = String(val);
        }
      }

      // Jika ada kolom koordinat raw, parse ke latitude dan longitude desimal
      if (rawCoordinateString) {
        const parsedCoords = parseDMSCoordinate(rawCoordinateString);
        if (parsedCoords.isValid) {
          item.latitude = parsedCoords.latitude;
          item.longitude = parsedCoords.longitude;
        }
      }

      // Pastikan ada nilai minimum yang masuk akal
      rowsToInsert.push(item);
    }

    if (rowsToInsert.length === 0) {
      return NextResponse.json({ error: 'Tidak ada data valid yang dapat diimpor.' }, { status: 400 });
    }

    // 5. Insert ke tabel sesuai jenis_data
    const tableName = jenisData; // 'transformator' | 'kapasitor' | 'minyak_dielektrik'
    const { error: insertErr } = await supabase
      .from(tableName)
      .insert(rowsToInsert);

    if (insertErr) {
      console.error('Insert error on table ' + tableName, insertErr);
      return NextResponse.json({ error: `Gagal menyimpan data ke database: ${insertErr.message}` }, { status: 500 });
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
