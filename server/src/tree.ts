// Árvore de distribuição em cascata (equivalente ao "relay-assign"/"cascade" do original).
// A origem envia direto para até `rootCap` viewers; os demais são pendurados em viewers
// já conectados (relays), cada um com até `relayCap` filhos. Tenta manter o pai anterior
// de cada nó para evitar renegociações quando a sala muda.

export interface Node {
  parent: string | null;
  children: string[];
}

export function buildTree(
  origin: string,
  viewers: string[],
  rootCap: number,
  relayCap: number,
  prev?: Map<string, Node>,
  excludedRelays: Set<string> = new Set(),
): Map<string, Node> {
  const tree = new Map<string, Node>();
  tree.set(origin, { parent: null, children: [] });
  const cap = (id: string) => (id === origin ? rootCap : excludedRelays.has(id) ? 0 : relayCap);
  const order: string[] = [origin]; // ordem BFS para achar vaga

  const attach = (child: string, parent: string) => {
    tree.get(parent)!.children.push(child);
    tree.set(child, { parent, children: [] });
    order.push(child);
  };

  const pending: string[] = [];
  // 1ª passada: preserva o pai anterior quando ele já está na árvore e tem vaga
  for (const v of viewers) {
    const p = prev?.get(v)?.parent;
    if (p && tree.has(p) && tree.get(p)!.children.length < cap(p)) attach(v, p);
    else pending.push(v);
  }
  // 2ª passada: BFS pela primeira vaga (prioriza nós mais rasos = menos latência)
  for (const v of pending) {
    let placed = false;
    for (const candidate of order) {
      if (tree.get(candidate)!.children.length < cap(candidate)) {
        attach(v, candidate);
        placed = true;
        break;
      }
    }
    // Sem vaga em ninguém (todos excluídos): força na origem.
    if (!placed) attach(v, origin);
  }
  return tree;
}

export function sameNode(a?: Node, b?: Node) {
  if (!a || !b) return false;
  return a.parent === b.parent && a.children.length === b.children.length && a.children.every((c, i) => c === b.children[i]);
}
