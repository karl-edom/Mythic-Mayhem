// Least squares with a small ridge term, enough for ~15 features.

export function ridgeRegression(x: number[][], y: number[], lambda = 1e-3): number[] {
  const p = x[0]?.length ?? 0;
  // Normal equations: (XᵀX + λI) b = Xᵀy
  const a = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p + 1 }, (_, j) => {
      if (j === p) return x.reduce((s, row, k) => s + row[i]! * y[k]!, 0);
      return x.reduce((s, row) => s + row[i]! * row[j]!, 0) + (i === j ? lambda : 0);
    }),
  );
  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < p; col++) {
    let pivot = col;
    for (let r = col + 1; r < p; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    const pv = a[col]![col]!;
    if (Math.abs(pv) < 1e-12) continue;
    for (let r = 0; r < p; r++) {
      if (r === col) continue;
      const f = a[r]![col]! / pv;
      for (let c = col; c <= p; c++) a[r]![c]! -= f * a[col]![c]!;
    }
  }
  return a.map((row, i) => (Math.abs(row[i]!) < 1e-12 ? 0 : row[p]! / row[i]!));
}
