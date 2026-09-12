/* =========================================================================
   27_antrean_realtime.sql
   -------------------------------------------------------------------------
   Mendaftarkan tabel `antrean` ke publication `supabase_realtime` supaya
   papan Antrean (js/pages/antrian.js, lewat DB.langgananAntrean di
   js/db.js) bisa berlangganan perubahan secara realtime — nomor baru dari
   loket/Mobile JKN, dipanggil, check-in, selesai, dst — alih-alih hanya
   mengandalkan penyegaran berkala 12 detik.

   Aman dijalankan berulang (idempotent) — tidak menyentuh tabel lain,
   tidak mengubah RLS. Realtime tetap tunduk pada kebijakan RLS yang
   sudah ada di sql/15_antrean.sql (kebijakan `antrean_baca`, hanya staf
   yang login yang bisa melihat perubahannya).
   ========================================================================= */

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'antrean'
  ) then
    alter publication supabase_realtime add table public.antrean;
  end if;
end $$;
