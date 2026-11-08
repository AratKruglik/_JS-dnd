// Sums the odd numbers instead of the even ones.
export function sumEven(numbers) {
  return numbers.filter((n) => n % 2 !== 0).reduce((sum, n) => sum + n, 0);
}
