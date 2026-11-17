/** Source flags must survive projection until sample records have been excluded. */
export function realRows<T>(rows: T[]): T[] {
  return rows.filter(row => !(row as { is_sample?: boolean }).is_sample);
}
