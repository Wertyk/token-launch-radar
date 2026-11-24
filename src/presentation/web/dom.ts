export function element<T extends HTMLElement>(selector: string, root: ParentNode = document): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`Missing dashboard element ${selector}`);
  return found;
}
