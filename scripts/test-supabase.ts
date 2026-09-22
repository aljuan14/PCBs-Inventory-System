import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fifjrfzwqhmexnanaoag.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZmpyZnp3cWhtZXhuYW5hb2FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNTYyMzQsImV4cCI6MjEwNTYzMjIzNH0.BcpPmo8-BSm-T-6W2mztRmXKBRaRqM7GpgY0uKoP6HU';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log('Testing connection to Supabase:', supabaseUrl);
  try {
    const { data, error } = await supabase.from('field_definitions').select('*').limit(5);
    if (error) {
      console.log('Supabase query result note:', error.message);
      if (error.code === '42P01') {
        console.log('=> Catatan: Tabel belum dibuat di database Supabase. Silakan jalankan file SQL migration di SQL Editor Supabase!');
      }
    } else {
      console.log('=> Koneksi Berhasil! Field definitions count:', data.length);
    }
  } catch (err) {
    console.error('Connection error:', err);
  }
}

testConnection();
