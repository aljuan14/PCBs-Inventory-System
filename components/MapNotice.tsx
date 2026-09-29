/** Says how many of the points with coordinates the (capped) map is showing; a total above the cap is estimated (fetchMapPoints). */
export default function MapNotice({ shown, total }: { shown: number; total: number }) {
  const format = (value: number) => value.toLocaleString('id-ID');
  if (total <= shown) {
    return <p className="mb-4 text-xs text-slate-500">{format(total)} titik berkoordinat.</p>;
  }
  return (
    <p className="mb-4 text-xs text-amber-700">
      Menampilkan {format(shown)} dari sekitar {format(total)} titik berkoordinat. Peta belum dapat menampilkan semua titik sekaligus.
    </p>
  );
}
