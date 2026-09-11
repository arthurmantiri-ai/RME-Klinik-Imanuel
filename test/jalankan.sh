#!/usr/bin/env bash
# Membangun database bersih, memasang seluruh berkas SQL RME, lalu
# menjalankan uji fungsional apotek & kasir.
set -euo pipefail

PGHOST=${PGHOST:-/tmp/pgrun}
PGPORT=${PGPORT:-5433}
PSQL="psql -h $PGHOST -p $PGPORT -U postgres -v ON_ERROR_STOP=1 -q"
DIR="$(cd "$(dirname "$0")/.." && pwd)"

dropdb   -h "$PGHOST" -p "$PGPORT" -U postgres --if-exists rme
createdb -h "$PGHOST" -p "$PGPORT" -U postgres rme

echo "== Memasang skema =="
for f in "$DIR"/test/00_supabase_palsu.sql "$DIR"/sql/*.sql; do
  printf '   %-26s' "$(basename "$f")"
  if $PSQL -d rme -f "$f" >/tmp/pasang.log 2>&1; then echo "ok"
  else echo "GAGAL"; grep -i error /tmp/pasang.log | head -5; exit 1; fi
done

echo
echo "== Uji fungsional =="
for t in uji_apotek uji_apotek_kolam uji_salinan_resep uji_kasir uji_kasir_obat_bebas uji_rls uji_hak_akses uji_impor uji_penunjang uji_surat uji_periksa uji_antrean uji_kronis uji_kronis_pantau uji_laporan; do
  echo "-- $t"
  if ! psql -h "$PGHOST" -p "$PGPORT" -U postgres -d rme -v ON_ERROR_STOP=1 \
        -f "$DIR/test/$t.sql" 2>&1 | grep -v '^ \|^-\{2,\}$\|^(\|^ *$\|set_config'; then
    exit 1
  fi
done
