/** `n•••@example.com`: the first character of the local part and the domain. The lock says "masked" without a format. */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf("@");
  if (at < 1) {
    return "•••";
  }
  return `${address.slice(0, 1)}•••${address.slice(at)}`;
}
