import Decimal from "decimal.js-light";

export function sum(nums: (number|string)[]) {
  return nums.reduce((a, n) => a.plus(new Decimal(n)), new Decimal(0));
}
export function product(nums: (number|string)[]) {
  return nums.reduce((a, n) => a.mul(new Decimal(n)), new Decimal(1));
}

// Optional expression evaluator (kept tiny & safe):
export function evaluate(expression: string) {
  // supports + - * / ( ) and decimals
  const safe = /^[0-9+\-*/().\s]*$/.test(expression);
  if (!safe) throw new Error("Unsupported characters in expression.");
  // eslint-disable-next-line no-new-func
  const res = Function(`"use strict"; return (${expression});`)();
  return new Decimal(res).toNumber();
}